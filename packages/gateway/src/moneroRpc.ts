import { createHash, randomBytes } from "node:crypto";
import JSONbigFactory from "json-bigint";

const JSONbig = JSONbigFactory({ useNativeBigInt: true });

export interface MoneroWalletRpcOptions {
  rpcUrl: string;
  accountIndex?: number;
  username?: string;
  password?: string;
  fetcher?: typeof fetch;
  cnonce?: () => string;
}

export interface MoneroIncomingTransfer {
  txHash: string;
  amountAtomic: bigint;
  confirmations: number;
  doubleSpendSeen: boolean;
  locked: boolean;
  addressIndex: number;
}

export class MoneroWalletRpcClient {
  private readonly fetcher: typeof fetch;
  private readonly accountIndex: number;
  private readonly cnonce: () => string;
  private digestNonceCount = 0;

  constructor(private readonly options: MoneroWalletRpcOptions) {
    const url = new URL(options.rpcUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Monero RPC URL must use HTTP or HTTPS.");
    }
    this.fetcher = options.fetcher ?? fetch;
    this.accountIndex = options.accountIndex ?? 0;
    this.cnonce = options.cnonce ?? (() => randomBytes(12).toString("hex"));
  }

  async createAddress(label: string) {
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(label)) throw new Error("Invalid Monero address label.");
    const result = await this.call("create_address", {
      account_index: this.accountIndex,
      label,
    });
    const address = stringField(result, "address");
    const addressIndex = integerField(result, "address_index");
    validateMoneroAddress(address);
    return { address, addressIndex };
  }

  async incomingTransfers(addressIndex: number): Promise<MoneroIncomingTransfer[]> {
    requireIndex(addressIndex);
    const result = await this.call("get_transfers", {
      in: true,
      pending: true,
      pool: true,
      failed: false,
      account_index: this.accountIndex,
      subaddr_indices: [addressIndex],
    });
    const entries = [
      ...arrayField(result, "in"),
      ...arrayField(result, "pending"),
      ...arrayField(result, "pool"),
    ];
    return entries.map((entry) => {
      const subaddress = objectField(entry, "subaddr_index");
      return {
        txHash: hashField(entry, "txid"),
        amountAtomic: bigintField(entry, "amount"),
        confirmations: optionalIntegerField(entry, "confirmations", 0),
        doubleSpendSeen: optionalBooleanField(entry, "double_spend_seen", false),
        locked: optionalBooleanField(entry, "locked", true),
        addressIndex: integerField(subaddress, "minor"),
      };
    });
  }

  async transfer(address: string, amountAtomic: bigint) {
    validateMoneroAddress(address);
    if (amountAtomic <= 0n) throw new Error("Monero withdrawal amount must be positive.");
    const result = await this.call("transfer", {
      account_index: this.accountIndex,
      destinations: [{ address, amount: amountAtomic }],
      get_tx_key: true,
    });
    return {
      txHash: hashField(result, "tx_hash"),
      feeAtomic: bigintField(result, "fee"),
    };
  }

  async height() {
    const result = await this.call("get_height", {});
    return integerField(result, "height");
  }

  private async call(method: string, params: Record<string, unknown>) {
    const body = JSONbig.stringify({
      jsonrpc: "2.0",
      id: method,
      method,
      params,
    });
    const request: RequestInit = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    };
    let response = await this.fetcher(this.options.rpcUrl, request);
    if (response.status === 401 && this.options.username && this.options.password) {
      const challenge = response.headers.get("www-authenticate");
      if (!challenge?.startsWith("Digest ")) throw new Error("Monero RPC authentication failed.");
      response = await this.fetcher(this.options.rpcUrl, {
        ...request,
        headers: {
          "content-type": "application/json",
          authorization: this.digestAuthorization(challenge),
        },
      });
    }
    if (!response.ok) throw new Error(`Monero RPC HTTP ${response.status}.`);
    const payload = JSONbig.parse(await response.text()) as {
      result?: unknown;
      error?: { code?: number; message?: string };
    };
    if (payload.error) {
      throw new Error(payload.error.message || `Monero RPC error ${payload.error.code ?? "unknown"}.`);
    }
    if (!payload.result || typeof payload.result !== "object" || Array.isArray(payload.result)) {
      throw new Error("Monero RPC returned an invalid result.");
    }
    return payload.result as Record<string, unknown>;
  }

  private digestAuthorization(challengeHeader: string) {
    const username = this.options.username!;
    const password = this.options.password!;
    const challenge = parseDigestChallenge(challengeHeader);
    const url = new URL(this.options.rpcUrl);
    const uri = `${url.pathname}${url.search}`;
    const cnonce = this.cnonce();
    const nonceCount = (++this.digestNonceCount).toString(16).padStart(8, "0");
    const qop = challenge.qop?.split(",").map((value) => value.trim()).find((value) => value === "auth");
    if (!challenge.realm || !challenge.nonce || !qop) {
      throw new Error("Unsupported Monero RPC digest challenge.");
    }
    const ha1 = md5(`${username}:${challenge.realm}:${password}`);
    const ha2 = md5(`POST:${uri}`);
    const digest = md5(`${ha1}:${challenge.nonce}:${nonceCount}:${cnonce}:${qop}:${ha2}`);
    const fields = [
      `username="${escapeHeader(username)}"`,
      `realm="${escapeHeader(challenge.realm)}"`,
      `nonce="${escapeHeader(challenge.nonce)}"`,
      `uri="${escapeHeader(uri)}"`,
      `response="${digest}"`,
      `qop=${qop}`,
      `nc=${nonceCount}`,
      `cnonce="${escapeHeader(cnonce)}"`,
    ];
    if (challenge.opaque) fields.push(`opaque="${escapeHeader(challenge.opaque)}"`);
    return `Digest ${fields.join(", ")}`;
  }
}

export function validateMoneroAddress(address: string) {
  if (!/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{95}$/.test(address)) {
    throw new Error("Monero RPC returned an invalid address.");
  }
}

function parseDigestChallenge(header: string) {
  const values: Record<string, string> = {};
  const source = header.slice(7);
  for (const match of source.matchAll(/([a-zA-Z]+)=(?:"([^"]*)"|([^,\s]+))/g)) {
    values[match[1]!.toLowerCase()] = match[2] ?? match[3] ?? "";
  }
  return values;
}

function md5(value: string) {
  return createHash("md5").update(value).digest("hex");
}

function escapeHeader(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function requireIndex(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid Monero address index.");
}

function objectField(value: Record<string, unknown>, key: string) {
  const result = value[key];
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(`Monero RPC returned an invalid ${key}.`);
  }
  return result as Record<string, unknown>;
}

function arrayField(value: Record<string, unknown>, key: string) {
  const result = value[key];
  if (result === undefined) return [];
  if (!Array.isArray(result)) throw new Error(`Monero RPC returned an invalid ${key}.`);
  return result.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Monero RPC returned an invalid ${key} entry.`);
    }
    return entry as Record<string, unknown>;
  });
}

function stringField(value: Record<string, unknown>, key: string) {
  const result = value[key];
  if (typeof result !== "string" || !result) throw new Error(`Monero RPC returned an invalid ${key}.`);
  return result;
}

function hashField(value: Record<string, unknown>, key: string) {
  const result = stringField(value, key);
  if (!/^[0-9a-fA-F]{64}$/.test(result)) throw new Error(`Monero RPC returned an invalid ${key}.`);
  return result.toLowerCase();
}

function bigintField(value: Record<string, unknown>, key: string) {
  const result = value[key];
  if (typeof result !== "bigint" && typeof result !== "number" && typeof result !== "string") {
    throw new Error(`Monero RPC returned an invalid ${key}.`);
  }
  const normalized = BigInt(result);
  if (normalized < 0n) throw new Error(`Monero RPC returned an invalid ${key}.`);
  return normalized;
}

function integerField(value: Record<string, unknown>, key: string) {
  const result = value[key];
  const normalized = typeof result === "bigint" ? Number(result) : result;
  if (!Number.isSafeInteger(normalized) || Number(normalized) < 0) {
    throw new Error(`Monero RPC returned an invalid ${key}.`);
  }
  return Number(normalized);
}

function optionalIntegerField(value: Record<string, unknown>, key: string, fallback: number) {
  return value[key] === undefined ? fallback : integerField(value, key);
}

function optionalBooleanField(value: Record<string, unknown>, key: string, fallback: boolean) {
  const result = value[key];
  if (result === undefined) return fallback;
  if (typeof result !== "boolean") throw new Error(`Monero RPC returned an invalid ${key}.`);
  return result;
}
