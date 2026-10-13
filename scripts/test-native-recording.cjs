// Run with Electron. Verify the real desktop-capture/H.264 pipeline against a synthetic screen.
const { app, BrowserWindow, screen, desktopCapturer } = require('electron');
const { spawn, execFileSync } = require('node:child_process');
const readline = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const ffmpeg = require('ffmpeg-static');
const root = path.resolve(__dirname, '..');
const host = path.resolve(process.argv[2] || path.join(root,
  'native/winui-shell/bin/x64/Debug/net10.0-windows10.0.26100.0/win-x64/recorder/ZhuagepingRecorderHost.exe'));
const output = path.join(root, '.runtime', 'native-recording-test', String(Date.now()));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function record(name, rect, exercisePause) {
  const file = path.join(output, name + '.mp4');
  const child = spawn(host, [], { windowsHide: true });
  const messages = [];
  let error = '';
  child.stderr.on('data', data => { error += data; });
  readline.createInterface({ input: child.stdout }).on('line', line => {
    try { messages.push(JSON.parse(line)); } catch { error += line; }
  });
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code));
  });
  // Observe failures immediately, even while waiting for protocol messages.
  exited.catch(() => {});
  const waitFor = async predicate => {
    const deadline = Date.now() + 15000;
    while (!messages.some(predicate)) {
      const failure = messages.find(message => message.type === 'error');
      if (failure) throw new Error(JSON.stringify(failure));
      if (child.exitCode !== null) throw new Error(`Host exited: ${error} ${JSON.stringify(messages)}`);
      if (Date.now() >= deadline) throw new Error(`Protocol timeout: ${JSON.stringify(messages)}`);
      await delay(30);
    }
  };
  const command = async value => {
    const start = messages.length;
    child.stdin.write(value + '\n');
    await waitFor((message, index) => index >= start &&
      (message.type === 'command' && message.payload.command === value ||
       value === 'stop' && message.type === 'completed'));
  };
  try {
    const started = Date.now();
    child.stdin.write(JSON.stringify({ outputPath: file, ...rect, framerate: rect.framerate || 30,
      bitrate: 8000000, quality: 90, captureSystemAudio: false,
      captureMicrophone: false, showCursor: false, showClickHighlight: false,
      excludeWindowHandles: [] }) + '\n');
    await waitFor(message => message.type === 'ready');
    console.log(`${name}: capture ready after ${Date.now() - started} ms`);
    const readyIndex = messages.findIndex(message => message.type === 'ready');
    assert(messages.slice(0, readyIndex).some(message => message.type === 'status' && message.payload.status === 'Recording'),
      'Ready must follow the Recording status');
    await delay(1100);
    if (exercisePause) {
      await command('pause');
      await waitFor(message => message.type === 'status' && message.payload.status === 'Paused');
      await delay(1000);
      await command('resume');
      await delay(1100);
    }
    await command('stop');
    assert.equal(await Promise.race([exited, delay(15000).then(() => { throw new Error('Host did not exit'); })]), 0, error);
    fs.writeFileSync(path.join(output, name + '-protocol.json'), JSON.stringify(messages, null, 2));
    return file;
  } finally {
    if (child.exitCode === null) child.kill();
  }
}

app.whenReady().then(async () => {
  let background;
  try {
    assert(fs.existsSync(host), 'Build the WinUI project first');
    fs.mkdirSync(output, { recursive: true });
    const display = screen.getPrimaryDisplay();
    const scale = display.scaleFactor;
    const width = Math.round(display.bounds.width * scale);
    const height = Math.round(display.bounds.height * scale);
    const pattern = Buffer.alloc(width * height * 3);
    const colorAt = (x, y) => [40 + Math.round(170 * x / (width - 1)),
      40 + Math.round(170 * y / (height - 1)), 110];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const rgb = colorAt(x, y);
        const index = (y * width + x) * 3;
        for (let channel = 0; channel < 3; channel++) pattern[index + channel] = rgb[channel];
      }
    }
    const png = await sharp(pattern, { raw: { width, height, channels: 3 } }).png().toBuffer();
    background = new BrowserWindow({ ...display.bounds, frame: false, show: false,
      skipTaskbar: true, resizable: false, title: 'Native recording regression fixture' });
    await background.loadURL('data:text/html,' + encodeURIComponent(
      `<html style="overflow:hidden"><body style="margin:0"><img style="width:100vw;height:100vh" src="data:image/png;base64,${png.toString('base64')}"></body></html>`));
    background.setAlwaysOnTop(true, 'screen-saver');
    background.showInactive();
    await delay(800);
    // The taskbar may remain above the fixture. Compare with the actual desktop,
    // including that bottom strip, rather than assuming the fixture covers it.
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } });
    const primary = sources.find(source => source.display_id === String(display.id));
    assert(primary, 'Primary display capture was not returned');
    const referencePng = primary.thumbnail.toPNG();
    fs.writeFileSync(path.join(output, 'desktop-reference.png'), referencePng);
    const reference = await sharp(referencePng).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(reference.info.width, width);
    assert.equal(reference.info.height, height);
    const cases = [
      { name: 'landscape', x: 160, y: 120, width: 640, height: 360, pause: true },
      { name: 'portrait', x: 480, y: 180, width: 320, height: 480 },
      { name: 'unaligned-size', x: 161, y: 121, width: 638, height: 358 },
      { name: 'unaligned-60fps', x: 139, y: 97, width: 946, height: 530, framerate: 60 },
      { name: 'bottom-edge', x: 120, y: height - 240, width: 480, height: 240 },
      { name: 'full-screen', x: 0, y: 0, width: 0, height: 0 }
    ];
    const results = [];
    for (const testCase of cases) {
      const file = await record(testCase.name, testCase, testCase.pause);
      // Decode from packet zero, including the startup frames that seek-based tests miss.
      execFileSync(ffmpeg, ['-v', 'error', '-xerror', '-i', file, '-f', 'null', '-'], { windowsHide: true });
      for (const sampleTime of [0, 0.1, 0.5, 1]) {
        // The HD converter uses BT.709, but the current library omits its MP4
        // color tag. Normalize explicitly for geometry/startup tests; this does
        // not validate automatic color interpretation in consumer players.
        const colorArgs = (testCase.height || height) >= 720
          ? ['-vf', 'scale=in_color_matrix=bt709'] : [];
        const frame = execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-ss', String(sampleTime),
          ...colorArgs, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'],
          { maxBuffer: 32 * 1024 * 1024, windowsHide: true });
        fs.writeFileSync(path.join(output, `${testCase.name}-${sampleTime}s.png`), frame);
        const { data, info } = await sharp(frame).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        assert.equal(info.width, testCase.width || width, `${testCase.name}: output width`);
        assert.equal(info.height, testCase.height || height, `${testCase.name}: output height`);
        for (const fractionX of [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]) {
          for (const fractionY of [0.05, 0.25, 0.5, 0.75, 0.95]) {
            const x = Math.floor(info.width * fractionX);
            const y = Math.floor(info.height * fractionY);
            const referenceIndex = ((testCase.y + y) * width + testCase.x + x) * reference.info.channels;
            const expected = [...reference.data.subarray(referenceIndex, referenceIndex + 3)];
            const index = (y * info.width + x) * info.channels;
            const actual = [...data.subarray(index, index + 3)];
            assert(actual.every((channel, i) => Math.abs(channel - expected[i]) <= 9),
              `${testCase.name} at ${sampleTime}s: invalid startup/color/crop at ${x},${y}: expected ${expected}, got ${actual}`);
          }
        }
      }
      results.push({ name: testCase.name, width: testCase.width || width, height: testCase.height || height,
        startupFrames: 'passed at 0, 0.1, 0.5, 1 seconds', pixelCheck: 'passed (140 points)',
        fullDecode: 'passed', colorInterpretation: (testCase.height || height) >= 720
          ? 'explicit BT.709; automatic player color tags not validated' : 'default decoder',
        pauseResume: testCase.pause ? 'passed' : 'not exercised' });
      console.log(JSON.stringify(results.at(-1)));
    }
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ display, results }, null, 2));
    console.log('PASS: ' + output);
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    if (background && !background.isDestroyed()) background.destroy();
  }
});
