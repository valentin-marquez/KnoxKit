import { ElectronAPI } from "@electron-toolkit/preload"

interface InstanceUpdatePayload {
  instanceId: string
  updates: Partial<BaseInstanceConfig>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      createInstance(config: BaseInstanceConfig): Promise<string>
      openFileDialog: (options: unknown) => Promise<{
        filePath: string
        base64: string
        canceled: boolean
      }>
      listInstances(): Promise<BaseInstanceConfig[]>
      deleteInstance(instanceId: string): Promise<{ success: boolean; error?: string }>
      launchInstance(
        instanceId: string
      ): Promise<{ success: boolean; message?: string; error?: string }>
      updateInstance(payload: InstanceUpdatePayload): Promise<{ success: boolean; error?: string }>
    }
  }
}
