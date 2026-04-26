const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const captureBtn = document.getElementById("captureBtn");
const openBtn = document.getElementById("openBtn");
const fileInput = document.getElementById("fileInput");
const emptyState = document.getElementById("emptyState");
const dropZone = document.getElementById("dropZone");
const statusEl = document.getElementById("status");
const undoBtn = document.getElementById("undoBtn");
const clearBtn = document.getElementById("clearBtn");
const pinBtn = document.getElementById("pinBtn");
const copyBtn = document.getElementById("copyBtn");
const saveBtn = document.getElementById("saveBtn");
const closeBtn = document.getElementById("closeBtn");
const colorInput = document.getElementById("colorInput");
const sizeInput = document.getElementById("sizeInput");
const toolButtons = Array.from(document.querySelectorAll(".tool"));

const api = window.screenshotMarker || {};
const state = {
  image: null,
  displayWidth: 0,
  displayHeight: 0,
  annotations: [],
  tool: "pen",
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

function setTool(tool) {
  state.tool = tool;
  toolButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === tool);
  });
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
  state.image = image;
  state.annotations = [];
  state.current = null;
  state.nextNumber = 1;
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  state.displayWidth = Math.round(displaySize.width || canvas.width);
  state.displayHeight = Math.round(displaySize.height || canvas.height);
  canvas.style.width = `${state.displayWidth}px`;
  canvas.style.height = `${state.displayHeight}px`;
  render();
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

function render(extra) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (state.image) {
    ctx.drawImage(state.image, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

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
  if (state.image) {
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
    setStatus("正在进入截图模式...");
    const dataUrl = await api.captureScreen();
    await setImage(dataUrl, "截图完成，可以开始标记");
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

canvas.addEventListener("pointerdown", (event) => {
  if (!state.image) return;
  const point = getPointer(event);

  if (state.tool === "text") {
    const text = window.prompt("输入标记文字");
    if (text && text.trim()) {
      state.annotations.push({
        type: "text",
        text: text.trim(),
        color: state.color,
        size: state.size,
        x: point.x,
        y: point.y
      });
      render();
      updateButtons();
    }
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
      setStatus("已复制到剪贴板");
      return;
    }
    await navigator.clipboard.writeText(dataUrl);
    setStatus("当前环境仅能复制图片 Data URL");
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
  if (api.closeWindow) {
    api.closeWindow();
    return;
  }
  window.close();
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
      width: event.detail.displayWidth,
      height: event.detail.displayHeight
    });
  } catch (error) {
    setStatus(error.message || "载入截图失败");
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (api.closeWindow) {
      api.closeWindow();
      return;
    }
    window.close();
  }
});

render();
updateButtons();
