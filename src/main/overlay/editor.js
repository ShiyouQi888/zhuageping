const { ipcRenderer, clipboard } = require("electron");
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
const fontSizeInput = document.getElementById("fontSize");
const privacyStrengthInput = document.getElementById("privacyStrength");
const boldTextButton = document.getElementById("boldText");
const textBgButton = document.getElementById("textBg");
const textStrokeButton = document.getElementById("textStroke");
const alignMenu = document.getElementById("alignMenu");
const scrollCaptureButton = document.getElementById("scrollCapture");
const ocrCaptureButton = document.getElementById("ocrCapture");
const ocrDialog = document.getElementById("ocrDialog");
const ocrText = document.getElementById("ocrText");
const ocrMeta = document.getElementById("ocrMeta");
const ocrTip = document.getElementById("ocrTip");
const ocrCloseButton = document.getElementById("ocrClose");
const ocrCopyButton = document.getElementById("ocrCopy");
const contextualGroups = [...document.querySelectorAll(".contextual")];
const objectActionControls = [
  document.getElementById("duplicateObject"),
  document.getElementById("bringForward"),
  document.getElementById("sendBackward"),
  alignMenu
];
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
const overlayLanguage = params.get("language") === "en-US" ? "en-US" : "zh-CN";
const editorMessages = {
  "zh-CN": {
    documentTitle: "抓个屏截图编辑器",
    toolbarLabel: "截图编辑工具",
    selectionHint: "拖动选择截图区域",
    help: "V 选择 · R 矩形 · T 文字 · M 马赛克 · U 模糊 · Ctrl+Shift+O OCR · Ctrl+Shift+F1 滚动截图 · F3 贴图 · Esc 取消 · Ctrl+C 复制 · Enter 完成",
    editableStatus: "可移动选区，也可选中对象后二次编辑",
    textPlaceholder: "输入文字",
    ocr: {
      title: "OCR 识别结果",
      ready: "准备就绪",
      close: "关闭 OCR 结果",
      empty: "未识别到文字",
      failed: "OCR 识别失败",
      lines: (count) => `${count} 行`,
      copied: "已自动复制到剪贴板",
      noText: "没有识别到文字，可调整截图区域后重试",
      copyButton: "复制文字",
      copyAgain: "已复制到剪贴板",
      copiedStatus: "OCR 文字已复制",
      running: "正在 OCR 识别...",
      doneStatus: "OCR 完成，文字已复制",
      tip: "识别成功后会自动复制到剪贴板"
    },
    statusByChannel: {
      "inline-capture-copy": "正在复制...",
      "inline-capture-pin": "正在贴图...",
      "inline-capture-scroll": "正在滚动截图...",
      "inline-capture-complete": "正在保存..."
    },
    processing: "正在处理...",
    captureError: "截图失败，请按 Esc 退出后重试",
    titles: {
      select: "选择/移动 V",
      rect: "矩形 R",
      ellipse: "圆形 O",
      line: "直线 L",
      arrow: "箭头 A",
      brush: "画笔 B",
      text: "文字 T",
      mosaic: "马赛克 M",
      blur: "模糊块 U",
      eraser: "橡皮擦 E",
      scrollCapture: "滚动截图 Ctrl+Shift+F1",
      color: "自定义颜色",
      strokeSize: "线宽",
      duplicateObject: "复制对象 Ctrl+D",
      bringForward: "上移一层 Ctrl+]",
      sendBackward: "下移一层 Ctrl+[",
      alignMenu: "对齐选中对象",
      undo: "撤销 Ctrl+Z",
      ocrCapture: "OCR 识别并复制 Ctrl+Shift+O",
      copy: "复制 Ctrl+C",
      pin: "贴图 F3",
      save: "保存 Ctrl+S",
      cancel: "取消 Esc",
      ok: "完成 Enter",
      fontSize: "文字大小",
      boldText: "文字加粗",
      textBg: "文字背景",
      textStroke: "文字描边",
      privacyStrength: "马赛克/模糊强度"
    },
    swatches: {
      "#ef4444": "红色",
      "#2563eb": "蓝色",
      "#16a34a": "绿色",
      "#f59e0b": "黄色",
      "#111827": "黑色",
      "#ffffff": "白色"
    }
  },
  "en-US": {
    documentTitle: "Zhuageping Screenshot Editor",
    toolbarLabel: "Screenshot editing tools",
    selectionHint: "Drag to select a capture region",
    help: "V Select · R Rectangle · T Text · M Mosaic · U Blur · Ctrl+Shift+O OCR · Ctrl+Shift+F1 Scroll · F3 Pin · Esc Cancel · Ctrl+C Copy · Enter Done",
    editableStatus: "Move the selection, or select objects for further editing",
    textPlaceholder: "Enter text",
    ocr: {
      title: "OCR Result",
      ready: "Ready",
      close: "Close OCR result",
      empty: "No text detected",
      failed: "OCR failed",
      lines: (count) => `${count} line${count === 1 ? "" : "s"}`,
      copied: "Automatically copied to clipboard",
      noText: "No text detected. Adjust the region and try again.",
      copyButton: "Copy Text",
      copyAgain: "Copied to clipboard",
      copiedStatus: "OCR text copied",
      running: "Running OCR...",
      doneStatus: "OCR completed, text copied",
      tip: "Recognized text will be copied automatically"
    },
    statusByChannel: {
      "inline-capture-copy": "Copying...",
      "inline-capture-pin": "Pinning...",
      "inline-capture-scroll": "Capturing scroll...",
      "inline-capture-complete": "Saving..."
    },
    processing: "Processing...",
    captureError: "Capture failed. Press Esc and try again.",
    titles: {
      select: "Select/Move V",
      rect: "Rectangle R",
      ellipse: "Ellipse O",
      line: "Line L",
      arrow: "Arrow A",
      brush: "Brush B",
      text: "Text T",
      mosaic: "Mosaic M",
      blur: "Blur U",
      eraser: "Eraser E",
      scrollCapture: "Scrolling Capture Ctrl+Shift+F1",
      color: "Custom color",
      strokeSize: "Stroke width",
      duplicateObject: "Duplicate Object Ctrl+D",
      bringForward: "Bring Forward Ctrl+]",
      sendBackward: "Send Backward Ctrl+[",
      alignMenu: "Align selected objects",
      undo: "Undo Ctrl+Z",
      ocrCapture: "OCR and Copy Ctrl+Shift+O",
      copy: "Copy Ctrl+C",
      pin: "Pin F3",
      save: "Save Ctrl+S",
      cancel: "Cancel Esc",
      ok: "Done Enter",
      fontSize: "Font size",
      boldText: "Bold text",
      textBg: "Text background",
      textStroke: "Text outline",
      privacyStrength: "Mosaic/blur strength"
    },
    swatches: {
      "#ef4444": "Red",
      "#2563eb": "Blue",
      "#16a34a": "Green",
      "#f59e0b": "Amber",
      "#111827": "Black",
      "#ffffff": "White"
    }
  }
};
const ui = editorMessages[overlayLanguage];
const pixelRatio = Number(params.get("scaleFactor")) || window.devicePixelRatio || 1;
const selectionChannel = params.get("selectionChannel") || "inline-region-selected";
const selectionHint = params.get("selectionHint") || ui.selectionHint;
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
let hoverSelection = null;
let canvasRect = null;
let captureRegion = null;
let startPoint = null;
let selecting = false;
let pendingAutoSelection = null;
let pendingAutoStart = null;
let drawingObject = null;
let movingCrop = false;
let movingObject = false;
let resizeState = null;
let moveOrigin = null;
let activeTextEditor = null;
let selectedObjectId = null;
let selectedObjectIds = [];
let serial = 0;
let objects = [];
let backgroundImage = null;
let backgroundMode = "selection";
let baseImageDataUrl = null;
let ocrDialogOpen = false;
let ocrInFlight = false;
let textBold = false;
let textBackground = false;
let textOutline = false;
let windowProbeSeq = 0;
let lastWindowProbeAt = 0;
let windowProbeInFlight = false;
const history = [];

function applyEditorLanguage() {
  document.documentElement.lang = overlayLanguage;
  document.title = ui.documentTitle;
  toolbar.setAttribute("aria-label", ui.toolbarLabel);
  helpEl.textContent = ui.help;
  document.getElementById("ocrTitle").textContent = ui.ocr.title;
  ocrMeta.textContent = ui.ocr.ready;
  ocrText.placeholder = ui.ocr.empty;
  ocrTip.textContent = ui.ocr.tip;
  ocrCopyButton.textContent = ui.ocr.copyButton;
  ocrCloseButton.title = ui.ocr.close;
  Object.entries(ui.titles).forEach(([idOrTool, title]) => {
    const target = document.getElementById(idOrTool) || document.querySelector(`[data-tool="${idOrTool}"]`);
    if (target) target.title = title;
  });
  document.querySelector(".privacy-tools .compact-control span").textContent = overlayLanguage === "en-US" ? "Strength" : "强度";
  swatchButtons.forEach((button) => {
    const color = button.dataset.color?.toLowerCase();
    if (color && ui.swatches[color]) button.title = ui.swatches[color];
  });
}

function nextId() {
  serial += 1;
  return `obj-${serial}`;
}

function setStatus(message) {
  statusEl.textContent = message;
}

function sendSelectedRegion(rect) {
  ipcRenderer.send(selectionChannel, screenSelectionToCaptureRegion(rect));
}

function setTool(nextTool) {
  commitTextEditor();
  tool = nextTool;
  document.body.style.cursor = nextTool === "select" ? "default" : "crosshair";
  toolButtons.forEach((button) => button.classList.toggle("active", button.dataset.tool === nextTool));
  syncToolbarContext();
  renderObjectBox();
}

function syncActiveSwatch() {
  const activeColor = colorInput.value.toLowerCase();
  swatchButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.color.toLowerCase() === activeColor);
  });
}

function syncToolbarContext() {
  const items = selectedObjects();
  const hasSelected = items.length > 0;
  const activeContext = activeToolbarContext(items);

  contextualGroups.forEach((group) => {
    group.classList.toggle("is-hidden", group.dataset.context !== activeContext);
  });
  objectActionControls.forEach((control) => {
    if (control) control.disabled = !hasSelected;
  });
  positionContextPanel(activeContext, items);
}

function activeToolbarContext(items = selectedObjects()) {
  const textContext = tool === "text" || items.some((object) => object.type === "text");
  const privacyContext = tool === "mosaic" || tool === "blur" || items.some((object) => object.type === "mosaic" || object.type === "blur");
  return privacyContext ? "privacy" : textContext ? "text" : "";
}

function contextAnchorTool(activeContext, items) {
  if (activeContext === "text") return "text";
  if (activeContext !== "privacy") return "";
  if (tool === "mosaic" || tool === "blur") return tool;
  const privacyObject = items.find((object) => object.type === "mosaic" || object.type === "blur");
  return privacyObject?.type || "mosaic";
}

function positionContextPanel(activeContext, items = selectedObjects()) {
  if (!activeContext || toolbar.style.display === "none") return;
  const anchorTool = contextAnchorTool(activeContext, items);
  const anchor = anchorTool ? toolbar.querySelector(`[data-tool="${anchorTool}"]`) : null;
  const panel = contextualGroups.find((group) => group.dataset.context === activeContext);
  if (!anchor || !panel) return;
  const anchorRect = anchor.getBoundingClientRect();
  const panelWidth = panel.offsetWidth || panel.scrollWidth || 160;
  const anchorCenter = anchorRect.left + anchorRect.width / 2;
  const minLeft = 12;
  const maxLeft = Math.max(minLeft, window.innerWidth - panelWidth - 12);
  const panelLeft = Math.max(minLeft, Math.min(maxLeft, anchorCenter - panelWidth / 2));
  const panelTop = anchorRect.bottom + 14;
  const arrowLeft = Math.max(12, Math.min(panelWidth - 12, anchorCenter - panelLeft));
  panel.style.setProperty("--context-left", `${Math.round(panelLeft)}px`);
  panel.style.setProperty("--context-top", `${Math.round(panelTop)}px`);
  panel.style.setProperty("--context-arrow-left", `${Math.round(arrowLeft)}px`);
}

function cloneObjects(items = objects) {
  return JSON.parse(JSON.stringify(items));
}

function pushHistory() {
  history.push({
    objects: cloneObjects(objects),
    selectedObjectId,
    selectedObjectIds: [...selectedObjectIds]
  });
  if (history.length > 80) history.shift();
}

function restore(state) {
  objects = cloneObjects(state.objects);
  selectedObjectId = state.selectedObjectId;
  selectedObjectIds = state.selectedObjectIds || (state.selectedObjectId ? [state.selectedObjectId] : []);
  renderObjects();
  renderObjectBox();
}

function selectedObject() {
  return objects.find((object) => object.id === selectedObjectId) || null;
}

function selectedObjects() {
  return selectedObjectIds.map((id) => objects.find((object) => object.id === id)).filter(Boolean);
}

function setSelectedObjects(ids) {
  selectedObjectIds = [...new Set(ids)].filter((id) => objects.some((object) => object.id === id));
  selectedObjectId = selectedObjectIds[selectedObjectIds.length - 1] || null;
}

function selectObject(objectId, additive = false) {
  if (!additive) {
    setSelectedObjects([objectId]);
    return;
  }
  if (selectedObjectIds.includes(objectId)) {
    setSelectedObjects(selectedObjectIds.filter((id) => id !== objectId));
    return;
  }
  setSelectedObjects([...selectedObjectIds, objectId]);
}

function clearSelection() {
  selectedObjectId = null;
  selectedObjectIds = [];
}

function groupBounds(items = selectedObjects()) {
  if (!items.length) return null;
  const bounds = items.map(objectBounds);
  const left = Math.min(...bounds.map((item) => item.x));
  const top = Math.min(...bounds.map((item) => item.y));
  const right = Math.max(...bounds.map((item) => item.x + item.width));
  const bottom = Math.max(...bounds.map((item) => item.y + item.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
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
  const previewSelection = selection || hoverSelection;
  if (!previewSelection || previewSelection.width < 2 || previewSelection.height < 2) {
    selectionEl.style.display = "none";
    toolbar.style.display = "none";
    helpEl.style.display = "none";
    return;
  }
  selectionEl.style.display = "block";
  selectionEl.style.left = `${previewSelection.x}px`;
  selectionEl.style.top = `${previewSelection.y}px`;
  selectionEl.style.width = `${previewSelection.width}px`;
  selectionEl.style.height = `${previewSelection.height}px`;
  selectionEl.classList.toggle("is-editing", phase === "editing");
  selectionEl.classList.toggle("is-hover", !selection && Boolean(hoverSelection));

  toolbar.style.display = phase === "editing" && Boolean(selection) ? "flex" : "none";
  if (phase !== "editing") return;

  syncToolbarContext();
  positionToolbarNearSelection();
}

function setHoverSelection(rect) {
  hoverSelection = rect ? clampRect(rect, viewportBounds(), minSelectionSize) : null;
  if (phase === "selecting" && !selecting && !pendingAutoSelection) {
    renderSelection();
  }
}

function probeWindowSelectionAt(clientX, clientY, options = {}) {
  if (phase !== "selecting" || selecting || pendingAutoSelection || windowProbeInFlight) return;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
  if (clientX < 0 || clientY < 0 || clientX > window.innerWidth || clientY > window.innerHeight) {
    setHoverSelection(null);
    return;
  }
  const now = performance.now();
  if (!options.force && now - lastWindowProbeAt < 120) return;
  lastWindowProbeAt = now;
  const seq = ++windowProbeSeq;
  windowProbeInFlight = true;
  ipcRenderer
    .invoke("overlay:window-at-point", {
      x: clientX + overlayOffset.x,
      y: clientY + overlayOffset.y
    })
    .then((rect) => {
      if (seq !== windowProbeSeq || phase !== "selecting" || selecting || pendingAutoSelection) return;
      setHoverSelection(rect && rect.width >= minSelectionSize && rect.height >= minSelectionSize ? rect : null);
    })
    .catch(() => {
      if (seq === windowProbeSeq) setHoverSelection(null);
    })
    .finally(() => {
      if (seq === windowProbeSeq) windowProbeInFlight = false;
    });
}

function probeWindowSelection(event, options = {}) {
  if (event.buttons && !options.force) return;
  probeWindowSelectionAt(event.clientX, event.clientY, options);
}

function positionToolbarNearSelection() {
  if (!selection || toolbar.style.display === "none") return;
  const toolbarWidth = toolbar.offsetWidth || toolbar.scrollWidth;
  const openContext = contextualGroups.find((group) => !group.classList.contains("is-hidden"));
  const contextHeight = openContext ? openContext.offsetHeight + 14 : 0;
  const toolbarHeight = (toolbar.offsetHeight || toolbar.scrollHeight || 48) + contextHeight;
  const selectionCenterX = selection.x + selection.width / 2;
  let left = selectionCenterX - toolbarWidth / 2;
  let top = selection.y + selection.height + 10;
  if (top + toolbarHeight > window.innerHeight - 12) top = selection.y - toolbarHeight - 10;
  if (left + toolbarWidth > window.innerWidth - 12) left = window.innerWidth - toolbarWidth - 12;
  toolbar.style.left = `${Math.max(12, left)}px`;
  toolbar.style.top = `${Math.max(12, top)}px`;
  positionContextPanel(activeToolbarContext());
  positionHelpNearToolbar();
}

function positionHelpNearToolbar() {
  if (helpEl.style.display === "none" || toolbar.style.display === "none") {
    return;
  }
  const toolbarRect = toolbar.getBoundingClientRect();
  const openContext = contextualGroups.find((group) => !group.classList.contains("is-hidden"));
  const contextRect = openContext ? openContext.getBoundingClientRect() : null;
  helpEl.style.maxWidth = `${Math.max(280, Math.round(toolbarRect.width))}px`;
  helpEl.style.left = `${Math.round(toolbarRect.left)}px`;
  let top = Math.max(toolbarRect.bottom, contextRect?.bottom || 0) + 8;
  if (top + helpEl.offsetHeight > window.innerHeight - 12) {
    top = Math.min(toolbarRect.top, contextRect?.top || toolbarRect.top) - helpEl.offsetHeight - 8;
  }
  helpEl.style.top = `${Math.max(12, Math.round(top))}px`;
}

function renderObjectBox() {
  const items = selectedObjects();
  syncToolbarContext();
  positionToolbarNearSelection();
  if (!items.length || phase !== "editing" || !canvasRect) {
    objectBox.style.display = "none";
    return;
  }
  const bounds = objectToScreenBounds(groupBounds(items));
  objectBox.style.display = "block";
  objectBox.style.left = `${bounds.x}px`;
  objectBox.style.top = `${bounds.y}px`;
  objectBox.style.width = `${Math.max(1, bounds.width)}px`;
  objectBox.style.height = `${Math.max(1, bounds.height)}px`;
  objectBox.classList.toggle("is-group", items.length > 1);
  if (items.length === 1 && items[0].type === "text") {
    const object = items[0];
    textBold = Boolean(object.bold);
    textBackground = Boolean(object.background);
    textOutline = Boolean(object.outline);
    fontSizeInput.value = String(object.fontSize || 24);
    syncTextButtons();
  }
  if (items.length === 1 && (items[0].type === "mosaic" || items[0].type === "blur")) {
    privacyStrengthInput.value = String(items[0].strength || 5);
  }
}

function configureCanvas(rect) {
  activeScaleFactor = rect.scaleFactor || pixelRatio;
  canvasRect = rect;
  captureRegion = rect.captureRegion || screenSelectionToCaptureRegion(rect);
  canvas.width = Math.max(1, Math.round(rect.pixelWidth || rect.width * activeScaleFactor));
  canvas.height = Math.max(1, Math.round(rect.pixelHeight || rect.height * activeScaleFactor));
  canvas.style.display = "block";
  canvas.style.left = `${rect.x}px`;
  canvas.style.top = `${rect.y}px`;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  backgroundImage = null;
  backgroundMode = rect.backgroundMode || "selection";
  baseImageDataUrl = rect.baseDataUrl || (backgroundMode === "image" ? rect.backgroundDataUrl : null);
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
  hoverSelection = null;
  pendingAutoSelection = null;
  pendingAutoStart = null;
  shade.style.display = "none";
  helpEl.style.display = "block";
  setStatus(ui.editableStatus);
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
    const strength = object.strength || Number(privacyStrengthInput.value) || 5;
    const block = Math.max(8, 6 + strength * 4);
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
    const strength = object.strength || Number(privacyStrengthInput.value) || 5;
    targetCtx.filter = `blur(${Math.max(8, 6 + strength * 4)}px)`;
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

function wrappedTextLines(targetCtx, object) {
  const maxWidth = Math.max(24, object.width || canvas.width);
  const lines = [];
  String(object.text || "")
    .split("\n")
    .forEach((rawLine) => {
      let current = "";
      [...rawLine].forEach((char) => {
        const next = current + char;
        if (current && targetCtx.measureText(next).width > maxWidth) {
          lines.push(current);
          current = char;
        } else {
          current = next;
        }
      });
      lines.push(current || "");
    });
  return lines;
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
    targetCtx.font = `${object.bold ? 800 : 500} ${object.fontSize}px Microsoft YaHei, Segoe UI`;
    targetCtx.fillStyle = object.color;
    const lines = wrappedTextLines(targetCtx, object);
    const boxHeight = Math.max(object.lineHeight, lines.length * object.lineHeight);
    if (object.background) {
      targetCtx.save();
      targetCtx.fillStyle = "rgba(255,255,255,.78)";
      targetCtx.strokeStyle = "rgba(15,23,42,.12)";
      targetCtx.lineWidth = 1;
      targetCtx.beginPath();
      targetCtx.roundRect(object.x - 6, object.y - object.fontSize - 5, object.width + 12, boxHeight + 10, 6);
      targetCtx.fill();
      targetCtx.stroke();
      targetCtx.restore();
      targetCtx.fillStyle = object.color;
    }
    lines.forEach((line, index) => {
      const y = object.y + index * object.lineHeight;
      if (object.outline) {
        targetCtx.save();
        targetCtx.lineWidth = Math.max(3, object.fontSize * 0.12);
        targetCtx.strokeStyle = "rgba(255,255,255,.92)";
        targetCtx.strokeText(line, object.x, y);
        targetCtx.restore();
      }
      targetCtx.fillText(line, object.x, y);
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
    const object = { id: nextId(), type: toolName, ...normalizeRect(from, to), color, size };
    if (toolName === "mosaic" || toolName === "blur") {
      object.strength = Number(privacyStrengthInput.value) || 5;
    }
    return object;
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
  setSelectedObjects([object.id]);
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

function snapDelta(bounds) {
  const threshold = 8;
  const canvasBounds = canvasPixelBounds();
  const candidates = [
    { x: 0, target: bounds.x },
    { x: canvasBounds.width, target: bounds.x + bounds.width },
    { x: canvasBounds.width / 2, target: bounds.x + bounds.width / 2 },
    { y: 0, target: bounds.y },
    { y: canvasBounds.height, target: bounds.y + bounds.height },
    { y: canvasBounds.height / 2, target: bounds.y + bounds.height / 2 }
  ];
  let dx = 0;
  let dy = 0;
  candidates.forEach((candidate) => {
    if ("x" in candidate && Math.abs(candidate.x - candidate.target) <= threshold) dx = candidate.x - candidate.target;
    if ("y" in candidate && Math.abs(candidate.y - candidate.target) <= threshold) dy = candidate.y - candidate.target;
  });
  return { dx, dy };
}

function translateSelectedObjects(originObjects, dx, dy, useSnap = true) {
  const movedObjects = originObjects.map((object) => translateObject(object, dx, dy));
  const movedBounds = groupBounds(movedObjects);
  if (!movedBounds) return;
  const clampedBounds = clampRect(movedBounds, canvasPixelBounds(), 1);
  let adjustX = clampedBounds.x - movedBounds.x;
  let adjustY = clampedBounds.y - movedBounds.y;
  if (useSnap) {
    const snap = snapDelta({ ...movedBounds, x: movedBounds.x + adjustX, y: movedBounds.y + adjustY });
    adjustX += snap.dx;
    adjustY += snap.dy;
  }
  const nextById = new Map(movedObjects.map((object) => [object.id, translateObject(object, adjustX, adjustY)]));
  objects = objects.map((object) => nextById.get(object.id) || object);
  renderObjects();
  renderObjectBox();
}

function duplicateSelectedObjects() {
  const items = selectedObjects();
  if (!items.length) return;
  const clones = items.map((object) => ({ ...cloneObjects([object])[0], id: nextId() }));
  const movedClones = clones.map((object) => translateObject(object, 18, 18));
  objects.push(...movedClones);
  setSelectedObjects(movedClones.map((object) => object.id));
  renderObjects();
  renderObjectBox();
  pushHistory();
}

function moveSelectedLayer(direction, toEdge = false) {
  if (!selectedObjectIds.length) return;
  const selected = new Set(selectedObjectIds);
  const remaining = objects.filter((object) => !selected.has(object.id));
  const picked = objects.filter((object) => selected.has(object.id));
  if (toEdge) {
    objects = direction > 0 ? [...remaining, ...picked] : [...picked, ...remaining];
  } else if (direction > 0) {
    objects = [...objects];
    for (let index = objects.length - 2; index >= 0; index -= 1) {
      if (selected.has(objects[index].id) && !selected.has(objects[index + 1].id)) {
        [objects[index], objects[index + 1]] = [objects[index + 1], objects[index]];
      }
    }
  } else {
    objects = [...objects];
    for (let index = 1; index < objects.length; index += 1) {
      if (selected.has(objects[index].id) && !selected.has(objects[index - 1].id)) {
        [objects[index], objects[index - 1]] = [objects[index - 1], objects[index]];
      }
    }
  }
  renderObjects();
  renderObjectBox();
  pushHistory();
}

function alignSelectedObjects(mode) {
  const items = selectedObjects();
  if (!items.length || !mode) return;
  const target = canvasPixelBounds();
  const nextById = new Map();
  items.forEach((object) => {
    const bounds = objectBounds(object);
    let dx = 0;
    let dy = 0;
    if (mode === "left") dx = target.x - bounds.x;
    if (mode === "center") dx = target.x + target.width / 2 - (bounds.x + bounds.width / 2);
    if (mode === "right") dx = target.x + target.width - (bounds.x + bounds.width);
    if (mode === "top") dy = target.y - bounds.y;
    if (mode === "middle") dy = target.y + target.height / 2 - (bounds.y + bounds.height / 2);
    if (mode === "bottom") dy = target.y + target.height - (bounds.y + bounds.height);
    nextById.set(object.id, translateObject(object, dx, dy));
  });
  objects = objects.map((object) => nextById.get(object.id) || object);
  alignMenu.value = "";
  renderObjects();
  renderObjectBox();
  pushHistory();
}

function syncTextButtons() {
  boldTextButton.classList.toggle("active", textBold);
  textBgButton.classList.toggle("active", textBackground);
  textStrokeButton.classList.toggle("active", textOutline);
}

function applyTextStyleToSelected(commit = false) {
  const selectedTextIds = selectedObjects().filter((object) => object.type === "text").map((object) => object.id);
  if (!selectedTextIds.length) return;
  const ids = new Set(selectedTextIds);
  const fontSize = Number(fontSizeInput.value) || 24;
  objects = objects.map((object) => {
    if (!ids.has(object.id)) return object;
    const lineHeight = Math.max(24, fontSize * 1.25);
    return {
      ...object,
      fontSize,
      lineHeight,
      bold: textBold,
      background: textBackground,
      outline: textOutline
    };
  });
  renderObjects();
  renderObjectBox();
  if (commit) pushHistory();
}

function beginTextEditor(point, existingObject = null) {
  commitTextEditor();
  const rect = canvas.getBoundingClientRect();
  const editor = document.createElement("textarea");
  editor.className = "text-editor";
  editor.placeholder = ui.textPlaceholder;
  editor.spellcheck = false;
  editor.value = existingObject?.text || "";
  const fontSize = existingObject?.fontSize || Number(fontSizeInput.value) || Math.max(18, Number(strokeSize.value) * 5);
  if (existingObject) {
    textBold = Boolean(existingObject.bold);
    textBackground = Boolean(existingObject.background);
    textOutline = Boolean(existingObject.outline);
    fontSizeInput.value = String(existingObject.fontSize || fontSize);
    syncTextButtons();
  }
  editor.style.left = `${rect.left + point.x / (canvas.width / rect.width)}px`;
  editor.style.top = `${rect.top + (point.y - fontSize) / (canvas.height / rect.height)}px`;
  editor.style.color = existingObject?.color || colorInput.value;
  editor.style.font = `${textBold ? 800 : 500} ${fontSize}px Microsoft YaHei, Segoe UI`;
  editor.style.lineHeight = "1.25";
  editor.style.width = existingObject?.width ? `${Math.max(160, existingObject.width / (canvas.width / rect.width))}px` : "220px";
  document.body.appendChild(editor);
  activeTextEditor = { element: editor, point, objectId: existingObject?.id || null, fontSize };
  const resizeTextEditor = () => {
    editor.style.height = "auto";
    editor.style.height = `${Math.max(fontSize * 1.35, editor.scrollHeight)}px`;
  };
  editor.addEventListener("input", resizeTextEditor);
  requestAnimationFrame(() => {
    resizeTextEditor();
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
    lineHeight,
    bold: textBold,
    background: textBackground,
    outline: textOutline
  };
  if (objectId) {
    setSelectedObjects([objectId]);
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

function ocrDataUrl() {
  if (!backgroundImage) return null;
  const output = document.createElement("canvas");
  output.width = canvas.width;
  output.height = canvas.height;
  const outputCtx = output.getContext("2d");
  drawBackgroundPreview(outputCtx);
  objects
    .filter((object) => object.type === "mosaic" || object.type === "blur")
    .forEach((object) => drawPrivacyObject(outputCtx, object, { includeOutline: false }));
  return output.toDataURL("image/png");
}

function mosaicPayload() {
  return objects
    .filter((object) => object.type === "mosaic")
    .map((object) => ({ x: object.x, y: object.y, width: object.width, height: object.height, strength: object.strength || 5 }));
}

function blurPayload() {
  return objects
    .filter((object) => object.type === "blur")
    .map((object) => ({ x: object.x, y: object.y, width: object.width, height: object.height, strength: object.strength || 5 }));
}

function capturePayload(options = {}) {
  const payload = {
    region: captureRegion,
    annotationDataUrl: annotationDataUrl(),
    baseDataUrl: baseImageDataUrl,
    privacyDataUrl: privacyDataUrl(),
    mosaicRegions: mosaicPayload(),
    blurRegions: blurPayload()
  };
  if (options.includeOcrImage) {
    payload.ocrDataUrl = ocrDataUrl();
  }
  return payload;
}

function openOcrDialog(result) {
  ocrDialogOpen = true;
  ocrDialog.classList.add("is-open");
  ocrText.value = result.text || "";
  ocrText.placeholder = result.ok ? ui.ocr.empty : ui.ocr.failed;
  const countText = result.ok ? ui.ocr.lines(result.lines?.length || 0) : ui.ocr.failed;
  ocrMeta.textContent = `${countText} · ${Math.max(0, Math.round(result.elapsedMs || 0))} ms`;
  ocrTip.textContent = result.ok
    ? result.text
      ? ui.ocr.copied
      : ui.ocr.noText
    : result.error || ui.ocr.failed;
  requestAnimationFrame(() => {
    ocrText.focus();
    ocrText.select();
  });
}

function closeOcrDialog() {
  ocrDialogOpen = false;
  ocrDialog.classList.remove("is-open");
}

function requestOcr() {
  commitTextEditor();
  if (!captureRegion) return;
  if (ocrInFlight) return;
  ocrInFlight = true;
  ocrCaptureButton.disabled = true;
  document.body.style.cursor = "progress";
  setStatus(ui.ocr.running);
  ipcRenderer.send("inline-capture-ocr", capturePayload({ includeOcrImage: true }));
}

function complete(channel) {
  commitTextEditor();
  if (!captureRegion) return;
  document.body.style.cursor = "wait";
  setStatus(ui.statusByChannel[channel] || ui.processing);
  ipcRenderer.send(channel, capturePayload());
}

toolButtons.forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool)));
document.querySelectorAll(".swatch").forEach((button) => {
  button.addEventListener("click", () => {
    colorInput.value = button.dataset.color;
    syncActiveSwatch();
  });
});
colorInput.addEventListener("input", syncActiveSwatch);
boldTextButton.addEventListener("click", () => {
  textBold = !textBold;
  syncTextButtons();
  applyTextStyleToSelected(true);
});
textBgButton.addEventListener("click", () => {
  textBackground = !textBackground;
  syncTextButtons();
  applyTextStyleToSelected(true);
});
textStrokeButton.addEventListener("click", () => {
  textOutline = !textOutline;
  syncTextButtons();
  applyTextStyleToSelected(true);
});
fontSizeInput.addEventListener("change", () => applyTextStyleToSelected(true));
privacyStrengthInput.addEventListener("input", () => {
  const strength = Number(privacyStrengthInput.value) || 5;
  const selectedPrivacyObjects = selectedObjects().filter((object) => object.type === "mosaic" || object.type === "blur");
  if (!selectedPrivacyObjects.length) return;
  const ids = new Set(selectedPrivacyObjects.map((object) => object.id));
  objects = objects.map((object) => (ids.has(object.id) ? { ...object, strength } : object));
  renderObjects();
});
privacyStrengthInput.addEventListener("change", () => {
  if (selectedObjects().some((object) => object.type === "mosaic" || object.type === "blur")) pushHistory();
});
document.getElementById("duplicateObject").addEventListener("click", duplicateSelectedObjects);
document.getElementById("bringForward").addEventListener("click", () => moveSelectedLayer(1));
document.getElementById("sendBackward").addEventListener("click", () => moveSelectedLayer(-1));
alignMenu.addEventListener("change", () => alignSelectedObjects(alignMenu.value));
syncTextButtons();

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
    if (!object || selectedObjects().length !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    resizeState = { mode: "object", handle: handle.dataset.handle, origin: objectBounds(object), object: cloneObjects([object])[0] };
  });
});

objectBox.addEventListener("mousedown", (event) => {
  if (!selectedObjects().length || event.target.dataset.handle) return;
  event.preventDefault();
  movingObject = true;
  moveOrigin = { objects: cloneObjects(selectedObjects()), pointer: eventPoint(event) };
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
      if (event.shiftKey) {
        selectObject(hit.id, true);
      } else if (!selectedObjectIds.includes(hit.id)) {
        setSelectedObjects([hit.id]);
      }
      renderObjectBox();
      if (!selectedObjectIds.length) return;
      movingObject = true;
      moveOrigin = { objects: cloneObjects(selectedObjects()), pointer: point };
      return;
    }
    clearSelection();
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
    setSelectedObjects([hit.id]);
    renderObjectBox();
    beginTextEditor({ x: hit.x, y: hit.y }, hit);
  }
});

window.addEventListener("mousedown", (event) => {
  if (phase !== "selecting" || event.button !== 0 || toolbar.contains(event.target)) return;
  if (hoverSelection) {
    pendingAutoSelection = { ...hoverSelection };
    pendingAutoStart = { x: event.clientX, y: event.clientY };
    hoverSelection = null;
    selection = { ...pendingAutoSelection };
    renderSelection();
    return;
  }
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
    translateSelectedObjects(moveOrigin.objects, current.x - moveOrigin.pointer.x, current.y - moveOrigin.pointer.y);
    return;
  }
  if (pendingAutoSelection && pendingAutoStart) {
    const dragDistance = Math.hypot(event.clientX - pendingAutoStart.x, event.clientY - pendingAutoStart.y);
    if (dragDistance < 5) return;
    selecting = true;
    startPoint = { ...pendingAutoStart };
    pendingAutoSelection = null;
    pendingAutoStart = null;
    selection = normalizeRect(startPoint, { x: event.clientX, y: event.clientY });
    renderSelection();
    return;
  }
  if (selecting && startPoint) {
    selection = normalizeRect(startPoint, { x: event.clientX, y: event.clientY });
    renderSelection();
    return;
  }
  if (!drawingObject || !startPoint) {
    probeWindowSelection(event);
    return;
  }
  const current = eventPoint(event);
  if (drawingObject.type === "brush" || drawingObject.type === "eraser") {
    drawingObject.points.push(current);
  } else {
    drawingObject = buildObject(tool, startPoint, current);
  }
  renderObjects();
  drawObject(ctx, drawingObject);
});

window.addEventListener("mouseenter", (event) => {
  probeWindowSelection(event, { force: true });
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
  if (pendingAutoSelection) {
    selection = clampRect(pendingAutoSelection, viewportBounds(), minSelectionSize);
    pendingAutoSelection = null;
    pendingAutoStart = null;
    sendSelectedRegion(selection);
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
    sendSelectedRegion(selection);
    return;
  }
  if (drawingObject) {
    if (objectBounds(drawingObject).width >= 2 || objectBounds(drawingObject).height >= 2) {
      objects.push(drawingObject);
      setSelectedObjects([drawingObject.id]);
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
ocrCaptureButton.addEventListener("click", requestOcr);
document.getElementById("copy").addEventListener("click", () => complete("inline-capture-copy"));
document.getElementById("pin").addEventListener("click", () => complete("inline-capture-pin"));
scrollCaptureButton.addEventListener("click", () => complete("inline-capture-scroll"));
document.getElementById("save").addEventListener("click", () => complete("inline-capture-complete"));
document.getElementById("ok").addEventListener("click", () => complete("inline-capture-complete"));
document.getElementById("cancel").addEventListener("click", () => ipcRenderer.send("inline-capture-cancel"));
ocrCloseButton.addEventListener("click", closeOcrDialog);
ocrCopyButton.addEventListener("click", () => {
  if (!ocrText.value.trim()) return;
  clipboard.writeText(ocrText.value);
  ocrTip.textContent = ui.ocr.copyAgain;
  setStatus(ui.ocr.copiedStatus);
});
ocrDialog.addEventListener("mousedown", (event) => {
  if (event.target === ocrDialog) closeOcrDialog();
});

window.addEventListener("keydown", (event) => {
  if (ocrDialogOpen) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeOcrDialog();
    }
    return;
  }
  if (activeTextEditor) return;
  if (event.key === "Escape") ipcRenderer.send("inline-capture-cancel");
  const toolFromKey = toolHotkeys[event.key.toLowerCase()];
  if (toolFromKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    setTool(toolFromKey);
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    if (selectedObjectIds.length) {
      const selected = new Set(selectedObjectIds);
      objects = objects.filter((object) => !selected.has(object.id));
      clearSelection();
      renderObjects();
      renderObjectBox();
      pushHistory();
    }
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
    event.preventDefault();
    setSelectedObjects(objects.map((object) => object.id));
    renderObjectBox();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
    event.preventDefault();
    duplicateSelectedObjects();
  }
  if ((event.ctrlKey || event.metaKey) && event.key === "]") {
    event.preventDefault();
    moveSelectedLayer(1, event.shiftKey);
  }
  if ((event.ctrlKey || event.metaKey) && event.key === "[") {
    event.preventDefault();
    moveSelectedLayer(-1, event.shiftKey);
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
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "o") {
    event.preventDefault();
    requestOcr();
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === "F1") {
    event.preventDefault();
    complete("inline-capture-scroll");
  }
  if (event.key === "F3") {
    event.preventDefault();
    complete("inline-capture-pin");
  }
  if (event.key === "Enter") complete("inline-capture-complete");
});

ipcRenderer.on("inline-region-ready", (_event, rect) => enterEditMode(rect));
ipcRenderer.on("inline-capture-error", () => {
  setStatus(ui.captureError);
  document.body.style.cursor = "default";
});
ipcRenderer.on("inline-ocr-result", (_event, result) => {
  ocrInFlight = false;
  ocrCaptureButton.disabled = false;
  document.body.style.cursor = tool === "select" ? "default" : "crosshair";
  setStatus(result.ok ? ui.ocr.doneStatus : ui.ocr.failed);
  openOcrDialog(result);
});
ipcRenderer.on("overlay:cursor-point", (_event, point) => {
  if (phase !== "selecting") return;
  const clientX = point.x - overlayOffset.x;
  const clientY = point.y - overlayOffset.y;
  requestAnimationFrame(() => probeWindowSelectionAt(clientX, clientY, { force: true }));
});

applyEditorLanguage();
setStatus(selectionHint);
setTool("rect");
requestAnimationFrame(() => ipcRenderer.send("overlay:ready"));
