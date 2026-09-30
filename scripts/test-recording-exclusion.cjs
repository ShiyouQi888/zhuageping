// Run with Electron; creates a synthetic desktop and verifies encoded pixels.
const { app, BrowserWindow, screen, ipcMain } = require('electron');
const { spawn, execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const out = path.join(root, '.runtime', 'recording-exclusion-test', String(Date.now()));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function clickDesktop(x, y) {
  const script = `Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class TestMouse {[DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);[DllImport("user32.dll")]public static extern void mouse_event(uint flags,uint dx,uint dy,uint data,UIntPtr extra);}' ; [TestMouse]::SetCursorPos(${x},${y}); Start-Sleep -Milliseconds 120; [TestMouse]::mouse_event(2,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 60; [TestMouse]::mouse_event(4,0,0,0,[UIntPtr]::Zero)`;
  execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true });
}
function windowAt(x, y) {
  const script = `Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class HitTest {[StructLayout(LayoutKind.Sequential)]public struct Point {public int X;public int Y;}[DllImport("user32.dll")]public static extern IntPtr WindowFromPoint(Point p);[DllImport("user32.dll")]public static extern IntPtr GetAncestor(IntPtr h,uint flag);}' ; $p=New-Object HitTest+Point; $p.X=${x}; $p.Y=${y}; [HitTest]::GetAncestor([HitTest]::WindowFromPoint($p),2).ToInt64()`;
  return execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true, encoding: 'utf8' }).trim();
}
app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true });
  const display = screen.getPrimaryDisplay();
  console.log('display', JSON.stringify({ bounds: display.bounds, scaleFactor: display.scaleFactor }));
  const bounds = display.bounds;
  const background = new BrowserWindow({ ...bounds, frame: false, show: false, backgroundColor: '#209040' });
  await background.loadURL('data:text/html,<html style="width:100%;height:100%"><body style="margin:0;width:100%;height:100%;background:%23209040"></body></html>');
  await background.webContents.executeJavaScript("window.testClicks=0;document.body.addEventListener('click',()=>window.testClicks++)");
  background.show();
  background.setAlwaysOnTop(true, 'floating');
  const overlay = new BrowserWindow({ ...bounds, frame: false, transparent: true, show: false,
    alwaysOnTop: true, webPreferences: { nodeIntegration: true, contextIsolation: false } });
  overlay.setContentProtection(true);
  await overlay.loadFile(path.join(root, 'src/main/overlay/recorder.html'), { query: { nativeMode: 'true' } });
  overlay.showInactive();
  overlay.setContentProtection(true);
  const handle = overlay.getNativeWindowHandle().readBigUInt64LE().toString();
  for (const mode of ['region', 'screen']) {
    const rect = mode === 'region' ? { x: 80, y: 80, width: 640, height: 360 }
      : { x: 0, y: 0, width: bounds.width, height: bounds.height };
    await overlay.webContents.executeJavaScript(`
      document.body.classList.add('is-recording');
      document.getElementById('shade').style.display='none';
      positionRecordingFrame(${JSON.stringify(rect)});
      document.getElementById('controlBar').style.display='none';
    `);
    overlay.setIgnoreMouseEvents(true);
    overlay.setContentProtection(true);
    const barWidth = mode === 'screen' ? 260 : Math.min(rect.width, bounds.width);
    const barX = mode === 'screen' ? bounds.width - barWidth - 8 : rect.x;
    const barY = mode === 'screen' ? 8 : rect.y >= 26 ? rect.y - 26 : rect.y;
    const control = new BrowserWindow({ x: barX, y: barY,
      width: barWidth, height: 24, frame: false,
      show: false, alwaysOnTop: true, transparent: true, backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: true, contextIsolation: false } });
    await control.loadFile(path.join(root, 'src/main/overlay/recorder-control.html'),
      { query: { width: String(rect.width), height: String(rect.height) } });
    control.showInactive();
    control.setAlwaysOnTop(true, 'screen-saver');
    console.log(mode, 'hit before protection', windowAt(bounds.x + barX + barWidth - 16, bounds.y + barY + 12));
    control.setContentProtection(true);
    control.moveTop();
    control.focus();
    await wait(500);
    fs.writeFileSync(path.join(out, mode + '-ui.png'), (await control.webContents.capturePage()).toPNG());
    const scale = display.scaleFactor;
    const file = path.join(out, mode + '.mp4');
    const child = spawn(path.join(root, 'build/recorder/ZhuagepingRecorderHost.exe'), [], { windowsHide: true });
    let log = '';
    child.stdout.on('data', chunk => { log += chunk; });
    child.stderr.on('data', chunk => { log += chunk; });
    const completion = new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', code => code === 0 ? resolve() : reject(new Error(log)));
    });
    completion.catch(() => {});
    child.stdin.write(JSON.stringify({ outputPath: file, x: Math.floor(rect.x*scale/2)*2,
      y: Math.floor(rect.y*scale/2)*2, width: Math.floor(rect.width*scale/2)*2,
      height: Math.floor(rect.height*scale/2)*2, framerate: 30, bitrate: 12000000, quality: 90,
      captureSystemAudio: false, captureMicrophone: false, showCursor: false,
      showClickHighlight: false, excludeWindowHandles: [handle,
        control.getNativeWindowHandle().readBigUInt64LE().toString()] }) + '\n');
    const timeout = setTimeout(() => child.kill(), 20000);
    let controlCommands = 0;
    const onCommand = (event, command) => {
      if (event.sender.id === control.webContents.id) {
        controlCommands++;
        child.stdin.write(command + '\n');
      }
    };
    ipcMain.on('recording-native-command', onCommand);
    const clickX = Math.min(bounds.width - 50, 900);
    const clickY = Math.min(bounds.height - 50, 500);
    const beforeClicks = await background.webContents.executeJavaScript('window.testClicks');
    clickDesktop(bounds.x + clickX, bounds.y + clickY);
    await wait(150);
    const afterClicks = await background.webContents.executeJavaScript('window.testClicks');
    if (afterClicks <= beforeClicks) throw new Error(`${mode}: full-screen recording overlay blocked the desktop click`);
    await wait(2200);
    // Exercise the actual hit target and its IPC route.
    const controlX = bounds.x + barX + barWidth - 16;
    const controlY = bounds.y + barY + 12;
    const target = await control.webContents.executeJavaScript(`document.elementFromPoint(${barWidth - 16},12)?.id`);
    const controlHandle = control.getNativeWindowHandle().readBigUInt64LE().toString();
    const hit = windowAt(controlX, controlY);
    console.log(mode, 'control bounds', JSON.stringify(control.getBounds()), 'click', controlX, controlY,
      'handle', controlHandle, 'hit', hit);
    if (hit !== controlHandle || target !== 'stop') throw new Error(`${mode}: stop button is not the OS hit target`);
    control.webContents.sendInputEvent({ type: 'mouseDown', x: barWidth - 16, y: 12, button: 'left', clickCount: 1 });
    control.webContents.sendInputEvent({ type: 'mouseUp', x: barWidth - 16, y: 12, button: 'left', clickCount: 1 });
    await wait(250);
    if (!controlCommands) {
      child.stdin.write('stop\n');
      throw new Error(`${mode}: control click missed (DOM target=${target}, background clicks=${await background.webContents.executeJavaScript('window.testClicks')})`);
    }
    await completion.finally(() => clearTimeout(timeout));
    ipcMain.removeListener('recording-native-command', onCommand);
    fs.writeFileSync(path.join(out, mode + '.log'), log);
    execFileSync(require('ffmpeg-static'), ['-y', '-i', file, '-vf', 'fps=2', path.join(out, mode + '-%02d.png')], { windowsHide: true, stdio: 'pipe' });
    const frames = fs.readdirSync(out).filter(name => new RegExp('^' + mode + '-\\d+\\.png$').test(name));
    if (!frames.length) throw new Error('No decoded frames');
    for (const name of frames) {
      const { data, info } = await sharp(path.join(out, name)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let wrong = 0;
      let checked = 0;
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        if (mode === 'screen' && (y < 8 || y > 160 || x < 8 || x >= info.width - 8)) continue;
        const i = (y * info.width + x) * info.channels;
        checked++;
        if (Math.abs(data[i]-32) > 22 || Math.abs(data[i+1]-144) > 22 || Math.abs(data[i+2]-64) > 22) wrong++;
      }
      if (wrong / checked > 0.001) throw new Error(`${name}: ${wrong} unexpected pixels (controls, borders or black frame)`);
    }
    console.log(`${mode}: PASS, ${frames.length} decoded frames, no controls/borders/black frames`);
    control.close();
  }
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
