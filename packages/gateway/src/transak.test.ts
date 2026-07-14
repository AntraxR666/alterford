import { describe, expect, it, vi } from "vitest";
import { TransakProvider } from "./transak.js";

describe("TransakProvider", () => {
  it("caches the partner token and returns only a one-use hosted widget URL", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { accessToken: "partner-token", expiresAt: 9_000 } }))
      .mockResolvedValueOnce(jsonResponse({ data: { widgetUrl: "https://global-stg.transak.com?sessionId=one" } }))
      .mockResolvedValueOnce(jsonResponse({ data: { widgetUrl: "https://global-stg.transak.com?sessionId=two" } }));
    const provider = new TransakProvider({
      apiKey: "public-partner-key",
      apiSecret: "server-secret",
      referrerDomain: "alterford.example",
      environment: "staging",
      fetcher,
      now: () => 1_000,
    });

    const input = {
      walletAddress: "0x1111111111111111111111111111111111111111" as const,
      fiatAmount: 25,
      fiatCurrency: "USD",
      cryptoCurrencyCode: "ETH",
      network: "base",
      partnerOrderId: "alterford-order-0001",
    };
    await expect(provider.createSession(input)).resolves.toEqual({
      widgetUrl: "https://global-stg.transak.com?sessionId=one",
      expiresInSeconds: 300,
    });
    await provider.createSession({ ...input, partnerOrderId: "alterford-order-0002" });

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      "api-secret": "server-secret",
      "x-api-key": "public-partner-key",
    });
    expect(fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({ "access-token": "partner-token" });
    expect(JSON.stringify(await fetcher.mock.calls[1]?.[1]?.body)).not.toContain("server-secret");
  });

  it("rejects a provider URL outside the expected Transak host", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { accessToken: "partner-token", expiresAt: 9_000 } }))
      .mockResolvedValueOnce(jsonResponse({ data: { widgetUrl: "https://attacker.example/session" } }));
    const provider = new TransakProvider({
      apiKey: "key",
      apiSecret: "secret",
      referrerDomain: "alterford.example",
      environment: "staging",
      fetcher,
      now: () => 1_000,
    });

    await expect(provider.createSession({
      walletAddress: "0x1111111111111111111111111111111111111111",
      fiatAmount: 25,
      fiatCurrency: "USD",
      cryptoCurrencyCode: "ETH",
      network: "base",
      partnerOrderId: "alterford-order-0003",
    })).rejects.toThrow("unexpected widget URL");
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}
