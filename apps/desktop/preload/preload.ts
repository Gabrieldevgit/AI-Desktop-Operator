import { contextBridge, ipcRenderer } from "electron";

/** Narrow, explicit bridge. No generic invoke, no Node, no filesystem. */
const api = {
  getStatus: () => ipcRenderer.invoke("dts:get-status") as Promise<StatusDto>,
  authorize: () => ipcRenderer.invoke("dts:authorize") as Promise<StatusDto>,
  takeControl: () => ipcRenderer.invoke("dts:take-control") as Promise<StatusDto>,
  resume: () => ipcRenderer.invoke("dts:resume") as Promise<StatusDto>,
};

export interface StatusDto {
  authorized: boolean;
  userControlled: boolean;
  platform: "simulated" | "windows";
  version: string;
}
export type DtsApi = typeof api;

contextBridge.exposeInMainWorld("dts", api);
