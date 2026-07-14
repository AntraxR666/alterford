import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA, type VitePWAOptions } from "vite-plugin-pwa";

const networkOnlyPattern = /(?:^|[./_-])(rpc|indexer|walletconnect|wallet-connect|relay|oauth|authorize|token|onramp|on-ramp|moonpay|transak|coinbase)(?:[./_?-]|$)/i;
const localhostDependencyIds = [
  "/node_modules/@reown/appkit/",
  "/node_modules/@walletconnect/jsonrpc-utils/",
];

export function sanitizeDependencyLocalhost(code: string, id: string) {
  const normalizedId = id.replaceAll("\\", "/");
  if (!localhostDependencyIds.some((dependencyId) => normalizedId.includes(dependencyId))) return code;
  return code.replaceAll("localhost", "invalid.invalid");
}

const productionDependencyUrls: Plugin = {
  name: "alterford-production-dependency-urls",
  enforce: "pre",
  transform(code, id) {
    const sanitized = sanitizeDependencyLocalhost(code, id);
    return sanitized === code ? null : { code: sanitized, map: null };
  },
};

export const pwaOptions: Partial<VitePWAOptions> = {
  strategies: "generateSW",
  injectRegister: "auto",
  registerType: "autoUpdate",
  manifest: false,
  includeAssets: ["pwa-192x192.png", "pwa-512x512.png", "pwa-maskable-512x512.png"],
  workbox: {
    cleanupOutdatedCaches: true,
    clientsClaim: true,
    skipWaiting: true,
    navigateFallback: "index.html",
    navigateFallbackDenylist: [networkOnlyPattern],
    globPatterns: ["**/*.{html,js,css,webmanifest,png,svg,ico,woff,woff2}"],
    globIgnores: ["**/*.map"],
    runtimeCaching: [
      {
        urlPattern: networkOnlyPattern,
        handler: "NetworkOnly",
      },
      {
        urlPattern: /^https?:\/\//i,
        handler: "NetworkOnly",
        method: "POST",
      },
      {
        urlPattern: ({ url }) => url.origin !== globalThis.location.origin,
        handler: "NetworkOnly",
      },
      {
        urlPattern: /\/assets\/.*\.(?:js|css|woff2?|png|svg)$/i,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "alterford-assets",
          cacheableResponse: { statuses: [0, 200] },
          expiration: { maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
    ],
  },
};

export default defineConfig({
  base: "./",
  build: {
    sourcemap: false,
  },
  plugins: [productionDependencyUrls, react(), VitePWA(pwaOptions)],
  test: {
    environment: "jsdom",
  },
});
