// @vitest-environment happy-dom

import { createServer, request as requestHttp, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { liveTransport } from "../../testing/liveClient";
import { a2aTeamClient, useRunRelay } from "../../stores/server/agent/a2aTeam";
import { TeamRunProgressProvider, useTeamRunProgress } from "./TeamRunProgressContext";

afterEach(() => {
  cleanup();
  a2aTeamClient.useTransport(liveTransport);
});

/** Real Node HTTP transport with a streaming Fetch response.
 *
 * happy-dom's fetch client reports cleanly closed long-lived sockets as
 * ECONNRESET during teardown. This adapter still uses a genuine TCP request and
 * streamed response, but owns the Node socket lifecycle explicitly. */
function realHttpTransport(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const target = input instanceof URL ? input : new URL(String(input));
  return new Promise<Response>((resolve, reject) => {
    let abortRequest: (() => void) | undefined;
    const removeAbortListener = () => {
      if (init?.signal && abortRequest) {
        init.signal.removeEventListener("abort", abortRequest);
      }
    };
    const request = requestHttp(
      target,
      {
        method: init?.method,
        headers: init?.headers as import("node:http").OutgoingHttpHeaders,
      },
      (response) => {
        let bodySettled = false;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            const settle = (error?: Error) => {
              if (bodySettled) return;
              bodySettled = true;
              removeAbortListener();
              if (error) controller.error(error);
              else controller.close();
            };
            response.on("data", (chunk: Buffer) => controller.enqueue(chunk));
            response.once("end", () => settle());
            response.once("error", settle);
            response.once("aborted", () => settle(new Error("response aborted")));
            response.once("close", () => {
              if (!response.complete) settle(new Error("response closed early"));
            });
          },
          cancel() {
            removeAbortListener();
            response.destroy();
          },
        });
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) {
            for (const item of value) headers.append(name, item);
          } else if (value !== undefined) {
            headers.set(name, value);
          }
        }
        resolve(
          new Response(body, {
            headers,
            status: response.statusCode ?? 500,
            statusText: response.statusMessage,
          }),
        );
      },
    );
    request.once("error", (error) => {
      removeAbortListener();
      reject(error);
    });
    if (init?.signal) {
      abortRequest = () => request.destroy(new DOMException("Aborted", "AbortError"));
      if (init.signal.aborted) abortRequest();
      else init.signal.addEventListener("abort", abortRequest, { once: true });
    }
    if (init?.body) request.write(init.body);
    request.end();
  });
}

async function closeServer(server: Server): Promise<void> {
  const closed = new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  server.closeAllConnections();
  await Promise.race([
    closed,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error("test HTTP server did not close within 2s")),
        2_000,
      );
      timer.unref();
    }),
  ]);
}

function ProgressConsumer({
  label,
  observe,
}: {
  label: string;
  observe: (degraded: boolean) => void;
}) {
  const progress = useTeamRunProgress();
  observe(progress.degraded);
  return <span data-testid={label}>{String(progress.degraded)}</span>;
}

function RelayConsumer({ runId }: { runId: string }) {
  const relay = useRunRelay(runId);
  return <span>{relay.data?.frames.length ?? 0}</span>;
}

describe("TeamRunProgressProvider", () => {
  it("preserves a streamed gap through dense eviction for two consumers", async () => {
    let statusRequests = 0;
    let observedDegraded = false;
    let streamResponse: import("node:http").ServerResponse | undefined;
    let queryClient: QueryClient | undefined;
    const server = createServer((request, response) => {
      if (request.url?.includes("/ops/a2a/runs/run-shared/stream")) {
        streamResponse = response;
        response.writeHead(200, {
          connection: "close",
          "content-type": "text/event-stream",
        });
        response.write(
          [
            'event: gap\ndata: {"reason":"budget pressure"}\n\n',
            ...Array.from(
              { length: 300 },
              (_, seq) =>
                `event: message_chunk\ndata: ${JSON.stringify({ seq, content: "x" })}\n\n`,
            ),
          ].join(""),
        );
        return;
      }
      if (request.url?.endsWith("/ops/a2a/run-status")) {
        statusRequests += 1;
        setTimeout(() => {
          const body = JSON.stringify({
            data: {
              envelope: {
                api_version: "v1",
                run_id: "run-shared",
                status: "running",
                semantic_phase: "running",
              },
            },
          });
          response.writeHead(200, {
            connection: "close",
            "content-length": Buffer.byteLength(body),
            "content-type": "application/json",
          });
          response.end(body);
        }, 100);
        return;
      }
      response.writeHead(404).end();
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const { port } = server.address() as AddressInfo;
      a2aTeamClient.useTransport((input, init) =>
        realHttpTransport(new URL(String(input), `http://127.0.0.1:${port}`), init),
      );
      queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      render(
        <QueryClientProvider client={queryClient}>
          <TeamRunProgressProvider runId="run-shared">
            <ProgressConsumer
              label="composer"
              observe={(value) => {
                observedDegraded ||= value;
              }}
            />
            <ProgressConsumer
              label="transcript"
              observe={(value) => {
                observedDegraded ||= value;
              }}
            />
          </TeamRunProgressProvider>
        </QueryClientProvider>,
      );

      await waitFor(() => expect(observedDegraded).toBe(true), { timeout: 5_000 });
      await waitFor(() => expect(statusRequests).toBeGreaterThan(0), {
        timeout: 5_000,
      });
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(statusRequests).toBeLessThanOrEqual(2);
    } finally {
      try {
        streamResponse?.end(
          'event: thread_terminal\ndata: {"seq":301,"status":"completed"}\n\n',
        );
        if (queryClient) {
          const activeQueryClient = queryClient;
          await waitFor(() => expect(activeQueryClient.isFetching()).toBe(0), {
            timeout: 2_000,
          });
        }
      } finally {
        cleanup();
        await queryClient?.cancelQueries();
        queryClient?.clear();
        await closeServer(server);
      }
    }
  });

  it("retries non-terminal EOF but completes after terminal EOF", async () => {
    let nonTerminalRequests = 0;
    let terminalRequests = 0;
    let heldNonTerminal: import("node:http").ServerResponse | undefined;
    let queryClient: QueryClient | undefined;
    const server = createServer((request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      if (request.url?.includes("run-terminal")) {
        terminalRequests += 1;
        response.end(
          'event: thread_terminal\ndata: {"seq":1,"status":"completed"}\n\n',
        );
        return;
      }
      nonTerminalRequests += 1;
      response.write('event: message_chunk\ndata: {"seq":1,"content":"x"}\n\n');
      if (nonTerminalRequests === 1) response.end();
      else heldNonTerminal = response;
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const { port } = server.address() as AddressInfo;
      a2aTeamClient.useTransport((input, init) =>
        realHttpTransport(new URL(String(input), `http://127.0.0.1:${port}`), init),
      );
      queryClient = new QueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <RelayConsumer runId="run-non-terminal" />
          <RelayConsumer runId="run-terminal" />
        </QueryClientProvider>,
      );

      await waitFor(() => expect(nonTerminalRequests).toBeGreaterThanOrEqual(2), {
        timeout: 5_000,
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(terminalRequests).toBe(1);
    } finally {
      try {
        heldNonTerminal?.end(
          'event: thread_terminal\ndata: {"seq":2,"status":"completed"}\n\n',
        );
        if (queryClient) {
          const activeQueryClient = queryClient;
          await waitFor(() => expect(activeQueryClient.isFetching()).toBe(0), {
            timeout: 2_000,
          });
        }
      } finally {
        cleanup();
        await queryClient?.cancelQueries();
        queryClient?.clear();
        await closeServer(server);
      }
    }
  });
});
