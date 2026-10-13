const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'native/winui-shell/Assets');

test('native logo is the supplied image, without alternate artwork', () => {
  assert.deepEqual(fs.readFileSync(path.join(assets, 'AppLogo.png')),
    fs.readFileSync(path.join(root, 'src/main/assets/app-logo.png')));
});

test('ICO contains seven correctly sized lossless frames', async () => {
  const ico = fs.readFileSync(path.join(assets, 'AppIcon.ico'));
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), sizes.length);
  let expectedOffset = 6 + sizes.length * 16;
  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i], entry = 6 + i * 16;
    assert.equal(ico[entry] || 256, size);
    assert.equal(ico[entry + 1] || 256, size);
    const length = ico.readUInt32LE(entry + 8), offset = ico.readUInt32LE(entry + 12);
    assert.equal(offset, expectedOffset);
    expectedOffset += length;
    assert.ok(expectedOffset <= ico.length);
    const expected = await sharp(path.join(assets, 'AppLogo.png')).resize(size, size).ensureAlpha().raw().toBuffer();
    if (size <= 64) {
      assert.equal(ico.readUInt32LE(offset), 40);
      assert.equal(ico.readInt32LE(offset + 4), size);
      assert.equal(ico.readInt32LE(offset + 8), size * 2);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const from = offset + 40 + ((size - 1 - y) * size + x) * 4;
        const to = (y * size + x) * 4;
        assert.deepEqual([ico[from + 2], ico[from + 1], ico[from], ico[from + 3]], Array.from(expected.subarray(to, to + 4)));
      }
    } else {
      const decoded = await sharp(ico.subarray(offset, offset + length)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.equal(decoded.info.width, size);
      assert.equal(decoded.info.height, size);
      assert.deepEqual(decoded.data, expected);
    }
  }
  assert.equal(expectedOffset, ico.length);
});

test('installer artwork uses valid 24-bit BMP resources at NSIS dimensions', () => {
  for (const [name, width, height] of [['header',150,57],['sidebar',164,314]]) {
    const data = fs.readFileSync(path.join(root, `build/winui-installer-${name}.bmp`));
    assert.equal(data.toString('ascii',0,2), 'BM');
    assert.equal(data.readUInt32LE(2), data.length);
    assert.equal(data.readUInt32LE(10), 54);
    assert.equal(data.readInt32LE(18), width);
    assert.equal(data.readInt32LE(22), height);
    assert.equal(data.readUInt16LE(28), 24);
  }
});
