import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import { A2aTeamClient, type TeamRunStartPayload } from "./a2aTeam";

describe("A2aTeamClient transport identity", () => {
  it("retries one lost run-start acknowledgement with the exact run id and resumes relay by cursor", async () => {
    const requestBodies: string[] = [];
    const requestTargets: string[] = [];
    const server = createServer((request, response) => {
      requestTargets.push(request.url ?? "");
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        body += chunk;
      });
      request.on("end", () => {
        if (request.url === "/ops/a2a/run-start") {
          requestBodies.push(body);
          if (requestBodies.length === 1) {
            // Real lost-ack transport failure: close the TCP socket before any
            // response bytes. The production client must retry idempotently.
            request.socket.destroy();
            return;
          }
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              data: {
                envelope: {
                  api_version: "v1",
                  run_id: "run-0123456789abcdef0123456789abcdef",
                  status: "submitted",
                },
              },
              tiers: {
                declared: { available: true },
                structural: { available: true },
                temporal: { available: true },
                semantic: { available: true },
              },
            }),
          );
          return;
        }

        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end();
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      const address = server.address() as AddressInfo;
      const client = new A2aTeamClient({
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
      const payload: TeamRunStartPayload = {
        run_id: "run-0123456789abcdef0123456789abcdef",
        team_preset: "vaultspec-authoring",
        message: "Audit the edge",
        expected_scope: "scope-token",
      };

      const started = await client.startRun(payload);
      expect(started.ok).toBe(true);
      expect(started.run_id).toBe(payload.run_id);
      expect(requestBodies).toEqual([JSON.stringify(payload), JSON.stringify(payload)]);

      const relay = await client.openRunStream("run-a", 17);
      expect(relay.ok).toBe(true);
      expect(requestTargets).toContain("/ops/a2a/runs/run-a/stream?since=17");
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
