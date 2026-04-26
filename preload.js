const fs = require("node:fs");
const path = require("node:path");
const { clipboard, ipcRenderer, nativeImage } = require("electron");

const pinWindows = new Map();

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
  const maxWidth = Math.max(240, Math.floor(bounds.width * 0.72));
  const maxHeight = Math.max(160, Math.floor(bounds.height * 0.72));
  const scale = Math.min(1, maxWidth / imageSize.width, maxHeight / imageSize.height);

  return {
    width: Math.max(120, Math.round(imageSize.width * scale)),
    height: Math.max(80, Math.round(imageSize.height * scale)),
    point,
    display,
    bounds
  };
}

function createPinWindow(dataUrl) {
  if (!window.utools || !window.utools.createBrowserWindow) {
    throw new Error("当前环境没有 uTools 独立窗口 API");
  }

  const image = nativeImage.createFromDataURL(dataUrl);
  const imageSize = image.getSize();
  if (image.isEmpty() || !imageSize.width || !imageSize.height) {
    throw new Error("贴图失败，图片为空");
  }

  const { width, height, point, bounds } = getPinSize(imageSize);
  const x = Math.min(
    Math.max(bounds.x || 0, point.x - Math.floor(width / 2)),
    (bounds.x || 0) + bounds.width - width
  );
  const y = Math.min(
    Math.max(bounds.y || 0, point.y - Math.floor(height / 2)),
    (bounds.y || 0) + bounds.height - height
  );

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
      pinWindows.set(win.webContents.id, win);
      win.webContents.send("pin:init", {
        dataUrl,
        width,
        height,
        naturalWidth: imageSize.width,
        naturalHeight: imageSize.height
      });
      win.setAlwaysOnTop(true, "screen-saver");
      win.show();
      win.focus();
    }
  );

  return true;
}

function getPinWindow(event) {
  return pinWindows.get(event.senderId);
}

ipcRenderer.on("pin:close", (event) => {
  const win = getPinWindow(event);
  if (!win) return;
  pinWindows.delete(event.senderId);
  win.destroy();
});

ipcRenderer.on("pin:resize", (event, payload) => {
  const win = getPinWindow(event);
  if (!win) return;
  const data = typeof payload === "string" ? JSON.parse(payload) : payload;
  const width = Math.max(120, Math.round(data.width || 120));
  const height = Math.max(80, Math.round(data.height || 80));
  win.setSize(width, height);
});

ipcRenderer.on("pin:opacity", (event, payload) => {
  const win = getPinWindow(event);
  if (!win) return;
  const data = typeof payload === "string" ? JSON.parse(payload) : payload;
  const opacity = Math.min(1, Math.max(0.25, Number(data.opacity) || 1));
  win.setOpacity(opacity);
});

window.screenshotMarker = {
  captureScreen() {
    return new Promise((resolve, reject) => {
      if (!window.utools || !window.utools.screenCapture) {
        reject(new Error("当前环境没有 uTools 截图 API"));
        return;
      }

      window.utools.hideMainWindow(true);
      setTimeout(() => {
        window.utools.screenCapture((image) => {
          window.utools.showMainWindow();
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
    return createPinWindow(dataUrl);
  },

  showNotification(message) {
    if (window.utools && window.utools.showNotification) {
      window.utools.showNotification(message);
    }
  }
};
