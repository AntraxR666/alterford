import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { SponsorshipLedgerSnapshot } from "./ledger.js";

export function loadLedgerSnapshot(path: string): SponsorshipLedgerSnapshot | undefined {
  try {
    const parsed = JSON.parse(readFileSync(resolve(path), "utf8")) as SponsorshipLedgerSnapshot;
    return parsed?.version === 1 && Array.isArray(parsed.reservations) ? parsed : undefined;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return undefined;
    throw new Error(`Unable to read sponsorship ledger: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function atomicLedgerWriter(path: string) {
  const destination = resolve(path);
  mkdirSync(dirname(destination), { recursive: true });
  return (snapshot: SponsorshipLedgerSnapshot) => {
    const temporary = `${destination}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(snapshot)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, destination);
  };
}
