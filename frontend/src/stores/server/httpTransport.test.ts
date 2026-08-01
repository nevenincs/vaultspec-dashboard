import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import { EngineError } from "./engine/tiers";
import {
  AUTHORING_ACTOR_TOKEN_HEADER,
  authoringActorFetch,
  engineErrorFromResponse,
  machineBearerFetch,
} from "./httpTransport";

describe("machineBearerFetch", () => {
  it("adds the injected bearer without replacing a caller authorization header", async () => {
    const authorizations: string[] = [];
    const server = createServer((request, response) => {
      authorizations.push(request.headers.authorization ?? "");
      response.writeHead(204).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const transport = machineBearerFetch(() => "machine-token");

    try {
      await transport(`http://127.0.0.1:${address.port}/status`);
      await transport(`http://127.0.0.1:${address.port}/authoring`, {
        headers: { authorization: "Actor caller-token" },
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }

    expect(authorizations).toEqual(["Bearer machine-token", "Actor caller-token"]);
  });
});

describe("authoringActorFetch", () => {
  it("adds the actor header while preserving injected bearer and caller authorization", async () => {
    const received: { actor: string; authorization: string }[] = [];
    const server = createServer((request, response) => {
      const actor = request.headers[AUTHORING_ACTOR_TOKEN_HEADER];
      received.push({
        actor: typeof actor === "string" ? actor : (actor?.join(",") ?? ""),
        authorization: request.headers.authorization ?? "",
      });
      response.writeHead(204).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const baseTransport = machineBearerFetch(() => "machine-token");
    const actorTransport = authoringActorFetch(baseTransport, "actor-token");
    const anonymousTransport = authoringActorFetch(baseTransport);

    try {
      await actorTransport(`http://127.0.0.1:${address.port}/command`);
      await actorTransport(`http://127.0.0.1:${address.port}/command`, {
        headers: { authorization: "Actor caller-token" },
      });
      await anonymousTransport(`http://127.0.0.1:${address.port}/read`);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }

    expect(received).toEqual([
      { actor: "actor-token", authorization: "Bearer machine-token" },
      { actor: "actor-token", authorization: "Actor caller-token" },
      { actor: "", authorization: "Bearer machine-token" },
    ]);
  });
});

describe("engineErrorFromResponse", () => {
  it("retains the unwrapped body and a non-null served tiers record", async () => {
    const error = await engineErrorFromResponse(
      "/status",
      new Response(
        JSON.stringify({
          data: { error_kind: "scope_unknown" },
          tiers: { semantic: { available: false, reason: "rag unavailable" } },
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
    );

    expect(error).toBeInstanceOf(EngineError);
    expect(error.status).toBe(404);
    expect(error.errorKind).toBe("scope_unknown");
    expect(error.tiers).toEqual({
      semantic: { available: false, reason: "rag unavailable" },
    });
  });

  it("rejects null tiers and turns non-JSON failures into status-bearing errors", async () => {
    const nullTiers = await engineErrorFromResponse(
      "/status",
      new Response(JSON.stringify({ data: { error: "no tiers" }, tiers: null }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );
    const textFailure = await engineErrorFromResponse(
      "/status",
      new Response("gateway unavailable", { status: 502, statusText: "Bad Gateway" }),
    );

    expect(nullTiers.tiers).toBeUndefined();
    expect(nullTiers.body).toEqual({ error: "no tiers", tiers: null });
    expect(textFailure).toMatchObject({
      path: "/status",
      status: 502,
      body: undefined,
    });
    expect(textFailure.tiers).toBeUndefined();
  });
});
