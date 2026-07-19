// @vitest-environment happy-dom

import { createServer } from "node:http";
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
    const server = createServer((request, response) => {
      if (request.url?.includes("/ops/a2a/runs/run-shared/stream")) {
        streamResponse = response;
        response.writeHead(200, { "content-type": "text/event-stream" });
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
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              data: {
                envelope: {
                  api_version: "v1",
                  run_id: "run-shared",
                  status: "running",
                  semantic_phase: "running",
                },
              },
            }),
          );
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
        fetch(new URL(String(input), `http://127.0.0.1:${port}`), init),
      );
      const queryClient = new QueryClient({
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
      cleanup();
      streamResponse?.end();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("retries non-terminal EOF but completes after terminal EOF", async () => {
    let nonTerminalRequests = 0;
    let terminalRequests = 0;
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
      response.end('event: message_chunk\ndata: {"seq":1,"content":"x"}\n\n');
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const { port } = server.address() as AddressInfo;
      a2aTeamClient.useTransport((input, init) =>
        fetch(new URL(String(input), `http://127.0.0.1:${port}`), init),
      );
      const queryClient = new QueryClient();
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
      cleanup();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
