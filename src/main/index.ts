import { app, shell, BrowserWindow, ipcMain, dialog, protocol, net } from "electron"
import { join } from "path"
import { electronApp, optimizer, is } from "@electron-toolkit/utils"
import config from "./config"
import { WebSocketService } from "./websocket"
import { InstanceManager } from "./intance-manager"
import { readFile } from "fs/promises"

const instanceManager = new InstanceManager()

let wsService: WebSocketService

function createWindow(): void {
  // Create the browser window.
  config.mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1122,
    minHeight: 752,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    ...(process.platform === "linux" ? { icon: config.icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      devTools: is.dev
    }
  })

  // Initialize WebSocket service without auth token
  wsService = new WebSocketService(config.mainWindow)

  config.mainWindow.on("ready-to-show", () => {
    config.mainWindow?.show()
  })

  config.mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: "deny" }
  })

  // Window control IPC handlers
  ipcMain.on("minimize-window", () => {
    config.mainWindow?.minimize()
  })

  ipcMain.on("maximize-window", () => {
    if (config.mainWindow?.isMaximized()) {
      config.mainWindow?.restore()
    } else {
      config.mainWindow?.maximize()
    }
  })

  ipcMain.on("close-window", () => {
    config.mainWindow?.close()
  })

  // WebSocket message handler
  ipcMain.on("ws:send", (_, message) => {
    console.log("Sending message to websocket:", message)
    console.log("Message type:", typeof message) // string
    wsService.sendMessage(message)
  })

  // HMR for renderer base on electron-vite cli.
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    config.mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"])
  } else {
    config.mainWindow.loadFile(join(__dirname, "../renderer/index.html"))
  }
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "media",
    privileges: {
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true
    }
  }
])

// App initialization
app.whenReady().then(() => {
  electronApp.setAppUserModelId(config.appName)

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  protocol.handle("media", (req) => {
    const pathToMedia = new URL(req.url).pathname
    return net.fetch(`file://${pathToMedia}`)
  })
  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit handling
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

ipcMain.handle("instance:create", async (_, config) => {
  try {
    const instancePath = await instanceManager.createInstance(config)

    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send("instance:created")
    })

    return {
      success: true,
      instanceId: instancePath // Ensure this matches what the frontend expects
    }
  } catch (error: unknown) {
    console.error("Failed to create instance:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
})

ipcMain.handle("open-file-dialog", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["jpg", "png", "gif", "jpeg"] }]
  })

  if (result.canceled || !result.filePaths[0]) {
    return {
      filePath: "",
      base64: "",
      canceled: true
    }
  }

  // Leer el archivo y convertirlo a base64
  const fileBuffer = await readFile(result.filePaths[0])
  const base64 = fileBuffer.toString("base64")
  const extension = result.filePaths[0].split(".").pop()?.toLowerCase()

  return {
    filePath: result.filePaths[0],
    base64: `data:image/${extension};base64,${base64}`,
    canceled: false
  }
})

ipcMain.handle("instance:list", async () => {
  try {
    const instances = await instanceManager.listInstances()
    return instances
  } catch (error) {
    console.error("Failed to list instances:", error)
    return []
  }
})

ipcMain.handle("instance:delete", async (_, instanceId) => {
  try {
    await instanceManager.deleteInstance(instanceId)
    return { success: true }
  } catch (error) {
    console.error("Failed to delete instance:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
})

ipcMain.handle("instance:launch", async (_, instanceId) => {
  try {
    const result = await instanceManager.launchInstance(instanceId)
    console.log("Instance launch result:", result)
    if (result.success) {
      // Notify renderer process about instance status change
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("instance:status-changed", {
          instanceId,
          status: "running"
        })
      })
    }

    return result
  } catch (error) {
    console.error("Failed to launch instance:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
})

ipcMain.handle("instance:update", async (_, { instanceId, updates }) => {
  try {
    await instanceManager.updateInstance(instanceId, updates)
    return { success: true }
  } catch (error) {
    console.error("Failed to update instance:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
})
