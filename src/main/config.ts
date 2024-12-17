// config.ts

import { BrowserWindow } from "electron"
import icon from "../../resources/icon.png?asset"
import path from "path"
import fs from "fs"

interface iConfig {
  appName: string
  icon: string
  mainWindow: BrowserWindow | null
  isDev: boolean
  isQuiting: boolean
  appDir: string
}

interface KnoxKitConfig {
  version: string
  steamcmd_setup: boolean
  last_run: string | null
  websocket: {
    host: string
    port: number
  }
  auth: {
    token: string
  }
  paths: {
    steamcmd: string
    instances: string
    mods: string
    logs: string
    game: string | null
    game_executable: string | null
  }
  instances: {
    default_settings: {
      memory: number
      java_args: string
      priority: string
    }
  }
  downloads: {
    concurrent_limit: number
    retry_attempts: number
    verify_integrity: boolean
  }
  performance: {
    auto_adjust: boolean
    presets: {
      [key: string]: {
        memory: number
        java_args: string
      }
    }
  }
}

const config: iConfig = {
  appName: "com.nozz.knoxkit",
  icon,
  mainWindow: null,
  isDev: process.env.NODE_ENV === "development",
  isQuiting: false,
  appDir: path.join(process.env.LOCALAPPDATA || "", "knoxkit")
}

export function readConfig(): KnoxKitConfig {
  const configPath = path.join(config.appDir, "config.json")

  try {
    if (!fs.existsSync(configPath)) {
      throw new Error("Config file not found")
    }

    const rawConfig = fs.readFileSync(configPath, "utf-8")
    const parsedConfig = JSON.parse(rawConfig) as KnoxKitConfig

    // Validate required fields
    if (!parsedConfig.auth?.token) {
      throw new Error("Invalid config: missing auth token")
    }

    return parsedConfig
  } catch (error) {
    console.error("Failed to read config:", error)
    // Return default config
    return {
      version: "0.1.0",
      steamcmd_setup: false,
      last_run: null,
      websocket: {
        host: "localhost",
        port: 16271
      },
      auth: {
        token: crypto.randomUUID() // Generate new token if none exists
      },
      paths: {
        steamcmd: path.join(config.appDir, "steamcmd"),
        instances: path.join(config.appDir, "instances"),
        mods: path.join(config.appDir, "mods"),
        logs: path.join(config.appDir, "logs"),
        game: null,
        game_executable: null
      },
      instances: {
        default_settings: {
          memory: 4096,
          java_args: "-Xms2048m -Xmx4096m",
          priority: "normal"
        }
      },
      downloads: {
        concurrent_limit: 1,
        retry_attempts: 3,
        verify_integrity: true
      },
      performance: {
        auto_adjust: true,
        presets: {
          low: {
            memory: 2048,
            java_args: "-Xms1024m -Xmx2048m"
          },
          medium: {
            memory: 4096,
            java_args: "-Xms2048m -Xmx4096m"
          },
          high: {
            memory: 8192,
            java_args: "-Xms4096m -Xmx8192m"
          }
        }
      }
    }
  }
}

export default config
