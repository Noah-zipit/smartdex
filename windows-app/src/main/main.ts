import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { ConnectionManager } from "./connection";

let win: BrowserWindow | null = null;
let manager: ConnectionManager;

function createWindow(): void {
  win = new BrowserWindow({
    width: 760,
    height: 640,
    title: "SmartDex",
    backgroundColor: "#111418",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu();
  win.loadFile(join(__dirname, "..", "renderer", "index.html"));
}

app.whenReady().then(() => {
  manager = new ConnectionManager({
    log: (text) => win?.webContents.send("smartdex:log", text),
    state: (state, detail) => win?.webContents.send("smartdex:state", state, detail),
    rebootNeeded: (needed) => win?.webContents.send("smartdex:reboot", needed),
  });

  ipcMain.handle("smartdex:connect", () => manager.connect());
  ipcMain.handle("smartdex:disconnect", () => manager.disconnect());
  ipcMain.handle("smartdex:get-state", () => ({
    state: manager.currentState,
    rebootNeeded: manager.rebootNeeded,
  }));
  ipcMain.handle("smartdex:get-checklist", () => manager.getChecklist());

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  // Never leave the phone in a weird state: kill scrcpy on exit.
  manager?.disconnect();
});
