const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tag = `v${pkg.version}`;
const releaseDir = path.join(root, "release");
const assets = [
  path.join(releaseDir, `zhuageping-Setup-${pkg.version}-x64.exe`),
  path.join(releaseDir, `zhuageping-Setup-${pkg.version}-x64.exe.blockmap`),
  path.join(releaseDir, "latest.yml")
];

assets.forEach((asset) => {
  if (!fs.existsSync(asset)) throw new Error(`Release asset not found: ${asset}`);
});

try {
  execFileSync("gh", ["release", "view", tag], { stdio: "ignore" });
  execFileSync("gh", ["release", "upload", tag, ...assets, "--clobber"], { stdio: "inherit" });
} catch {
  execFileSync("gh", ["release", "create", tag, ...assets, "--target", "main", "--title", `Zhuageping ${tag}`, "--generate-notes"], {
    stdio: "inherit"
  });
}
