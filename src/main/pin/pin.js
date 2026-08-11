const { ipcRenderer } = require("electron");

const image = document.getElementById("pinImage");
const opacityInput = document.getElementById("opacity");

let currentFilePath = "";

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

opacityInput.addEventListener("input", () => {
  ipcRenderer.send("pin:opacity", Number(opacityInput.value) / 100);
});

window.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    ipcRenderer.send("pin:resize", event.deltaY < 0 ? 1.08 : 0.92);
  },
  { passive: false }
);

window.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  ipcRenderer.send("pin:context-menu", currentFilePath);
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
});
