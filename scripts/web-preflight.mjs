import { readFile, readdir } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const textExtensions = new Set([".css", ".html", ".js", ".json", ".mjs", ".svg", ".txt", ".webmanifest", ".xml"]);
const forbiddenContent = [
  { name: "localhost URL", pattern: /https?:\/\/localhost(?::\d+)?/i },
  { name: "loopback URL", pattern: /https?:\/\/(?:127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])(?::\d+)?/i },
  { name: "PINATA_JWT deploy secret", pattern: /\bPINATA_JWT\b/i },
  { name: "PINNING_TOKEN deploy secret", pattern: /\bPINNING_TOKEN\b/i },
  { name: "Fleek deploy secret", pattern: /\b(?:FLEEK_(?:API_KEY|PAT|TOKEN)|PINNING_PROJECT_ID)\b/i },
  { name: "Irys deploy secret", pattern: /\bIRYS_(?:PRIVATE_KEY|WALLET)\b/i },
  { name: "private key", pattern: /\b(?:private[_-]?key|secret|key)\s*[:=]\s*["']0x[a-f\d]{64}["']/i },
  { name: "source map reference", pattern: /sourceMappingURL\s*=/i },
];

export async function auditDist(distDir = resolve("apps", "web", "dist")) {
  const root = resolve(distDir);
  const files = await walk(root);
  const issues = [];

  if (!files.some((file) => relative(root, file).replaceAll("\\", "/") === "index.html")) {
    issues.push("missing index.html");
  }

  for (const file of files) {
    const relativePath = relative(root, file).replaceAll("\\", "/");
    if (relativePath.endsWith(".map")) {
      issues.push(`${relativePath}: source map files are forbidden`);
      continue;
    }
    if (!textExtensions.has(extname(file).toLowerCase())) continue;

    const content = await readFile(file, "utf8");
    for (const check of forbiddenContent) {
      if (check.pattern.test(content)) issues.push(`${relativePath}: ${check.name}`);
    }
  }

  if (issues.length > 0) {
    throw new Error(`Web dist preflight failed:\n- ${issues.join("\n- ")}`);
  }
  return { ok: true, fileCount: files.length, distDir: root };
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return nested.flat().sort();
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await auditDist(process.argv[2]);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
