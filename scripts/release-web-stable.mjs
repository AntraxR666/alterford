import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runReleaseSteps } from "./web-process.mjs";

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    await runReleaseSteps();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
