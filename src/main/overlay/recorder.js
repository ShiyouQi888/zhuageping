const { ipcRenderer } = require("electron");

const params = new URLSearchParams(window.location.search);
const sourceId = params.get("sourceId") || "";
const scaleFactor = Number(params.get("scaleFactor")) || 1;
const fps = Math.max(1, Number(params.get("fps")) || 30);
const bitsPerSecond = Math.max(500000, Number(params.get("bitsPerSecond")) || 5000000);
const useMic = params.get("mic") === "true";
const useCountdown = params.get("countdown") !== "false";
const recordingMode = params.get("mode") === "screen" ? "screen" : "region";
const nativeMode = params.get("nativeMode") === "true";
const windowRegionChannel = params.get("windowRegionChannel") || "";
const windowRegionActiveChannel = params.get("windowRegionActiveChannel") || "";
const showCursor = params.get("showCursor") !== "false";
const clickHighlight = params.get("clickHighlight") !== "false";
const displayPixelWidth = Math.max(1, Number(params.get("displayPixelWidth")) || Math.round(window.innerWidth * scaleFactor));
const displayPixelHeight = Math.max(1, Number(params.get("displayPixelHeight")) || Math.round(window.innerHeight * scaleFactor));
const language = params.get("language") === "en-US" ? "en-US" : "zh-CN";
let windowRegions = (() => {
  try {
    const value = JSON.parse(params.get("windowRegions") || "[]");
    return Array.isArray(value)
      ? value.filter(
          (rect) =>
            rect &&
            [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
            rect.width >= 24 &&
            rect.height >= 24
        )
      : [];
  } catch {
    return [];
  }
})();
const initialCursor = { x: Number(params.get("cursorX")), y: Number(params.get("cursorY")) };
let lastPointer = { ...initialCursor };
let windowRegionsRequested = false;
let lastWindowRegionActiveAt = 0;

const text = {
  "zh-CN": {
    select: "拖动选择录屏区域",
    pause: "暂停",
    resume: "继续",
    stop: "停止",
    cancel: "取消",
    selectionHint: "移动鼠标探测窗口，单击选中；拖动自定义区域 · F2 或 Esc 取消"
  },
  "en-US": {
    select: "Drag to select a recording region",
    pause: "Pause",
    resume: "Resume",
    stop: "Stop",
    cancel: "Cancel",
    selectionHint: "Hover to detect a window, click to select, or drag · F2/Esc to cancel"
  }
}[language];

const shade = document.getElementById("shade");
const selectionEl = document.getElementById("selection");
const sizeBadge = document.getElementById("sizeBadge");
const selectionHint = document.getElementById("selectionHint");
const selectionHintText = document.getElementById("selectionHintText");
const selectionCancel = document.getElementById("selectionCancel");
const countdownEl = document.getElementById("countdown");
const controlBar = document.getElementById("controlBar");
const controlSize = document.getElementById("controlSize");
const recordingFrame = document.getElementById("recordingFrame");
const timerEl = document.getElementById("timer");
const pauseButton = document.getElementById("pause");
const stopButton = document.getElementById("stop");
const cancelButton = document.getElementById("cancel");
const video = document.getElementById("screenVideo");

document.body.classList.toggle("is-screen-mode", recordingMode === "screen");

selectionHintText.textContent = text.selectionHint;
selectionCancel.textContent = text.cancel;

function setButtonLabel(button, label) {
  button.removeAttribute("title");
  button.setAttribute("aria-label", label);
}

function syncPauseButton(paused) {
  const label = paused ? text.resume : text.pause;
  setButtonLabel(pauseButton, label);
  pauseButton.firstElementChild.textContent = paused ? "▶" : "Ⅱ";
}

syncPauseButton(false);
setButtonLabel(stopButton, text.stop);
setButtonLabel(cancelButton, text.cancel);

let selecting = false;
let selectedRect = null;
let hoverWindowRect = null;
let clickWindowRect = null;
let startPoint = null;
let hasDragged = false;
let recorder = null;
let screenStream = null;
let micStream = null;
let audioContext = null;
let timerId = 0;
let startedAt = 0;
let pausedAt = 0;
let pausedMs = 0;
let chunks = [];
let canceled = false;
let ignoringMouse = false;
let nativeRecordingActive = false;
let nativeRecordingPaused = false;
let controlHideTimer = 0;

const recordingFrameWidth = 2;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function windowRegionAt(x, y) {
  return windowRegions.find(
    (rect) => x >= rect.x && y >= rect.y && x <= rect.x + rect.width && y <= rect.y + rect.height
  );
}

function requestWindowRegions() {
  if (!windowRegionChannel || windowRegionsRequested || recordingMode !== "region") return;
  windowRegionsRequested = true;
  ipcRenderer.send(windowRegionChannel);
}

function announceActiveWindowRegionOverlay() {
  if (!windowRegionActiveChannel) return;
  const now = performance.now();
  if (now - lastWindowRegionActiveAt < 60) return;
  lastWindowRegionActiveAt = now;
  ipcRenderer.send(windowRegionActiveChannel);
}

function evenPixelSize(value) {
  return Math.max(2, Math.floor(Math.max(2, value) / 2) * 2);
}

function normalizeRect(a, b) {
  const x1 = clamp(a.x, 0, window.innerWidth);
  const y1 = clamp(a.y, 0, window.innerHeight);
  const x2 = clamp(b.x, 0, window.innerWidth);
  const y2 = clamp(b.y, 0, window.innerHeight);
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1)
  };
}

function renderSelection(rect) {
  selectionEl.style.display = "block";
  selectionEl.classList.toggle(
    "is-sensing",
    recordingMode === "screen" || (recordingMode === "region" && !selecting && hoverWindowRect === rect)
  );
  selectionEl.style.left = `${rect.x}px`;
  selectionEl.style.top = `${rect.y}px`;
  selectionEl.style.width = `${rect.width}px`;
  selectionEl.style.height = `${rect.height}px`;
  sizeBadge.style.display = "block";
  const dimensions = `${Math.round(rect.width * scaleFactor)} x ${Math.round(rect.height * scaleFactor)}`;
  sizeBadge.textContent = dimensions;
  controlSize.textContent = dimensions;
  sizeBadge.style.left = `${Math.min(window.innerWidth - 120, rect.x)}px`;
  sizeBadge.style.top = `${Math.max(8, rect.y - 28)}px`;
}

function positionRecordingFrame(rect) {
  const frameWidth = recordingFrameWidth;
  const coversViewport =
    rect.x <= 1 &&
    rect.y <= 1 &&
    rect.x + rect.width >= window.innerWidth - 1 &&
    rect.y + rect.height >= window.innerHeight - 1;
  if (coversViewport) {
    recordingFrame.style.left = "0";
    recordingFrame.style.top = "0";
    recordingFrame.style.width = `${window.innerWidth}px`;
    recordingFrame.style.height = `${window.innerHeight}px`;
    return;
  }
  recordingFrame.style.left = `${rect.x - frameWidth}px`;
  recordingFrame.style.top = `${rect.y - frameWidth}px`;
  recordingFrame.style.width = `${rect.width + frameWidth * 2}px`;
  recordingFrame.style.height = `${rect.height + frameWidth * 2}px`;
}

function placeControlBar(rect) {
  if (recordingMode === "screen") {
    controlBar.style.display = "flex";
    controlBar.style.visibility = "visible";
    controlBar.style.left = "2px";
    controlBar.style.top = "2px";
    controlBar.style.width = `${Math.max(248, window.innerWidth - 4)}px`;
    controlBar.classList.add("is-screen-bar");
    controlBar.classList.remove("is-below", "is-compact", "is-auto-hidden");
    return true;
  }

  controlBar.style.visibility = "hidden";
  controlBar.style.display = "flex";
  const availableWidth = Math.max(0, window.innerWidth - 16);
  const barWidth = Math.min(availableWidth, Math.max(248, rect.width));
  const barHeight = Math.max(34, controlBar.offsetHeight);
  const gap = 2;
  const left = clamp(rect.x + rect.width / 2 - barWidth / 2, 8, window.innerWidth - barWidth - 8);
  const above = rect.y - barHeight - gap;
  const below = rect.y + rect.height + gap;
  let top;
  let isBelow = false;

  if (above >= 8) {
    top = above;
  } else if (below + barHeight <= window.innerHeight - 8) {
    top = below;
    isBelow = true;
  } else {
    controlBar.style.display = "none";
    controlBar.style.visibility = "visible";
    return false;
  }

  controlBar.style.width = `${barWidth}px`;
  controlBar.style.left = `${left}px`;
  controlBar.style.top = `${top}px`;
  controlBar.classList.toggle("is-below", isBelow);
  controlBar.classList.toggle("is-compact", barWidth < 330);
  controlBar.style.visibility = "visible";
  return true;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function recordingDuration() {
  const now = recorder?.state === "paused" || nativeRecordingPaused ? pausedAt : Date.now();
  return Math.max(0, now - startedAt - pausedMs);
}

function updateTimer() {
  timerEl.textContent = formatDuration(recordingDuration());
}

function showCountdown() {
  if (!useCountdown) return Promise.resolve();
  return new Promise((resolve) => {
    let value = 3;
    countdownEl.style.display = "flex";
    countdownEl.textContent = String(value);
    const id = setInterval(() => {
      value -= 1;
      if (value <= 0) {
        clearInterval(id);
        countdownEl.style.display = "none";
        resolve();
      } else {
        countdownEl.textContent = String(value);
      }
    }, 700);
  });
}

function pickMimeType() {
  const candidates = [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp9"
  ];
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) || "";
}

async function getScreenStream() {
  const video = {
    cursor: showCursor ? "always" : "never",
    mandatory: {
      chromeMediaSource: "desktop",
      chromeMediaSourceId: sourceId,
      minWidth: displayPixelWidth,
      maxWidth: displayPixelWidth,
      minHeight: displayPixelHeight,
      maxHeight: displayPixelHeight,
      maxFrameRate: fps
    }
  };

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId
        }
      },
      video
    });
  } catch {
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video
    });
  }
}

function waitForUiPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

async function getMicStream() {
  if (!useMic) return null;
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch {
    return null;
  }
}

function activeScale() {
  return {
    x: video.videoWidth > 0 ? video.videoWidth / window.innerWidth : scaleFactor,
    y: video.videoHeight > 0 ? video.videoHeight / window.innerHeight : scaleFactor
  };
}

function recordingCrop(rect) {
  const currentScale = activeScale();
  const sourceWidth = Math.max(2, video.videoWidth);
  const sourceHeight = Math.max(2, video.videoHeight);
  const cropX = Math.max(0, Math.min(sourceWidth - 2, Math.floor((rect.x * currentScale.x) / 2) * 2));
  const cropY = Math.max(0, Math.min(sourceHeight - 2, Math.floor((rect.y * currentScale.y) / 2) * 2));
  return {
    cropX,
    cropY,
    width: evenPixelSize(Math.min(rect.width * currentScale.x, sourceWidth - cropX)),
    height: evenPixelSize(Math.min(rect.height * currentScale.y, sourceHeight - cropY)),
    sourceWidth,
    sourceHeight
  };
}

function stopTracks() {
  screenStream?.getTracks().forEach((track) => track.stop());
  micStream?.getTracks().forEach((track) => track.stop());
  audioContext?.close().catch(() => undefined);
  screenStream = null;
  micStream = null;
  audioContext = null;
}

function connectAudioSource(destination, stream) {
  const audioTracks = stream?.getAudioTracks?.() || [];
  if (!audioTracks.length) return;
  const source = audioContext.createMediaStreamSource(new MediaStream(audioTracks));
  source.connect(destination);
}

function buildRecordingStream() {
  const recordingStream = new MediaStream();
  screenStream?.getVideoTracks().forEach((track) => recordingStream.addTrack(track));
  const systemAudioTracks = screenStream?.getAudioTracks?.() || [];
  const micAudioTracks = micStream?.getAudioTracks?.() || [];
  if (!systemAudioTracks.length && !micAudioTracks.length) {
    return recordingStream;
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    systemAudioTracks.forEach((track) => recordingStream.addTrack(track));
    micAudioTracks.forEach((track) => recordingStream.addTrack(track));
    return recordingStream;
  }

  audioContext = new AudioContextCtor();
  const destination = audioContext.createMediaStreamDestination();
  connectAudioSource(destination, screenStream);
  connectAudioSource(destination, micStream);
  destination.stream.getAudioTracks().forEach((track) => recordingStream.addTrack(track));
  return recordingStream;
}

function fail(message) {
  if (canceled) return;
  setMouseIgnored(false);
  stopTracks();
  ipcRenderer.send("recording-error", message);
}

function setMouseIgnored(ignore) {
  if (ignoringMouse === ignore) return;
  ignoringMouse = ignore;
  ipcRenderer.send("recording-ignore-mouse", ignore);
}

function pointInControlBar(x, y) {
  if (controlBar.style.display === "none") return false;
  const rect = controlBar.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function clearControlHideTimer() {
  if (!controlHideTimer) return;
  clearTimeout(controlHideTimer);
  controlHideTimer = 0;
}

function showScreenControls() {
  if (recordingMode !== "screen") return;
  clearControlHideTimer();
  controlBar.classList.remove("is-auto-hidden");
}

function scheduleScreenControlsHide(delay = 520) {
  if (recordingMode !== "screen") return;
  clearControlHideTimer();
  controlHideTimer = window.setTimeout(() => {
    controlHideTimer = 0;
    controlBar.classList.add("is-auto-hidden");
    setMouseIgnored(true);
  }, delay);
}

function syncMousePassThrough(event) {
  if ((!recorder || recorder.state === "inactive") && !nativeRecordingActive) return;
  if (recordingMode === "screen") {
    const revealDistance = 10;
    const nearScreenEdge =
      event.clientX <= revealDistance ||
      event.clientY <= revealDistance ||
      event.clientX >= window.innerWidth - revealDistance ||
      event.clientY >= window.innerHeight - revealDistance;
    if (nearScreenEdge) showScreenControls();
    const insideBar = pointInControlBar(event.clientX, event.clientY);
    if (insideBar) {
      showScreenControls();
    } else if (!nearScreenEdge) {
      scheduleScreenControlsHide();
    }
    setMouseIgnored(!insideBar);
    return;
  }
  setMouseIgnored(!pointInControlBar(event.clientX, event.clientY));
}

async function startRecording(rect) {
  try {
    const captureRect = rect;
    selectedRect = captureRect;
    const dimensions = `${Math.round(captureRect.width * scaleFactor)} x ${Math.round(captureRect.height * scaleFactor)}`;
    controlSize.textContent = dimensions;
    positionRecordingFrame(captureRect);
    document.body.classList.add("is-recording");
    shade.style.display = "none";
    placeControlBar(captureRect);
    setMouseIgnored(true);
    await showCountdown();
    if (canceled) return;

    if (nativeMode) {
      nativeRecordingActive = true;
      nativeRecordingPaused = false;
      await waitForUiPaint();
      await new Promise((resolve) => setTimeout(resolve, 120));
      if (canceled) return;
      startedAt = Date.now();
      pausedMs = 0;
      if (controlBar.style.display !== "none") {
        timerId = setInterval(updateTimer, 250);
        updateTimer();
      }
      if (recordingMode === "screen") scheduleScreenControlsHide(2200);
      ipcRenderer.send("recording-region-selected", {
        x: Math.round(captureRect.x),
        y: Math.round(captureRect.y),
        width: Math.round(captureRect.width),
        height: Math.round(captureRect.height)
      });
      return;
    }

    controlBar.style.display = "none";
    document.body.classList.add("hide-recording-frame");
    await waitForUiPaint();

    screenStream = await getScreenStream();
    micStream = await getMicStream();
    video.srcObject = screenStream;
    await video.play();

    const crop = recordingCrop(captureRect);
    const recordingStream = buildRecordingStream();
    const mimeType = pickMimeType();
    chunks = [];
    recorder = new MediaRecorder(recordingStream, {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: bitsPerSecond
    });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = (event) => fail(event.error?.message || "MediaRecorder error");
    recorder.onstop = async () => {
      clearInterval(timerId);
      setMouseIgnored(false);
      stopTracks();
      if (canceled) {
        ipcRenderer.send("recording-cancel");
        return;
      }
      const blob = new Blob(chunks, { type: mimeType || "video/webm" });
      try {
        const dataBuffer = await blob.arrayBuffer();
        ipcRenderer.send("recording-complete", {
          dataBuffer,
          mimeType: blob.type,
          byteLength: blob.size,
          durationMs: recordingDuration(),
          width: crop.width,
          height: crop.height,
          cropX: crop.cropX,
          cropY: crop.cropY,
          sourceWidth: crop.sourceWidth,
          sourceHeight: crop.sourceHeight
        });
      } catch {
        fail("Failed to read recording data");
      }
    };
    startedAt = Date.now();
    pausedMs = 0;
    recorder.start(1000);
    timerId = setInterval(updateTimer, 250);
    updateTimer();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

function cancelRecording() {
  canceled = true;
  clearControlHideTimer();
  setMouseIgnored(false);
  clearInterval(timerId);
  if (nativeMode && nativeRecordingActive) {
    ipcRenderer.send("recording-native-command", "cancel");
    return;
  }
  if (recorder && recorder.state !== "inactive") {
    recorder.stop();
    return;
  }
  stopTracks();
  ipcRenderer.send("recording-cancel");
}

window.addEventListener("mousedown", (event) => {
  if (recorder || nativeRecordingActive || event.button !== 0) return;
  selecting = true;
  hasDragged = false;
  clickWindowRect = hoverWindowRect ? { ...hoverWindowRect } : null;
  startPoint = { x: event.clientX, y: event.clientY };
  selectedRect = { x: event.clientX, y: event.clientY, width: 0, height: 0 };
  renderSelection(selectedRect);
});

window.addEventListener("mousemove", (event) => {
  requestWindowRegions();
  announceActiveWindowRegionOverlay();
  lastPointer = { x: event.clientX, y: event.clientY };
  syncMousePassThrough(event);
  if (!selecting || !startPoint) {
    if (!recorder && !nativeRecordingActive && recordingMode === "region") {
      hoverWindowRect = windowRegionAt(event.clientX, event.clientY) || null;
      selectedRect = hoverWindowRect;
      if (selectedRect) {
        renderSelection(selectedRect);
      } else {
        selectionEl.style.display = "none";
        sizeBadge.style.display = "none";
      }
    }
    return;
  }
  if (Math.abs(event.clientX - startPoint.x) > 4 || Math.abs(event.clientY - startPoint.y) > 4) {
    hasDragged = true;
  }
  selectedRect = normalizeRect(startPoint, { x: event.clientX, y: event.clientY });
  renderSelection(selectedRect);
});
window.addEventListener("mouseleave", () => {
  if (recordingMode !== "region" || selecting || recorder || nativeRecordingActive) return;
  hoverWindowRect = null;
  selectedRect = null;
  selectionEl.style.display = "none";
  sizeBadge.style.display = "none";
});

window.addEventListener("mouseup", () => {
  if (!selecting || !selectedRect) return;
  selecting = false;
  if (!hasDragged && clickWindowRect) {
    selectedRect = clickWindowRect;
    clickWindowRect = null;
    renderSelection(selectedRect);
    void startRecording(selectedRect);
    return;
  }
  clickWindowRect = null;
  if (selectedRect.width < 24 || selectedRect.height < 24) {
    selectedRect = hoverWindowRect;
    if (selectedRect) {
      renderSelection(selectedRect);
    } else {
      selectionEl.style.display = "none";
      sizeBadge.style.display = "none";
    }
    return;
  }
  void startRecording(selectedRect);
});

pauseButton.addEventListener("click", () => {
  if (nativeMode && nativeRecordingActive) {
    if (nativeRecordingPaused) {
      pausedMs += Date.now() - pausedAt;
      nativeRecordingPaused = false;
      document.body.classList.remove("is-paused");
      syncPauseButton(false);
      ipcRenderer.send("recording-native-command", "resume");
    } else {
      pausedAt = Date.now();
      nativeRecordingPaused = true;
      document.body.classList.add("is-paused");
      syncPauseButton(true);
      ipcRenderer.send("recording-native-command", "pause");
    }
    return;
  }
  if (!recorder) return;
  if (recorder.state === "recording") {
    recorder.pause();
    pausedAt = Date.now();
    document.body.classList.add("is-paused");
    syncPauseButton(true);
  } else if (recorder.state === "paused") {
    pausedMs += Date.now() - pausedAt;
    recorder.resume();
    document.body.classList.remove("is-paused");
    syncPauseButton(false);
  }
});

stopButton.addEventListener("click", () => {
  if (nativeMode && nativeRecordingActive) {
    ipcRenderer.send("recording-native-command", "stop");
    return;
  }
  if (recorder && recorder.state !== "inactive") {
    recorder.stop();
  }
});

cancelButton.addEventListener("click", cancelRecording);
selectionCancel.addEventListener("mousedown", (event) => event.stopPropagation());
selectionCancel.addEventListener("click", (event) => {
  event.stopPropagation();
  cancelRecording();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") cancelRecording();
  if (nativeMode && nativeRecordingActive && event.key === "Enter") {
    ipcRenderer.send("recording-native-command", "stop");
    return;
  }
  if (nativeMode && nativeRecordingActive && (event.key === " " || event.code === "Space")) {
    event.preventDefault();
    pauseButton.click();
    return;
  }
  if (event.key === "Enter" && recorder && recorder.state !== "inactive") recorder.stop();
  if ((event.key === " " || event.code === "Space") && recorder?.state === "recording") {
    event.preventDefault();
    recorder.pause();
    pausedAt = Date.now();
    document.body.classList.add("is-paused");
  } else if ((event.key === " " || event.code === "Space") && recorder?.state === "paused") {
    event.preventDefault();
    pausedMs += Date.now() - pausedAt;
    recorder.resume();
    document.body.classList.remove("is-paused");
  }
  if (event.key === "Enter" && !recorder && selectedRect) void startRecording(selectedRect);
});

ipcRenderer.on("recording-command", (_event, command) => {
  if (command === "cancel") {
    cancelRecording();
    return;
  }
  if (nativeMode && nativeRecordingActive && command === "stop") {
    ipcRenderer.send("recording-native-command", "stop");
    return;
  }
  if (command === "stop" && recorder && recorder.state !== "inactive") recorder.stop();
});

ipcRenderer.on("window-regions", (_event, payload) => {
  const regions = Array.isArray(payload?.regions) ? payload.regions : [];
  windowRegions = regions.filter(
    (rect) =>
      rect &&
      [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
      rect.width >= 24 &&
      rect.height >= 24
  );
  if (Number.isFinite(payload?.cursor?.x) && Number.isFinite(payload?.cursor?.y)) {
    lastPointer = { x: payload.cursor.x, y: payload.cursor.y };
  }
  if (recordingMode === "region" && !selecting && !recorder && !nativeRecordingActive) {
    hoverWindowRect = windowRegionAt(lastPointer.x, lastPointer.y) || null;
    selectedRect = hoverWindowRect;
    if (selectedRect) renderSelection(selectedRect);
  }
});
ipcRenderer.on("window-regions-clear", () => {
  if (recordingMode !== "region" || selecting || recorder || nativeRecordingActive) return;
  hoverWindowRect = null;
  selectedRect = null;
  selectionEl.style.display = "none";
  sizeBadge.style.display = "none";
});

ipcRenderer.send("overlay:ready");

if (recordingMode === "screen") {
  selectedRect = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
  renderSelection(selectedRect);
  setTimeout(() => {
    if (!recorder && selectedRect) void startRecording(selectedRect);
  }, 160);
} else if (Number.isFinite(initialCursor.x) && Number.isFinite(initialCursor.y)) {
  hoverWindowRect = windowRegionAt(initialCursor.x, initialCursor.y) || null;
  selectedRect = hoverWindowRect;
  if (selectedRect) renderSelection(selectedRect);
}
