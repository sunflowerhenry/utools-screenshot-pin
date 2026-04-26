const image = document.getElementById("pinImage");
const closeBtn = document.getElementById("closeBtn");
const copyBtn = document.getElementById("copyBtn");
const opacityInput = document.getElementById("opacityInput");
const resizeHandle = document.getElementById("resizeHandle");

const pinState = {
  dataUrl: "",
  naturalWidth: 0,
  naturalHeight: 0,
  resizing: false,
  startX: 0,
  startY: 0,
  startWidth: 0,
  startHeight: 0
};

window.addEventListener("pin:init", (event) => {
  const detail = event.detail || {};
  pinState.dataUrl = detail.dataUrl || "";
  pinState.naturalWidth = detail.naturalWidth || detail.width || 1;
  pinState.naturalHeight = detail.naturalHeight || detail.height || 1;
  image.src = pinState.dataUrl;
});

closeBtn.addEventListener("click", () => {
  if (window.pinWindow && window.pinWindow.close) {
    window.pinWindow.close();
    return;
  }
  window.close();
});

copyBtn.addEventListener("click", () => {
  if (window.pinWindow && window.pinWindow.copyImage) {
    window.pinWindow.copyImage(pinState.dataUrl);
  }
});

opacityInput.addEventListener("input", () => {
  if (window.pinWindow && window.pinWindow.setOpacity) {
    window.pinWindow.setOpacity(Number(opacityInput.value) / 100);
  }
});

resizeHandle.addEventListener("pointerdown", (event) => {
  pinState.resizing = true;
  pinState.startX = event.clientX;
  pinState.startY = event.clientY;
  pinState.startWidth = window.innerWidth;
  pinState.startHeight = window.innerHeight;
  resizeHandle.setPointerCapture(event.pointerId);
});

resizeHandle.addEventListener("pointermove", (event) => {
  if (!pinState.resizing || !window.pinWindow || !window.pinWindow.resize) return;
  const ratio = pinState.naturalWidth / pinState.naturalHeight;
  const widthDelta = event.clientX - pinState.startX;
  const heightDelta = event.clientY - pinState.startY;
  const nextWidthFromX = pinState.startWidth + widthDelta;
  const nextWidthFromY = (pinState.startHeight + heightDelta) * ratio;
  const width = Math.max(120, Math.round(Math.max(nextWidthFromX, nextWidthFromY)));
  const height = Math.max(80, Math.round(width / ratio));
  window.pinWindow.resize(width, height);
});

resizeHandle.addEventListener("pointerup", (event) => {
  pinState.resizing = false;
  resizeHandle.releasePointerCapture(event.pointerId);
});
