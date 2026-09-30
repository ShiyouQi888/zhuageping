const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function latestYaml({ version, fileName, size, sha512, releaseDate }) {
  return [
    `version: ${version}`,
    "files:",
    `  - url: ${fileName}`,
    `    sha512: ${sha512}`,
    `    size: ${size}`,
    `path: ${fileName}`,
    `sha512: ${sha512}`,
    `releaseDate: '${releaseDate}'`,
    ""
  ].join("\n");
}

function buildLatestManifest(installerPath, version, releaseDate = new Date().toISOString()) {
  const content = fs.readFileSync(installerPath);
  const fileName = path.basename(installerPath);
  return latestYaml({
    version,
    fileName,
    size: content.length,
    sha512: crypto.createHash("sha512").update(content).digest("base64"),
    releaseDate
  });
}

function main() {
  const root = path.resolve(__dirname, "..");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const installerPath = process.argv[2] || path.join(root, "release", `zhuageping-Setup-${pkg.version}-x64.exe`);
  if (!fs.existsSync(installerPath)) {
    throw new Error(`Installer not found: ${installerPath}`);
  }
  const manifestPath = path.join(path.dirname(installerPath), "latest.yml");
  fs.writeFileSync(manifestPath, buildLatestManifest(installerPath, pkg.version), "utf8");
  console.log(`Generated ${manifestPath}`);
}

if (require.main === module) main();

module.exports = { buildLatestManifest, latestYaml };
