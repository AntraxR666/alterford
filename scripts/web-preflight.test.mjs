// @vitest-environment node

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditDist } from "./web-preflight.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("web distribution preflight", () => {
  it("accepts a relative production distribution", async () => {
    const dist = await fixture({
      "index.html": '<script type="module" src="./assets/app.js"></script>',
      "assets/app.js": 'const rpc="https://sepolia.base.org";',
      "manifest.webmanifest": '{"start_url":"./"}',
    });

    await expect(auditDist(dist)).resolves.toMatchObject({ ok: true, fileCount: 3 });
  });

  it.each([
    ["localhost URL", "assets/app.js", 'fetch("http://localhost:8787/events")', /localhost/i],
    ["loopback URL", "assets/app.js", 'fetch("http://127.0.0.1:8545")', /loopback/i],
    ["embedded deploy secret", "assets/app.js", 'const PINATA_JWT="eyJhbGciOiJIUzI1NiJ9.payload.signature"', /PINATA_JWT/i],
    ["private key", "assets/app.js", `const key="0x${"a".repeat(64)}"`, /private key/i],
    ["source map reference", "assets/app.js", "//# sourceMappingURL=app.js.map", /source map/i],
  ])("rejects %s", async (_name, path, content, error) => {
    const dist = await fixture({ "index.html": "<main>Alterford</main>", [path]: content });
    await expect(auditDist(dist)).rejects.toThrow(error);
  });

  it("rejects source map files even when they are not referenced", async () => {
    const dist = await fixture({ "index.html": "<main>Alterford</main>", "assets/app.js.map": "{}" });
    await expect(auditDist(dist)).rejects.toThrow(/app\.js\.map/i);
  });

  it("allows runtime sourceURL labels that do not publish source maps", async () => {
    const dist = await fixture({
      "index.html": "<main>Alterford</main>",
      "assets/app.js": 'const label = "//# sourceURL=runtime-template";',
    });
    await expect(auditDist(dist)).resolves.toMatchObject({ ok: true });
  });

  it("allows bare localhost compatibility literals that are not network URLs", async () => {
    const dist = await fixture({
      "index.html": "<main>Alterford</main>",
      "assets/app.js": 'const fallbackHost = "localhost";',
    });
    await expect(auditDist(dist)).resolves.toMatchObject({ ok: true });
  });
});

async function fixture(files) {
  const dist = await mkdtemp(join(tmpdir(), "alterford-web-preflight-"));
  temporaryDirectories.push(dist);
  for (const [relativePath, content] of Object.entries(files)) {
    const target = join(dist, relativePath);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, content);
  }
  return dist;
}
