const { ipcRenderer } = require("electron");

const image = document.getElementById("pinImage");
const toolbar = document.getElementById("toolbar");
const opacityInput = document.getElementById("opacity");
const lockButton = document.getElementById("lock");
const topLevelButton = document.getElementById("topLevel");
const clickThroughButton = document.getElementById("clickThrough");

let currentFilePath = "";
let locked = false;
let clickThrough = false;
let topLevel = "screen";
let dragging = false;
let toolbarInteractive = false;

function syncState() {
  document.body.classList.toggle("is-locked", locked);
  document.body.classList.toggle("is-click-through", clickThrough);
  lockButton.classList.toggle("active", locked);
  clickThroughButton.classList.toggle("active", clickThrough);
  lockButton.textContent = locked ? "解锁" : "锁定";
  clickThroughButton.textContent = clickThrough ? "取消穿透" : "穿透";
  topLevelButton.classList.toggle("active", topLevel !== "normal");
  topLevelButton.textContent = topLevel === "normal" ? "置顶" : "取消置顶";
}

ipcRenderer.on("pin:init", (_event, payload) => {
  currentFilePath = payload.filePath;
  image.src = payload.fileUrl;
  document.title = payload.title || "贴图";
});

document.getElementById("zoomOut").addEventListener("click", () => ipcRenderer.send("pin:resize", 0.86));
document.getElementById("zoomReset").addEventListener("click", () => ipcRenderer.send("pin:reset-size"));
document.getElementById("zoomIn").addEventListener("click", () => ipcRenderer.send("pin:resize", 1.16));
document.getElementById("copy").addEventListener("click", () => ipcRenderer.send("pin:copy", currentFilePath));
document.getElementById("open").addEventListener("click", () => ipcRenderer.send("pin:open", currentFilePath));
document.getElementById("close").addEventListener("click", () => window.close());
lockButton.addEventListener("click", () => ipcRenderer.send("pin:lock", !locked));
topLevelButton.addEventListener("click", () => {
  const next = topLevel === "normal" ? "screen" : "normal";
  ipcRenderer.send("pin:top-level", next);
});
clickThroughButton.addEventListener("click", () => ipcRenderer.send("pin:click-through", !clickThrough));

opacityInput.addEventListener("input", () => {
  ipcRenderer.send("pin:opacity", Number(opacityInput.value) / 100);
});

window.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    if (locked) return;
    ipcRenderer.send("pin:resize", event.deltaY < 0 ? 1.08 : 0.92);
  },
  { passive: false }
);

function updateToolbarInteractive(event) {
  if (!clickThrough) return;
  const rect = toolbar.getBoundingClientRect();
  const insideToolbarZone =
    event.clientX >= rect.left - 12 &&
    event.clientX <= rect.right + 12 &&
    event.clientY >= rect.top - 12 &&
    event.clientY <= rect.bottom + 12;
  if (insideToolbarZone === toolbarInteractive) return;
  toolbarInteractive = insideToolbarZone;
  ipcRenderer.send("pin:toolbar-interactive", toolbarInteractive);
}

window.addEventListener("mousemove", updateToolbarInteractive);

window.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  ipcRenderer.send("pin:context-menu", currentFilePath);
});

window.addEventListener("mousedown", (event) => {
  if (event.button !== 0 || locked || event.target.closest("#toolbar")) return;
  dragging = true;
  event.preventDefault();
  ipcRenderer.send("pin:drag-start", { x: event.screenX, y: event.screenY });
});

window.addEventListener("mousemove", (event) => {
  if (!dragging) return;
  event.preventDefault();
  ipcRenderer.send("pin:drag-move", { x: event.screenX, y: event.screenY });
});

window.addEventListener("mouseup", () => {
  if (!dragging) return;
  dragging = false;
  ipcRenderer.send("pin:drag-end");
});

window.addEventListener("mouseleave", () => {
  if (!dragging) return;
  dragging = false;
  ipcRenderer.send("pin:drag-end");
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.close();
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
    event.preventDefault();
    ipcRenderer.send("pin:copy", currentFilePath);
  }
  if (event.key === "+" || event.key === "=") ipcRenderer.send("pin:resize", 1.16);
  if (event.key === "-") ipcRenderer.send("pin:resize", 0.86);
  if (event.key === "0") ipcRenderer.send("pin:reset-size");
  if (event.key.toLowerCase() === "l") ipcRenderer.send("pin:lock", !locked);
  if (event.key.toLowerCase() === "t") ipcRenderer.send("pin:top-level", topLevel === "normal" ? "screen" : "normal");
  if (event.key.toLowerCase() === "x") ipcRenderer.send("pin:click-through", !clickThrough);
  if (event.key === "[" || event.key === "{") ipcRenderer.send("pin:opacity-step", -0.08);
  if (event.key === "]" || event.key === "}") ipcRenderer.send("pin:opacity-step", 0.08);
});

ipcRenderer.on("pin:state", (_event, state) => {
  locked = Boolean(state.locked);
  clickThrough = Boolean(state.clickThrough);
  topLevel = state.topLevel || "screen";
  if (typeof state.opacity === "number") {
    opacityInput.value = String(Math.round(state.opacity * 100));
  }
  syncState();
});

syncState();
