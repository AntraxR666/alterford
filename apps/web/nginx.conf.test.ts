import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PWA nginx cache policy", () => {
  it("never marks the service worker bootstrap files as immutable", async () => {
    const configPath = resolve(process.cwd(), "nginx.conf");
    const config = await readFile(configPath, "utf8");

    expect(config).toContain('location = /sw.js');
    expect(config).toContain('location = /registerSW.js');
    expect(config).toMatch(/location = \/sw\.js\s*\{\s*add_header Cache-Control "no-cache, no-store, must-revalidate" always;/s);
    expect(config).toMatch(/location = \/registerSW\.js\s*\{\s*add_header Cache-Control "no-cache, no-store, must-revalidate" always;/s);
  });
});
