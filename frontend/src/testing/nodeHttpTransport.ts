import {
  request as httpRequest,
  type ClientRequest,
  type IncomingMessage,
} from "node:http";
import { request as httpsRequest } from "node:https";
import type { Socket } from "node:net";

import type { FetchLike } from "../stores/server/engine";

const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);
const INIT_FIELDS = new Set(["method", "headers", "body", "signal"]);

interface ValidatedRequest {
  readonly url: URL;
  readonly method: string;
  readonly headers: Headers;
  readonly body: string | null;
  readonly signal: AbortSignal | null;
}

function invalid(name: string): TypeError {
  return new TypeError(`unsupported node HTTP transport ${name}`);
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AbortSignal).aborted === "boolean" &&
    typeof (value as AbortSignal).addEventListener === "function" &&
    typeof (value as AbortSignal).removeEventListener === "function"
  );
}

function validate(input: string, init: RequestInit | undefined): ValidatedRequest {
  if (typeof input !== "string") throw invalid("URL");
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw invalid("URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw invalid(`URL scheme ${url.protocol || "<missing>"}`);
  }

  for (const field of Object.keys(init ?? {})) {
    if (!INIT_FIELDS.has(field)) throw invalid(`RequestInit field ${field}`);
  }

  const method = (init?.method ?? "GET").toUpperCase();
  if (!METHODS.has(method)) throw invalid(`method ${method}`);

  const rawBody = init?.body;
  if (rawBody !== undefined && rawBody !== null && typeof rawBody !== "string") {
    throw invalid(`body ${Object.prototype.toString.call(rawBody)}`);
  }
  const body = typeof rawBody === "string" ? rawBody : null;
  if ((method === "GET" || method === "HEAD") && body !== null) {
    throw invalid(`${method} body`);
  }

  const signal = init?.signal ?? null;
  if (signal !== null && !isAbortSignal(signal)) throw invalid("signal");

  let headers: Headers;
  try {
    headers = new Headers(init?.headers);
  } catch {
    throw invalid("headers");
  }
  headers.set("connection", "close");
  if (body !== null && !headers.has("content-length")) {
    headers.set("content-length", String(Buffer.byteLength(body)));
  }
  return { url, method, headers, body, signal };
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason === undefined
    ? new DOMException("The operation was aborted.", "AbortError")
    : signal.reason;
}

function responseHeaders(message: IncomingMessage): Headers {
  const headers = new Headers();
  for (let index = 0; index < message.rawHeaders.length; index += 2) {
    headers.append(message.rawHeaders[index]!, message.rawHeaders[index + 1]!);
  }
  return headers;
}

function requestHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

/**
 * Test-only FetchLike with one explicitly owned, non-pooled Node socket per call.
 * Its deliberately narrow input contract matches the live-engine clients.
 */
export const nodeHttpTransport: FetchLike = async (input, init) => {
  const spec = validate(input, init);
  if (spec.signal?.aborted) throw abortReason(spec.signal);

  return await new Promise<Response>((resolve, reject) => {
    let message: IncomingMessage | null = null;
    let socket: Socket | null = null;
    let socketClosed = false;
    let fetchSettled = false;
    let terminal = false;
    let drainListener: (() => void) | null = null;
    const socketCloseWaiters: Array<() => void> = [];

    const resolveSocketClose = () => {
      socketClosed = true;
      for (const waiter of socketCloseWaiters.splice(0)) waiter();
    };
    const waitForSocketClose = (): Promise<void> =>
      socketClosed
        ? Promise.resolve()
        : new Promise((done) => socketCloseWaiters.push(done));
    const removeDrainListener = () => {
      if (drainListener) request.removeListener("drain", drainListener);
      drainListener = null;
    };
    const removeAbortListener = () => {
      spec.signal?.removeEventListener("abort", onAbort);
    };
    const removeRequestListeners = () => {
      removeDrainListener();
      request.removeListener("error", onRequestError);
      request.removeListener("response", onResponse);
      request.removeListener("socket", onSocket);
      request.removeListener("close", onRequestClose);
    };
    const destroyResources = () => {
      if (message && !message.destroyed) message.destroy();
      if (!request.destroyed) request.destroy();
      if (socket && !socket.destroyed) socket.destroy();
    };
    const cleanup = () => {
      removeAbortListener();
      removeRequestListeners();
      socket?.removeListener("close", resolveSocketClose);
    };
    const rejectBeforeHeaders = async (cause: unknown) => {
      if (terminal || fetchSettled) return;
      terminal = true;
      removeDrainListener();
      destroyResources();
      await waitForSocketClose();
      cleanup();
      reject(cause);
    };

    const onSocket = (assigned: Socket) => {
      socket = assigned;
      assigned.once("close", resolveSocketClose);
    };
    const onRequestClose = () => {
      if (socket === null) resolveSocketClose();
    };
    const onRequestError = (error: Error) => {
      if (!fetchSettled) void rejectBeforeHeaders(error);
    };
    const onAbort = () => {
      const cause = abortReason(spec.signal!);
      if (!fetchSettled) {
        void rejectBeforeHeaders(cause);
        return;
      }
      bodyAbort?.(cause);
    };
    let bodyAbort: ((cause: unknown) => void) | null = null;

    const finishNullBody = async (response: IncomingMessage): Promise<Response> => {
      terminal = true;
      await new Promise<void>((done, fail) => {
        let settled = false;
        let settling = false;
        let failure: { readonly cause: unknown } | null = null;
        const remove = () => {
          response.removeListener("end", onEnd);
          response.removeListener("error", onError);
        };
        const settle = async () => {
          if (settling) return;
          settling = true;
          await waitForSocketClose();
          if (settled) return;
          settled = true;
          cleanup();
          if (failure === null) done();
          else fail(failure.cause);
        };
        const failAndSettle = (cause: unknown) => {
          if (settled || failure !== null) return;
          failure = { cause };
          remove();
          destroyResources();
          void settle();
        };
        const onEnd = () => {
          remove();
          void settle();
        };
        const onError = (error: Error) => failAndSettle(error);
        bodyAbort = failAndSettle;
        response.once("end", onEnd);
        response.once("error", onError);
        response.resume();
      });
      return new Response(null, {
        status: response.statusCode!,
        statusText: response.statusMessage,
        headers: responseHeaders(response),
      });
    };

    const bodyResponse = (response: IncomingMessage): Response => {
      response.pause();
      let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
      let completed = false;

      const removeResponseListeners = () => {
        response.removeListener("data", onData);
        response.removeListener("end", onEnd);
        response.removeListener("error", onError);
      };
      const finish = async (action: () => void, destroy: boolean) => {
        if (completed) return;
        completed = true;
        terminal = true;
        removeResponseListeners();
        if (destroy) destroyResources();
        await waitForSocketClose();
        cleanup();
        action();
      };
      const onData = (chunk: Buffer) => {
        controller!.enqueue(new Uint8Array(chunk));
        if ((controller!.desiredSize ?? 0) <= 0) response.pause();
      };
      const onEnd = () => void finish(() => controller!.close(), false);
      const onError = (error: Error) =>
        void finish(() => controller!.error(error), true);

      const body = new ReadableStream<Uint8Array>({
        start(streamController) {
          controller = streamController;
          response.on("data", onData);
          response.once("end", onEnd);
          response.once("error", onError);
        },
        pull() {
          if (!completed) response.resume();
        },
        async cancel() {
          await finish(() => undefined, true);
        },
      });
      bodyAbort = (cause) => {
        void finish(() => controller!.error(cause), true);
      };
      return new Response(body, {
        status: response.statusCode!,
        statusText: response.statusMessage,
        headers: responseHeaders(response),
      });
    };

    const onResponse = (response: IncomingMessage) => {
      if (terminal) {
        response.destroy();
        return;
      }
      message = response;
      fetchSettled = true;
      const status = response.statusCode!;
      if (spec.method === "HEAD" || status === 204 || status === 304) {
        void finishNullBody(response).then(resolve, reject);
        return;
      }
      try {
        resolve(bodyResponse(response));
      } catch (error) {
        terminal = true;
        destroyResources();
        void waitForSocketClose().then(() => {
          cleanup();
          reject(error);
        });
      }
    };

    const request: ClientRequest = (
      spec.url.protocol === "https:" ? httpsRequest : httpRequest
    )(spec.url, {
      method: spec.method,
      headers: requestHeaders(spec.headers),
      agent: false,
    });
    request.once("socket", onSocket);
    request.once("close", onRequestClose);
    request.once("response", onResponse);
    request.once("error", onRequestError);
    spec.signal?.addEventListener("abort", onAbort, { once: true });

    if (spec.body === null) {
      request.end();
      return;
    }
    if (request.write(spec.body)) {
      request.end();
      return;
    }
    drainListener = () => {
      drainListener = null;
      request.end();
    };
    request.once("drain", drainListener);
  });
};
