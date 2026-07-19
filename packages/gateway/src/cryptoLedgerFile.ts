import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { CryptoLedgerSnapshot } from "./cryptoLedger.js";

export function loadCryptoLedgerSnapshot(path: string): CryptoLedgerSnapshot | undefined {
  try {
    const parsed = JSON.parse(readFileSync(resolve(path), "utf8")) as CryptoLedgerSnapshot;
    return parsed?.version === 1
      && Array.isArray(parsed.deposits)
      && Array.isArray(parsed.withdrawals)
      && Array.isArray(parsed.withdrawalNonces)
      ? parsed
      : undefined;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return undefined;
    throw new Error(
      `Unable to read crypto ledger: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function atomicCryptoLedgerWriter(path: string) {
  const destination = resolve(path);
  mkdirSync(dirname(destination), { recursive: true });
  return (snapshot: CryptoLedgerSnapshot) => {
    const temporary = `${destination}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    renameSync(temporary, destination);
  };
}
