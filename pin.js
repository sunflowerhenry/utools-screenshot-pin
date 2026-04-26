const image = document.getElementById("pinImage");
const textNode = document.getElementById("pinText");
const closeBtn = document.getElementById("closeBtn");
const copyBtn = document.getElementById("copyBtn");
const opacityInput = document.getElementById("opacityInput");
const resizeHandle = document.getElementById("resizeHandle");

const pinState = {
  dataUrl: "",
  text: "",
  type: "image",
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
  pinState.type = detail.type || "image";
  pinState.dataUrl = detail.dataUrl || "";
  pinState.text = detail.text || "";
  pinState.naturalWidth = detail.naturalWidth || detail.width || 1;
  pinState.naturalHeight = detail.naturalHeight || detail.height || 1;

  const isText = pinState.type === "text";
  image.classList.toggle("hidden", isText);
  textNode.classList.toggle("hidden", !isText);
  if (isText) {
    textNode.textContent = pinState.text;
  } else {
    image.src = pinState.dataUrl;
  }
});

function closePin() {
  if (window.pinWindow && window.pinWindow.close) {
    window.pinWindow.close();
    return;
  }
  window.close();
}

closeBtn.addEventListener("click", () => {
  closePin();
});

copyBtn.addEventListener("click", () => {
  if (window.pinWindow && window.pinWindow.copyContent) {
    window.pinWindow.copyContent({ type: pinState.type, dataUrl: pinState.dataUrl, text: pinState.text });
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

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closePin();
  }
});

resizeHandle.addEventListener("pointerup", (event) => {
  pinState.resizing = false;
  resizeHandle.releasePointerCapture(event.pointerId);
});
