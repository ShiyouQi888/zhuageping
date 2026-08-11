const fs = require("node:fs");
const path = require("node:path");

const assetDirs = ["overlay", "pin", "assets"];

for (const assetDir of assetDirs) {
  const sourceDir = path.join(__dirname, "..", "src", "main", assetDir);
  const targetDir = path.join(__dirname, "..", "dist", "main", assetDir);

  if (!fs.existsSync(sourceDir)) {
    continue;
  }

  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir)) {
    const sourcePath = path.join(sourceDir, entry);
    const targetPath = path.join(targetDir, entry);
    if (fs.statSync(sourcePath).isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }

  const assetLabel = assetDir === "assets" ? "main assets" : `${assetDir} assets`;
  console.log(`Copied ${assetLabel} to ${targetDir}`);
}
