const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src/main/assets/app-logo.png');
const assets = path.join(root, 'native/winui-shell/Assets');

async function dibIcon(size) {
  const rgba = await sharp(source).resize(size, size).ensureAlpha().raw().toBuffer();
  const maskStride = Math.ceil(size / 32) * 4;
  const data = Buffer.alloc(40 + size * size * 4 + maskStride * size);
  data.writeUInt32LE(40, 0);
  data.writeInt32LE(size, 4);
  data.writeInt32LE(size * 2, 8);
  data.writeUInt16LE(1, 12);
  data.writeUInt16LE(32, 14);
  data.writeUInt32LE(size * size * 4, 20);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const src = (y * size + x) * 4;
    const dst = 40 + ((size - 1 - y) * size + x) * 4;
    data[dst] = rgba[src + 2]; data[dst + 1] = rgba[src + 1];
    data[dst + 2] = rgba[src]; data[dst + 3] = rgba[src + 3];
    if (rgba[src + 3] === 0)
      data[40 + size * size * 4 + (size - 1 - y) * maskStride + (x >> 3)] |= 0x80 >> (x & 7);
  }
  return data;
}

async function bitmap(file, width, height, logoSize, left, top) {
  const logo = await sharp(source).resize(logoSize, logoSize).png().toBuffer();
  const rgb = await sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
    .composite([{ input: logo, left, top }]).removeAlpha().raw().toBuffer();
  const stride = Math.ceil(width * 3 / 4) * 4;
  const bmp = Buffer.alloc(54 + stride * height);
  bmp.write('BM'); bmp.writeUInt32LE(bmp.length, 2); bmp.writeUInt32LE(54, 10);
  bmp.writeUInt32LE(40, 14); bmp.writeInt32LE(width, 18); bmp.writeInt32LE(height, 22);
  bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const src = (y * width + x) * 3;
    const dst = 54 + (height - 1 - y) * stride + x * 3;
    bmp[dst] = rgb[src + 2]; bmp[dst + 1] = rgb[src + 1]; bmp[dst + 2] = rgb[src];
  }
  fs.writeFileSync(path.join(root, 'build', file), bmp);
}

async function main() {
  fs.mkdirSync(assets, { recursive: true });
  fs.copyFileSync(source, path.join(assets, 'AppLogo.png'));
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = [];
  for (const size of sizes) images.push(size <= 64 ? await dibIcon(size)
    : await sharp(source).resize(size, size).png().toBuffer());
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  images.forEach((data, index) => {
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = sizes[index] === 256 ? 0 : sizes[index];
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  fs.writeFileSync(path.join(assets, 'AppIcon.ico'), Buffer.concat([header, ...images]));
  for (const [name, width, height, logoSize] of [
    ['Square44x44Logo.png',44,44,44], ['Square44x44Logo.scale-200.png',88,88,88],
    ['Square44x44Logo.targetsize-24_altform-unplated.png',24,24,24],
    ['Square44x44Logo.targetsize-48_altform-lightunplated.png',48,48,48],
    ['Square150x150Logo.png',150,150,120], ['Square150x150Logo.scale-200.png',300,300,240],
    ['Wide310x150Logo.png',310,150,120], ['Wide310x150Logo.scale-200.png',620,300,240],
    ['StoreLogo.png',50,50,44], ['LockScreenLogo.scale-200.png',48,48,44],
    ['SplashScreen.png',620,300,128], ['SplashScreen.scale-200.png',1240,600,256]
  ]) {
    const logo = await sharp(source).resize(logoSize, logoSize).png().toBuffer();
    await sharp({create:{width,height,channels:4,background:'#00000000'}})
      .composite([{input:logo,left:Math.floor((width-logoSize)/2),top:Math.floor((height-logoSize)/2)}])
      .png().toFile(path.join(assets,name));
  }
  await bitmap('winui-installer-sidebar.bmp',164,314,120,22,64);
  await bitmap('winui-installer-header.bmp',150,57,44,100,6);
  console.log('Generated native branding: exact source logo, seven ICO sizes, package tiles and installer bitmaps.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
