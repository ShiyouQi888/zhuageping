const test = require("node:test");
const assert = require("node:assert/strict");
const {
  clampRect,
  normalizeRect,
  objectBounds,
  pixelToScreen,
  rectFromHandle,
  resizeObjectToBounds,
  screenToPixel,
  translateObject
} = require("./geometry");

test("normalizeRect handles reverse drags", () => {
  assert.deepEqual(normalizeRect({ x: 220, y: 140 }, { x: 80, y: 20 }), {
    x: 80,
    y: 20,
    width: 140,
    height: 120
  });
});

test("screenToPixel preserves negative monitor offsets for virtual desktop capture", () => {
  assert.deepEqual(screenToPixel({ x: 20, y: 10, width: 120, height: 80 }, 1.5, { x: -1920, y: 0 }), {
    x: -2850,
    y: 15,
    width: 180,
    height: 120
  });
});

test("pixelToScreen reverses high-DPI conversion", () => {
  assert.deepEqual(pixelToScreen({ x: -2850, y: 15, width: 180, height: 120 }, 1.5, { x: -1920, y: 0 }), {
    x: 20,
    y: 10,
    width: 120,
    height: 80
  });
});

test("rectFromHandle clamps resize inside viewport", () => {
  const rect = rectFromHandle(
    "se",
    { x: 100, y: 100, width: 300, height: 180 },
    { x: 900, y: 700 },
    { x: 0, y: 0, width: 800, height: 600 },
    24
  );
  assert.deepEqual(rect, { x: 100, y: 100, width: 700, height: 500 });
});

test("clampRect keeps small selections usable", () => {
  assert.deepEqual(clampRect({ x: -20, y: -10, width: 3, height: 5 }, { x: 0, y: 0, width: 400, height: 300 }, 24), {
    x: 0,
    y: 0,
    width: 24,
    height: 24
  });
});

test("object bounds, move, and resize work for arrows", () => {
  const arrow = { id: "a", type: "arrow", x1: 10, y1: 20, x2: 110, y2: 70, color: "#f00", size: 5 };
  assert.deepEqual(objectBounds(arrow), { x: 10, y: 20, width: 100, height: 50 });
  assert.deepEqual(objectBounds(translateObject(arrow, 5, -10)), { x: 15, y: 10, width: 100, height: 50 });
  assert.deepEqual(objectBounds(resizeObjectToBounds(arrow, { x: 0, y: 0, width: 200, height: 100 })), {
    x: 0,
    y: 0,
    width: 200,
    height: 100
  });
});

test("text object resize adjusts text box without stretching font metrics", () => {
  const text = {
    id: "t",
    type: "text",
    x: 10,
    y: 30,
    width: 120,
    height: 30,
    text: "hello",
    color: "#f00",
    size: 5,
    fontSize: 24,
    lineHeight: 30
  };
  const resized = resizeObjectToBounds(text, { x: 20, y: 40, width: 200, height: 50 });
  assert.equal(resized.x, 20);
  assert.equal(resized.width, 200);
  assert.equal(resized.fontSize, 24);
  assert.equal(resized.lineHeight, 30);
  assert.equal(resized.y, 64);
});
