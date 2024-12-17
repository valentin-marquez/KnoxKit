import React from "react"
import { Minus, Square, X } from "lucide-react"
import { Button } from "./ui/button"
import { cn } from "@renderer/lib/utils"

const TitleBar: React.FC = () => {
  const handleMinimize = (): void => {
    window.electron.ipcRenderer.send("minimize-window")
  }

  const handleMaximize = (): void => {
    window.electron.ipcRenderer.send("maximize-window")
  }

  const handleClose = (): void => {
    window.electron.ipcRenderer.send("close-window")
  }

  return (
    <div className="h-9 flex justify-between items-center bg-background select-none z-50">
      {/* Draggable area with title */}
      <div className={cn("flex h-full border-b", "cursor-move", "select-none", "border-border")}>
        <h1
          className="pl-4 flex items-center text-sm font-medium"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          Knoxkit
        </h1>
        <div className="flex-1 h-full" style={{ WebkitAppRegion: "drag" } as React.CSSProperties} />
      </div>
      <div
        className="flex-1 h-full border-b"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      <div
        className="flex h-full border-b"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-12 rounded-none hover:bg-secondary"
          onClick={handleMinimize}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-12 rounded-none hover:bg-secondary"
          onClick={handleMaximize}
        >
          <Square className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-12 rounded-none hover:bg-destructive hover:text-destructive-foreground"
          onClick={handleClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export default TitleBar
