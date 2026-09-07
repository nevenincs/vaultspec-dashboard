// @vitest-environment happy-dom

import {
  ClientRequest,
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createServer as createHttpsServer } from "node:https";
import type { AddressInfo, Socket } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import { liveFetch, liveTransport } from "./liveClient";
import { nodeHttpTransport } from "./nodeHttpTransport";

const SELF_SIGNED_KEY = Buffer.from(
  "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDc386WHQMDDuDBtzB35TnnYx1QL/FC5iGzeyLZeaFkMlt/tuL/Ci2wK6VGKCpF3qTUMreIq1YWpxKHyUyvsGwHnnhKuSwH48do9T7J+uw66jbEYfbduwWguWtGNR3zN8gOpCxjcrvrv1DjoX2uJfIfz15XRlESzqH6myygqqnOyUhAvCoupCLSHCFI/wQAUGb/p7XDgXyGgEDjDBaScPbGbT+Kah4j0FHdK3DxH4PPQudoTaV2Q89FUhLr1PfsR8kk5Ej2FBxh7GGGUq7Gj09XY80z/LcNyAXCVkRU8WorTJMCMX0GZkWSJXif8SY/W2c9yBsQeIIXXds6+EUIqlS5AgMBAAECggEAVCTzJ97/kb+uQj5Oua5bI9pvhWfuSqUve5fSi/U5VdmVYA9FZRH0m+PUv+h3SkzqkGiN4QQc9N5LQe2fSGM2lKR7gUQQESVmh4a+l+X+7ubhXGlRyeEA4N0ikAmWUl0S2vkSbAR+sO4em8me/qQ4HIQ8lZUVN8v+i2FoXAEIVd1FNF6Zw037U/jcj+V5+VmfBFQbRAFeqXWcmFuyASoCIiN0QsI/ERiHeiAD7/wlQp6hfsz6x9aKgzympFvurRzfiKzqQL47MFpI+y05HrqhNvgfjMlfVuGyHz0ket2zLzerOU+YRBZ/KbjnIyi2pW9BtTP0z5HmBbkENjSfJbmkrQKBgQD7OOvdCVhekuR1rkIKzjQ3k7qJ36222nQQZk9BZY1KHu1T0BhIZBS0LInfAdOJJDrtfK7f3B3hvDLkdRGpAPYPTV4a0GGHxlvJ+YXXO+YVYTlbQCZu4PBfJkUh2MAYgTLEl7dXvL6zSvrwv1HFtwn3+c02nEna+LOkauEoF4bQFwKBgQDhEyK1KJRoCZGrnf+XivisaaYeXUi6NdoxTs8fDbKuE/nfTGBGEqroN1jnEeGQwwFKLj4oOPY8LrmXOWO+tonl/4yhZoaVUcaITFrHUi/oPBoIvey8YtjutpHRx4tF0o1w70XDwmRy/gGpYAY2NvJxxeARqqGpH4P6tvCon06zrwKBgB3fceSRxOlSDEqWExJX3MuzDF5ys6Rnq597mvcKzVdAADaUKx8Ij5GxLh/Phsjq/vrYda727LK3/1E9PoFbNOcy6vrDRqWvh6CnxCuI2t419m0MXsWWh964nUXeEVGYo2HPLKUJM5/8TYStK1sYXd4X3TgeM4YPRsVJVEbBLW23AoGAD3DQoLz38Ws2ox9juXG/PZTB4LNlmeC350oQy4CVEXwtWDRVJnmBYAzr/G4tm1DFdeFWQkwmGFrcQJOfVCYRr8WoUCpIcVX62L7kO2hYAQaegpsE8qeVWksMFegqlc+sBGNl1dgwK/NhCc2cn3uFhmicxpl+Hawb0cdbGzZSn+ECgYEAhtdroVkJSO4k9Sso8TJd6/U/kD8RffuS8Z/FpMJQOxDdLUsgDn/F0Fg6a+6SV/tvC5QuYMz0QYZxB74naac8SGt9OHJM0NJArDb9Fyfqayzvz8QPvbwWGry1SJrSmUyLqkQo6KecN1qF4jRYYYiyQ7dI/gJ/TGsdH93eu/GOKGs=",
  "base64",
);
const SELF_SIGNED_CERTIFICATE = Buffer.from(
  "MIICyDCCAbCgAwIBAgIIUJPji0EWKiowDQYJKoZIhvcNAQELBQAwFDESMBAGA1UEAxMJbG9jYWxob3N0MB4XDTI2MDkwNTE3MTM0MVoXDTI3MDkwNjE3MTM0MVowFDESMBAGA1UEAxMJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA3N/Olh0DAw7gwbcwd+U552MdUC/xQuYhs3si2XmhZDJbf7bi/wotsCulRigqRd6k1DK3iKtWFqcSh8lMr7BsB554SrksB+PHaPU+yfrsOuo2xGH23bsFoLlrRjUd8zfIDqQsY3K7679Q46F9riXyH89eV0ZREs6h+pssoKqpzslIQLwqLqQi0hwhSP8EAFBm/6e1w4F8hoBA4wwWknD2xm0/imoeI9BR3Stw8R+Dz0LnaE2ldkPPRVIS69T37EfJJORI9hQcYexhhlKuxo9PV2PNM/y3DcgFwlZEVPFqK0yTAjF9BmZFkiV4n/EmP1tnPcgbEHiCF13bOvhFCKpUuQIDAQABox4wHDAaBgNVHREEEzARgglsb2NhbGhvc3SHBH8AAAEwDQYJKoZIhvcNAQELBQADggEBAMWYr3jALuOmCui3yTpShZW1aVFQEoTVta3lMtr7a9OuVfh4ENAHt70WKHW+1PF/jyTOJi1T+QTJIU2oJV/7/5pFe0GDQ+NpkU+9FCgViW5SaULFgrtv2QeUh6D5maX29lFQYnsIH8BczsdFFUDQuchLdOLmVEKbwHt1cgoF6XzHmGo6kww+gbDdrVe6dgWydCpA4J1QdeMTUWxKlESR1WGoC9wuEi+Lhk8ZmMLJ42ih3l6LDl2ddSHCdgX6ta42VjcA50vQvkNUXpK4hEnq+JyZwma/oZW5UORBjf6U0nmZzeVdPdbMVfb60mSOce9GQUfANcwnUhbR888qrE9wa7k=",
  "base64",
);

function pem(label: string, der: Buffer): string {
  const lines = der.toString("base64").match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

interface TestServer {
  readonly url: string;
  readonly sockets: Set<Socket>;
  readonly firstConnection: Promise<Socket>;
  readonly close: () => Promise<void>;
}

interface ClientLifecycleObservation {
  readonly requests: ClientRequest[];
  readonly sockets: Socket[];
  readonly responses: IncomingMessage[];
  readonly errors: Error[];
  readonly firstSocket: Promise<Socket>;
  readonly firstResponse: Promise<IncomingMessage>;
  readonly responseEndObserved: Promise<void>;
  readonly releaseResponseEnd: () => void;
  readonly counts: () => { opened: number; closed: number };
}

function observeClientLifecycle(options?: {
  readonly holdResponseEnd?: boolean;
}): ClientLifecycleObservation {
  const requests: ClientRequest[] = [];
  const sockets: Socket[] = [];
  const responses: IncomingMessage[] = [];
  const errors: Error[] = [];
  let observeSocket!: (socket: Socket) => void;
  let observeResponse!: (response: IncomingMessage) => void;
  const firstSocket = new Promise<Socket>((resolve) => (observeSocket = resolve));
  const firstResponse = new Promise<IncomingMessage>(
    (resolve) => (observeResponse = resolve),
  );
  let observeResponseEnd!: () => void;
  const responseEndObserved = new Promise<void>(
    (resolve) => (observeResponseEnd = resolve),
  );
  let releaseResponseEnd = () => undefined;
  let closed = 0;
  const originalEmit = ClientRequest.prototype.emit;
  vi.spyOn(ClientRequest.prototype, "emit").mockImplementation(function (
    this: ClientRequest,
    event: string | symbol,
    ...args: unknown[]
  ) {
    if (!requests.includes(this)) requests.push(this);
    if (event === "socket") {
      const socket = args[0] as Socket;
      sockets.push(socket);
      observeSocket(socket);
      socket.once("close", () => {
        closed += 1;
      });
    }
    if (event === "response") {
      const response = args[0] as IncomingMessage;
      responses.push(response);
      observeResponse(response);
      if (options?.holdResponseEnd) {
        const originalResponseEmit = response.emit;
        let heldArguments: unknown[] | null = null;
        vi.spyOn(response, "emit").mockImplementation(function (
          this: IncomingMessage,
          responseEvent: string | symbol,
          ...responseArguments: unknown[]
        ) {
          if (responseEvent === "end") {
            heldArguments = responseArguments;
            observeResponseEnd();
            return true;
          }
          return Reflect.apply(originalResponseEmit, this, [
            responseEvent,
            ...responseArguments,
          ]) as boolean;
        });
        releaseResponseEnd = () => {
          if (heldArguments === null) return;
          Reflect.apply(originalResponseEmit, response, ["end", ...heldArguments]);
          heldArguments = null;
        };
      }
    }
    if (event === "error") errors.push(args[0] as Error);
    return Reflect.apply(originalEmit, this, [event, ...args]) as boolean;
  });
  return {
    requests,
    sockets,
    responses,
    errors,
    firstSocket,
    firstResponse,
    responseEndObserved,
    releaseResponseEnd: () => releaseResponseEnd(),
    counts: () => ({ opened: sockets.length, closed }),
  };
}

function observeClientSockets(): () => { opened: number; closed: number } {
  return observeClientLifecycle().counts;
}

async function serve(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<TestServer> {
  const server = createServer(handler);
  const sockets = new Set<Socket>();
  let observeFirstConnection!: (socket: Socket) => void;
  const firstConnection = new Promise<Socket>(
    (resolve) => (observeFirstConnection = resolve),
  );
  server.on("connection", (socket) => {
    sockets.add(socket);
    observeFirstConnection(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    sockets,
    firstConnection,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        for (const socket of sockets) socket.destroy();
      }),
  };
}

async function body(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString();
}

afterEach(() => vi.restoreAllMocks());

describe("nodeHttpTransport validation", () => {
  it.each([
    ["relative URL", "/status", undefined, "URL"],
    ["scheme", "file:///tmp/value", undefined, "scheme"],
    ["method", "http://127.0.0.1/", { method: "OPTIONS" }, "method"],
    ["GET body", "http://127.0.0.1/", { body: "value" }, "GET body"],
    ["HEAD body", "http://127.0.0.1/", { method: "HEAD", body: "value" }, "HEAD body"],
    [
      "binary body",
      "http://127.0.0.1/",
      { method: "POST", body: new Uint8Array([1]) as unknown as BodyInit },
      "body",
    ],
    ["signal", "http://127.0.0.1/", { signal: {} as AbortSignal }, "signal"],
    ["cache", "http://127.0.0.1/", { cache: "no-store" }, "cache"],
    ["credentials", "http://127.0.0.1/", { credentials: "omit" }, "credentials"],
    ["mode", "http://127.0.0.1/", { mode: "cors" }, "mode"],
    ["keepalive", "http://127.0.0.1/", { keepalive: true }, "keepalive"],
    ["redirect", "http://127.0.0.1/", { redirect: "manual" }, "redirect"],
    ["referrer", "http://127.0.0.1/", { referrer: "about:client" }, "referrer"],
    [
      "referrerPolicy",
      "http://127.0.0.1/",
      { referrerPolicy: "no-referrer" },
      "referrerPolicy",
    ],
    ["integrity", "http://127.0.0.1/", { integrity: "sha256-x" }, "integrity"],
    ["priority", "http://127.0.0.1/", { priority: "high" } as RequestInit, "priority"],
    ["window", "http://127.0.0.1/", { window: null }, "window"],
  ])(
    "rejects unsupported %s asynchronously before opening a socket",
    async (_label, input, init, name) => {
      const sockets = observeClientSockets();
      let synchronous = true;
      const result = nodeHttpTransport(input, init as RequestInit).catch((error) => {
        expect(synchronous).toBe(false);
        throw error;
      });
      synchronous = false;
      await expect(result).rejects.toEqual(
        expect.objectContaining({
          name: "TypeError",
          message: expect.stringContaining(name),
        }),
      );
      expect(sockets()).toEqual({ opened: 0, closed: 0 });
    },
  );

  it("returns a rejected Promise when liveTransport cannot construct headers", async () => {
    const failure = new Error("malformed headers");
    const malformedHeaders = new Proxy(
      {},
      {
        ownKeys() {
          throw failure;
        },
      },
    ) as HeadersInit;
    let synchronous = true;
    const result = liveTransport("/status", { headers: malformedHeaders }).catch(
      (error) => {
        expect(synchronous).toBe(false);
        throw error;
      },
    );
    synchronous = false;
    await expect(result).rejects.toBe(failure);
  });

  it("opens no socket for an already-aborted request and preserves its reason", async () => {
    const server = await serve((_request, response) => response.end("unexpected"));
    const controller = new AbortController();
    const reason = { owner: "already stopped" };
    controller.abort(reason);
    try {
      await expect(
        nodeHttpTransport(server.url, { signal: controller.signal }),
      ).rejects.toBe(reason);
      expect(server.sockets.size).toBe(0);
    } finally {
      await server.close();
    }
  });
});

describe("nodeHttpTransport wire ownership", () => {
  it.each(["PUT", "PATCH", "DELETE"])("accepts the %s method", async (method) => {
    const server = await serve(async (request, response) => {
      expect(request.method).toBe(method);
      expect(await body(request)).toBe("payload");
      response.end("ok");
    });
    try {
      const response = await nodeHttpTransport(server.url, {
        method,
        body: "payload",
      });
      expect(await response.text()).toBe("ok");
    } finally {
      await server.close();
    }
  });
  it("preserves method, headers, and a string body while forcing connection close", async () => {
    const sockets = observeClientSockets();
    let received:
      | {
          method: string | undefined;
          header: string | undefined;
          connection: string | undefined;
          body: string;
        }
      | undefined;
    const server = await serve(async (request, response) => {
      received = {
        method: request.method,
        header: request.headers["x-probe"] as string | undefined,
        connection: request.headers.connection,
        body: await body(request),
      };
      response.writeHead(201, { "content-type": "text/plain" });
      response.end("created");
    });
    try {
      const response = await nodeHttpTransport(server.url, {
        method: "POST",
        headers: { "x-probe": "yes", connection: "keep-alive" },
        body: "payload",
      });
      expect(response.status).toBe(201);
      expect(await response.text()).toBe("created");
      expect(received).toEqual({
        method: "POST",
        header: "yes",
        connection: "close",
        body: "payload",
      });
      expect(sockets()).toEqual({ opened: 1, closed: 1 });
    } finally {
      await server.close();
    }
  });

  it("waits for real request drain before end when write applies backpressure", async () => {
    const order: string[] = [];
    const originalWrite = ClientRequest.prototype.write;
    const originalEnd = ClientRequest.prototype.end;
    vi.spyOn(ClientRequest.prototype, "write").mockImplementation(function (
      this: ClientRequest,
      ...args: unknown[]
    ) {
      const accepted = Reflect.apply(originalWrite, this, args) as boolean;
      order.push(`write:${accepted}`);
      this.once("drain", () => order.push("drain"));
      return accepted;
    });
    vi.spyOn(ClientRequest.prototype, "end").mockImplementation(function (
      this: ClientRequest,
      ...args: unknown[]
    ) {
      order.push("end");
      return Reflect.apply(originalEnd, this, args) as ClientRequest;
    });
    const server = await serve(async (request, response) => {
      const received = await body(request);
      expect(received.length).toBe(2 * 1024 * 1024);
      response.end("ok");
    });
    try {
      const response = await nodeHttpTransport(server.url, {
        method: "POST",
        body: "x".repeat(2 * 1024 * 1024),
      });
      expect(await response.text()).toBe("ok");
      expect(order[0]).toBe("write:false");
      expect(order.indexOf("drain")).toBeGreaterThan(0);
      expect(order.indexOf("end")).toBeGreaterThan(order.indexOf("drain"));
    } finally {
      await server.close();
    }
  });

  it("aborts a pending request-drain wait with the exact reason and removes listeners", async () => {
    const lifecycle = observeClientLifecycle();
    const ownedRequests: ClientRequest[] = [];
    vi.spyOn(ClientRequest.prototype, "write").mockImplementation(function (
      this: ClientRequest,
    ) {
      ownedRequests.push(this);
      return false;
    });
    const server = await serve(() => undefined);
    const controller = new AbortController();
    const reason = { owner: "request drain" };
    try {
      const pending = nodeHttpTransport(server.url, {
        method: "POST",
        body: "payload",
        signal: controller.signal,
      });
      const request = ownedRequests[0]!;
      if (request.socket === null) {
        await new Promise<void>((resolve) => request.once("socket", () => resolve()));
      }
      expect(request.listenerCount("drain")).toBe(1);
      controller.abort(reason);
      await expect(pending).rejects.toBe(reason);
      expect(request.listenerCount("drain")).toBe(0);
      expect(request.listenerCount("error")).toBe(0);
      expect(request.listenerCount("response")).toBe(0);
      expect(request.listenerCount("socket")).toBe(0);
      expect(request.listenerCount("close")).toBe(0);
      expect(lifecycle.counts()).toEqual({ opened: 1, closed: 1 });
    } finally {
      await server.close();
    }
  });

  it("preserves request-error identity while request drain is pending", async () => {
    const lifecycle = observeClientLifecycle();
    const ownedRequests: ClientRequest[] = [];
    vi.spyOn(ClientRequest.prototype, "write").mockImplementation(function (
      this: ClientRequest,
    ) {
      ownedRequests.push(this);
      return false;
    });
    const server = await serve(() => undefined);
    try {
      const pending = nodeHttpTransport(server.url, {
        method: "POST",
        body: "payload",
      });
      const request = ownedRequests[0]!;
      if (request.socket === null) {
        await new Promise<void>((resolve) => request.once("socket", () => resolve()));
      }
      expect(request.listenerCount("drain")).toBe(1);
      const serverSocket = await server.firstConnection;
      serverSocket.destroy();
      let rejection: unknown;
      try {
        await pending;
      } catch (error) {
        rejection = error;
      }
      expect(rejection).toBe(lifecycle.errors[0]);
      expect(rejection).toEqual(expect.objectContaining({ code: "ECONNRESET" }));
      expect(request.listenerCount("drain")).toBe(0);
      expect(request.listenerCount("error")).toBe(0);
      expect(request.listenerCount("response")).toBe(0);
      expect(lifecycle.counts()).toEqual({ opened: 1, closed: 1 });
    } finally {
      await server.close();
    }
  });

  it("resolves at headers and streams SSE body bytes without buffering", async () => {
    const sockets = observeClientSockets();
    let releaseBody!: () => void;
    const bodyReleased = new Promise<void>((resolve) => (releaseBody = resolve));
    const server = await serve(async (_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.flushHeaders();
      await bodyReleased;
      response.end("data: ready\n\n");
    });
    try {
      const response = await nodeHttpTransport(server.url);
      expect(response.headers.get("content-type")).toBe("text/event-stream");
      releaseBody();
      expect(await response.text()).toBe("data: ready\n\n");
      expect(sockets()).toEqual({ opened: 1, closed: 1 });
    } finally {
      releaseBody();
      await server.close();
    }
  });

  it("pauses at Web-stream capacity and resumes only as the reader pulls", async () => {
    const order: string[] = [];
    const server = await serve((_request, response) => {
      response.writeHead(200);
      response.write("first");
      response.write("second");
      response.end("third");
    });
    const { IncomingMessage: Message } = await import("node:http");
    const originalPause = Message.prototype.pause;
    const originalResume = Message.prototype.resume;
    vi.spyOn(Message.prototype, "pause").mockImplementation(function (
      this: IncomingMessage,
    ) {
      if (this.statusCode !== null) order.push("pause");
      return originalPause.call(this);
    });
    vi.spyOn(Message.prototype, "resume").mockImplementation(function (
      this: IncomingMessage,
    ) {
      if (this.statusCode !== null) order.push("resume");
      return originalResume.call(this);
    });
    try {
      const response = await nodeHttpTransport(server.url);
      const reader = response.body!.getReader();
      const first = await reader.read();
      expect(first.done).toBe(false);
      expect(order).toContain("pause");
      expect(order).toContain("resume");
      expect(order.indexOf("pause")).toBeLessThan(order.indexOf("resume"));
      while (!(await reader.read()).done) {
        // Pulling one chunk at a time is the behavior under test.
      }
      expect(order.filter((entry) => entry === "pause").length).toBeGreaterThan(1);
      expect(order.filter((entry) => entry === "resume").length).toBeGreaterThan(1);
    } finally {
      await server.close();
    }
  });

  it.each([
    ["HEAD", 200],
    ["GET", 204],
    ["GET", 304],
  ])("returns a null body for %s/%i only after close", async (method, status) => {
    const sockets = observeClientSockets();
    const server = await serve((_request, response) => {
      response.writeHead(status);
      response.end();
    });
    try {
      const response = await nodeHttpTransport(server.url, { method });
      expect(response.status).toBe(status);
      expect(response.body).toBeNull();
      expect(sockets()).toEqual({ opened: 1, closed: 1 });
    } finally {
      await server.close();
    }
  });

  it.each([
    ["HEAD", 200],
    ["GET", 204],
    ["GET", 304],
  ])(
    "aborts a held null-body %s/%i response with the exact reason",
    async (method, status) => {
      const lifecycle = observeClientLifecycle({ holdResponseEnd: true });
      const server = await serve((_request, response) => {
        response.writeHead(status);
        response.flushHeaders();
      });
      const controller = new AbortController();
      const reason = { owner: `${method}/${status}` };
      try {
        const pending = nodeHttpTransport(server.url, {
          method,
          signal: controller.signal,
        });
        const response = await lifecycle.firstResponse;
        await lifecycle.responseEndObserved;
        const listenerCounts = {
          end: response.listenerCount("end"),
          error: response.listenerCount("error"),
        };
        controller.abort(reason);
        await expect(pending).rejects.toBe(reason);
        expect(response.listenerCount("end")).toBe(listenerCounts.end - 1);
        expect(response.listenerCount("error")).toBe(listenerCounts.error - 1);
        expect(lifecycle.counts()).toEqual({ opened: 1, closed: 1 });
      } finally {
        lifecycle.releaseResponseEnd();
        await server.close();
      }
    },
  );

  it("returns redirects without following them", async () => {
    let targetHits = 0;
    const server = await serve((request, response) => {
      if (request.url === "/target") targetHits += 1;
      response.writeHead(request.url === "/target" ? 200 : 302, {
        location: "/target",
      });
      response.end();
    });
    try {
      const response = await nodeHttpTransport(`${server.url}/redirect`);
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/target");
      expect(targetHits).toBe(0);
    } finally {
      await server.close();
    }
  });

  it("preserves custom abort-reason identity before headers", async () => {
    let requestObserved!: () => void;
    const observed = new Promise<void>((resolve) => (requestObserved = resolve));
    const server = await serve(() => requestObserved());
    const controller = new AbortController();
    const reason = new Error("owner stopped before headers");
    try {
      const pending = nodeHttpTransport(server.url, { signal: controller.signal });
      await observed;
      controller.abort(reason);
      await expect(pending).rejects.toBe(reason);
      // The abort rejects as soon as the CLIENT destroys its socket; the server
      // learns of the close an event-loop turn or more later, so the drain is
      // awaited rather than asserted against the platform's teardown timing.
      await vi.waitFor(() => expect(server.sockets.size).toBe(0));
    } finally {
      await server.close();
    }
  });

  it("preserves custom abort-reason identity after headers and removes its listener", async () => {
    const sockets = observeClientSockets();
    const server = await serve((_request, response) => {
      response.writeHead(200);
      response.flushHeaders();
    });
    const controller = new AbortController();
    const added = vi.spyOn(controller.signal, "addEventListener");
    const removed = vi.spyOn(controller.signal, "removeEventListener");
    const reason = { owner: "reader" };
    try {
      const response = await nodeHttpTransport(server.url, {
        signal: controller.signal,
      });
      const read = response.body!.getReader().read();
      controller.abort(reason);
      await expect(read).rejects.toBe(reason);
      expect(added).toHaveBeenCalledWith("abort", expect.any(Function), { once: true });
      expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
      expect(sockets()).toEqual({ opened: 1, closed: 1 });
    } finally {
      await server.close();
    }
  });

  it("preserves response-error identity and removes response and request listeners", async () => {
    const lifecycle = observeClientLifecycle();
    const server = await serve((_request, response) => {
      response.writeHead(200);
      response.flushHeaders();
    });
    const failure = new Error("response stream failed");
    try {
      const response = await nodeHttpTransport(server.url);
      const message = await lifecycle.firstResponse;
      const listenerCounts = {
        data: message.listenerCount("data"),
        end: message.listenerCount("end"),
        error: message.listenerCount("error"),
      };
      const read = response.body!.getReader().read();
      message.emit("error", failure);
      await expect(read).rejects.toBe(failure);
      expect(message.listenerCount("data")).toBe(listenerCounts.data - 1);
      expect(message.listenerCount("end")).toBe(listenerCounts.end - 1);
      expect(message.listenerCount("error")).toBe(listenerCounts.error - 1);
      const request = lifecycle.requests[0]!;
      expect(request.listenerCount("response")).toBe(0);
      expect(request.listenerCount("error")).toBe(0);
      expect(request.listenerCount("socket")).toBe(0);
      expect(request.listenerCount("close")).toBe(0);
      expect(lifecycle.counts()).toEqual({ opened: 1, closed: 1 });
    } finally {
      await server.close();
    }
  });

  it("awaits reader cancellation through socket close", async () => {
    const sockets = observeClientSockets();
    const server = await serve((_request, response) => {
      response.writeHead(200);
      response.write("frame");
    });
    try {
      const response = await nodeHttpTransport(server.url);
      const reader = response.body!.getReader();
      expect((await reader.read()).done).toBe(false);
      await reader.cancel("owner complete");
      expect(sockets()).toEqual({ opened: 1, closed: 1 });
    } finally {
      await server.close();
    }
  });

  it("does not treat a destroyed socket as closed before its close event", async () => {
    const clientRequests: ClientRequest[] = [];
    const clientSockets: Socket[] = [];
    const originalRequestEmit = ClientRequest.prototype.emit;
    vi.spyOn(ClientRequest.prototype, "emit").mockImplementation(function (
      this: ClientRequest,
      event: string | symbol,
      ...args: unknown[]
    ) {
      if (event === "socket") {
        clientRequests.push(this);
        clientSockets.push(args[0] as Socket);
      }
      return Reflect.apply(originalRequestEmit, this, [event, ...args]) as boolean;
    });

    const server = await serve((_request, response) => {
      response.writeHead(200);
      response.write("frame");
    });
    let releaseSocketClose: (() => void) | null = null;
    try {
      const response = await nodeHttpTransport(server.url);
      const reader = response.body!.getReader();
      expect((await reader.read()).done).toBe(false);
      expect(clientRequests).toHaveLength(1);
      expect(clientSockets).toHaveLength(1);

      const request = clientRequests[0]!;
      const socket = clientSockets[0]!;
      const originalSocketEmit = socket.emit;
      let closeObserved!: () => void;
      const closeHeld = new Promise<void>((resolve) => (closeObserved = resolve));
      let heldCloseArguments: unknown[] | null = null;
      vi.spyOn(socket, "emit").mockImplementation(function (
        this: Socket,
        event: string | symbol,
        ...args: unknown[]
      ) {
        if (event === "close") {
          heldCloseArguments = args;
          closeObserved();
          return true;
        }
        return Reflect.apply(originalSocketEmit, this, [event, ...args]) as boolean;
      });
      releaseSocketClose = () => {
        if (heldCloseArguments === null) return;
        Reflect.apply(originalSocketEmit, socket, ["close", ...heldCloseArguments]);
        heldCloseArguments = null;
      };

      const originalDestroy = request.destroy;
      vi.spyOn(request, "destroy").mockImplementation(function (
        this: ClientRequest,
        ...args: Parameters<ClientRequest["destroy"]>
      ) {
        const result = Reflect.apply(originalDestroy, this, args) as ClientRequest;
        this.emit("close");
        return result;
      });

      let cancellationSettled = false;
      const cancellation = reader.cancel("owner complete").then(() => {
        cancellationSettled = true;
      });
      await closeHeld;
      await Promise.resolve();
      expect(socket.destroyed).toBe(true);
      expect(cancellationSettled).toBe(false);
      releaseSocketClose();
      await cancellation;
      expect(cancellationSettled).toBe(true);
    } finally {
      releaseSocketClose?.();
      await server.close();
    }
  });

  it("preserves the exact non-abort connection failure object", async () => {
    const lifecycle = observeClientLifecycle();
    const server = await serve((_request, response) => response.end());
    const url = server.url;
    await server.close();
    let rejection: unknown;
    try {
      await nodeHttpTransport(url);
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toBe(lifecycle.errors[0]);
    expect(rejection).toEqual(expect.objectContaining({ code: "ECONNREFUSED" }));
    expect(lifecycle.counts()).toEqual({ opened: 1, closed: 1 });
  });

  it("uses a distinct non-pooled socket and retains none across sequential calls", async () => {
    const lifecycle = observeClientLifecycle();
    const server = await serve((_request, response) => response.end("ok"));
    try {
      expect(await (await nodeHttpTransport(server.url)).text()).toBe("ok");
      expect(await (await nodeHttpTransport(server.url)).text()).toBe("ok");
      expect(lifecycle.counts()).toEqual({ opened: 2, closed: 2 });
      expect(lifecycle.sockets[0]).not.toBe(lifecycle.sockets[1]);
      expect(lifecycle.sockets.every((socket) => socket.destroyed)).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("routes liveClient without consulting ambient happy-dom fetch", async () => {
    const ambient = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("ambient fetch must remain unused"));
    const response = await liveFetch("/status");
    expect(response.ok).toBe(true);
    expect(ambient).not.toHaveBeenCalled();
  });
});

describe("nodeHttpTransport HTTPS policy", () => {
  it("uses strict TLS against a real self-signed server", async () => {
    const server = createHttpsServer(
      {
        key: pem("PRIVATE KEY", SELF_SIGNED_KEY),
        cert: pem("CERTIFICATE", SELF_SIGNED_CERTIFICATE),
      },
      (_request, response) => response.end("untrusted"),
    );
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const port = (server.address() as AddressInfo).port;
    try {
      await expect(nodeHttpTransport(`https://127.0.0.1:${port}/`)).rejects.toEqual(
        expect.objectContaining({ code: "DEPTH_ZERO_SELF_SIGNED_CERT" }),
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
