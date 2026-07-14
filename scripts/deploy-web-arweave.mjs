import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveIrysConfig, safeErrorMessage } from "./web-deploy-config.mjs";
import { auditDist } from "./web-preflight.mjs";

export async function publishToArweave({
  distDir = resolve("apps", "web", "dist"),
  env = process.env,
  uploaderFactory = createIrysUploader,
} = {}) {
  const config = resolveIrysConfig(env);
  await auditDist(distDir);
  const uploader = await uploaderFactory(config);
  const receipt = await uploader.uploadFolder(resolve(distDir), {
    indexFile: "index.html",
    batchSize: 25,
    keepDeleted: false,
    interactivePreflight: false,
  });
  const id = receipt?.id;
  if (!id) throw new Error("Irys upload completed without a manifest id.");
  return { provider: "irys", id, url: `https://gateway.irys.xyz/${id}` };
}

async function createIrysUploader(config) {
  if (config.token !== "ethereum") {
    throw new Error('IRYS_TOKEN currently supports only "ethereum".');
  }
  const [{ Uploader }, { Ethereum }] = await Promise.all([
    import("@irys/upload"),
    import("@irys/upload-ethereum"),
  ]);
  let builder = Uploader(Ethereum).withWallet(config.privateKey).network(config.network);
  if (config.rpcUrl) builder = builder.withRpc(config.rpcUrl);
  return builder;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    console.log(JSON.stringify(await publishToArweave(), null, 2));
  } catch (error) {
    console.error(safeErrorMessage(error));
    process.exitCode = 1;
  }
}
