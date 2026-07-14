// @vitest-environment node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import config, { pwaOptions, sanitizeDependencyLocalhost } from "../apps/web/vite.config";

describe("static PWA configuration", () => {
  it("emits one location-agnostic distribution", () => {
    expect(config).toMatchObject({
      base: "./",
      build: { sourcemap: false },
    });
  });

  it("uses vite-plugin-pwa and precaches only the application shell and assets", () => {
    expect(config.plugins?.flat().map((plugin) => plugin && "name" in plugin ? plugin.name : "")).toContain("vite-plugin-pwa");
    expect(pwaOptions).toMatchObject({
      manifest: false,
      injectRegister: "auto",
      strategies: "generateSW",
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: "index.html",
      },
    });
    expect(pwaOptions.workbox?.globPatterns).not.toContain("**/*.map");
  });

  it("never serves network-backed Web3 and identity traffic from cache", () => {
    const rules = pwaOptions.workbox?.runtimeCaching ?? [];
    expect(rules.some((rule) => rule.handler === "NetworkOnly" && rule.method === "POST")).toBe(true);

    const sensitiveRule = rules.find((rule) => rule.handler === "NetworkOnly" && rule.method !== "POST");
    expect(sensitiveRule).toBeDefined();
    const pattern = sensitiveRule?.urlPattern as RegExp;
    for (const url of [
      "https://mainnet.base.org/rpc",
      "https://indexer.alterford.example/events",
      "https://relay.walletconnect.com",
      "https://account.example/oauth/authorize",
      "https://pay.example/onramp/session",
    ]) {
      expect(pattern.test(url), url).toBe(true);
    }
  });

  it("removes development localhost literals only from known third-party modules", () => {
    const source = 'export const url = "http://localhost:3000";';
    expect(sanitizeDependencyLocalhost(source, "/node_modules/@reown/appkit/constants.js")).not.toContain("localhost");
    expect(sanitizeDependencyLocalhost(source, "/node_modules/@walletconnect/jsonrpc-utils/url.js")).not.toContain("localhost");
    expect(sanitizeDependencyLocalhost(source, "/src/config.ts")).toBe(source);
  });

  it("ships an installable relative manifest with purpose-specific icons", async () => {
    const publicDir = resolve("apps", "web", "public");
    const manifest = JSON.parse(await readFile(resolve(publicDir, "manifest.webmanifest"), "utf8"));

    expect(manifest).toMatchObject({
      name: "Alterford",
      short_name: "Alterford",
      start_url: "./",
      scope: "./",
      display: "standalone",
    });
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: "./pwa-192x192.png", sizes: "192x192", purpose: "any" }),
      expect.objectContaining({ src: "./pwa-512x512.png", sizes: "512x512", purpose: "any" }),
      expect.objectContaining({ src: "./pwa-maskable-512x512.png", sizes: "512x512", purpose: "maskable" }),
    ]));

    await expect(readFile(resolve(publicDir, "pwa-192x192.png"))).resolves.not.toHaveLength(0);
    await expect(readFile(resolve(publicDir, "pwa-512x512.png"))).resolves.not.toHaveLength(0);
    await expect(readFile(resolve(publicDir, "pwa-maskable-512x512.png"))).resolves.not.toHaveLength(0);
  });
});
