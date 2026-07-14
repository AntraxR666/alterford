import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const requested = process.argv[2] || "all";
const strict = process.env.SECURITY_STRICT === "1";
const wslRepoPath = process.platform === "win32" ? getWslPath(resolve(".")) : null;
const localWslSlither = process.platform === "win32" && existsSync(resolve(".venv-slither", "bin", "slither"));

const tools = {
  slither: {
    command: "slither",
    args: [
      "packages/contracts",
      "--foundry-compile-all",
      "--filter-paths",
      "test/|script/|lib/|node_modules/",
      "--exclude",
      "timestamp,divide-before-multiply,naming-convention",
    ],
    install: "pipx install slither-analyzer",
    wslCommand:
      localWslSlither && wslRepoPath
        ? `cd ${shellQuote(wslRepoPath)} && export PATH="$HOME/.foundry/bin:${wslRepoPath}/.venv-slither/bin:$PATH" && slither packages/contracts --foundry-compile-all --filter-paths 'test/|script/|lib/|node_modules/' --exclude timestamp,divide-before-multiply,naming-convention`
        : null,
    wslVersionCommand:
      localWslSlither && wslRepoPath
        ? `cd ${shellQuote(wslRepoPath)} && export PATH="$HOME/.foundry/bin:${wslRepoPath}/.venv-slither/bin:$PATH" && slither --version`
        : null,
  },
  echidna: {
    command: "echidna",
    args: ["packages/contracts/test/EchidnaMarketProperties.sol", "--config", "packages/contracts/echidna.yaml"],
    install: "Install echidna from https://github.com/crytic/echidna/releases",
  },
  mythril: {
    command: "myth",
    args: ["analyze", "packages/contracts/src/factories/MarketFactory.sol", "--solv", "0.8.28"],
    install: "pipx install mythril",
  },
};

const selected = requested === "all" ? Object.keys(tools) : [requested];
let failures = 0;

for (const name of selected) {
  const tool = tools[name];
  if (!tool) throw new Error(`Unknown security tool "${name}"`);

  if (name === "echidna" && !existsSync(resolve("packages/contracts/echidna.yaml"))) {
    console.log(JSON.stringify({ tool: name, status: "skipped", reason: "missing_config" }));
    failures += strict ? 1 : 0;
    continue;
  }

  const version = runTool(tool, ["--version"], true);
  if (version.error || version.status !== 0) {
    console.log(
      JSON.stringify({
        tool: name,
        status: strict ? "missing" : "skipped",
        install: tool.install,
      }),
    );
    failures += strict ? 1 : 0;
    continue;
  }

  const startedAt = new Date().toISOString();
  const result = runTool(tool, tool.args, false);
  console.log(
    JSON.stringify({
      tool: name,
      status: result.status === 0 ? "passed" : "failed",
      startedAt,
      finishedAt: new Date().toISOString(),
    }),
  );
  if (result.status !== 0) failures += 1;
}

process.exitCode = failures === 0 ? 0 : 1;

function runTool(tool, args, versionCheck) {
  if (tool.wslCommand) {
    return spawnSync("wsl", ["bash", "-lc", versionCheck ? tool.wslVersionCommand : tool.wslCommand], {
      cwd: resolve("."),
      encoding: "utf8",
      stdio: versionCheck ? "pipe" : "inherit",
    });
  }

  return spawnSync(tool.command, args, {
    cwd: resolve("."),
    encoding: "utf8",
    stdio: versionCheck ? "pipe" : "inherit",
  });
}

function getWslPath(path) {
  const result = spawnSync("wsl", ["wslpath", "-a", path], { encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
