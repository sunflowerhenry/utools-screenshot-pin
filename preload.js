const fs = require("node:fs");
const path = require("node:path");
const { clipboard, ipcRenderer, nativeImage } = require("electron");

const childWindows = new Map();

function dataUrlToBuffer(dataUrl) {
  const match = /^data:image\/[\w+.-]+;base64,(.+)$/.exec(dataUrl || "");
  if (!match) {
    throw new Error("图片数据格式不正确");
  }
  return Buffer.from(match[1], "base64");
}

function getDefaultImagePath() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join("");
  const downloads = window.utools ? window.utools.getPath("downloads") : "";
  return path.join(downloads || process.cwd(), `screenshot-mark-${stamp}.png`);
}

function getPinSize(imageSize) {
  const point = window.utools.getCursorScreenPoint();
  const display = window.utools.getDisplayNearestPoint(point);
  const bounds = display.workArea || display.bounds || { width: 1200, height: 800 };
  const dipSize = getDipSize(imageSize, display);
  const naturalWidth = dipSize.width;
  const naturalHeight = dipSize.height;
  const maxWidth = Math.max(240, Math.floor(bounds.width * 0.72));
  const maxHeight = Math.max(160, Math.floor(bounds.height * 0.72));
  const scale = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight);

  return {
    width: Math.max(120, Math.round(naturalWidth * scale)),
    height: Math.max(80, Math.round(naturalHeight * scale)),
    naturalWidth: Math.round(naturalWidth),
    naturalHeight: Math.round(naturalHeight),
    point,
    display,
    bounds
  };
}

function getDipSize(imageSize, display) {
  if (window.utools && window.utools.screenToDipRect) {
    const rect = window.utools.screenToDipRect({
      x: 0,
      y: 0,
      width: imageSize.width,
      height: imageSize.height
    });
    if (rect && rect.width && rect.height) {
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    }
  }

  const scaleFactor = display && display.scaleFactor ? display.scaleFactor : 1;
  return {
    width: Math.round(imageSize.width / scaleFactor),
    height: Math.round(imageSize.height / scaleFactor)
  };
}

function getWindowPosition(width, height) {
  const point = window.utools.getCursorScreenPoint();
  const display = window.utools.getDisplayNearestPoint(point);
  const bounds = display.workArea || display.bounds || { x: 0, y: 0, width: 1200, height: 800 };
  const x = Math.min(
    Math.max(bounds.x || 0, point.x - Math.floor(width / 2)),
    (bounds.x || 0) + bounds.width - width
  );
  const y = Math.min(
    Math.max(bounds.y || 0, point.y - Math.floor(height / 2)),
    (bounds.y || 0) + bounds.height - height
  );
  return { x, y, bounds };
}

function getEditorWindowPosition(width, height) {
  const point = window.utools.getCursorScreenPoint();
  const display = window.utools.getDisplayNearestPoint(point);
  const bounds = display.workArea || display.bounds || { x: 0, y: 0, width: 1200, height: 800 };
  const x = Math.min(
    Math.max(bounds.x || 0, point.x - width),
    (bounds.x || 0) + bounds.width - width
  );
  const y = Math.min(
    Math.max(bounds.y || 0, point.y - height),
    (bounds.y || 0) + bounds.height - height
  );
  return { x, y, bounds };
}

function createPinWindow(payload) {
  if (!window.utools || !window.utools.createBrowserWindow) {
    throw new Error("当前环境没有 uTools 独立窗口 API");
  }

  let size;
  if (payload.type === "image") {
    const image = nativeImage.createFromDataURL(payload.dataUrl);
    const imageSize = image.getSize();
    if (image.isEmpty() || !imageSize.width || !imageSize.height) {
      throw new Error("贴图失败，图片为空");
    }
    size = getPinSize(imageSize);
    payload.naturalWidth = imageSize.width;
    payload.naturalHeight = imageSize.height;
    payload.displayWidth = size.naturalWidth;
    payload.displayHeight = size.naturalHeight;
  } else {
    const lines = wrapText(payload.text, 28);
    size = {
      width: Math.min(640, Math.max(260, Math.max(...lines.map((line) => line.length)) * 15 + 48)),
      height: Math.min(620, Math.max(120, lines.length * 25 + 64))
    };
    payload.lines = lines;
  }

  const { width, height } = size;
  const { x, y } = getWindowPosition(width, height);

  const win = window.utools.createBrowserWindow(
    "pin.html",
    {
      show: false,
      x,
      y,
      width,
      height,
      minWidth: 120,
      minHeight: 80,
      useContentSize: true,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: true,
      resizable: true,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      autoHideMenuBar: true,
      alwaysOnTop: true,
      webPreferences: {
        preload: "pin-preload.js"
      }
    },
    () => {
      childWindows.set(win.webContents.id, win);
      win.webContents.send("pin:init", {
        ...payload,
        width,
        height
      });
      win.setAlwaysOnTop(true, "screen-saver");
      win.show();
      win.focus();
    }
  );

  return true;
}

function wrapText(text, maxLength) {
  const cleanText = String(text || "").replace(/\r\n/g, "\n").trim();
  const lines = [];
  cleanText.split("\n").forEach((line) => {
    if (!line) {
      lines.push("");
      return;
    }
    let rest = line;
    while (rest.length > maxLength) {
      lines.push(rest.slice(0, maxLength));
      rest = rest.slice(maxLength);
    }
    lines.push(rest);
  });
  return lines.length ? lines : ["空文本"];
}

function createEditorWindow(dataUrl) {
  if (!window.utools || !window.utools.createBrowserWindow) {
    throw new Error("当前环境没有 uTools 独立窗口 API");
  }
  const image = nativeImage.createFromDataURL(dataUrl);
  const imageSize = image.getSize();
  if (image.isEmpty() || !imageSize.width || !imageSize.height) {
    throw new Error("截图图片为空");
  }
  const point = window.utools.getCursorScreenPoint();
  const display = window.utools.getDisplayNearestPoint(point);
  const bounds = display.workArea || display.bounds || { width: 1200, height: 800 };
  const dipSize = getDipSize(imageSize, display);
  const toolbarHeight = 58;
  const maxWidth = Math.max(260, bounds.width - 16);
  const maxImageHeight = Math.max(160, bounds.height - toolbarHeight - 16);
  const scale = Math.min(1, maxWidth / dipSize.width, maxImageHeight / dipSize.height);
  const displayWidth = Math.max(120, Math.round(dipSize.width * scale));
  const displayHeight = Math.max(80, Math.round(dipSize.height * scale));
  const width = Math.max(430, displayWidth);
  const height = displayHeight + toolbarHeight;
  const { x, y } = getEditorWindowPosition(width, height);
  const win = window.utools.createBrowserWindow(
    "editor.html",
    {
      show: false,
      x,
      y,
      width,
      height,
      minWidth: 120,
      minHeight: 80,
      useContentSize: true,
      frame: false,
      thickFrame: false,
      transparent: true,
      backgroundColor: "#00000000",
      roundedCorners: false,
      hasShadow: false,
      resizable: true,
      skipTaskbar: true,
      closeable: true,
      enableLargerThanScreen: true,
      autoHideMenuBar: true,
      webPreferences: {
        preload: "preload.js"
      }
    },
    () => {
      childWindows.set(win.webContents.id, win);
      win.webContents.send("editor:init", {
        dataUrl,
        displayWidth,
        displayHeight
      });
      try {
        win.setBackgroundColor("#00000000");
      } catch (error) {}
      win.setAlwaysOnTop(true, "screen-saver");
      win.show();
      win.focus();
    }
  );
  return true;
}

function getChildWindow(event) {
  return childWindows.get(event.senderId);
}

ipcRenderer.on("pin:close", (event) => {
  const win = getChildWindow(event);
  if (!win) return;
  childWindows.delete(event.senderId);
  win.destroy();
});

ipcRenderer.on("pin:resize", (event, payload) => {
  const win = getChildWindow(event);
  if (!win) return;
  const data = typeof payload === "string" ? JSON.parse(payload) : payload;
  const width = Math.max(120, Math.round(data.width || 120));
  const height = Math.max(80, Math.round(data.height || 80));
  win.setSize(width, height);
});

ipcRenderer.on("pin:opacity", (event, payload) => {
  const win = getChildWindow(event);
  if (!win) return;
  const data = typeof payload === "string" ? JSON.parse(payload) : payload;
  const opacity = Math.min(1, Math.max(0.25, Number(data.opacity) || 1));
  win.setOpacity(opacity);
});

ipcRenderer.on("editor:init", (event, payload) => {
  window.dispatchEvent(new CustomEvent("editor:init", { detail: payload }));
});

window.screenshotMarker = {
  captureScreen(options = {}) {
    return new Promise((resolve, reject) => {
      if (!window.utools || !window.utools.screenCapture) {
        reject(new Error("当前环境没有 uTools 截图 API"));
        return;
      }

      window.utools.hideMainWindow(true);
      setTimeout(() => {
        window.utools.screenCapture((image) => {
          if (options.restoreMainWindow !== false) {
            window.utools.showMainWindow();
          }
          if (image) {
            resolve(image);
          } else {
            reject(new Error("截图已取消"));
          }
        });
      }, 180);
    });
  },

  readImageFile(filePath) {
    if (!filePath) {
      throw new Error("图片路径为空");
    }
    const ext = path.extname(filePath).slice(1).toLowerCase() || "png";
    const mime = ext === "jpg" ? "jpeg" : ext;
    const buffer = fs.readFileSync(filePath);
    return `data:image/${mime};base64,${buffer.toString("base64")}`;
  },

  saveImage(dataUrl) {
    if (!window.utools || !window.utools.showSaveDialog) {
      throw new Error("当前环境没有 uTools 保存 API");
    }
    const savePath = window.utools.showSaveDialog({
      title: "保存标记图片",
      defaultPath: getDefaultImagePath(),
      filters: [{ name: "PNG 图片", extensions: ["png"] }],
      buttonLabel: "保存"
    });
    if (!savePath) {
      return null;
    }
    fs.writeFileSync(savePath, dataUrlToBuffer(dataUrl));
    return savePath;
  },

  copyImage(dataUrl) {
    const image = nativeImage.createFromDataURL(dataUrl);
    if (image.isEmpty()) {
      throw new Error("复制失败，图片为空");
    }
    clipboard.writeImage(image);
    return true;
  },

  pinImage(dataUrl) {
    return createPinWindow({ type: "image", dataUrl });
  },

  pinText(text) {
    return createPinWindow({ type: "text", text });
  },

  pinClipboard() {
    const image = clipboard.readImage();
    if (image && !image.isEmpty()) {
      createPinWindow({ type: "image", dataUrl: image.toDataURL() });
      return "已贴出剪贴板图片";
    }
    const text = clipboard.readText();
    if (text && text.trim()) {
      createPinWindow({ type: "text", text });
      return "已贴出剪贴板文本";
    }
    throw new Error("剪贴板中没有图片或文本");
  },

  openEditor(dataUrl) {
    return createEditorWindow(dataUrl);
  },

  closeWindow() {
    window.close();
  },

  showNotification(message) {
    if (window.utools && window.utools.showNotification) {
      window.utools.showNotification(message);
    }
  }
};
