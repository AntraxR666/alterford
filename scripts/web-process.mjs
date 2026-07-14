import { spawnSync } from "node:child_process";

export async function runReleaseSteps(run = runPackageScript) {
  const env = { ...process.env, RELEASE_CHANNEL: "stable" };
  for (const script of ["build:web:static", "deploy:web:ipfs", "deploy:web:arweave"]) {
    await run(script, env);
  }
}

export function runPackageScript(script, env = process.env) {
  return runPnpm(["run", script], env);
}

export function runPnpm(args, env = process.env) {
  const invocation = packageManagerInvocation(args, process.platform, env);
  const result = spawnSync(invocation.command, invocation.args, { env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`pnpm ${args.join(" ")} failed with exit code ${result.status}.`);
}

export function packageManagerInvocation(args, platform = process.platform, env = process.env) {
  if (platform !== "win32") return { command: "pnpm", args };
  if (args.some((argument) => !/^[a-zA-Z0-9@_./:=+-]+$/.test(argument))) {
    throw new Error("Unsafe pnpm argument rejected.");
  }
  return {
    command: env.ComSpec || "cmd.exe",
    args: ["/d", "/s", "/c", `pnpm ${args.join(" ")}`],
  };
}
