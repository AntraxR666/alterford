import { createServer } from "node:http";
import type { ProjectionState } from "./projections.js";
import { createReadApi } from "./api.js";
import type { HealthPayload } from "./observability.js";
import type { IndexerSnapshot } from "./store.js";

export function startReadServer(
  state: ProjectionState,
  port = 8787,
  health?: () => HealthPayload,
  snapshot?: () => IndexerSnapshot,
) {
  const api = createReadApi(state);
  const server = createServer((request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Content-Type", "application/json");

    if (url.pathname === "/health") return send(response, health ? health() : { ok: true });
    if (url.pathname === "/metrics") return send(response, health ? health().metrics : {});
    if (url.pathname === "/snapshot") return send(response, snapshot ? snapshot() : {});
    if (url.pathname === "/markets") return send(response, api.listMarkets());
    if (url.pathname === "/bounties") return send(response, api.listBounties());
    if (url.pathname === "/challenges") return send(response, api.listChallenges());
    if (url.pathname.startsWith("/markets/")) {
      return send(response, api.getMarket(url.pathname.split("/")[2] || ""));
    }
    if (url.pathname.startsWith("/challenges/")) {
      return send(response, api.getChallenge(url.pathname.split("/")[2] || ""));
    }
    if (url.pathname.startsWith("/bounties/")) {
      return send(response, api.getBounty(url.pathname.split("/")[2] || ""));
    }
    if (url.pathname === "/bets") {
      return send(
        response,
        api.listBets(
          url.searchParams.get("marketId") || undefined,
          url.searchParams.get("user") || undefined,
        ),
      );
    }
    if (url.pathname === "/claims") {
      return send(
        response,
        api.listClaims(
          url.searchParams.get("marketId") || undefined,
          url.searchParams.get("user") || undefined,
        ),
      );
    }
    if (url.pathname.startsWith("/fees/")) return send(response, api.getFees(url.pathname.split("/")[2] || ""));
    if (url.pathname.startsWith("/bonds/")) {
      const [, , entityType, entityId] = url.pathname.split("/");
      return send(response, api.getBond(entityType || "", entityId || ""));
    }

    response.statusCode = 404;
    return send(response, { error: "Not found" });
  });

  server.listen(port);
  return server;
}

function send(response: { end: (body: string) => void }, value: unknown) {
  response.end(JSON.stringify(value, jsonReplacer));
}

function jsonReplacer(_key: string, value: unknown) {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Map) return Object.fromEntries(value);
  if (value instanceof Set) return [...value];
  return value;
}
