const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const captureBtn = document.getElementById("captureBtn");
const openBtn = document.getElementById("openBtn");
const fileInput = document.getElementById("fileInput");
const emptyState = document.getElementById("emptyState");
const dropZone = document.getElementById("dropZone");
const cropOverlay = document.getElementById("cropOverlay");
const statusEl = document.getElementById("status");
const undoBtn = document.getElementById("undoBtn");
const clearBtn = document.getElementById("clearBtn");
const pinBtn = document.getElementById("pinBtn");
const copyBtn = document.getElementById("copyBtn");
const saveBtn = document.getElementById("saveBtn");
const closeBtn = document.getElementById("closeBtn");
const colorInput = document.getElementById("colorInput");
const sizeInput = document.getElementById("sizeInput");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const zoomInBtn = document.getElementById("zoomInBtn");
const actualSizeBtn = document.getElementById("actualSizeBtn");
const zoomLabel = document.getElementById("zoomLabel");
const pixelLabel = document.getElementById("pixelLabel");
const toolButtons = Array.from(document.querySelectorAll(".tool"));

const api = window.screenshotMarker || {};
const state = {
  image: null,
  sourceImage: null,
  screenBounds: null,
  cropRect: null,
  cropAction: "",
  cropHandle: "",
  cropStartPoint: null,
  cropStartRect: null,
  overlayEditor: false,
  baseDisplayWidth: 0,
  baseDisplayHeight: 0,
  displayWidth: 0,
  displayHeight: 0,
  imageOffsetX: 0,
  imageOffsetY: 0,
  toolbarOffsetX: 0,
  zoom: 1,
  annotations: [],
  tool: "move",
  color: colorInput.value,
  size: Number(sizeInput.value),
  drawing: false,
  current: null,
  capturing: false,
  nextNumber: 1
};

function setStatus(message) {
  statusEl.textContent = message;
}

function hasCropSource() {
  return Boolean(state.sourceImage && state.cropRect && state.screenBounds);
}

function setTool(tool) {
  if (tool === "crop" && !hasCropSource()) {
    setStatus("只有通过截图选择层进入的图片可以调整选区");
    return;
  }
  state.tool = tool;
  toolButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === tool);
  });
  canvas.classList.toggle("drawing", tool !== "move");
  updateCropOverlay();
}

function updateButtons() {
  const hasImage = Boolean(state.image);
  const hasAnnotations = state.annotations.length > 0;
  undoBtn.disabled = !hasAnnotations;
  clearBtn.disabled = !hasAnnotations;
  pinBtn.disabled = !hasImage;
  copyBtn.disabled = !hasImage;
  saveBtn.disabled = !hasImage;
  emptyState.classList.toggle("hidden", hasImage);
  canvas.classList.toggle("hidden", !hasImage);
  updateCropOverlay();
}

function updateCropOverlay() {
  if (!cropOverlay) return;
  const visible = state.tool === "crop" && hasCropSource();
  cropOverlay.classList.toggle("hidden", !visible);
  if (!visible) return;
  cropOverlay.style.left = `${state.imageOffsetX}px`;
  cropOverlay.style.top = `${state.imageOffsetY}px`;
  cropOverlay.style.width = `${state.displayWidth}px`;
  cropOverlay.style.height = `${state.displayHeight}px`;
}

function getToolbarHeight() {
  const toolbar = document.querySelector(".toolbar");
  return Math.ceil((toolbar && toolbar.getBoundingClientRect().height) || 58);
}

function getToolbarWidth() {
  const toolbar = document.querySelector(".toolbar");
  return Math.ceil((toolbar && toolbar.getBoundingClientRect().width) || 1040);
}

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeBounds(bounds) {
  return {
    x: Math.round(Number(bounds && bounds.x) || 0),
    y: Math.round(Number(bounds && bounds.y) || 0),
    width: Math.max(1, Math.round(Number(bounds && bounds.width) || window.innerWidth || 1)),
    height: Math.max(1, Math.round(Number(bounds && bounds.height) || window.innerHeight || 1))
  };
}

function normalizeCropRect(rect) {
  const bounds = state.screenBounds || normalizeBounds();
  const minSize = 16;
  const x = Math.min(rect.x, rect.x + rect.w);
  const y = Math.min(rect.y, rect.y + rect.h);
  const w = Math.abs(rect.w);
  const h = Math.abs(rect.h);
  const nextX = clamp(x, 0, Math.max(0, bounds.width - minSize));
  const nextY = clamp(y, 0, Math.max(0, bounds.height - minSize));

  return {
    x: nextX,
    y: nextY,
    w: clamp(w, minSize, bounds.width - nextX),
    h: clamp(h, minSize, bounds.height - nextY)
  };
}

function getCropPixelBox(rect = state.cropRect) {
  if (!state.sourceImage || !rect || !state.screenBounds) return null;
  const scaleX = state.sourceImage.naturalWidth / state.screenBounds.width;
  const scaleY = state.sourceImage.naturalHeight / state.screenBounds.height;

  return {
    sx: Math.round(rect.x * scaleX),
    sy: Math.round(rect.y * scaleY),
    sw: Math.max(1, Math.round(rect.w * scaleX)),
    sh: Math.max(1, Math.round(rect.h * scaleY))
  };
}

function updateCanvasFromCrop(updateDisplay = true) {
  const box = getCropPixelBox();
  if (!box) return;
  canvas.width = box.sw;
  canvas.height = box.sh;
  state.baseDisplayWidth = Math.max(1, Math.round(state.cropRect.w));
  state.baseDisplayHeight = Math.max(1, Math.round(state.cropRect.h));
  updatePixelLabel();
  if (updateDisplay) {
    applyDisplaySize();
  }
}

function shiftAnnotation(item, dx, dy) {
  if (!item) return;
  if (item.type === "pen" && Array.isArray(item.points)) {
    item.points.forEach((point) => {
      point.x += dx;
      point.y += dy;
    });
    return;
  }
  if (item.type === "line" || item.type === "arrow") {
    item.x1 += dx;
    item.y1 += dy;
    item.x2 += dx;
    item.y2 += dy;
    return;
  }
  if ("x" in item) item.x += dx;
  if ("y" in item) item.y += dy;
}

function setCropRect(nextRect) {
  if (!hasCropSource()) return;
  const oldBox = getCropPixelBox();
  state.cropRect = normalizeCropRect(nextRect);
  const nextBox = getCropPixelBox();

  if (oldBox && nextBox) {
    const dx = oldBox.sx - nextBox.sx;
    const dy = oldBox.sy - nextBox.sy;
    state.annotations.forEach((item) => shiftAnnotation(item, dx, dy));
    shiftAnnotation(state.current, dx, dy);
  }

  updateCanvasFromCrop();
  render();
  updateButtons();
}

function computeEditorLayout() {
  const toolbarHeight = getToolbarHeight();
  const toolbarWidth = getToolbarWidth();
  const bounds = state.screenBounds || normalizeBounds({
    width: window.screen && window.screen.availWidth,
    height: window.screen && window.screen.availHeight
  });
  const cropRect = state.cropRect || { x: 0, y: 0, w: state.displayWidth, h: state.displayHeight };
  const padding = 8;

  if (state.overlayEditor) {
    const imageOffsetX = Math.round(cropRect.x);
    const imageOffsetY = Math.round(cropRect.y);
    const toolbarOffsetX = clamp(
      imageOffsetX,
      padding,
      Math.max(padding, bounds.width - toolbarWidth - padding)
    );
    const belowTop = imageOffsetY + state.displayHeight + 6;
    const aboveTop = imageOffsetY - toolbarHeight - 6;
    const toolbarTop = belowTop + toolbarHeight <= bounds.height - padding
      ? belowTop
      : clamp(aboveTop, padding, Math.max(padding, bounds.height - toolbarHeight - padding));

    return {
      x: bounds.x || 0,
      y: bounds.y || 0,
      width: bounds.width,
      height: bounds.height,
      imageOffsetX,
      imageOffsetY,
      toolbarOffsetX,
      toolbarTop
    };
  }

  const imageX = Math.round((bounds.x || 0) + cropRect.x);
  const imageY = Math.round((bounds.y || 0) + cropRect.y);
  const screenLeft = bounds.x || 0;
  const screenTop = bounds.y || 0;
  const screenRight = screenLeft + bounds.width;
  const toolbarRightLimit = Math.max(screenLeft, screenRight - Math.min(toolbarWidth, bounds.width));
  const toolbarX = clamp(imageX, screenLeft, toolbarRightLimit);
  const x = Math.max(screenLeft, Math.min(imageX - padding, toolbarX - padding, imageX));
  const y = Math.max(screenTop, imageY - padding);
  const imageOffsetX = Math.max(0, imageX - x);
  const imageOffsetY = Math.max(0, imageY - y);
  const toolbarOffsetX = Math.max(0, toolbarX - x);
  const toolbarTop = imageOffsetY + state.displayHeight;
  const width = Math.max(120, imageOffsetX + state.displayWidth, toolbarOffsetX + toolbarWidth);
  const height = Math.max(80, imageOffsetY + state.displayHeight, toolbarTop + toolbarHeight);

  return {
    x,
    y,
    width,
    height,
    imageOffsetX,
    imageOffsetY,
    toolbarOffsetX,
    toolbarTop
  };
}

function updateZoomLabel() {
  if (zoomLabel) {
    zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
  }
}

function updatePixelLabel() {
  if (pixelLabel) {
    pixelLabel.textContent = `${canvas.width} x ${canvas.height}`;
  }
}

function applyDisplaySize() {
  state.displayWidth = Math.max(1, Math.round(state.baseDisplayWidth * state.zoom));
  state.displayHeight = Math.max(1, Math.round(state.baseDisplayHeight * state.zoom));
  const toolbarHeight = getToolbarHeight();
  const toolbarWidth = getToolbarWidth();
  const layout = hasCropSource() ? computeEditorLayout() : null;
  if (layout) {
    state.imageOffsetX = layout.imageOffsetX;
    state.imageOffsetY = layout.imageOffsetY;
    state.toolbarOffsetX = layout.toolbarOffsetX;
  }
  const toolbarTop = layout ? layout.toolbarTop : state.imageOffsetY + state.displayHeight;
  canvas.style.width = `${state.displayWidth}px`;
  canvas.style.height = `${state.displayHeight}px`;
  document.documentElement.style.setProperty("--image-left", `${state.imageOffsetX}px`);
  document.documentElement.style.setProperty("--image-top", `${state.imageOffsetY}px`);
  document.documentElement.style.setProperty("--image-width", `${state.displayWidth}px`);
  document.documentElement.style.setProperty("--image-height", `${state.displayHeight}px`);
  document.documentElement.style.setProperty("--toolbar-left", `${state.toolbarOffsetX}px`);
  document.documentElement.style.setProperty("--toolbar-top", `${toolbarTop}px`);
  updateZoomLabel();
  updateCropOverlay();

  if (layout && api.layoutEditor) {
    api.layoutEditor({
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height
    });
  } else if (api.resizeEditor) {
    api.resizeEditor({
      width: Math.max(
        120,
        state.imageOffsetX + state.displayWidth,
        state.toolbarOffsetX + toolbarWidth
      ),
      height: Math.max(
        80,
        state.imageOffsetY + state.displayHeight,
        toolbarTop + toolbarHeight
      )
    });
  }
}

function setZoom(nextZoom) {
  state.zoom = Math.min(4, Math.max(0.1, nextZoom));
  applyDisplaySize();
}

function getDefaultDisplaySize(displaySize) {
  const ratio = window.devicePixelRatio || 1;
  const visualWidth = Math.max(1, Math.round(canvas.width / ratio));
  const visualHeight = Math.max(1, Math.round(canvas.height / ratio));
  const requestedWidth = Math.max(1, Math.round(displaySize.width || visualWidth));
  const requestedHeight = Math.max(1, Math.round(displaySize.height || visualHeight));

  return {
    width: Math.min(requestedWidth, visualWidth),
    height: Math.min(requestedHeight, visualHeight)
  };
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = dataUrl;
  });
}

async function setImage(dataUrl, message, displaySize = {}) {
  const image = await loadImage(dataUrl);
  const sourceImage = displaySize.sourceDataUrl
    ? await loadImage(displaySize.sourceDataUrl)
    : null;
  state.image = image;
  state.sourceImage = sourceImage;
  state.screenBounds = sourceImage ? normalizeBounds(displaySize.screenBounds) : null;
  state.cropRect = sourceImage && displaySize.cropRect
    ? normalizeCropRect(displaySize.cropRect)
    : null;
  state.overlayEditor = Boolean(sourceImage && displaySize.overlayEditor);
  document.body.classList.toggle("overlay-editor", state.overlayEditor);
  state.annotations = [];
  state.current = null;
  state.nextNumber = 1;
  state.zoom = 1;
  state.imageOffsetX = Math.max(0, Math.round(Number(displaySize.imageOffsetX) || 0));
  state.imageOffsetY = Math.max(0, Math.round(Number(displaySize.imageOffsetY) || 0));
  const toolbarOffsetX = Number(displaySize.toolbarOffsetX);
  state.toolbarOffsetX = Math.max(
    0,
    Math.round(Number.isFinite(toolbarOffsetX) ? toolbarOffsetX : state.imageOffsetX)
  );
  if (hasCropSource()) {
    updateCanvasFromCrop(false);
  } else {
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
  }
  updatePixelLabel();
  const defaultDisplaySize = hasCropSource()
    ? { width: state.cropRect.w, height: state.cropRect.h }
    : getDefaultDisplaySize(displaySize);
  state.baseDisplayWidth = defaultDisplaySize.width;
  state.baseDisplayHeight = defaultDisplaySize.height;
  applyDisplaySize();
  render();
  setTool("move");
  updateButtons();
  setStatus(message || `已载入图片 ${canvas.width} x ${canvas.height}`);
}

function getPointer(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function drawArrow(context, item) {
  const dx = item.x2 - item.x1;
  const dy = item.y2 - item.y1;
  const angle = Math.atan2(dy, dx);
  const head = Math.max(14, item.size * 4);

  context.beginPath();
  context.moveTo(item.x1, item.y1);
  context.lineTo(item.x2, item.y2);
  context.stroke();

  context.beginPath();
  context.moveTo(item.x2, item.y2);
  context.lineTo(item.x2 - head * Math.cos(angle - Math.PI / 6), item.y2 - head * Math.sin(angle - Math.PI / 6));
  context.lineTo(item.x2 - head * Math.cos(angle + Math.PI / 6), item.y2 - head * Math.sin(angle + Math.PI / 6));
  context.closePath();
  context.fill();
}

function getBox(item) {
  const x = Math.min(item.x, item.x + item.w);
  const y = Math.min(item.y, item.y + item.h);
  return {
    x,
    y,
    w: Math.abs(item.w),
    h: Math.abs(item.h)
  };
}

function drawMosaic(context, item) {
  const box = getBox(item);
  if (box.w < 4 || box.h < 4) return;

  const block = Math.max(8, item.size * 3);
  const tiny = document.createElement("canvas");
  tiny.width = Math.max(1, Math.ceil(box.w / block));
  tiny.height = Math.max(1, Math.ceil(box.h / block));
  const tinyCtx = tiny.getContext("2d");

  tinyCtx.imageSmoothingEnabled = true;
  tinyCtx.drawImage(context.canvas, box.x, box.y, box.w, box.h, 0, 0, tiny.width, tiny.height);
  context.save();
  context.imageSmoothingEnabled = false;
  context.drawImage(tiny, 0, 0, tiny.width, tiny.height, box.x, box.y, box.w, box.h);
  context.restore();
}

function drawNumber(context, item) {
  const radius = Math.max(13, item.size * 3);
  context.save();
  context.fillStyle = item.color;
  context.strokeStyle = "#ffffff";
  context.lineWidth = Math.max(2, item.size / 2);
  context.beginPath();
  context.arc(item.x, item.y, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#ffffff";
  context.font = `700 ${Math.max(14, radius)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(item.value), item.x, item.y + 1);
  context.restore();
}

function drawAnnotation(context, item) {
  context.save();
  context.strokeStyle = item.color;
  context.fillStyle = item.color;
  context.lineWidth = item.size;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (item.type === "pen") {
    context.beginPath();
    item.points.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    });
    context.stroke();
  }

  if (item.type === "rect") {
    context.strokeRect(item.x, item.y, item.w, item.h);
  }

  if (item.type === "ellipse") {
    const box = getBox(item);
    context.beginPath();
    context.ellipse(box.x + box.w / 2, box.y + box.h / 2, box.w / 2, box.h / 2, 0, 0, Math.PI * 2);
    context.stroke();
  }

  if (item.type === "line") {
    context.beginPath();
    context.moveTo(item.x1, item.y1);
    context.lineTo(item.x2, item.y2);
    context.stroke();
  }

  if (item.type === "arrow") {
    drawArrow(context, item);
  }

  if (item.type === "mosaic") {
    context.restore();
    drawMosaic(context, item);
    return;
  }

  if (item.type === "number") {
    context.restore();
    drawNumber(context, item);
    return;
  }

  if (item.type === "text") {
    context.font = `${Math.max(18, item.size * 5)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    context.textBaseline = "top";
    context.fillText(item.text, item.x, item.y);
  }

  context.restore();
}

function drawBaseImage(context) {
  if (hasCropSource()) {
    const box = getCropPixelBox();
    context.drawImage(state.sourceImage, box.sx, box.sy, box.sw, box.sh, 0, 0, canvas.width, canvas.height);
    return;
  }
  if (state.image) {
    context.drawImage(state.image, 0, 0, canvas.width, canvas.height);
    return;
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
}

function render(extra) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBaseImage(ctx);

  state.annotations.forEach((item) => drawAnnotation(ctx, item));
  if (extra) {
    drawAnnotation(ctx, extra);
  }
}

function createCurrent(point) {
  if (state.tool === "pen") {
    return {
      type: "pen",
      color: state.color,
      size: state.size,
      points: [point]
    };
  }
  if (state.tool === "rect") {
    return {
      type: "rect",
      color: state.color,
      size: state.size,
      x: point.x,
      y: point.y,
      w: 0,
      h: 0
    };
  }
  if (state.tool === "ellipse") {
    return {
      type: "ellipse",
      color: state.color,
      size: state.size,
      x: point.x,
      y: point.y,
      w: 0,
      h: 0
    };
  }
  if (state.tool === "mosaic") {
    return {
      type: "mosaic",
      color: state.color,
      size: state.size,
      x: point.x,
      y: point.y,
      w: 0,
      h: 0
    };
  }
  if (state.tool === "line" || state.tool === "arrow") {
    return {
      type: state.tool,
      color: state.color,
      size: state.size,
      x1: point.x,
      y1: point.y,
      x2: point.x,
      y2: point.y
    };
  }
  return null;
}

function updateCurrent(point) {
  const item = state.current;
  if (!item) return;
  if (item.type === "pen") {
    item.points.push(point);
  }
  if (item.type === "rect") {
    item.w = point.x - item.x;
    item.h = point.y - item.y;
  }
  if (item.type === "ellipse" || item.type === "mosaic") {
    item.w = point.x - item.x;
    item.h = point.y - item.y;
  }
  if (item.type === "line" || item.type === "arrow") {
    item.x2 = point.x;
    item.y2 = point.y;
  }
}

function finishCurrent() {
  if (!state.current) return;
  state.annotations.push(state.current);
  state.current = null;
  render();
  updateButtons();
}

function exportImage() {
  const output = document.createElement("canvas");
  output.width = canvas.width;
  output.height = canvas.height;
  const outputCtx = output.getContext("2d");
  if (hasCropSource()) {
    const box = getCropPixelBox();
    outputCtx.drawImage(state.sourceImage, box.sx, box.sy, box.sw, box.sh, 0, 0, output.width, output.height);
  } else if (state.image) {
    outputCtx.drawImage(state.image, 0, 0, output.width, output.height);
  }
  state.annotations.forEach((item) => drawAnnotation(outputCtx, item));
  return output.toDataURL("image/png");
}

async function handleFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    setStatus("请选择图片文件");
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      await setImage(reader.result, `已打开 ${file.name}`);
    } catch (error) {
      setStatus(error.message);
    }
  };
  reader.readAsDataURL(file);
}

async function startCapture() {
  if (state.capturing) return;
  state.capturing = true;
  try {
    setStatus("正在打开截图选择层...");
    if (!api.openSelection) {
      throw new Error("当前环境没有自建截图选择层");
    }
    await api.openSelection();
    if (window.utools) {
      window.utools.outPlugin();
    }
  } catch (error) {
    setStatus(error.message || "截图失败");
  } finally {
    state.capturing = false;
  }
}

async function startCaptureToPin() {
  try {
    if (api.pinClipboard) {
      setStatus(api.pinClipboard());
      if (window.utools) {
        window.utools.outPlugin();
      }
      return;
    }
    setStatus("当前环境不支持剪贴板贴图");
  } catch (error) {
    setStatus(error.message || "贴图失败");
  }
}

function normalizeImagePayload(payload) {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (payload.type === "img" && typeof payload.data === "string") return payload.data;
  if (typeof payload.data === "string") return payload.data;
  return "";
}

function normalizeFilePayload(payload) {
  if (Array.isArray(payload)) return payload[0];
  if (payload && typeof payload === "object") return payload;
  return null;
}

function closeEditorWindow() {
  if (api.closeWindow) {
    api.closeWindow();
    return;
  }
  window.close();
}

if (captureBtn) {
  captureBtn.addEventListener("click", startCapture);
}

if (openBtn) {
  openBtn.addEventListener("click", () => fileInput.click());
}
fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));

toolButtons.forEach((button) => {
  button.addEventListener("click", () => setTool(button.dataset.tool));
});

colorInput.addEventListener("input", () => {
  state.color = colorInput.value;
});

sizeInput.addEventListener("input", () => {
  state.size = Number(sizeInput.value);
});

zoomOutBtn.addEventListener("click", () => {
  setZoom(state.zoom - 0.1);
});

zoomInBtn.addEventListener("click", () => {
  setZoom(state.zoom + 0.1);
});

actualSizeBtn.addEventListener("click", () => {
  if (!state.baseDisplayWidth || !state.baseDisplayHeight) return;
  setZoom(Math.min(canvas.width / state.baseDisplayWidth, canvas.height / state.baseDisplayHeight));
});

function openTextEditor(event, point) {
  event.preventDefault();
  event.stopPropagation();
  const existing = document.querySelector(".text-editor");
  if (existing) existing.remove();

  const input = document.createElement("textarea");
  input.className = "text-editor";
  input.rows = 1;
  input.placeholder = "输入文字";
  input.style.left = `${event.clientX}px`;
  input.style.top = `${event.clientY}px`;
  input.style.color = state.color;
  input.style.fontSize = `${Math.max(18, state.size * 5)}px`;
  document.body.appendChild(input);
  requestAnimationFrame(() => {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });

  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    const text = input.value.trim();
    input.remove();
    if (!text) return;
    state.annotations.push({
      type: "text",
      text,
      color: state.color,
      size: state.size,
      x: point.x,
      y: point.y
    });
    render();
    updateButtons();
  };
  const cancel = () => {
    done = true;
    input.remove();
  };

  input.addEventListener("keydown", (keyboardEvent) => {
    if (keyboardEvent.key === "Escape") {
      keyboardEvent.preventDefault();
      cancel();
      return;
    }
    if (keyboardEvent.key === "Enter" && !keyboardEvent.shiftKey) {
      keyboardEvent.preventDefault();
      commit();
    }
  });
  input.addEventListener("pointerdown", (pointerEvent) => {
    pointerEvent.stopPropagation();
  });
  input.addEventListener("blur", commit, { once: true });
}

function getCropPointer(event) {
  return {
    x: Number.isFinite(event.screenX) ? event.screenX : event.clientX,
    y: Number.isFinite(event.screenY) ? event.screenY : event.clientY
  };
}

function updateCropFromPointer(point) {
  if (!state.cropStartRect || !state.cropStartPoint) return;
  const dx = (point.x - state.cropStartPoint.x) / state.zoom;
  const dy = (point.y - state.cropStartPoint.y) / state.zoom;
  const rect = state.cropStartRect;
  const next = { ...rect };

  if (state.cropAction === "move") {
    next.x = rect.x + dx;
    next.y = rect.y + dy;
  } else {
    if (state.cropHandle.includes("e")) next.w = rect.w + dx;
    if (state.cropHandle.includes("s")) next.h = rect.h + dy;
    if (state.cropHandle.includes("w")) {
      next.x = rect.x + dx;
      next.w = rect.w - dx;
    }
    if (state.cropHandle.includes("n")) {
      next.y = rect.y + dy;
      next.h = rect.h - dy;
    }
  }

  setCropRect(next);
}

if (cropOverlay) {
  cropOverlay.addEventListener("pointerdown", (event) => {
    if (state.tool !== "crop" || !hasCropSource()) return;
    event.preventDefault();
    event.stopPropagation();
    state.cropHandle = event.target.dataset.cropHandle || "";
    state.cropAction = state.cropHandle ? "resize" : "move";
    state.cropStartPoint = getCropPointer(event);
    state.cropStartRect = { ...state.cropRect };
    cropOverlay.setPointerCapture(event.pointerId);
  });

  cropOverlay.addEventListener("pointermove", (event) => {
    if (!state.cropAction) return;
    event.preventDefault();
    updateCropFromPointer(getCropPointer(event));
  });

  cropOverlay.addEventListener("pointerup", (event) => {
    if (!state.cropAction) return;
    state.cropAction = "";
    state.cropHandle = "";
    state.cropStartPoint = null;
    state.cropStartRect = null;
    cropOverlay.releasePointerCapture(event.pointerId);
  });

  cropOverlay.addEventListener("pointercancel", () => {
    state.cropAction = "";
    state.cropHandle = "";
    state.cropStartPoint = null;
    state.cropStartRect = null;
  });
}

canvas.addEventListener("wheel", (event) => {
  if (!event.metaKey && !event.ctrlKey) return;
  event.preventDefault();
  setZoom(state.zoom + (event.deltaY < 0 ? 0.1 : -0.1));
});

canvas.addEventListener("pointerdown", (event) => {
  if (!state.image) return;
  if (state.tool === "move") return;
  if (state.tool === "crop") return;
  const point = getPointer(event);

  if (state.tool === "text") {
    openTextEditor(event, point);
    return;
  }

  if (state.tool === "number") {
    state.annotations.push({
      type: "number",
      value: state.nextNumber,
      color: state.color,
      size: state.size,
      x: point.x,
      y: point.y
    });
    state.nextNumber += 1;
    render();
    updateButtons();
    return;
  }

  state.drawing = true;
  state.current = createCurrent(point);
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!state.drawing || !state.current) return;
  updateCurrent(getPointer(event));
  render(state.current);
});

canvas.addEventListener("pointerup", (event) => {
  if (!state.drawing) return;
  state.drawing = false;
  updateCurrent(getPointer(event));
  finishCurrent();
  canvas.releasePointerCapture(event.pointerId);
});

canvas.addEventListener("pointercancel", () => {
  state.drawing = false;
  state.current = null;
  render();
});

undoBtn.addEventListener("click", () => {
  state.annotations.pop();
  render();
  updateButtons();
});

clearBtn.addEventListener("click", () => {
  state.annotations = [];
  state.nextNumber = 1;
  render();
  updateButtons();
});

pinBtn.addEventListener("click", () => {
  try {
    const dataUrl = exportImage();
    if (!api.pinImage) {
      setStatus("当前环境不支持贴图窗口");
      return;
    }
    api.pinImage(dataUrl);
    setStatus("已创建贴图窗口");
  } catch (error) {
    setStatus(error.message || "贴图失败");
  }
});

copyBtn.addEventListener("click", async () => {
  try {
    const dataUrl = exportImage();
    if (api.copyImage) {
      api.copyImage(dataUrl);
      closeEditorWindow();
      return;
    }
    await navigator.clipboard.writeText(dataUrl);
    closeEditorWindow();
  } catch (error) {
    setStatus(error.message || "复制失败");
  }
});

saveBtn.addEventListener("click", () => {
  try {
    const dataUrl = exportImage();
    if (api.saveImage) {
      const savePath = api.saveImage(dataUrl);
      setStatus(savePath ? `已保存到 ${savePath}` : "已取消保存");
      return;
    }
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = "screenshot-mark.png";
    link.click();
  } catch (error) {
    setStatus(error.message || "保存失败");
  }
});

closeBtn.addEventListener("click", () => {
  closeEditorWindow();
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragging");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  handleFile(event.dataTransfer.files[0]);
});

window.addEventListener("paste", (event) => {
  const item = Array.from(event.clipboardData.items).find((entry) => entry.type.startsWith("image/"));
  if (item) {
    handleFile(item.getAsFile());
  }
});

if (window.utools) {
  window.utools.onPluginEnter(async ({ code, type, payload }) => {
    try {
      const imagePayload = normalizeImagePayload(payload);
      if (type === "img" && imagePayload && code === "pin-image" && api.pinImage) {
        api.pinImage(imagePayload);
        window.utools.outPlugin();
        return;
      }
      if (type === "img" && imagePayload) {
        await setImage(imagePayload, "已载入剪贴板图片");
        return;
      }
      const filePayload = normalizeFilePayload(payload);
      if ((type === "files" || type === "file") && filePayload && code === "pin-image" && api.readImageFile && api.pinImage) {
        api.pinImage(api.readImageFile(filePayload.path));
        window.utools.outPlugin();
        return;
      }
      if ((type === "files" || type === "file") && filePayload && api.readImageFile) {
        await setImage(api.readImageFile(filePayload.path), `已打开 ${filePayload.name}`);
        return;
      }
      if (code === "capture-pin") {
        await startCaptureToPin();
        return;
      }
      if (code === "capture-settings") {
        setStatus("可在 uTools 全局功能中为“截图”和“贴图”绑定快捷键");
        return;
      }
      if (code === "capture-mark") {
        await startCapture();
      }
    } catch (error) {
      setStatus(error.message || "载入失败");
    }
  });
}

window.addEventListener("editor:init", async (event) => {
  try {
    await setImage(event.detail.dataUrl, "截图完成，可以开始标记", {
      sourceDataUrl: event.detail.sourceDataUrl,
      screenBounds: event.detail.screenBounds,
      cropRect: event.detail.cropRect,
      sourcePixelWidth: event.detail.sourcePixelWidth,
      sourcePixelHeight: event.detail.sourcePixelHeight,
      overlayEditor: event.detail.overlayEditor,
      width: event.detail.displayWidth,
      height: event.detail.displayHeight,
      imageOffsetX: event.detail.imageOffsetX,
      imageOffsetY: event.detail.imageOffsetY,
      toolbarOffsetX: event.detail.toolbarOffsetX
    });
  } catch (error) {
    setStatus(error.message || "载入截图失败");
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeEditorWindow();
  }
});

render();
updateButtons();
