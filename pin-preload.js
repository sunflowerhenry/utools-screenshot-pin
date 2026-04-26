const { clipboard, ipcRenderer, nativeImage } = require("electron");

function sendToParent(channel, payload) {
  if (window.utools && window.utools.sendToParent) {
    window.utools.sendToParent(channel, payload ? JSON.stringify(payload) : "");
  }
}

window.pinWindow = {
  close() {
    sendToParent("pin:close");
    window.close();
  },

  resize(width, height) {
    sendToParent("pin:resize", { width, height });
  },

  setOpacity(opacity) {
    sendToParent("pin:opacity", { opacity });
  },

  copyContent(content) {
    if (content && content.type === "text") {
      clipboard.writeText(content.text || "");
      return;
    }
    const image = nativeImage.createFromDataURL(content.dataUrl || "");
    if (!image.isEmpty()) {
      clipboard.writeImage(image);
    }
  }
};

ipcRenderer.on("pin:init", (event, payload) => {
  window.dispatchEvent(new CustomEvent("pin:init", { detail: payload }));
});
