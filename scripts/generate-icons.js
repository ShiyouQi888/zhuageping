const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const projectRoot = path.resolve(__dirname, "..");
const sourcePath = path.join(projectRoot, "src", "renderer", "assets", "app-logo-source.png");
const buildDir = path.join(projectRoot, "build");
const outputPath = path.join(buildDir, "icon.ico");
const sizes = [16, 24, 32, 48, 64, 128, 256];

function writeDirectoryEntry(buffer, offset, image, imageOffset) {
  buffer.writeUInt8(image.size === 256 ? 0 : image.size, offset);
  buffer.writeUInt8(image.size === 256 ? 0 : image.size, offset + 1);
  buffer.writeUInt8(0, offset + 2);
  buffer.writeUInt8(0, offset + 3);
  buffer.writeUInt16LE(1, offset + 4);
  buffer.writeUInt16LE(32, offset + 6);
  buffer.writeUInt32LE(image.buffer.length, offset + 8);
  buffer.writeUInt32LE(imageOffset, offset + 12);
}

async function main() {
  fs.mkdirSync(buildDir, { recursive: true });
  const images = await Promise.all(
    sizes.map(async (size) => ({
      size,
      buffer: await sharp(sourcePath).resize(size, size, { fit: "cover" }).png().toBuffer()
    }))
  );

  const headerSize = 6;
  const entrySize = 16;
  const imageOffset = headerSize + images.length * entrySize;
  const totalSize = imageOffset + images.reduce((sum, image) => sum + image.buffer.length, 0);
  const ico = Buffer.alloc(totalSize);

  ico.writeUInt16LE(0, 0);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(images.length, 4);

  let currentImageOffset = imageOffset;
  images.forEach((image, index) => {
    writeDirectoryEntry(ico, headerSize + index * entrySize, image, currentImageOffset);
    image.buffer.copy(ico, currentImageOffset);
    currentImageOffset += image.buffer.length;
  });

  fs.writeFileSync(outputPath, ico);
  console.log(`Generated ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
