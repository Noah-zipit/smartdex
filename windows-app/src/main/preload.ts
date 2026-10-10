import { contextBridge, ipcRenderer } from "electron";

export interface SmartDexApi {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getState(): Promise<{ state: string; rebootNeeded: boolean }>;
  getChecklist(): Promise<{
    adbAvailable: boolean;
    deviceDetected: boolean;
    deviceAuthorized: boolean;
    freeformEnabled: boolean;
  }>;
  onLog(cb: (text: string) => void): void;
  onState(cb: (state: string, detail?: string) => void): void;
  onReboot(cb: (needed: boolean) => void): void;
}

const api: SmartDexApi = {
  connect: () => ipcRenderer.invoke("smartdex:connect"),
  disconnect: () => ipcRenderer.invoke("smartdex:disconnect"),
  getState: () => ipcRenderer.invoke("smartdex:get-state"),
  getChecklist: () => ipcRenderer.invoke("smartdex:get-checklist"),
  onLog: (cb) => ipcRenderer.on("smartdex:log", (_e, text: string) => cb(text)),
  onState: (cb) => ipcRenderer.on("smartdex:state", (_e, state: string, detail?: string) => cb(state, detail)),
  onReboot: (cb) => ipcRenderer.on("smartdex:reboot", (_e, needed: boolean) => cb(needed)),
};

contextBridge.exposeInMainWorld("smartdex", api);
