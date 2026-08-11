const { ipcRenderer } = require("electron");
const {
  clampRect,
  normalizeRect,
  objectBounds,
  pointInRect,
  rectFromHandle,
  resizeObjectToBounds,
  translateObject
} = require("./geometry");

const canvas = document.getElementById("annotationCanvas");
const ctx = canvas.getContext("2d");
const shade = document.getElementById("shade");
const selectionEl = document.getElementById("selection");
const objectBox = document.getElementById("objectBox");
const toolbar = document.getElementById("toolbar");
const statusEl = document.getElementById("status");
const helpEl = document.getElementById("help");
const colorInput = document.getElementById("color");
const strokeSize = document.getElementById("strokeSize");
const toolButtons = [...document.querySelectorAll("[data-tool]")];
const swatchButtons = [...document.querySelectorAll(".swatch")];
const toolHotkeys = {
  v: "select",
  r: "rect",
  o: "ellipse",
  l: "line",
  a: "arrow",
  b: "brush",
  t: "text",
  m: "mosaic",
  u: "blur",
  e: "eraser"
};

const params = new URLSearchParams(window.location.search);
const pixelRatio = Number(params.get("scaleFactor")) || window.devicePixelRatio || 1;
const overlayOffset = {
  x: Number(params.get("offsetX")) || 0,
  y: Number(params.get("offsetY")) || 0
};
let activeScaleFactor = pixelRatio;
const minSelectionSize = 24;

const viewportBounds = () => ({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight });
const canvasPixelBounds = () => ({ x: 0, y: 0, width: canvas.width, height: canvas.height });

let phase = "selecting";
let tool = "rect";
let selection = null;
let canvasRect = null;
let captureRegion = null;
let startPoint = null;
let selecting = false;
let drawingObject = null;
let movingCrop = false;
let movingObject = false;
let resizeState = null;
let moveOrigin = null;
let activeTextEditor = null;
let selectedObjectId = null;
let serial = 0;
let objects = [];
let backgroundImage = null;
let backgroundMode = "selection";
const history = [];

function nextId() {
  serial += 1;
  return `obj-${serial}`;
}

function setStatus(message) {
  statusEl.textContent = message;
}

function setTool(nextTool) {
  commitTextEditor();
  tool = nextTool;
  document.body.style.cursor = nextTool === "select" ? "default" : "crosshair";
  toolButtons.forEach((button) => button.classList.toggle("active", button.dataset.tool === nextTool));
  renderObjectBox();
}

function syncActiveSwatch() {
  const activeColor = colorInput.value.toLowerCase();
  swatchButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.color.toLowerCase() === activeColor);
  });
}

function cloneObjects(items = objects) {
  return JSON.parse(JSON.stringify(items));
}

function pushHistory() {
  history.push({
    objects: cloneObjects(objects),
    selectedObjectId
  });
  if (history.length > 80) history.shift();
}

function restore(state) {
  objects = cloneObjects(state.objects);
  selectedObjectId = state.selectedObjectId;
  renderObjects();
  renderObjectBox();
}

function selectedObject() {
  return objects.find((object) => object.id === selectedObjectId) || null;
}

function objectToScreenBounds(bounds) {
  const scaleX = canvasRect.width / canvas.width;
  const scaleY = canvasRect.height / canvas.height;
  return {
    x: canvasRect.x + bounds.x * scaleX,
    y: canvasRect.y + bounds.y * scaleY,
    width: bounds.width * scaleX,
    height: bounds.height * scaleY
  };
}

function backgroundSourceRect() {
  if (backgroundMode === "display" && canvasRect) {
    return {
      x: Math.round(canvasRect.x * activeScaleFactor),
      y: Math.round(canvasRect.y * activeScaleFactor),
      width: canvas.width,
      height: canvas.height
    };
  }
  return { x: 0, y: 0, width: canvas.width, height: canvas.height };
}

function drawBackgroundPreview(targetCtx) {
  if (!backgroundImage) return;
  const source = backgroundSourceRect();
  targetCtx.drawImage(backgroundImage, source.x, source.y, source.width, source.height, 0, 0, canvas.width, canvas.height);
}

function screenSelectionToCaptureRegion(rect) {
  return {
    x: rect.x + overlayOffset.x,
    y: rect.y + overlayOffset.y,
    width: rect.width,
    height: rect.height
  };
}

function eventPoint(event) {
  if (!canvasRect) {
    return { x: event.clientX * pixelRatio, y: event.clientY * pixelRatio };
  }
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function renderSelection() {
  if (!selection || selection.width < 2 || selection.height < 2) {
    selectionEl.style.display = "none";
    toolbar.style.display = "none";
    helpEl.style.display = "none";
    return;
  }
  selectionEl.style.display = "block";
  selectionEl.style.left = `${selection.x}px`;
  selectionEl.style.top = `${selection.y}px`;
  selectionEl.style.width = `${selection.width}px`;
  selectionEl.style.height = `${selection.height}px`;
  selectionEl.classList.toggle("is-editing", phase === "editing");

  toolbar.style.display = phase === "editing" ? "flex" : "none";
  if (phase !== "editing") return;

  const toolbarWidth = toolbar.offsetWidth || toolbar.scrollWidth;
  const selectionCenterX = selection.x + selection.width / 2;
  let left = selectionCenterX - toolbarWidth / 2;
  let top = selection.y + selection.height + 10;
  if (top + 58 > window.innerHeight) top = selection.y - 62;
  if (left + toolbarWidth > window.innerWidth - 12) left = window.innerWidth - toolbarWidth - 12;
  toolbar.style.left = `${Math.max(12, left)}px`;
  toolbar.style.top = `${Math.max(12, top)}px`;
  positionHelpNearToolbar();
}

function positionHelpNearToolbar() {
  if (helpEl.style.display === "none" || toolbar.style.display === "none") {
    return;
  }
  const toolbarRect = toolbar.getBoundingClientRect();
  helpEl.style.maxWidth = `${Math.max(280, Math.round(toolbarRect.width))}px`;
  helpEl.style.left = `${Math.round(toolbarRect.left)}px`;
  let top = toolbarRect.bottom + 8;
  if (top + helpEl.offsetHeight > window.innerHeight - 12) {
    top = toolbarRect.top - helpEl.offsetHeight - 8;
  }
  helpEl.style.top = `${Math.max(12, Math.round(top))}px`;
}

function renderObjectBox() {
  const object = selectedObject();
  if (!object || phase !== "editing" || !canvasRect) {
    objectBox.style.display = "none";
    return;
  }
  const bounds = objectToScreenBounds(objectBounds(object));
  objectBox.style.display = "block";
  objectBox.style.left = `${bounds.x}px`;
  objectBox.style.top = `${bounds.y}px`;
  objectBox.style.width = `${Math.max(1, bounds.width)}px`;
  objectBox.style.height = `${Math.max(1, bounds.height)}px`;
}

function configureCanvas(rect) {
  activeScaleFactor = rect.scaleFactor || pixelRatio;
  canvasRect = rect;
  captureRegion = screenSelectionToCaptureRegion(rect);
  canvas.width = Math.max(1, Math.round(rect.width * activeScaleFactor));
  canvas.height = Math.max(1, Math.round(rect.height * activeScaleFactor));
  canvas.style.display = "block";
  canvas.style.left = `${rect.x}px`;
  canvas.style.top = `${rect.y}px`;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  backgroundImage = null;
  backgroundMode = rect.backgroundMode || "selection";
  objects = [];
  selectedObjectId = null;
  history.length = 0;
  if (rect.backgroundDataUrl) {
    const image = new Image();
    image.onload = () => {
      backgroundImage = image;
      renderObjects();
    };
    image.src = rect.backgroundDataUrl;
  }
  renderObjects();
  pushHistory();
}

function resizeCrop(nextRect) {
  const previousRect = { ...canvasRect };
  const nextWidth = Math.max(1, Math.round(nextRect.width * activeScaleFactor));
  const nextHeight = Math.max(1, Math.round(nextRect.height * activeScaleFactor));
  const objectOffsetX = Math.round((previousRect.x - nextRect.x) * activeScaleFactor);
  const objectOffsetY = Math.round((previousRect.y - nextRect.y) * activeScaleFactor);
  if (objectOffsetX || objectOffsetY) {
    objects = objects.map((object) => translateObject(object, objectOffsetX, objectOffsetY));
  }

  canvasRect = nextRect;
  captureRegion = screenSelectionToCaptureRegion(nextRect);
  selection = { ...nextRect };
  canvas.width = nextWidth;
  canvas.height = nextHeight;
  canvas.style.left = `${nextRect.x}px`;
  canvas.style.top = `${nextRect.y}px`;
  canvas.style.width = `${nextRect.width}px`;
  canvas.style.height = `${nextRect.height}px`;
  renderObjects();
  pushHistory();
  renderSelection();
  renderObjectBox();
}

function moveCrop(nextRect) {
  canvasRect = nextRect;
  captureRegion = screenSelectionToCaptureRegion(nextRect);
  selection = { ...nextRect };
  canvas.style.left = `${nextRect.x}px`;
  canvas.style.top = `${nextRect.y}px`;
  renderSelection();
  renderObjectBox();
}

function enterEditMode(rect) {
  phase = "editing";
  shade.style.display = "none";
  helpEl.style.display = "block";
  setStatus("可移动选区，也可选中对象后二次编辑");
  configureCanvas(rect);
  selection = { ...rect };
  renderSelection();
  setTool("rect");
}

function drawPrivacyObject(targetCtx, object, options = { includeOutline: true }) {
  if (!backgroundImage) {
    targetCtx.save();
    targetCtx.fillStyle = object.type === "mosaic" ? "rgba(30,41,59,.92)" : "rgba(226,232,240,.9)";
    targetCtx.fillRect(object.x, object.y, object.width, object.height);
    targetCtx.restore();
    return;
  }

  if (object.type === "mosaic") {
    const block = Math.max(10, object.size * 3);
    const sampleWidth = Math.max(1, Math.ceil(object.width / block));
    const sampleHeight = Math.max(1, Math.ceil(object.height / block));
    const pixelCanvas = document.createElement("canvas");
    pixelCanvas.width = sampleWidth;
    pixelCanvas.height = sampleHeight;
    const pixelCtx = pixelCanvas.getContext("2d");
    pixelCtx.imageSmoothingEnabled = false;
    const source = backgroundSourceRect();
    pixelCtx.drawImage(backgroundImage, source.x + object.x, source.y + object.y, object.width, object.height, 0, 0, sampleWidth, sampleHeight);
    targetCtx.save();
    targetCtx.imageSmoothingEnabled = false;
    targetCtx.drawImage(pixelCanvas, 0, 0, sampleWidth, sampleHeight, object.x, object.y, object.width, object.height);
    if (options.includeOutline) {
      targetCtx.strokeStyle = "rgba(15,23,42,.58)";
      targetCtx.lineWidth = 1;
      targetCtx.strokeRect(object.x + 0.5, object.y + 0.5, object.width - 1, object.height - 1);
    }
    targetCtx.restore();
  }

  if (object.type === "blur") {
    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.rect(object.x, object.y, object.width, object.height);
    targetCtx.clip();
    targetCtx.filter = `blur(${Math.max(12, object.size * 3)}px)`;
    drawBackgroundPreview(targetCtx);
    targetCtx.filter = "none";
    if (options.includeOutline) {
      targetCtx.strokeStyle = "rgba(37,99,235,.58)";
      targetCtx.lineWidth = 1;
      targetCtx.strokeRect(object.x + 0.5, object.y + 0.5, object.width - 1, object.height - 1);
    }
    targetCtx.restore();
  }
}

function drawObject(targetCtx, object, options = { includePrivacyPreview: true }) {
  targetCtx.save();
  targetCtx.strokeStyle = object.color || colorInput.value;
  targetCtx.fillStyle = object.color || colorInput.value;
  targetCtx.lineWidth = object.size || Number(strokeSize.value);
  targetCtx.lineCap = "round";
  targetCtx.lineJoin = "round";

  if (object.type === "rect") {
    targetCtx.strokeRect(object.x, object.y, object.width, object.height);
  }
  if (object.type === "ellipse") {
    targetCtx.beginPath();
    targetCtx.ellipse(object.x + object.width / 2, object.y + object.height / 2, Math.abs(object.width / 2), Math.abs(object.height / 2), 0, 0, Math.PI * 2);
    targetCtx.stroke();
  }
  if (object.type === "line" || object.type === "arrow") {
    targetCtx.beginPath();
    targetCtx.moveTo(object.x1, object.y1);
    targetCtx.lineTo(object.x2, object.y2);
    targetCtx.stroke();
    if (object.type === "arrow") {
      const angle = Math.atan2(object.y2 - object.y1, object.x2 - object.x1);
      const head = object.size * 4 + 12;
      targetCtx.beginPath();
      targetCtx.moveTo(object.x2, object.y2);
      targetCtx.lineTo(object.x2 - head * Math.cos(angle - Math.PI / 6), object.y2 - head * Math.sin(angle - Math.PI / 6));
      targetCtx.moveTo(object.x2, object.y2);
      targetCtx.lineTo(object.x2 - head * Math.cos(angle + Math.PI / 6), object.y2 - head * Math.sin(angle + Math.PI / 6));
      targetCtx.stroke();
    }
  }
  if (object.type === "brush" || object.type === "eraser") {
    if (object.type === "eraser") targetCtx.globalCompositeOperation = "destination-out";
    targetCtx.lineWidth = object.type === "eraser" ? object.size * 3 : object.size;
    targetCtx.beginPath();
    object.points.forEach((point, index) => {
      index === 0 ? targetCtx.moveTo(point.x, point.y) : targetCtx.lineTo(point.x, point.y);
    });
    targetCtx.stroke();
  }
  if (object.type === "text") {
    targetCtx.font = `${object.fontSize}px Microsoft YaHei, Segoe UI`;
    targetCtx.fillStyle = object.color;
    object.text.split("\n").forEach((line, index) => {
      targetCtx.fillText(line, object.x, object.y + index * object.lineHeight);
    });
  }
  if ((object.type === "mosaic" || object.type === "blur") && options.includePrivacyPreview) {
    drawPrivacyObject(targetCtx, object);
  }
  targetCtx.restore();
}

function renderObjects(targetCtx = ctx, options = { includePrivacyPreview: true, includeBackgroundPreview: true }) {
  targetCtx.clearRect(0, 0, canvas.width, canvas.height);
  if (options.includeBackgroundPreview && backgroundImage) {
    drawBackgroundPreview(targetCtx);
  }
  if (options.includePrivacyPreview) {
    objects
      .filter((object) => object.type === "mosaic" || object.type === "blur")
      .forEach((object) => drawObject(targetCtx, object, options));
  }
  objects
    .filter((object) => object.type !== "mosaic" && object.type !== "blur")
    .forEach((object) => drawObject(targetCtx, object, { includePrivacyPreview: false }));
}

function buildObject(toolName, from, to) {
  const color = colorInput.value;
  const size = Number(strokeSize.value);
  if (toolName === "rect" || toolName === "ellipse" || toolName === "mosaic" || toolName === "blur") {
    return { id: nextId(), type: toolName, ...normalizeRect(from, to), color, size };
  }
  if (toolName === "line" || toolName === "arrow") {
    return { id: nextId(), type: toolName, x1: from.x, y1: from.y, x2: to.x, y2: to.y, color, size };
  }
  return null;
}

function objectAt(point) {
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    if (pointInRect(point, objectBounds(objects[index]), 8)) {
      return objects[index];
    }
  }
  return null;
}

function addObject(object) {
  objects.push(object);
  selectedObjectId = object.id;
  renderObjects();
  renderObjectBox();
  pushHistory();
}

function updateSelectedObject(nextObject) {
  objects = objects.map((object) => (object.id === nextObject.id ? nextObject : object));
  renderObjects();
  renderObjectBox();
}

function translateObjectClamped(object, dx, dy) {
  const moved = translateObject(object, dx, dy);
  const bounds = objectBounds(moved);
  const clampedBounds = clampRect(bounds, canvasPixelBounds(), 1);
  return translateObject(moved, clampedBounds.x - bounds.x, clampedBounds.y - bounds.y);
}

function beginTextEditor(point, existingObject = null) {
  commitTextEditor();
  const rect = canvas.getBoundingClientRect();
  const editor = document.createElement("textarea");
  editor.className = "text-editor";
  editor.placeholder = "输入文字";
  editor.value = existingObject?.text || "";
  const fontSize = existingObject?.fontSize || Math.max(18, Number(strokeSize.value) * 5);
  editor.style.left = `${rect.left + point.x / (canvas.width / rect.width)}px`;
  editor.style.top = `${rect.top + (point.y - fontSize) / (canvas.height / rect.height)}px`;
  editor.style.color = existingObject?.color || colorInput.value;
  editor.style.font = `${fontSize}px Microsoft YaHei, Segoe UI`;
  editor.style.lineHeight = "1.25";
  document.body.appendChild(editor);
  activeTextEditor = { element: editor, point, objectId: existingObject?.id || null, fontSize };
  requestAnimationFrame(() => {
    editor.focus();
    editor.select();
  });
  editor.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      editor.remove();
      activeTextEditor = null;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      commitTextEditor();
    }
  });
  editor.addEventListener("blur", commitTextEditor, { once: true });
}

function commitTextEditor() {
  if (!activeTextEditor) return;
  const { element, objectId, fontSize } = activeTextEditor;
  const text = element.value.trim();
  const editorRect = element.getBoundingClientRect();
  const canvasBounds = canvas.getBoundingClientRect();
  element.remove();
  activeTextEditor = null;
  if (!text) return;

  const lineHeight = Math.max(24, fontSize * 1.25);
  const nextObject = {
    id: objectId || nextId(),
    type: "text",
    x: (editorRect.left - canvasBounds.left) * (canvas.width / canvasBounds.width),
    y: (editorRect.top - canvasBounds.top) * (canvas.height / canvasBounds.height) + fontSize,
    width: editorRect.width * (canvas.width / canvasBounds.width),
    height: Math.max(lineHeight, text.split("\n").length * lineHeight),
    text,
    color: colorInput.value,
    size: Number(strokeSize.value),
    fontSize,
    lineHeight
  };
  if (objectId) {
    selectedObjectId = objectId;
    updateSelectedObject(nextObject);
    pushHistory();
  } else {
    addObject(nextObject);
  }
}

function annotationDataUrl() {
  const output = document.createElement("canvas");
  output.width = canvas.width;
  output.height = canvas.height;
  const outputCtx = output.getContext("2d");
  objects
    .filter((object) => object.type !== "mosaic" && object.type !== "blur")
    .forEach((object) => drawObject(outputCtx, object, { includePrivacyPreview: false }));
  return output.toDataURL("image/png");
}

function privacyDataUrl() {
  const privacyObjects = objects.filter((object) => object.type === "mosaic" || object.type === "blur");
  if (!backgroundImage || privacyObjects.length === 0) return null;

  const output = document.createElement("canvas");
  output.width = canvas.width;
  output.height = canvas.height;
  const outputCtx = output.getContext("2d");
  privacyObjects.forEach((object) => drawPrivacyObject(outputCtx, object, { includeOutline: false }));
  return output.toDataURL("image/png");
}

function mosaicPayload() {
  return objects
    .filter((object) => object.type === "mosaic")
    .map((object) => ({ x: object.x, y: object.y, width: object.width, height: object.height }));
}

function blurPayload() {
  return objects
    .filter((object) => object.type === "blur")
    .map((object) => ({ x: object.x, y: object.y, width: object.width, height: object.height }));
}

function complete(channel) {
  commitTextEditor();
  if (!captureRegion) return;
  document.body.style.cursor = "wait";
  const statusText = {
    "inline-capture-copy": "正在复制...",
    "inline-capture-pin": "正在贴图...",
    "inline-capture-complete": "正在保存..."
  };
  setStatus(statusText[channel] || "正在处理...");
  ipcRenderer.send(channel, {
    region: captureRegion,
    annotationDataUrl: annotationDataUrl(),
    privacyDataUrl: privacyDataUrl(),
    mosaicRegions: mosaicPayload(),
    blurRegions: blurPayload()
  });
}

toolButtons.forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool)));
document.querySelectorAll(".swatch").forEach((button) => {
  button.addEventListener("click", () => {
    colorInput.value = button.dataset.color;
    syncActiveSwatch();
  });
});
colorInput.addEventListener("input", syncActiveSwatch);

selectionEl.querySelectorAll(".handle").forEach((handle) => {
  handle.addEventListener("mousedown", (event) => {
    if (phase !== "editing" || !selection) return;
    event.preventDefault();
    event.stopPropagation();
    resizeState = { mode: "crop", handle: handle.dataset.handle, origin: { ...selection } };
  });
});

objectBox.querySelectorAll(".handle").forEach((handle) => {
  handle.addEventListener("mousedown", (event) => {
    const object = selectedObject();
    if (!object) return;
    event.preventDefault();
    event.stopPropagation();
    resizeState = { mode: "object", handle: handle.dataset.handle, origin: objectBounds(object), object: cloneObjects([object])[0] };
  });
});

objectBox.addEventListener("mousedown", (event) => {
  if (!selectedObject() || event.target.dataset.handle) return;
  event.preventDefault();
  movingObject = true;
  moveOrigin = { object: cloneObjects([selectedObject()])[0], pointer: eventPoint(event) };
});

objectBox.addEventListener("dblclick", (event) => {
  const object = selectedObject();
  if (object?.type !== "text") return;
  event.preventDefault();
  event.stopPropagation();
  beginTextEditor({ x: object.x, y: object.y }, object);
});

canvas.addEventListener("mousedown", (event) => {
  if (phase !== "editing") return;
  commitTextEditor();
  const point = eventPoint(event);
  if (tool === "select") {
    const hit = objectAt(point);
    if (hit) {
      selectedObjectId = hit.id;
      renderObjectBox();
      movingObject = true;
      moveOrigin = { object: cloneObjects([hit])[0], pointer: point };
      return;
    }
    selectedObjectId = null;
    renderObjectBox();
    movingCrop = true;
    moveOrigin = { rect: { ...selection }, pointer: { x: event.clientX, y: event.clientY } };
    return;
  }
  if (tool === "text") {
    beginTextEditor(point);
    return;
  }
  startPoint = point;
  if (tool === "brush" || tool === "eraser") {
    drawingObject = {
      id: nextId(),
      type: tool,
      points: [point],
      color: colorInput.value,
      size: Number(strokeSize.value)
    };
  } else {
    drawingObject = buildObject(tool, point, point);
  }
});

canvas.addEventListener("dblclick", (event) => {
  if (tool !== "select") return;
  const hit = objectAt(eventPoint(event));
  if (hit?.type === "text") {
    selectedObjectId = hit.id;
    renderObjectBox();
    beginTextEditor({ x: hit.x, y: hit.y }, hit);
  }
});

window.addEventListener("mousedown", (event) => {
  if (phase !== "selecting" || toolbar.contains(event.target)) return;
  selecting = true;
  startPoint = { x: event.clientX, y: event.clientY };
  selection = { x: startPoint.x, y: startPoint.y, width: 1, height: 1 };
  renderSelection();
});

window.addEventListener("mousemove", (event) => {
  if (resizeState?.mode === "crop") {
    selection = rectFromHandle(resizeState.handle, resizeState.origin, { x: event.clientX, y: event.clientY }, viewportBounds(), minSelectionSize);
    renderSelection();
    return;
  }
  if (resizeState?.mode === "object") {
    const current = eventPoint(event);
    const nextBounds = rectFromHandle(resizeState.handle, resizeState.origin, current, canvasPixelBounds(), 8);
    updateSelectedObject(resizeObjectToBounds(resizeState.object, nextBounds));
    return;
  }
  if (movingCrop && moveOrigin) {
    const dx = event.clientX - moveOrigin.pointer.x;
    const dy = event.clientY - moveOrigin.pointer.y;
    moveCrop(clampRect({ ...moveOrigin.rect, x: moveOrigin.rect.x + dx, y: moveOrigin.rect.y + dy }, viewportBounds(), minSelectionSize));
    return;
  }
  if (movingObject && moveOrigin) {
    const current = eventPoint(event);
    updateSelectedObject(
      translateObjectClamped(moveOrigin.object, current.x - moveOrigin.pointer.x, current.y - moveOrigin.pointer.y)
    );
    return;
  }
  if (selecting && startPoint) {
    selection = normalizeRect(startPoint, { x: event.clientX, y: event.clientY });
    renderSelection();
    return;
  }
  if (!drawingObject || !startPoint) return;
  const current = eventPoint(event);
  if (drawingObject.type === "brush" || drawingObject.type === "eraser") {
    drawingObject.points.push(current);
  } else {
    drawingObject = buildObject(tool, startPoint, current);
  }
  renderObjects();
  drawObject(ctx, drawingObject);
});

window.addEventListener("mouseup", () => {
  if (resizeState?.mode === "crop") {
    const nextRect = { ...selection };
    resizeState = null;
    resizeCrop(nextRect);
    return;
  }
  if (resizeState?.mode === "object") {
    resizeState = null;
    pushHistory();
    return;
  }
  if (movingCrop) {
    movingCrop = false;
    moveOrigin = null;
    return;
  }
  if (movingObject) {
    movingObject = false;
    moveOrigin = null;
    pushHistory();
    return;
  }
  if (selecting) {
    selecting = false;
    if (!selection || selection.width < 8 || selection.height < 8) {
      selection = null;
      renderSelection();
      return;
    }
    selection = clampRect(selection, viewportBounds(), minSelectionSize);
    ipcRenderer.send("inline-region-selected", screenSelectionToCaptureRegion(selection));
    return;
  }
  if (drawingObject) {
    if (objectBounds(drawingObject).width >= 2 || objectBounds(drawingObject).height >= 2) {
      objects.push(drawingObject);
      selectedObjectId = drawingObject.id;
      pushHistory();
    }
    drawingObject = null;
    renderObjects();
    renderObjectBox();
  }
});

document.getElementById("undo").addEventListener("click", () => {
  commitTextEditor();
  if (history.length <= 1) return;
  history.pop();
  restore(history[history.length - 1]);
});
document.getElementById("copy").addEventListener("click", () => complete("inline-capture-copy"));
document.getElementById("pin").addEventListener("click", () => complete("inline-capture-pin"));
document.getElementById("save").addEventListener("click", () => complete("inline-capture-complete"));
document.getElementById("ok").addEventListener("click", () => complete("inline-capture-complete"));
document.getElementById("cancel").addEventListener("click", () => ipcRenderer.send("inline-capture-cancel"));

window.addEventListener("keydown", (event) => {
  if (activeTextEditor) return;
  if (event.key === "Escape") ipcRenderer.send("inline-capture-cancel");
  const toolFromKey = toolHotkeys[event.key.toLowerCase()];
  if (toolFromKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    setTool(toolFromKey);
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    if (selectedObjectId) {
      objects = objects.filter((object) => object.id !== selectedObjectId);
      selectedObjectId = null;
      renderObjects();
      renderObjectBox();
      pushHistory();
    }
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    document.getElementById("undo").click();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
    event.preventDefault();
    complete("inline-capture-copy");
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    complete("inline-capture-complete");
  }
  if (event.key === "F3") {
    event.preventDefault();
    complete("inline-capture-pin");
  }
  if (event.key === "Enter") complete("inline-capture-complete");
});

ipcRenderer.on("inline-region-ready", (_event, rect) => enterEditMode(rect));
ipcRenderer.on("inline-capture-error", () => {
  setStatus("截图失败，请按 Esc 退出后重试");
  document.body.style.cursor = "default";
});

setTool("rect");
requestAnimationFrame(() => ipcRenderer.send("overlay:ready"));
