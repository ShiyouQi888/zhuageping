const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { buildLatestManifest } = require("./generate-latest-yml");

test("buildLatestManifest writes an electron-updater compatible manifest", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "zhuageping-latest-"));
  const installer = path.join(directory, "zhuageping-Setup-0.1.20-x64.exe");
  const content = Buffer.from("recording-release");
  fs.writeFileSync(installer, content);

  const manifest = buildLatestManifest(installer, "0.1.20", "2026-09-30T00:00:00.000Z");
  assert.match(manifest, /^version: 0\.1\.20/m);
  assert.match(manifest, /url: zhuageping-Setup-0\.1\.20-x64\.exe/);
  assert.match(manifest, new RegExp(`size: ${content.length}`));
  assert.match(manifest, new RegExp(crypto.createHash("sha512").update(content).digest("base64").replace(/[+/]/g, "\\$&")));
});
