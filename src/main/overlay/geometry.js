function normalizeRect(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y)
  };
}

function clampRect(rect, bounds, minSize = 24) {
  const width = Math.max(minSize, Math.min(rect.width, bounds.width));
  const height = Math.max(minSize, Math.min(rect.height, bounds.height));
  return {
    x: Math.max(bounds.x, Math.min(rect.x, bounds.x + bounds.width - width)),
    y: Math.max(bounds.y, Math.min(rect.y, bounds.y + bounds.height - height)),
    width,
    height
  };
}

function rectFromHandle(handle, origin, current, bounds, minSize = 24) {
  const boundedCurrent = {
    x: Math.max(bounds.x, Math.min(current.x, bounds.x + bounds.width)),
    y: Math.max(bounds.y, Math.min(current.y, bounds.y + bounds.height))
  };
  let left = origin.x;
  let top = origin.y;
  let right = origin.x + origin.width;
  let bottom = origin.y + origin.height;

  if (handle.includes("w")) left = boundedCurrent.x;
  if (handle.includes("e")) right = boundedCurrent.x;
  if (handle.includes("n")) top = boundedCurrent.y;
  if (handle.includes("s")) bottom = boundedCurrent.y;

  if (right - left < minSize) {
    handle.includes("w") ? (left = right - minSize) : (right = left + minSize);
  }
  if (bottom - top < minSize) {
    handle.includes("n") ? (top = bottom - minSize) : (bottom = top + minSize);
  }

  return clampRect({ x: left, y: top, width: right - left, height: bottom - top }, bounds, minSize);
}

function screenToPixel(rect, scaleFactor, offset = { x: 0, y: 0 }) {
  return {
    x: (rect.x + offset.x) * scaleFactor,
    y: (rect.y + offset.y) * scaleFactor,
    width: rect.width * scaleFactor,
    height: rect.height * scaleFactor
  };
}

function pixelToScreen(rect, scaleFactor, offset = { x: 0, y: 0 }) {
  return {
    x: rect.x / scaleFactor - offset.x,
    y: rect.y / scaleFactor - offset.y,
    width: rect.width / scaleFactor,
    height: rect.height / scaleFactor
  };
}

function scaleRect(rect, scaleX, scaleY) {
  return {
    x: rect.x * scaleX,
    y: rect.y * scaleY,
    width: rect.width * scaleX,
    height: rect.height * scaleY
  };
}

function rectBounds(rect) {
  return {
    x: Math.min(rect.x, rect.x + rect.width),
    y: Math.min(rect.y, rect.y + rect.height),
    width: Math.abs(rect.width),
    height: Math.abs(rect.height)
  };
}

function pointInRect(point, rect, padding = 0) {
  return (
    point.x >= rect.x - padding &&
    point.x <= rect.x + rect.width + padding &&
    point.y >= rect.y - padding &&
    point.y <= rect.y + rect.height + padding
  );
}

function objectBounds(object) {
  if (object.type === "line" || object.type === "arrow") {
    return normalizeRect({ x: object.x1, y: object.y1 }, { x: object.x2, y: object.y2 });
  }
  if (object.type === "brush" || object.type === "eraser") {
    const xs = object.points.map((point) => point.x);
    const ys = object.points.map((point) => point.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys)
    };
  }
  if (object.type === "text") {
    return { x: object.x, y: object.y - object.fontSize, width: object.width, height: object.height };
  }
  return rectBounds(object);
}

function translateObject(object, dx, dy) {
  if (object.type === "line" || object.type === "arrow") {
    return { ...object, x1: object.x1 + dx, y1: object.y1 + dy, x2: object.x2 + dx, y2: object.y2 + dy };
  }
  if (object.type === "brush" || object.type === "eraser") {
    return { ...object, points: object.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) };
  }
  return { ...object, x: object.x + dx, y: object.y + dy };
}

function resizeObjectToBounds(object, nextBounds) {
  const current = objectBounds(object);
  const scaleX = current.width ? nextBounds.width / current.width : 1;
  const scaleY = current.height ? nextBounds.height / current.height : 1;
  const mapPoint = (point) => ({
    x: nextBounds.x + (point.x - current.x) * scaleX,
    y: nextBounds.y + (point.y - current.y) * scaleY
  });

  if (object.type === "line" || object.type === "arrow") {
    const start = mapPoint({ x: object.x1, y: object.y1 });
    const end = mapPoint({ x: object.x2, y: object.y2 });
    return { ...object, x1: start.x, y1: start.y, x2: end.x, y2: end.y };
  }
  if (object.type === "brush" || object.type === "eraser") {
    return { ...object, points: object.points.map(mapPoint) };
  }
  if (object.type === "text") {
    return {
      ...object,
      x: nextBounds.x,
      y: nextBounds.y + object.fontSize,
      width: nextBounds.width,
      height: nextBounds.height
    };
  }
  return { ...object, ...nextBounds };
}

module.exports = {
  clampRect,
  normalizeRect,
  objectBounds,
  pixelToScreen,
  pointInRect,
  rectFromHandle,
  scaleRect,
  screenToPixel,
  translateObject,
  resizeObjectToBounds
};
