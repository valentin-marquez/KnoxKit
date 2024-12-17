// services/WebSocketService.ts

import { BrowserWindow } from "electron"
import WebSocket from "ws"
import {
  ClientMessage,
  ServerMessage,
  WebSocketEvents,
  WebSocketStatus,
  WorkshopItemRequest,
  WorkshopItemResponse,
  WorkshopCollectionResponse
} from "./types"

export class WebSocketService {
  private ws: WebSocket | null = null
  private mainWindow: BrowserWindow
  private reconnectTimer: NodeJS.Timeout | null = null
  private readonly WEBSOCKET_URL = "ws://127.0.0.1:16271"
  private readonly RECONNECT_DELAY = 5000

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
    this.connect()
  }

  private connect(): void {
    try {
      this.ws = new WebSocket(this.WEBSOCKET_URL)
      this.setupEventListeners()
    } catch (err) {
      console.error("Failed to connect:", err)
      this.scheduleReconnect()
    }
  }

  private setupEventListeners(): void {
    if (!this.ws) return

    this.ws.on("open", this.handleOpen.bind(this))
    this.ws.on("message", (data: WebSocket.RawData) => {
      try {
        const message = JSON.parse(data.toString())
        this.handleMessage(message)
      } catch (err) {
        console.error("Failed to parse WebSocket message:", err)
      }
    })
    this.ws.on("close", this.handleClose.bind(this))
    this.ws.on("error", this.handleError.bind(this))
  }

  private handleOpen(): void {
    this.emitStatus({ connected: true })
    // Request initial status on connection
    this.sendMessage({ type: "server_status" })
  }

  private handleMessage(
    message:
      | ServerMessage
      | WorkshopItemResponse
      | WorkshopCollectionResponse
      | { type: string; message?: string }
  ): void {
    if (!message || typeof message !== "object" || !message.type) {
      console.warn("Invalid message received:", message)
      return
    }

    switch (message.type) {
      case "download_started":
      case "download_complete":
      case "status":
      case "server_status":
        this.emitMessage(message as ServerMessage)
        break

      case "item_info":
      case "initial_info":
        this.emitMessage(message as WorkshopItemResponse)
        break

      case "collection_info":
        this.emitMessage(message as WorkshopCollectionResponse)
        break

      case "error":
        this.emitError({ message: message.message || "Unknown error" })
        break

      default:
        console.warn("Unhandled message type:", message.type)
    }
  }

  private handleClose(): void {
    this.emitStatus({ connected: false })
    this.scheduleReconnect()
  }

  private handleError(error: Error): void {
    console.error("WebSocket error:", error)
    this.emitError({ message: error.message })
  }

  private emitStatus(status: WebSocketStatus): void {
    this.emit("ws:status", status)
  }

  private emitMessage(message: ServerMessage): void {
    this.emit("ws:message", message)
  }

  private emitError(error: { message: string }): void {
    this.emit("ws:error", error)
  }

  private emit<K extends keyof WebSocketEvents>(channel: K, data: WebSocketEvents[K]): void {
    this.mainWindow.webContents.send(channel, data)
  }

  public sendMessage(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log("Sending message:", message)
      this.ws.send(JSON.stringify(message))
    } else {
      console.warn("WebSocket is not connected. Message not sent:", message)
    }
  }

  public async requestWorkshopItem(
    workshopId: string,
    isCollection: boolean = false
  ): Promise<void> {
    const message: WorkshopItemRequest = {
      type: "workshop_item",
      workshop_id: workshopId,
      is_collection: isCollection
    }
    this.sendMessage(message)
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }
    this.reconnectTimer = setTimeout(() => this.connect(), this.RECONNECT_DELAY)
  }

  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}
