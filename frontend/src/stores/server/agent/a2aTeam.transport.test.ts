import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import { A2aTeamClient, type TeamRunStartPayload } from "./a2aTeam";

describe("A2aTeamClient transport identity", () => {
  it("carries bounded advanced selections, omits empty fields, retries one lost acknowledgement, and resumes relay by cursor", async () => {
    const requestBodies: string[] = [];
    const runStartBodies: string[] = [];
    const requestTargets: string[] = [];
    const server = createServer((request, response) => {
      requestTargets.push(request.url ?? "");
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        body += chunk;
      });
      request.on("end", () => {
        if (request.url === "/ops/a2a/provider-catalog") {
          requestBodies.push(body);
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              data: {
                envelope: {
                  providers: [
                    {
                      provider_id: "provider-issued-id",
                      execution_mode: "execution-lane-issued-id",
                      health: {
                        configured: "available",
                        transport: "available",
                        authentication: "authenticated",
                        catalog: "available",
                        admission: "admitted",
                        selectable: true,
                        reasons: [],
                        checked_at: "2026-08-02T08:30:00Z",
                      },
                      catalog: {
                        state: {
                          status: "available",
                          revision: "catalog-revision-issued-id",
                          checked_at: "2026-08-02T09:30:00Z",
                          expires_at: "2099-08-02T10:30:00Z",
                          reason: "A2A-issued freshness reason",
                        },
                        models: [
                          {
                            entry_id: "entry-issued-id",
                            capabilities: [],
                            native_control_ids: ["provider-native-control-issued-id"],
                          },
                        ],
                        native_controls: [
                          {
                            control_id: "provider-native-control-issued-id",
                            options: [
                              { option_id: "provider-native-default-issued-id" },
                            ],
                          },
                        ],
                      },
                    },
                  ],
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

        if (request.url === "/ops/a2a/run-start") {
          requestBodies.push(body);
          runStartBodies.push(body);
          if (runStartBodies.length === 1) {
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

        if (request.url === "/ops/a2a/run-status") {
          requestBodies.push(body);
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              data: {
                envelope: {
                  run_id: "run-0123456789abcdef0123456789abcdef",
                  status: "running",
                  frozen_assignment: {
                    schema_version: 1,
                    digest:
                      "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
                    assignments: [
                      {
                        role_id: "role-issued-id",
                        provider_id: "provider-issued-id",
                        provider_display_name: "Provider-issued display",
                        execution_mode: "execution-lane-issued-id",
                        catalog_revision: "catalog-revision-issued-id",
                        entry_id: "entry-issued-id",
                        model_name: "provider-issued-model-value",
                        model_display_name: "Provider-issued model display",
                        controls: [
                          {
                            control_id: "provider-native-control-issued-id",
                            option_id: "provider-native-default-issued-id",
                            provider_value: "provider-native-value",
                            display_name: "Provider-native control",
                            option_display_name: "Provider-native option",
                          },
                        ],
                        fallbacks: [
                          {
                            provider_id: "fallback-provider-issued-id",
                            execution_mode: "fallback-execution-lane-issued-id",
                            catalog_revision: "fallback-catalog-revision-issued-id",
                            entry_id: "fallback-entry-issued-id",
                            model_name: "fallback-provider-issued-model-value",
                            controls: [],
                          },
                        ],
                        provenance: {
                          selection_source: "team_selection",
                          authorization: "must-never-reach-the-browser-view",
                        },
                      },
                    ],
                  },
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
        selection: {
          provider_id: "provider-issued-id",
          execution_mode: "execution-lane-issued-id",
          catalog_revision: "catalog-revision-issued-id",
          entry_id: "entry-issued-id",
          controls: {},
        },
        overrides: {
          "role-issued-id": {
            provider_id: "provider-issued-id",
            execution_mode: "execution-lane-issued-id",
            catalog_revision: "catalog-revision-issued-id",
            entry_id: "entry-issued-id",
            controls: {},
          },
        },
        fallbacks: [
          {
            provider_id: "provider-issued-id",
            execution_mode: "execution-lane-issued-id",
            catalog_revision: "catalog-revision-issued-id",
            entry_id: "entry-issued-id",
            controls: {},
          },
        ],
      };
      const emptyPayload: TeamRunStartPayload = {
        run_id: "run-fedcba9876543210fedcba9876543210",
        team_preset: "vaultspec-authoring",
        message: "Audit the empty optional fields",
        expected_scope: "scope-token",
        selection: payload.selection,
      };

      const catalog = await client.listProviderCatalog();
      expect(catalog.providers[0]?.catalog.models[0]?.entry_id).toBe("entry-issued-id");
      expect(catalog.providers[0]?.catalog.models[0]?.native_control_ids).toEqual([
        "provider-native-control-issued-id",
      ]);
      expect(catalog.providers[0]?.health).toMatchObject({
        configured: "available",
        transport: "available",
        authentication: "authenticated",
        catalog: "available",
        admission: "admitted",
        selectable: true,
        checked_at: "2026-08-02T08:30:00Z",
      });
      expect(catalog.providers[0]?.catalog.state).toMatchObject({
        status: "available",
        checked_at: "2026-08-02T09:30:00Z",
        expires_at: "2099-08-02T10:30:00Z",
        reason: "A2A-issued freshness reason",
      });
      const started = await client.startRun(payload);
      expect(started.ok).toBe(true);
      expect(started.run_id).toBe(payload.run_id);
      expect((await client.startRun(emptyPayload)).ok).toBe(true);
      const recovered = await client.runStatus(payload.run_id);
      expect(recovered.frozen_assignment).toMatchObject({
        schema_version: 1,
        digest:
          "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      });
      expect(recovered.frozen_assignment?.assignments[0]).toMatchObject({
        provider_id: "provider-issued-id",
        model_name: "provider-issued-model-value",
        controls: [
          {
            control_id: "provider-native-control-issued-id",
            provider_value: "provider-native-value",
          },
        ],
        provenance: { selection_source: "team_selection" },
      });
      expect(JSON.stringify(recovered)).not.toContain(
        "must-never-reach-the-browser-view",
      );
      expect(requestBodies).toEqual([
        "{}",
        JSON.stringify(payload),
        JSON.stringify(payload),
        JSON.stringify(emptyPayload),
        JSON.stringify({ run_id: payload.run_id }),
      ]);
      expect(requestTargets).toContain("/ops/a2a/provider-catalog");

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
