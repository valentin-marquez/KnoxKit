import { contextBridge, ipcRenderer } from "electron"
import { electronAPI } from "@electron-toolkit/preload"

const api = {
  createInstance: (config: unknown): Promise<void> => ipcRenderer.invoke("instance:create", config),
  openFileDialog: (
    options: unknown
  ): Promise<{
    filePath: string
    base64: string
    canceled: boolean
  }> => ipcRenderer.invoke("open-file-dialog", options),
  listInstances: (): Promise<unknown> => ipcRenderer.invoke("instance:list"),
  deleteInstance: (instanceId: string): Promise<unknown> =>
    ipcRenderer.invoke("instance:delete", instanceId),
  launchInstance: (instanceId: string): Promise<unknown> =>
    ipcRenderer.invoke("instance:launch", instanceId),
  updateInstance: (instanceId: string, updates: unknown): Promise<unknown> =>
    ipcRenderer.invoke("instance:update", { instanceId, updates })
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI)
    contextBridge.exposeInMainWorld("api", api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
