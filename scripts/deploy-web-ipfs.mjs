import { File } from "node:buffer";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolvePinningConfig, safeErrorMessage } from "./web-deploy-config.mjs";
import { collectFiles } from "./web-files.mjs";
import { auditDist } from "./web-preflight.mjs";

export async function publishToIpfs({
  distDir = resolve("apps", "web", "dist"),
  env = process.env,
  fetchImpl = fetch,
  fleekFactory = createFleekPublisher,
} = {}) {
  const config = resolvePinningConfig(env);
  await auditDist(distDir);
  const files = await collectFiles(distDir);

  if (config.provider === "pinata") {
    return publishToPinata(config, files, fetchImpl);
  }

  const publisher = await fleekFactory({ token: config.token, projectId: config.projectId });
  const response = await publisher.uploadDirectory({ path: resolve(distDir), files });
  const cid = response?.pin?.cid;
  if (!cid) throw new Error("Fleek upload completed without a CID.");
  return { provider: "fleek", cid, uri: `ipfs://${cid}` };
}

async function publishToPinata(config, files, fetchImpl) {
  const body = new FormData();
  for (const file of files) {
    const pinataPath = `alterford-web/${file.path}`;
    body.append("file", new File([file.content], pinataPath), pinataPath);
  }
  body.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));
  body.append("pinataMetadata", JSON.stringify({ name: "alterford-web" }));

  const response = await fetchImpl(config.apiUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}` },
    body,
  });
  if (!response.ok) throw new Error(`Pinata upload failed (HTTP ${response.status}).`);

  const payload = await response.json();
  const cid = payload?.IpfsHash;
  if (!cid) throw new Error("Pinata upload completed without a CID.");
  return { provider: "pinata", cid, uri: `ipfs://${cid}` };
}

export async function createFleekPublisher({ token, projectId }) {
  const { FleekSdk, PersonalAccessTokenService } = await import("@fleek-platform/sdk");
  const accessTokenService = new PersonalAccessTokenService({
    personalAccessToken: token,
    projectId,
  });
  const sdk = new FleekSdk({ accessTokenService });
  return {
    uploadDirectory: ({ files }) => sdk.storage().uploadVirtualDirectory({
      directoryName: "alterford-web",
      files: files.map((file) => ({
        name: file.path,
        stream: () => new Blob([file.content]).stream(),
      })),
    }),
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    console.log(JSON.stringify(await publishToIpfs(), null, 2));
  } catch (error) {
    console.error(safeErrorMessage(error));
    process.exitCode = 1;
  }
}
