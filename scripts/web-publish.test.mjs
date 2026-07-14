// @vitest-environment node

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { publishToArweave } from "./deploy-web-arweave.mjs";
import { publishToIpfs } from "./deploy-web-ipfs.mjs";
import { packageManagerInvocation, runReleaseSteps } from "./web-process.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("IPFS publication", () => {
  it("constructs the real Fleek adapter without loading its incompatible path uploader", async () => {
    const output = execFileSync(process.execPath, [
      "--input-type=module",
      "--eval",
      'import { createFleekPublisher } from "./scripts/deploy-web-ipfs.mjs"; const publisher = await createFleekPublisher({ token: "fleek-token", projectId: "project-id" }); process.stdout.write(typeof publisher.uploadDirectory);',
    ], { encoding: "utf8" });
    expect(output).toBe("function");
  });

  it("uploads the complete dist folder to a configurable Pinata endpoint", async () => {
    const distDir = await fixture();
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ IpfsHash: "bafy-pinata" }),
    }));

    const result = await publishToIpfs({
      distDir,
      env: {
        PINNING_PROVIDER: "pinata",
        PINNING_TOKEN: "pinata-secret",
        PINNING_API_URL: "https://pin.example/upload",
      },
      fetchImpl,
    });

    expect(result).toEqual({ provider: "pinata", cid: "bafy-pinata", uri: "ipfs://bafy-pinata" });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, request] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://pin.example/upload");
    expect(request.headers.Authorization).toBe("Bearer pinata-secret");
    expect(request.body).toBeInstanceOf(FormData);
    expect(request.body.getAll("file").map((file) => file.name).sort()).toEqual([
      "alterford-web/assets/app.js",
      "alterford-web/index.html",
    ]);
    expect(JSON.parse(request.body.get("pinataOptions"))).toEqual({ cidVersion: 1 });
  });

  it("uploads a virtual directory through Fleek without exposing its token in the result", async () => {
    const distDir = await fixture();
    const uploadDirectory = vi.fn(async () => ({ pin: { cid: "bafy-fleek" } }));
    const fleekFactory = vi.fn(async () => ({ uploadDirectory }));

    const result = await publishToIpfs({
      distDir,
      env: {
        PINNING_PROVIDER: "fleek",
        PINNING_TOKEN: "fleek-secret",
        PINNING_PROJECT_ID: "project-id",
      },
      fleekFactory,
    });

    expect(fleekFactory).toHaveBeenCalledWith({ token: "fleek-secret", projectId: "project-id" });
    expect(uploadDirectory).toHaveBeenCalledOnce();
    expect(uploadDirectory.mock.calls[0][0].files.map((file) => file.path).sort()).toEqual(["assets/app.js", "index.html"]);
    expect(result).toEqual({ provider: "fleek", cid: "bafy-fleek", uri: "ipfs://bafy-fleek" });
    expect(JSON.stringify(result)).not.toContain("fleek-secret");
  });

  it("surfaces provider failures without echoing credentials", async () => {
    const distDir = await fixture();
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, text: async () => "token pinata-secret invalid" }));

    await expect(publishToIpfs({
      distDir,
      env: { PINNING_PROVIDER: "pinata", PINNING_TOKEN: "pinata-secret" },
      fetchImpl,
    })).rejects.toThrow("Pinata upload failed (HTTP 401)");
  });
});

describe("Irys publication", () => {
  it("uploads dist as an indexed folder for a stable release", async () => {
    const distDir = await fixture();
    const uploadFolder = vi.fn(async () => ({ id: "irys-manifest-id" }));
    const uploaderFactory = vi.fn(async () => ({ uploadFolder }));

    const result = await publishToArweave({
      distDir,
      env: {
        RELEASE_CHANNEL: "stable",
        IRYS_TOKEN: "ethereum",
        IRYS_PRIVATE_KEY: "wallet-secret",
        IRYS_RPC_URL: "https://rpc.example",
      },
      uploaderFactory,
    });

    expect(uploaderFactory).toHaveBeenCalledWith({
      token: "ethereum",
      privateKey: "wallet-secret",
      rpcUrl: "https://rpc.example",
      network: "mainnet",
    });
    expect(uploadFolder).toHaveBeenCalledWith(distDir, expect.objectContaining({ indexFile: "index.html" }));
    expect(result).toEqual({ provider: "irys", id: "irys-manifest-id", url: "https://gateway.irys.xyz/irys-manifest-id" });
    expect(JSON.stringify(result)).not.toContain("wallet-secret");
  });

  it("rejects preview publication before constructing an uploader", async () => {
    const uploaderFactory = vi.fn();
    await expect(publishToArweave({
      distDir: "unused",
      env: { RELEASE_CHANNEL: "preview", IRYS_PRIVATE_KEY: "wallet-secret" },
      uploaderFactory,
    })).rejects.toThrow(/stable/i);
    expect(uploaderFactory).not.toHaveBeenCalled();
  });
});

describe("stable release orchestration", () => {
  it("uses ComSpec for pnpm shims on Windows without enabling a child shell", () => {
    expect(packageManagerInvocation(["run", "build:web:static"], "win32", { ComSpec: "C:\\Windows\\cmd.exe" })).toEqual({
      command: "C:\\Windows\\cmd.exe",
      args: ["/d", "/s", "/c", "pnpm run build:web:static"],
    });
  });

  it("runs build, IPFS, and Arweave sequentially with a stable channel", async () => {
    const calls = [];
    await runReleaseSteps(async (script, env) => calls.push([script, env.RELEASE_CHANNEL]));
    expect(calls).toEqual([
      ["build:web:static", "stable"],
      ["deploy:web:ipfs", "stable"],
      ["deploy:web:arweave", "stable"],
    ]);
  });

  it("stops before Arweave when IPFS fails", async () => {
    const calls = [];
    await expect(runReleaseSteps(async (script) => {
      calls.push(script);
      if (script === "deploy:web:ipfs") throw new Error("IPFS unavailable");
    })).rejects.toThrow("IPFS unavailable");
    expect(calls).toEqual(["build:web:static", "deploy:web:ipfs"]);
  });
});

async function fixture() {
  const distDir = await mkdtemp(join(tmpdir(), "alterford-web-publish-"));
  temporaryDirectories.push(distDir);
  await mkdir(join(distDir, "assets"), { recursive: true });
  await writeFile(join(distDir, "index.html"), "<main>Alterford</main>");
  await writeFile(join(distDir, "assets", "app.js"), "export {};");
  return distDir;
}
