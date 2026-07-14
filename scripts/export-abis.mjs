import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const contracts = [
  "MockSettlementToken",
  "CreationBondPolicy",
  "MarketFactory",
  "BountyFactory",
  "ChallengeFactory",
  "BountyRecoveryVault",
];

await mkdir(resolve("deployments", "abis"), { recursive: true });

for (const contractName of contracts) {
  const artifactPath = resolve(
    "packages",
    "contracts",
    "out",
    `${contractName}.sol`,
    `${contractName}.json`,
  );
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  await writeFile(
    resolve("deployments", "abis", `${contractName}.json`),
    `${JSON.stringify(artifact.abi, null, 2)}\n`,
  );
  console.log(`Exported ABI: ${contractName}`);
}
