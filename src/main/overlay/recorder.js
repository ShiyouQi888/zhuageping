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
const showCursor = params.get("showCursor") !== "false";
const clickHighlight = params.get("clickHighlight") !== "false";
const displayPixelWidth = Math.max(1, Number(params.get("displayPixelWidth")) || Math.round(window.innerWidth * scaleFactor));
const displayPixelHeight = Math.max(1, Number(params.get("displayPixelHeight")) || Math.round(window.innerHeight * scaleFactor));
const language = params.get("language") === "en-US" ? "en-US" : "zh-CN";
const initialWindowRect = (() => {
  const x = Number(params.get("windowX"));
  const y = Number(params.get("windowY"));
  const width = Number(params.get("windowWidth"));
  const height = Number(params.get("windowHeight"));
  if (![x, y, width, height].every(Number.isFinite) || width < 8 || height < 8) return null;
  return {
    x: clamp(x, 0, window.innerWidth),
    y: clamp(y, 0, window.innerHeight),
    width: clamp(width, 0, window.innerWidth),
    height: clamp(height, 0, window.innerHeight)
  };
})();

const text = {
  "zh-CN": {
    select: "拖动选择录屏区域",
    pause: "暂停",
    resume: "继续",
    stop: "停止",
    cancel: "取消",
    selectionHint: "拖动选择区域 · 再按 F2 或 Esc 取消"
  },
  "en-US": {
    select: "Drag to select a recording region",
    pause: "Pause",
    resume: "Resume",
    stop: "Stop",
    cancel: "Cancel",
    selectionHint: "Drag to select · Press F2 again or Esc to cancel"
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
const timerEl = document.getElementById("timer");
const pauseButton = document.getElementById("pause");
const stopButton = document.getElementById("stop");
const cancelButton = document.getElementById("cancel");
const video = document.getElementById("screenVideo");

pauseButton.textContent = text.pause;
stopButton.textContent = text.stop;
cancelButton.textContent = text.cancel;
selectionHintText.textContent = text.selectionHint;
selectionCancel.textContent = text.cancel;

let selecting = false;
let selectedRect = null;
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
  selectionEl.style.left = `${rect.x}px`;
  selectionEl.style.top = `${rect.y}px`;
  selectionEl.style.width = `${rect.width}px`;
  selectionEl.style.height = `${rect.height}px`;
  sizeBadge.style.display = "block";
  sizeBadge.textContent = `${Math.round(rect.width * scaleFactor)} x ${Math.round(rect.height * scaleFactor)}`;
  sizeBadge.style.left = `${Math.min(window.innerWidth - 120, rect.x)}px`;
  sizeBadge.style.top = `${Math.max(8, rect.y - 28)}px`;
}

function placeControlBar(rect) {
  if (recordingMode === "screen") {
    controlBar.style.display = "none";
    return;
  }
  controlBar.style.display = "flex";
  const barWidth = 245;
  const left = clamp(rect.x + rect.width / 2 - barWidth / 2, 12, window.innerWidth - barWidth - 12);
  const below = rect.y + rect.height + 14;
  const top = below + 54 < window.innerHeight ? below : Math.max(12, rect.y - 58);
  controlBar.style.left = `${left}px`;
  controlBar.style.top = `${top}px`;
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
  if (recordingMode === "screen") return false;
  if (controlBar.style.display === "none") return false;
  const rect = controlBar.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function syncMousePassThrough(event) {
  if ((!recorder || recorder.state === "inactive") && !nativeRecordingActive) return;
  setMouseIgnored(!pointInControlBar(event.clientX, event.clientY));
}

async function startRecording(rect) {
  try {
    document.body.classList.add("is-recording");
    shade.style.display = "none";
    placeControlBar(rect);
    setMouseIgnored(true);
    await showCountdown();
    if (canceled) return;

    if (nativeMode) {
      nativeRecordingActive = true;
      nativeRecordingPaused = false;
      startedAt = Date.now();
      pausedMs = 0;
      controlBar.style.display = "none";
      ipcRenderer.send("recording-region-selected", {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      });
      return;
    }

    controlBar.style.display = "none";
    await waitForUiPaint();

    screenStream = await getScreenStream();
    micStream = await getMicStream();
    video.srcObject = screenStream;
    await video.play();

    const crop = recordingCrop(rect);
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
  startPoint = { x: event.clientX, y: event.clientY };
  selectedRect = { x: event.clientX, y: event.clientY, width: 0, height: 0 };
  renderSelection(selectedRect);
});

window.addEventListener("mousemove", (event) => {
  syncMousePassThrough(event);
  if (!selecting || !startPoint) return;
  if (Math.abs(event.clientX - startPoint.x) > 4 || Math.abs(event.clientY - startPoint.y) > 4) {
    hasDragged = true;
  }
  selectedRect = normalizeRect(startPoint, { x: event.clientX, y: event.clientY });
  renderSelection(selectedRect);
});

window.addEventListener("mouseup", () => {
  if (!selecting || !selectedRect) return;
  selecting = false;
  if (!hasDragged && initialWindowRect) {
    selectedRect = initialWindowRect;
    renderSelection(selectedRect);
    void startRecording(selectedRect);
    return;
  }
  if (selectedRect.width < 24 || selectedRect.height < 24) {
    selectedRect = null;
    if (initialWindowRect) {
      selectedRect = initialWindowRect;
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
      pauseButton.textContent = text.pause;
      ipcRenderer.send("recording-native-command", "resume");
    } else {
      pausedAt = Date.now();
      nativeRecordingPaused = true;
      document.body.classList.add("is-paused");
      pauseButton.textContent = text.resume;
      ipcRenderer.send("recording-native-command", "pause");
    }
    return;
  }
  if (!recorder) return;
  if (recorder.state === "recording") {
    recorder.pause();
    pausedAt = Date.now();
    document.body.classList.add("is-paused");
    pauseButton.textContent = text.resume;
  } else if (recorder.state === "paused") {
    pausedMs += Date.now() - pausedAt;
    recorder.resume();
    document.body.classList.remove("is-paused");
    pauseButton.textContent = text.pause;
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

ipcRenderer.send("overlay:ready");

if (recordingMode === "screen") {
  selectedRect = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
  renderSelection(selectedRect);
  setTimeout(() => {
    if (!recorder && selectedRect) void startRecording(selectedRect);
  }, 160);
} else if (initialWindowRect) {
  selectedRect = initialWindowRect;
  renderSelection(selectedRect);
}
