const fs = require("node:fs");
const path = require("node:path");
const { clipboard, desktopCapturer, ipcRenderer, nativeImage } = require("electron");

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

function clampNumber(value, min, max) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function getEditorFrame(options) {
  const bounds = options.bounds || { x: 0, y: 0, width: 1200, height: 800 };
  const screenLeft = bounds.x || 0;
  const screenTop = bounds.y || 0;
  const screenRight = screenLeft + bounds.width;
  const imageX = Math.round(options.imageX !== undefined ? options.imageX : screenLeft);
  const imageY = Math.round(options.imageY !== undefined ? options.imageY : screenTop);
  const imageWidth = Math.max(1, Math.round(options.imageWidth || 1));
  const imageHeight = Math.max(1, Math.round(options.imageHeight || 1));
  const toolbarWidth = Math.max(120, Math.round(options.toolbarWidth || 1040));
  const toolbarHeight = Math.max(40, Math.round(options.toolbarHeight || 58));
  const padding = Math.max(0, Math.round(options.padding || 8));
  const toolbarRightLimit = Math.max(screenLeft, screenRight - Math.min(toolbarWidth, bounds.width));
  const toolbarX = clampNumber(imageX, screenLeft, toolbarRightLimit);
  const x = Math.max(screenLeft, Math.min(imageX - padding, toolbarX - padding, imageX));
  const y = Math.max(screenTop, imageY - padding);
  const imageOffsetX = Math.max(0, imageX - x);
  const imageOffsetY = Math.max(0, imageY - y);
  const toolbarOffsetX = Math.max(0, toolbarX - x);
  const toolbarOffsetY = imageOffsetY + imageHeight;
  const width = Math.max(
    120,
    imageOffsetX + imageWidth,
    toolbarOffsetX + toolbarWidth
  );
  const height = Math.max(
    80,
    imageOffsetY + imageHeight,
    toolbarOffsetY + toolbarHeight
  );

  return {
    x,
    y,
    width,
    height,
    imageOffsetX,
    imageOffsetY,
    toolbarOffsetX
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withCacheBust(file) {
  return `${file}?v=${Date.now()}`;
}

function getCurrentDisplay() {
  const point = window.utools.getCursorScreenPoint();
  const display = window.utools.getDisplayNearestPoint(point);
  return display || {
    id: "primary",
    bounds: { x: 0, y: 0, width: 1200, height: 800 },
    workArea: { x: 0, y: 0, width: 1200, height: 800 },
    scaleFactor: 1
  };
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

function createEditorWindow(dataUrl, options = {}) {
  if (!window.utools || !window.utools.createBrowserWindow) {
    throw new Error("当前环境没有 uTools 独立窗口 API");
  }
  const image = nativeImage.createFromDataURL(dataUrl);
  const imageSize = image.getSize();
  if (image.isEmpty() || !imageSize.width || !imageSize.height) {
    throw new Error("截图图片为空");
  }
  const hasCropSource = Boolean(options.sourceDataUrl && options.cropRect && options.screenBounds);
  const hasSelectionPosition = options.windowX !== undefined && options.windowY !== undefined;
  const selectionDisplay = hasSelectionPosition && window.utools && window.utools.getDisplayNearestPoint
    ? window.utools.getDisplayNearestPoint({ x: options.windowX, y: options.windowY })
    : null;
  const display = selectionDisplay || getCurrentDisplay();
  const bounds = options.screenBounds || display.bounds || display.workArea || { width: 1200, height: 800 };
  const actualSize = options.displayWidth && options.displayHeight
    ? { width: options.displayWidth, height: options.displayHeight }
    : { width: imageSize.width, height: imageSize.height };
  const toolbarHeight = 58;
  const maxWidth = Math.max(260, bounds.width - 16);
  const maxImageHeight = Math.max(160, bounds.height - toolbarHeight - 16);
  const scale = Math.min(1, maxWidth / actualSize.width, maxImageHeight / actualSize.height);
  const displayWidth = Math.max(1, Math.round(actualSize.width * scale));
  const displayHeight = Math.max(1, Math.round(actualSize.height * scale));
  const toolbarWidth = 1040;
  let imageOffsetX = 0;
  let imageOffsetY = 0;
  let toolbarOffsetX = 0;
  let width = Math.max(toolbarWidth, displayWidth);
  let height = displayHeight + toolbarHeight;
  let position;

  if (hasCropSource) {
    const cropRect = options.cropRect;
    imageOffsetX = Math.max(0, Math.round(cropRect.x || 0));
    imageOffsetY = Math.max(0, Math.round(cropRect.y || 0));
    toolbarOffsetX = clampNumber(imageOffsetX, 8, Math.max(8, bounds.width - toolbarWidth - 8));
    width = bounds.width;
    height = bounds.height;
    position = { x: bounds.x || 0, y: bounds.y || 0 };
  } else if (hasSelectionPosition) {
    const desiredImageX = Math.round(options.windowX);
    const desiredImageY = Math.round(options.windowY);
    const frame = getEditorFrame({
      bounds,
      imageX: desiredImageX,
      imageY: desiredImageY,
      imageWidth: displayWidth,
      imageHeight: displayHeight,
      toolbarWidth,
      toolbarHeight
    });
    imageOffsetX = frame.imageOffsetX;
    imageOffsetY = frame.imageOffsetY;
    toolbarOffsetX = frame.toolbarOffsetX;
    width = frame.width;
    height = frame.height;
    position = { x: frame.x, y: frame.y };
  } else {
    position = getEditorWindowPosition(width, height);
  }

  const x = position.x;
  const y = position.y;
  const win = window.utools.createBrowserWindow(
    withCacheBust("editor.html"),
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
      resizable: !hasCropSource,
      movable: !hasCropSource,
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
        sourceDataUrl: options.sourceDataUrl,
        screenBounds: options.screenBounds,
        cropRect: options.cropRect,
        sourcePixelWidth: options.sourcePixelWidth,
        sourcePixelHeight: options.sourcePixelHeight,
        overlayEditor: hasCropSource,
        displayWidth,
        displayHeight,
        imageOffsetX,
        imageOffsetY,
        toolbarOffsetX,
        pixelWidth: imageSize.width,
        pixelHeight: imageSize.height
      });
      try {
        win.setBackgroundColor("#00000000");
      } catch (error) {}
      try {
        win.setPosition(x, y);
      } catch (error) {}
      win.setAlwaysOnTop(true, "screen-saver");
      win.show();
      win.focus();
    }
  );
  return true;
}

async function captureCurrentDisplay() {
  if (!desktopCapturer || !desktopCapturer.getSources) {
    throw new Error("当前环境没有桌面截图能力");
  }

  const display = getCurrentDisplay();
  const bounds = display.bounds || display.workArea || { x: 0, y: 0, width: 1200, height: 800 };
  const scaleFactor = display.scaleFactor || 1;
  const thumbnailSize = {
    width: Math.max(1, Math.round(bounds.width * scaleFactor)),
    height: Math.max(1, Math.round(bounds.height * scaleFactor))
  };
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize
  });
  const source = sources.find((item) => String(item.display_id) === String(display.id)) || sources[0];
  if (!source || source.thumbnail.isEmpty()) {
    throw new Error("获取屏幕图像失败");
  }
  const imageSize = source.thumbnail.getSize();
  return {
    dataUrl: source.thumbnail.toDataURL(),
    display,
    bounds,
    pixelWidth: imageSize.width,
    pixelHeight: imageSize.height,
    scaleX: imageSize.width / bounds.width,
    scaleY: imageSize.height / bounds.height
  };
}

async function openSelectionWindow() {
  if (!window.utools || !window.utools.createBrowserWindow) {
    throw new Error("当前环境没有 uTools 独立窗口 API");
  }

  window.utools.hideMainWindow(true);
  await sleep(180);
  const capture = await captureCurrentDisplay();
  const bounds = capture.bounds;
  const win = window.utools.createBrowserWindow(
    withCacheBust("selection.html"),
    {
      show: false,
      x: bounds.x || 0,
      y: bounds.y || 0,
      width: bounds.width,
      height: bounds.height,
      useContentSize: true,
      frame: false,
      thickFrame: false,
      transparent: false,
      backgroundColor: "#000000",
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      fullscreenable: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: "selection-preload.js"
      }
    },
    () => {
      childWindows.set(win.webContents.id, win);
      win.webContents.send("selection:init", {
        dataUrl: capture.dataUrl,
        pixelWidth: capture.pixelWidth,
        pixelHeight: capture.pixelHeight,
        bounds: capture.bounds,
        scaleX: capture.scaleX,
        scaleY: capture.scaleY
      });
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

ipcRenderer.on("editor:resize", (event, payload) => {
  const win = getChildWindow(event);
  if (!win) return;
  const data = typeof payload === "string" ? JSON.parse(payload) : payload;
  const width = Math.max(120, Math.round(data.width || 120));
  const height = Math.max(80, Math.round(data.height || 80));
  win.setSize(width, height);
});

ipcRenderer.on("editor:layout", (event, payload) => {
  const win = getChildWindow(event);
  if (!win) return;
  const data = typeof payload === "string" ? JSON.parse(payload) : payload;
  const bounds = {
    x: Math.round(Number(data.x) || 0),
    y: Math.round(Number(data.y) || 0),
    width: Math.max(120, Math.round(Number(data.width) || 120)),
    height: Math.max(80, Math.round(Number(data.height) || 80))
  };
  try {
    win.setBounds(bounds);
  } catch (error) {
    win.setPosition(bounds.x, bounds.y);
    win.setSize(bounds.width, bounds.height);
  }
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

ipcRenderer.on("selection:cancel", (event) => {
  const win = getChildWindow(event);
  if (win) {
    childWindows.delete(event.senderId);
    win.destroy();
  }
});

ipcRenderer.on("selection:complete", (event, payload) => {
  const data = typeof payload === "string" ? JSON.parse(payload) : payload;
  const win = getChildWindow(event);
  if (win) {
    childWindows.delete(event.senderId);
    win.destroy();
  }
  createEditorWindow(data.dataUrl, {
    sourceDataUrl: data.sourceDataUrl,
    screenBounds: data.screenBounds,
    cropRect: data.cropRect,
    sourcePixelWidth: data.sourcePixelWidth,
    sourcePixelHeight: data.sourcePixelHeight,
    displayWidth: data.displayWidth,
    displayHeight: data.displayHeight,
    pixelWidth: data.pixelWidth,
    pixelHeight: data.pixelHeight,
    windowX: data.windowX,
    windowY: data.windowY
  });
});

window.screenshotMarker = {
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

  resizeEditor(size) {
    if (window.utools && window.utools.sendToParent) {
      window.utools.sendToParent("editor:resize", JSON.stringify(size));
    }
  },

  layoutEditor(frame) {
    if (window.utools && window.utools.sendToParent) {
      window.utools.sendToParent("editor:layout", JSON.stringify(frame));
    }
  },

  openSelection() {
    return openSelectionWindow();
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
