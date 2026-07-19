import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { XmrConversionSnapshot } from "./xmrConversion.js";

export function loadXmrConversionSnapshot(path: string): XmrConversionSnapshot | undefined {
  try {
    const parsed = JSON.parse(readFileSync(resolve(path), "utf8")) as XmrConversionSnapshot;
    return parsed?.version === 1
      && Array.isArray(parsed.quotes)
      && Array.isArray(parsed.conversions)
      && Array.isArray(parsed.assistanceCases)
      && Array.isArray(parsed.conversionNonces)
      ? parsed
      : undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(
      `Unable to read XMR conversion ledger: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function atomicXmrConversionWriter(path: string) {
  const destination = resolve(path);
  mkdirSync(dirname(destination), { recursive: true });
  return (snapshot: XmrConversionSnapshot) => {
    const temporary = `${destination}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    renameSync(temporary, destination);
  };
}
