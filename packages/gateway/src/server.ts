import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Address, Hex } from "viem";
import type { SignedForwardRequest } from "@alterford/sdk";
import { PolicyViolation } from "./policy.js";
import type { FiatSessionInput } from "./transak.js";

interface GatewayHttpService {
  prepareRelay(input: { chainId: number; user: Address; target: Address; data: Hex }, ip: string): Promise<unknown>;
  submitRelay(input: { request: SignedForwardRequest; idempotencyKey: string }, ip: string): Promise<unknown>;
  relayStatus(taskId: string): Promise<unknown>;
  createFiatSession(input: FiatSessionInput & { idempotencyKey: string }): Promise<unknown>;
  createMoneroDeposit?(input: {
    beneficiary: Address;
    requestedAmountAtomic?: bigint;
    idempotencyKey: string;
  }): Promise<unknown>;
  moneroDeposit?(id: string): unknown;
  syncMoneroDeposits?(): Promise<unknown>;
  moneroWithdrawalNonce?(beneficiary: Address): bigint;
  submitMoneroWithdrawal?(input: {
    beneficiary: Address;
    destination: string;
    amountAtomic: bigint;
    nonce: bigint;
    deadline: number;
    idempotencyKey: string;
    signature: Hex;
  }): Promise<unknown>;
  xmrCapabilities?(ip: string): Promise<unknown>;
  createXmrQuote?(input: {
    destination: Address;
    depositAmountAtomic?: bigint;
    settlementAmountMinor?: bigint;
    idempotencyKey: string;
    userIp: string;
    assistanceRequested?: boolean;
  }): Promise<unknown>;
  createXmrConversion?(input: {
    destination: Address;
    quoteId: string;
    idempotencyKey: string;
    nonce: bigint;
    deadline: number;
    signature: Hex;
    userIp: string;
  }): Promise<unknown>;
  syncXmrConversion?(id: string, userIp: string): Promise<unknown>;
  xmrAssistanceCase?(id: string): unknown;
  pinEvidence?(input: {
    fileName: string;
    mimeType: string;
    bytesBase64: string;
  }): Promise<unknown>;
}

interface ServerOptions {
  port: number;
  allowedOrigins: string[];
  publicConfig: {
    chainId: number;
    marketFactory: Address;
    bountyFactory: Address;
    challengeFactory: Address;
    forwarder: Address;
    relayEnabled: boolean;
    fiatEnabled: boolean;
    monero?: {
      enabled: boolean;
      network: "mainnet" | "stagenet" | "testnet";
      minimumConfirmations: number;
      withdrawalsEnabled: boolean;
      nativeSettlementEnabled: false;
    };
    xmrConversion?: {
      enabled: boolean;
      provider: string;
      assistedThresholdMinor: string;
      settlementChainId: number;
    };
    evidenceUploads?: {
      enabled: boolean;
      maxBytes: number;
      mimeTypes: readonly string[];
    };
  };
  operatorSyncToken?: string;
  xmrOperatorToken?: string;
  evidenceUploadMaxBytes?: number;
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
      if (request.method === "POST" && url.pathname === "/v1/evidence/images") {
        if (!service.pinEvidence) return send(response, 503, { error: "EVIDENCE_UPLOAD_NOT_CONFIGURED" });
        const maxBytes = options.evidenceUploadMaxBytes ?? 10 * 1024 * 1024;
        const body = await readBody(request, Math.ceil(maxBytes * 4 / 3) + 65_536);
        return send(response, 201, await service.pinEvidence({
          fileName: requiredString(body, "fileName"),
          mimeType: requiredString(body, "mimeType"),
          bytesBase64: requiredString(body, "bytesBase64"),
        }));
      }
      if (request.method === "GET" && url.pathname === "/v1/xmr/capabilities") {
        if (!service.xmrCapabilities) return send(response, 503, { error: "XMR_CONVERSION_NOT_CONFIGURED" });
        return send(response, 200, await service.xmrCapabilities(ip));
      }
      if (request.method === "POST" && url.pathname === "/v1/xmr/quotes") {
        if (!service.createXmrQuote) return send(response, 503, { error: "XMR_CONVERSION_NOT_CONFIGURED" });
        const body = await readBody(request);
        return send(response, 201, await service.createXmrQuote({
          destination: requiredString(body, "destination") as Address,
          depositAmountAtomic: optionalBigIntString(body, "depositAmountAtomic"),
          settlementAmountMinor: optionalBigIntString(body, "settlementAmountMinor"),
          idempotencyKey: requiredString(body, "idempotencyKey"),
          assistanceRequested: body.assistanceRequested === true,
          userIp: ip,
        }));
      }
      if (request.method === "POST" && url.pathname === "/v1/xmr/conversions") {
        if (!service.createXmrConversion) return send(response, 503, { error: "XMR_CONVERSION_NOT_CONFIGURED" });
        const body = await readBody(request);
        return send(response, 201, await service.createXmrConversion({
          destination: requiredString(body, "destination") as Address,
          quoteId: requiredString(body, "quoteId"),
          idempotencyKey: requiredString(body, "idempotencyKey"),
          nonce: requiredBigIntString(body, "nonce"),
          deadline: requiredNumber(body, "deadline"),
          signature: requiredString(body, "signature") as Hex,
          userIp: ip,
        }));
      }
      if (
        request.method === "POST"
        && url.pathname.startsWith("/v1/xmr/conversions/")
        && url.pathname.endsWith("/sync")
      ) {
        if (!service.syncXmrConversion) return send(response, 503, { error: "XMR_CONVERSION_NOT_CONFIGURED" });
        if (!validOperatorToken(request, options.xmrOperatorToken, "x-alterford-operator-token")) {
          return send(response, 401, { error: "INVALID_XMR_OPERATOR_TOKEN" });
        }
        const encodedId = url.pathname.slice("/v1/xmr/conversions/".length, -"/sync".length);
        return send(response, 200, await service.syncXmrConversion(decodeURIComponent(encodedId), ip));
      }
      if (request.method === "GET" && url.pathname.startsWith("/v1/xmr/conversions/")) {
        if (!service.syncXmrConversion) return send(response, 503, { error: "XMR_CONVERSION_NOT_CONFIGURED" });
        return send(response, 200, await service.syncXmrConversion(
          decodeURIComponent(url.pathname.slice("/v1/xmr/conversions/".length)),
          ip,
        ));
      }
      if (request.method === "POST" && url.pathname === "/v1/xmr/assistance") {
        if (!service.createXmrQuote) return send(response, 503, { error: "XMR_CONVERSION_NOT_CONFIGURED" });
        const body = await readBody(request);
        return send(response, 201, await service.createXmrQuote({
          destination: requiredString(body, "destination") as Address,
          settlementAmountMinor: requiredBigIntString(body, "settlementAmountMinor"),
          idempotencyKey: requiredString(body, "idempotencyKey"),
          assistanceRequested: true,
          userIp: ip,
        }));
      }
      if (request.method === "GET" && url.pathname.startsWith("/v1/xmr/assistance/")) {
        if (!service.xmrAssistanceCase) return send(response, 503, { error: "XMR_CONVERSION_NOT_CONFIGURED" });
        return send(response, 200, service.xmrAssistanceCase(
          decodeURIComponent(url.pathname.slice("/v1/xmr/assistance/".length)),
        ));
      }
      if (request.method === "POST" && url.pathname === "/v1/relay/prepare") {
        const body = await readBody(request);
        return send(response, 200, await service.prepareRelay({
          chainId: requiredNumber(body, "chainId"),
          user: requiredString(body, "user") as Address,
          target: requiredString(body, "target") as Address,
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
      if (request.method === "POST" && url.pathname === "/v1/crypto/xmr/deposits") {
        if (!service.createMoneroDeposit) return send(response, 503, { error: "XMR_NOT_CONFIGURED" });
        const body = await readBody(request);
        const amount = optionalBigIntString(body, "requestedAmountAtomic");
        return send(response, 201, await service.createMoneroDeposit({
          beneficiary: requiredString(body, "beneficiary") as Address,
          requestedAmountAtomic: amount,
          idempotencyKey: requiredString(body, "idempotencyKey"),
        }));
      }
      if (request.method === "GET" && url.pathname.startsWith("/v1/crypto/xmr/deposits/")) {
        if (!service.moneroDeposit) return send(response, 503, { error: "XMR_NOT_CONFIGURED" });
        return send(
          response,
          200,
          service.moneroDeposit(decodeURIComponent(url.pathname.slice("/v1/crypto/xmr/deposits/".length))),
        );
      }
      if (request.method === "POST" && url.pathname === "/v1/crypto/xmr/sync") {
        if (!service.syncMoneroDeposits) return send(response, 503, { error: "XMR_NOT_CONFIGURED" });
        if (!validOperatorToken(request, options.operatorSyncToken)) {
          return send(response, 401, { error: "INVALID_SYNC_TOKEN" });
        }
        return send(response, 200, await service.syncMoneroDeposits());
      }
      if (request.method === "GET" && url.pathname.startsWith("/v1/crypto/xmr/withdrawals/nonce/")) {
        if (!service.moneroWithdrawalNonce) return send(response, 503, { error: "XMR_NOT_CONFIGURED" });
        const beneficiary = decodeURIComponent(
          url.pathname.slice("/v1/crypto/xmr/withdrawals/nonce/".length),
        ) as Address;
        return send(response, 200, { beneficiary, nonce: service.moneroWithdrawalNonce(beneficiary) });
      }
      if (request.method === "POST" && url.pathname === "/v1/crypto/xmr/withdrawals") {
        if (!service.submitMoneroWithdrawal) {
          return send(response, 503, { error: "XMR_NOT_CONFIGURED" });
        }
        const body = await readBody(request);
        return send(response, 202, await service.submitMoneroWithdrawal({
          beneficiary: requiredString(body, "beneficiary") as Address,
          destination: requiredString(body, "destination"),
          amountAtomic: requiredBigIntString(body, "amountAtomic"),
          nonce: requiredBigIntString(body, "nonce"),
          deadline: requiredNumber(body, "deadline"),
          idempotencyKey: requiredString(body, "idempotencyKey"),
          signature: requiredString(body, "signature") as Hex,
        }));
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

async function readBody(request: IncomingMessage, maxBytes = 65_536): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    length += buffer.length;
    if (length > maxBytes) throw new Error("Request body exceeds the allowed size.");
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

function requiredBigIntString(value: Record<string, unknown>, key: string) {
  const candidate = requiredString(value, key);
  if (!/^\d+$/.test(candidate)) throw new Error(`${key} must be an unsigned integer string.`);
  return BigInt(candidate);
}

function optionalBigIntString(value: Record<string, unknown>, key: string) {
  return value[key] === undefined ? undefined : requiredBigIntString(value, key);
}

function clientIp(request: IncomingMessage) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() || "unknown";
  return request.socket.remoteAddress || "unknown";
}

function validOperatorToken(
  request: IncomingMessage,
  expected?: string,
  header: "x-alterford-sync-token" | "x-alterford-operator-token" = "x-alterford-sync-token",
) {
  const supplied = request.headers[header];
  if (!expected || typeof supplied !== "string") return false;
  const actualBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
}

function send(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.end(JSON.stringify(body, (_key, value) => typeof value === "bigint" ? value.toString() : value));
}
