const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const targetRoot = path.join(rootDir, "build", "ocr");
const targetDir = path.join(targetRoot, "RapidOCR-json");
const candidates = [
  process.env.RAPIDOCR_JSON_DIR,
  path.join(rootDir, ".runtime", "ocr", "RapidOCR-json"),
  path.join(rootDir, ".runtime", "ocr-v0.1.0", "RapidOCR-json")
].filter(Boolean);

function hasEngine(dir) {
  return fs.existsSync(path.join(dir, "RapidOCR_json.exe")) && fs.existsSync(path.join(dir, "models"));
}

fs.mkdirSync(targetRoot, { recursive: true });

const sourceDir = candidates.find((candidate) => hasEngine(candidate));
if (!sourceDir) {
  console.warn("[prepare:ocr] RapidOCR-json engine not found. OCR will show a setup error in packaged builds.");
  process.exit(0);
}

if (hasEngine(targetDir) && process.env.FORCE_PREPARE_OCR !== "1") {
  console.log(`[prepare:ocr] RapidOCR-json engine already prepared at ${targetDir}`);
  process.exit(0);
}

fs.rmSync(targetDir, { recursive: true, force: true });
fs.cpSync(sourceDir, targetDir, { recursive: true });
console.log(`[prepare:ocr] Copied RapidOCR-json engine from ${sourceDir}`);
