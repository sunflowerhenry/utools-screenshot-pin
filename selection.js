const surface = document.getElementById("surface");
const screenImage = document.getElementById("screenImage");
const selection = document.getElementById("selection");
const guide = document.getElementById("guide");
const shade = document.getElementById("shade");
const sizeLabel = document.getElementById("sizeLabel");
const actions = document.getElementById("actions");
const confirmBtn = document.getElementById("confirmBtn");
const cancelBtn = document.getElementById("cancelBtn");

const state = {
  dataUrl: "",
  pixelWidth: 0,
  pixelHeight: 0,
  bounds: { x: 0, y: 0, width: 0, height: 0 },
  rect: null,
  mode: "",
  handle: "",
  start: null,
  startRect: null
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRect(rect) {
  const x = Math.min(rect.x, rect.x + rect.w);
  const y = Math.min(rect.y, rect.y + rect.h);
  return {
    x: clamp(x, 0, window.innerWidth),
    y: clamp(y, 0, window.innerHeight),
    w: clamp(Math.abs(rect.w), 0, window.innerWidth - x),
    h: clamp(Math.abs(rect.h), 0, window.innerHeight - y)
  };
}

function pixelSize(rect) {
  return {
    w: Math.max(1, Math.round(rect.w * state.pixelWidth / window.innerWidth)),
    h: Math.max(1, Math.round(rect.h * state.pixelHeight / window.innerHeight))
  };
}

function render() {
  if (!state.rect || state.rect.w < 1 || state.rect.h < 1) {
    selection.classList.add("hidden");
    guide.classList.remove("hidden");
    shade.classList.remove("clear");
    sizeLabel.classList.add("hidden");
    actions.classList.add("hidden");
    return;
  }

  const rect = state.rect;
  guide.classList.add("hidden");
  shade.classList.add("clear");
  selection.classList.remove("hidden");
  selection.style.left = `${rect.x}px`;
  selection.style.top = `${rect.y}px`;
  selection.style.width = `${rect.w}px`;
  selection.style.height = `${rect.h}px`;

  const px = pixelSize(rect);
  sizeLabel.classList.remove("hidden");
  sizeLabel.textContent = `${px.w} x ${px.h}`;
  sizeLabel.style.left = `${clamp(rect.x, 8, window.innerWidth - 100)}px`;
  sizeLabel.style.top = `${clamp(rect.y - 30, 8, window.innerHeight - 34)}px`;

  actions.classList.remove("hidden");
  actions.style.left = `${clamp(rect.x + rect.w - 122, 8, window.innerWidth - 132)}px`;
  actions.style.top = `${clamp(rect.y + rect.h + 8, 8, window.innerHeight - 44)}px`;
}

function pointFromEvent(event) {
  return {
    x: clamp(event.clientX, 0, window.innerWidth),
    y: clamp(event.clientY, 0, window.innerHeight)
  };
}

function hitSelection(point) {
  if (!state.rect) return false;
  const rect = state.rect;
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

function resizeRect(point) {
  const next = { ...state.startRect };
  const dx = point.x - state.start.x;
  const dy = point.y - state.start.y;

  if (state.handle.includes("e")) next.w = state.startRect.w + dx;
  if (state.handle.includes("s")) next.h = state.startRect.h + dy;
  if (state.handle.includes("w")) {
    next.x = state.startRect.x + dx;
    next.w = state.startRect.w - dx;
  }
  if (state.handle.includes("n")) {
    next.y = state.startRect.y + dy;
    next.h = state.startRect.h - dy;
  }
  state.rect = normalizeRect(next);
}

function moveRect(point) {
  const dx = point.x - state.start.x;
  const dy = point.y - state.start.y;
  const rect = state.startRect;
  state.rect = {
    x: clamp(rect.x + dx, 0, window.innerWidth - rect.w),
    y: clamp(rect.y + dy, 0, window.innerHeight - rect.h),
    w: rect.w,
    h: rect.h
  };
}

surface.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button")) return;
  const point = pointFromEvent(event);
  const handle = event.target.dataset.handle;
  state.start = point;
  state.startRect = state.rect ? { ...state.rect } : null;

  if (handle && state.rect) {
    state.mode = "resize";
    state.handle = handle;
  } else if (hitSelection(point)) {
    state.mode = "move";
  } else {
    state.mode = "draw";
    state.rect = { x: point.x, y: point.y, w: 1, h: 1 };
  }

  surface.setPointerCapture(event.pointerId);
  render();
});

actions.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});

surface.addEventListener("pointermove", (event) => {
  if (!state.mode) return;
  const point = pointFromEvent(event);

  if (state.mode === "draw") {
    state.rect = normalizeRect({
      x: state.start.x,
      y: state.start.y,
      w: point.x - state.start.x,
      h: point.y - state.start.y
    });
  }
  if (state.mode === "move") {
    moveRect(point);
  }
  if (state.mode === "resize") {
    resizeRect(point);
  }
  render();
});

surface.addEventListener("pointerup", (event) => {
  state.mode = "";
  state.handle = "";
  surface.releasePointerCapture(event.pointerId);
  render();
});

function cropSelection() {
  if (!state.rect || state.rect.w < 2 || state.rect.h < 2) return;

  const rect = state.rect;
  const scaleX = state.pixelWidth / window.innerWidth;
  const scaleY = state.pixelHeight / window.innerHeight;
  const sx = Math.round(rect.x * scaleX);
  const sy = Math.round(rect.y * scaleY);
  const sw = Math.max(1, Math.round(rect.w * scaleX));
  const sh = Math.max(1, Math.round(rect.h * scaleY));

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    window.selectionWindow.complete({
      dataUrl: canvas.toDataURL("image/png"),
      sourceDataUrl: state.dataUrl,
      screenBounds: state.bounds,
      cropRect: {
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h
      },
      sourcePixelWidth: state.pixelWidth,
      sourcePixelHeight: state.pixelHeight,
      displayWidth: Math.round(rect.w),
      displayHeight: Math.round(rect.h),
      pixelWidth: sw,
      pixelHeight: sh,
      windowX: Math.round((state.bounds.x || 0) + rect.x),
      windowY: Math.round((state.bounds.y || 0) + rect.y)
    });
  };
  img.src = state.dataUrl;
}

confirmBtn.addEventListener("click", cropSelection);
cancelBtn.addEventListener("click", () => window.selectionWindow.cancel());

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    window.selectionWindow.cancel();
  }
  if (event.key === "Enter") {
    cropSelection();
  }
});

window.addEventListener("selection:init", (event) => {
  const detail = event.detail || {};
  state.dataUrl = detail.dataUrl;
  state.pixelWidth = detail.pixelWidth;
  state.pixelHeight = detail.pixelHeight;
  state.bounds = detail.bounds || state.bounds;
  screenImage.src = state.dataUrl;
});
