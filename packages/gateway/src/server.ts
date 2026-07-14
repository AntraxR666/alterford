import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Address, Hex } from "viem";
import type { SignedForwardRequest } from "@alterford/sdk";
import { PolicyViolation } from "./policy.js";
import type { FiatSessionInput } from "./transak.js";

interface GatewayHttpService {
  prepareRelay(input: { chainId: number; user: Address; data: Hex }, ip: string): Promise<unknown>;
  submitRelay(input: { request: SignedForwardRequest; idempotencyKey: string }, ip: string): Promise<unknown>;
  relayStatus(taskId: string): Promise<unknown>;
  createFiatSession(input: FiatSessionInput & { idempotencyKey: string }): Promise<unknown>;
}

interface ServerOptions {
  port: number;
  allowedOrigins: string[];
  publicConfig: {
    chainId: number;
    challengeFactory: Address;
    forwarder: Address;
    relayEnabled: boolean;
    fiatEnabled: boolean;
  };
}

export function startGatewayServer(service: GatewayHttpService, options: ServerOptions) {
  const server = createServer(async (request, response) => {
    try {
      applyCors(request, response, options.allowedOrigins);
      if (request.method === "OPTIONS") {
        response.statusCode = 204;
        return response.end();
      }
      if (request.method === "POST" && !originAllowed(request, options.allowedOrigins)) {
        return send(response, 403, { error: "ORIGIN_NOT_ALLOWED" });
      }
      const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
      const ip = clientIp(request);

      if (request.method === "GET" && url.pathname === "/health") {
        return send(response, 200, { ok: true, service: "alterford-gateway" });
      }
      if (request.method === "GET" && url.pathname === "/v1/config") {
        return send(response, 200, options.publicConfig);
      }
      if (request.method === "POST" && url.pathname === "/v1/relay/prepare") {
        const body = await readBody(request);
        return send(response, 200, await service.prepareRelay({
          chainId: requiredNumber(body, "chainId"),
          user: requiredString(body, "user") as Address,
          data: requiredString(body, "data") as Hex,
        }, ip));
      }
      if (request.method === "POST" && url.pathname === "/v1/relay/submit") {
        const body = await readBody(request);
        const rawRequest = requiredObject(body, "request");
        const signedRequest: SignedForwardRequest = {
          from: requiredString(rawRequest, "from") as Address,
          to: requiredString(rawRequest, "to") as Address,
          value: BigInt(requiredString(rawRequest, "value")),
          gas: BigInt(requiredString(rawRequest, "gas")),
          nonce: BigInt(requiredString(rawRequest, "nonce")),
          deadline: requiredNumber(rawRequest, "deadline"),
          data: requiredString(rawRequest, "data") as Hex,
          signature: requiredString(rawRequest, "signature") as Hex,
        };
        return send(response, 202, await service.submitRelay({
          request: signedRequest,
          idempotencyKey: requiredString(body, "idempotencyKey"),
        }, ip));
      }
      if (request.method === "GET" && url.pathname.startsWith("/v1/relay/tasks/")) {
        return send(response, 200, await service.relayStatus(decodeURIComponent(url.pathname.slice(16))));
      }
      if (request.method === "POST" && url.pathname === "/v1/fiat/sessions") {
        const body = await readBody(request);
        return send(response, 201, await service.createFiatSession({
          idempotencyKey: requiredString(body, "idempotencyKey"),
          walletAddress: requiredString(body, "walletAddress") as Address,
          fiatAmount: requiredNumber(body, "fiatAmount"),
          fiatCurrency: requiredString(body, "fiatCurrency"),
          cryptoCurrencyCode: requiredString(body, "cryptoCurrencyCode"),
          network: requiredString(body, "network"),
          partnerOrderId: requiredString(body, "partnerOrderId"),
        }));
      }
      return send(response, 404, { error: "NOT_FOUND" });
    } catch (error) {
      const policy = error instanceof PolicyViolation;
      const message = error instanceof Error ? error.message : "Unexpected gateway error.";
      return send(response, policy ? 422 : 400, {
        error: policy ? error.code : "INVALID_REQUEST",
        message,
      });
    }
  });
  server.listen(options.port, "0.0.0.0");
  return server;
}

function originAllowed(request: IncomingMessage, allowedOrigins: string[]) {
  const origin = request.headers.origin;
  return !origin || allowedOrigins.includes(origin);
}

function applyCors(request: IncomingMessage, response: ServerResponse, allowedOrigins: string[]) {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.includes(origin)) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Headers", "content-type,idempotency-key");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    length += buffer.length;
    if (length > 65_536) throw new Error("Request body exceeds 64 KiB.");
    chunks.push(buffer);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON object required.");
  return parsed as Record<string, unknown>;
}

function requiredObject(value: Record<string, unknown>, key: string) {
  const candidate = value[key];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error(`${key} must be an object.`);
  }
  return candidate as Record<string, unknown>;
}

function requiredString(value: Record<string, unknown>, key: string) {
  const candidate = value[key];
  if (typeof candidate !== "string" || candidate.length === 0) throw new Error(`${key} is required.`);
  return candidate;
}

function requiredNumber(value: Record<string, unknown>, key: string) {
  const candidate = value[key];
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) throw new Error(`${key} must be a number.`);
  return candidate;
}

function clientIp(request: IncomingMessage) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() || "unknown";
  return request.socket.remoteAddress || "unknown";
}

function send(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.end(JSON.stringify(body, (_key, value) => typeof value === "bigint" ? value.toString() : value));
}
