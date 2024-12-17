import path from "path"
import fs from "fs/promises"
import { v4 as uuidv4 } from "uuid"
import { readConfig } from "./config"
import { BaseInstanceConfig, InstanceData, InstanceSettings, InstanceStatus } from "./types"
import { InstanceLauncher } from "./instance-launcher"

export class InstanceManager {
  private config = readConfig()
  private readonly MODS_DIR = "mods"
  private launcher = new InstanceLauncher()
  private runningInstances: Map<string, number> = new Map()

  constructor() {
    this.launcher = new InstanceLauncher()
  }

  async launchInstance(instanceId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Get instance configuration
      const instancePath = path.join(this.config.paths.instances, instanceId)
      const instanceConfigPath = path.join(instancePath, "instance.json")

      const instanceConfigRaw = await fs.readFile(instanceConfigPath, "utf-8")
      const instanceConfig: InstanceData = JSON.parse(instanceConfigRaw)

      // Launch the instance
      const result = await this.launcher.launch({
        instanceId,
        instancePath,
        memory: instanceConfig.memory || this.config.instances.default_settings.memory,
        javaArgs: instanceConfig.javaArgs || this.config.instances.default_settings.java_args
      })

      if (result.success && result.processId) {
        this.runningInstances.set(instanceId, result.processId)
      }

      return result
    } catch (error) {
      console.error("Error launching instance:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to launch instance"
      }
    }
  }

  private async saveBase64AsImage(base64Data: string, instanceId: string): Promise<string | null> {
    try {
      if (!base64Data) return null

      const matches = base64Data.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/)
      if (!matches) return null

      const [, extension, data] = matches
      const iconFileName = `icon.${extension}`
      const instanceConfigDir = path.join(this.config.paths.instances, instanceId)
      const iconPath = path.join(instanceConfigDir, iconFileName)

      // Ensure config directory exists
      await fs.mkdir(instanceConfigDir, { recursive: true })

      const buffer = Buffer.from(data, "base64")
      await fs.writeFile(iconPath, buffer)

      return iconFileName
    } catch (error) {
      console.error("Error saving icon:", error)
      return null
    }
  }

  async createInstance(instanceConfig: BaseInstanceConfig): Promise<string> {
    const instanceId = uuidv4()
    const instanceDir = path.join(this.config.paths.instances, instanceId)

    // Create instance directory
    await fs.mkdir(instanceDir, { recursive: true })

    // Save icon if provided
    const iconFileName = instanceConfig.iconBase64
      ? await this.saveBase64AsImage(instanceConfig.iconBase64, instanceId)
      : null

    // Prepare default settings with improved defaults
    const defaultSettings: InstanceSettings = {
      backup_enabled: true,
      backup_interval: 60,
      auto_update: true,
      custom_launch_options: "",
      max_backups: 5,
      compress_backups: true,
      auto_restart: false,
      restart_interval: 24, // hours
      ...this.config.instances.default_settings,
      memory: instanceConfig.memory,
      java_args: instanceConfig.javaArgs ?? "-Xmx2048M -XX:+UseG1GC"
    }

    // Create instance data with additional fields
    const instanceData: InstanceData = {
      id: instanceId,
      name: instanceConfig.name,
      memory: instanceConfig.memory,
      javaArgs: instanceConfig.javaArgs ?? defaultSettings.java_args,
      created: new Date().toISOString(),
      lastPlayed: undefined,
      playtime: 0,
      iconPath: iconFileName
        ? `media:${path.join(this.config.paths.instances, instanceId, iconFileName)}`
        : null,
      steamCollection: instanceConfig.steamCollection || null,
      status: "ready" as InstanceStatus,
      version: "1.0.0",
      settings: defaultSettings,
      lastBackup: undefined,
      modCount: 0,
      description: instanceConfig.description || "",
      tags: instanceConfig.tags || []
    }

    // Create required directories with improved structure
    const directories = [path.join(instanceDir, this.MODS_DIR)]

    await Promise.all(directories.map((dir) => fs.mkdir(dir, { recursive: true })))

    // Write instance config
    await fs.writeFile(
      path.join(instanceDir, "instance.json"),
      JSON.stringify(instanceData, null, 2)
    )

    return instanceId
  }

  async updateInstance(instanceId: string, updates: Partial<BaseInstanceConfig>): Promise<void> {
    const instanceDir = path.join(this.config.paths.instances, instanceId)
    const configPath = path.join(instanceDir, "instance.json")

    const currentData = JSON.parse(await fs.readFile(configPath, "utf-8")) as InstanceData

    // Handle icon update if provided
    let iconFileName = currentData.iconPath
    if (updates.iconBase64) {
      // Delete old icon if exists
      if (currentData.iconPath) {
        const oldIconPath = path.join(instanceDir, currentData.iconPath)
        await fs.unlink(oldIconPath).catch(() => {}) // Ignore error if file doesn't exist
      }

      const newIconName = await this.saveBase64AsImage(updates.iconBase64, instanceId)
      iconFileName = newIconName
        ? path.join(this.config.paths.instances, instanceId, newIconName)
        : null
    }

    const updatedData: InstanceData = {
      ...currentData,
      ...updates,
      iconPath: iconFileName,
      settings: {
        ...currentData.settings,
        memory: updates.memory ?? currentData.settings.memory,
        java_args: updates.javaArgs ?? currentData.settings.java_args
      }
    }

    await fs.writeFile(configPath, JSON.stringify(updatedData, null, 2))
  }

  async deleteInstance(instanceId: string): Promise<void> {
    const instanceDir = path.join(this.config.paths.instances, instanceId)
    await fs.rm(instanceDir, { recursive: true, force: true })
  }

  async getInstance(instanceId: string): Promise<InstanceData | null> {
    try {
      const configPath = path.join(this.config.paths.instances, instanceId, "instance.json")
      return JSON.parse(await fs.readFile(configPath, "utf-8")) as InstanceData
    } catch (error) {
      return null
    }
  }

  async listInstances(): Promise<InstanceData[]> {
    const instancesDir = this.config.paths.instances
    const instances: InstanceData[] = []

    const dirs = await fs.readdir(instancesDir)

    for (const dir of dirs) {
      try {
        const configPath = path.join(instancesDir, dir, "instance.json")
        const data = JSON.parse(await fs.readFile(configPath, "utf-8")) as InstanceData
        instances.push(data)
      } catch (error) {
        console.error(`Error reading instance ${dir}:`, error)
      }
    }

    return instances
  }

  // New utility methods
  async getInstanceSize(instanceId: string): Promise<number> {
    const instanceDir = path.join(this.config.paths.instances, instanceId)
    let totalSize = 0

    async function calculateDirSize(dirPath: string): Promise<number> {
      const files = await fs.readdir(dirPath, { withFileTypes: true })
      let size = 0

      for (const file of files) {
        const filePath = path.join(dirPath, file.name)
        if (file.isDirectory()) {
          size += await calculateDirSize(filePath)
        } else {
          const stat = await fs.stat(filePath)
          size += stat.size
        }
      }

      return size
    }

    try {
      totalSize = await calculateDirSize(instanceDir)
    } catch (error) {
      console.error(`Error calculating size for instance ${instanceId}:`, error)
    }

    return totalSize
  }

  async updateInstanceStatus(instanceId: string, status: InstanceStatus): Promise<void> {
    await this.updateInstance(instanceId, { status } as Partial<BaseInstanceConfig>)
  }

  async updatePlaytime(instanceId: string, playtime: number): Promise<void> {
    const instance = await this.getInstance(instanceId)
    if (instance) {
      await this.updateInstance(instanceId, {
        playtime,
        lastPlayed: new Date().toISOString()
      } as Partial<BaseInstanceConfig>)
    }
  }
}
