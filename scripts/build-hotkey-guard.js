const { existsSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const rootDir = join(__dirname, "..");
const projectPath = join(rootDir, "native", "hotkey-guard", "ZhuagepingHotkeyGuard.csproj");
const outputDir = join(rootDir, "build", "hotkey");

if (process.platform !== "win32") {
  console.log("Hotkey guard build skipped: Windows only.");
  process.exit(0);
}

if (existsSync(outputDir)) {
  rmSync(outputDir, { recursive: true, force: true });
}

const result = spawnSync(
  "dotnet",
  [
    "publish",
    projectPath,
    "-c",
    "Release",
    "-r",
    "win-x64",
    "--self-contained",
    "true",
    "-p:PublishSingleFile=true",
    "-p:EnableCompressionInSingleFile=true",
    "-p:DebugType=none",
    "-p:DebugSymbols=false",
    "-o",
    outputDir
  ],
  { stdio: "inherit", shell: false }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
