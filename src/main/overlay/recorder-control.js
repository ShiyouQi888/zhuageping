const { ipcRenderer } = require("electron");
const params = new URLSearchParams(location.search);
const english = params.get("language") === "en-US";
const size = document.getElementById("size");
const timer = document.getElementById("timer");
const pause = document.getElementById("pause");
const stop = document.getElementById("stop");
size.textContent = `${params.get("width")} x ${params.get("height")}`;
let started = Date.now();
let pausedAt = 0;
let pausedFor = 0;
let paused = false;
function updateTimer() {
  const seconds = Math.floor(((paused ? pausedAt : Date.now()) - started - pausedFor) / 1000);
  timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
function updatePause() {
  document.body.classList.toggle("paused", paused);
  pause.textContent = paused ? "▶" : "Ⅱ";
  pause.title = pause.ariaLabel = paused ? (english ? "Resume" : "继续") : (english ? "Pause" : "暂停");
}
updatePause();
stop.title = stop.ariaLabel = english ? "Stop" : "停止";
setInterval(updateTimer, 250);
pause.addEventListener("click", () => {
  if (paused) {
    pausedFor += Date.now() - pausedAt;
  } else {
    pausedAt = Date.now();
  }
  paused = !paused;
  updatePause();
  ipcRenderer.send("recording-native-command", paused ? "pause" : "resume");
});
stop.addEventListener("click", () => {
  stop.disabled = true;
  ipcRenderer.send("recording-native-command", "stop");
});
