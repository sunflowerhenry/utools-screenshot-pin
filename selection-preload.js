const { ipcRenderer } = require("electron");

function sendToParent(channel, payload) {
  if (window.utools && window.utools.sendToParent) {
    window.utools.sendToParent(channel, payload ? JSON.stringify(payload) : "");
  }
}

window.selectionWindow = {
  complete(payload) {
    sendToParent("selection:complete", payload);
  },

  cancel() {
    sendToParent("selection:cancel");
    window.close();
  }
};

ipcRenderer.on("selection:init", (event, payload) => {
  window.dispatchEvent(new CustomEvent("selection:init", { detail: payload }));
});
