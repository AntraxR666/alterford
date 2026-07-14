import { readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

export async function collectFiles(directory) {
  const root = resolve(directory);
  const paths = await walk(root);
  return Promise.all(paths.map(async (absolutePath) => ({
    absolutePath,
    path: relative(root, absolutePath).replaceAll("\\", "/"),
    content: await readFile(absolutePath),
  })));
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return nested.flat().sort();
}
