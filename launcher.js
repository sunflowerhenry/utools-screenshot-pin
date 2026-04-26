const captureBtn = document.getElementById("captureBtn");
const pinBtn = document.getElementById("pinBtn");
const statusEl = document.getElementById("status");
const api = window.screenshotMarker || {};

function setStatus(message) {
  statusEl.textContent = message;
}

async function captureToEditor() {
  try {
    setStatus("正在打开截图选择层...");
    await api.openSelection();
    if (window.utools) {
      window.utools.outPlugin();
    }
  } catch (error) {
    setStatus(error.message || "截图失败");
  }
}

function pinClipboard() {
  try {
    const result = api.pinClipboard();
    setStatus(result || "已创建贴图");
    if (window.utools) {
      window.utools.outPlugin();
    }
  } catch (error) {
    setStatus(error.message || "贴图失败");
  }
}

captureBtn.addEventListener("click", captureToEditor);
pinBtn.addEventListener("click", pinClipboard);

if (window.utools) {
  window.utools.onPluginEnter(async ({ code }) => {
    if (code === "capture-mark") {
      await captureToEditor();
      return;
    }
    if (code === "capture-pin") {
      pinClipboard();
      return;
    }
    if (code === "capture-settings") {
      setStatus("可在 uTools 全局功能中为“截图”和“贴图”绑定快捷键。");
    }
  });
}
