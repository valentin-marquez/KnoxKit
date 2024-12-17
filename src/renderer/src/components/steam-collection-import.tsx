import React, { useState, useEffect } from "react"
import { Input } from "./ui/input"
import { Button } from "./ui/button"
import { RefreshCw, Download, ExternalLink, Package } from "lucide-react"
import { Progress } from "./ui/progress"
import { Card, CardContent } from "./ui/card"
import { toast } from "../hooks/use-toast"

interface WorkshopMod {
  id: string
  name: string
  description: string
  imageUrl: string
  size: string
  downloadStatus?: "pending" | "downloading" | "completed" | "error"
  progress?: number
}

interface ImportState {
  step: "input" | "preview" | "downloading"
  workshopUrl: string
  mods: WorkshopMod[]
  currentDownload: number
  totalDownloaded: number
  overallProgress: number
}

const SteamWorkshopImport = ({ onClose }: { onClose: () => void }) => {
  const [state, setState] = useState<ImportState>({
    step: "input",
    workshopUrl: "",
    mods: [],
    currentDownload: 0,
    totalDownloaded: 0,
    overallProgress: 0
  })

  const [loading, setLoading] = useState(false)

  const extractWorkshopId = (url: string): string | null => {
    try {
      const urlObj = new URL(url)
      const id = urlObj.searchParams.get("id")
      return id
    } catch (error) {
      return null
    }
  }

  useEffect(() => {
    const handleMessage = (_: unknown, message: unknown): void => {
      try {
        const data = typeof message === "string" ? JSON.parse(message) : message

        switch (data.type) {
          case "item_info":
          case "initial_info":
            // Handle single item info
            if (data.data) {
              const newMod: WorkshopMod = {
                id: data.data.id,
                name: data.data.title || "Unknown Mod",
                description: data.data.description || "",
                imageUrl: data.data.preview_url || "",
                size: data.data.file_size || "Unknown size",
                downloadStatus: "pending"
              }
              setState((prev) => ({
                ...prev,
                step: "preview",
                mods: [...prev.mods, newMod]
              }))
            }
            break

          case "collection_info":
            // Handle collection info
            if (data.data && Array.isArray(data.data.items)) {
              const newMods = data.data.items.map((item) => ({
                id: item.id,
                name: item.title || "Unknown Mod",
                description: "",
                imageUrl: "",
                size: "Fetching...",
                downloadStatus: "pending"
              }))
              setState((prev) => ({
                ...prev,
                step: "preview",
                mods: newMods
              }))
            }
            break

          case "workshop_progress":
            // Handle download progress
            setState((prev) => ({
              ...prev,
              mods: prev.mods.map((mod) =>
                mod.id === data.mod_id
                  ? {
                      ...mod,
                      progress: data.progress,
                      downloadStatus: data.status
                    }
                  : mod
              ),
              overallProgress: data.overall_progress || prev.overallProgress
            }))
            break

          case "error":
            toast({
              title: "Error",
              description: data.message,
              variant: "destructive"
            })
            break
        }
      } catch (error) {
        console.error("Error handling WebSocket message:", error)
        toast({
          title: "Error",
          description: "Failed to process server response",
          variant: "destructive"
        })
      }
    }

    window.electron.ipcRenderer.on("ws:message", handleMessage)

    return () => {
      window.electron.ipcRenderer.removeListener("ws:message", handleMessage)
    }
  }, [])

  const fetchWorkshopInfo = async () => {
    const workshopId = extractWorkshopId(state.workshopUrl)

    if (!workshopId) {
      toast({
        title: "Error",
        description: "Please enter a valid Steam Workshop Collection URL",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    setState((prev) => ({ ...prev, mods: [] }))

    try {
      const message = {
        type: "workshop",
        workshop_id: workshopId,
        is_collection: true
      }

      window.electron.ipcRenderer.send("ws:send", JSON.stringify(message))
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch Workshop information",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const startDownload = async () => {
    setState((prev) => ({ ...prev, step: "downloading" }))

    try {
      const message = {
        type: "download",
        app_id: 108600, // Project Zomboid's Steam App ID
        workshop_ids: state.mods.map((mod) => mod.id),
        destination: "mods"
      }

      window.electron.ipcRenderer.send("ws:send", JSON.stringify(message))
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start download",
        variant: "destructive"
      })
    }
  }

  const renderInput = () => (
    <div className="space-y-4">
      <div className="flex items-center space-x-3">
        <Input
          placeholder="Enter Steam Workshop Collection URL"
          value={state.workshopUrl}
          onChange={(e) => setState((prev) => ({ ...prev, workshopUrl: e.target.value }))}
          className="flex-1"
        />
        <Button
          onClick={fetchWorkshopInfo}
          disabled={loading}
          variant="secondary"
          className="min-w-[120px]"
        >
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <span>Get Info</span>}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Enter the Steam Workshop Collection URL (e.g.,
        https://steamcommunity.com/sharedfiles/filedetails/?id=1234567890)
      </p>
    </div>
  )

  const renderPreview = () => (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Workshop Collection</h3>
              <span className="text-sm text-muted-foreground">{state.mods.length} mods</span>
            </div>

            <div className="max-h-[400px] overflow-y-auto space-y-3">
              {state.mods.map((mod) => (
                <div key={mod.id} className="flex items-center p-3 rounded-lg border bg-card">
                  {mod.imageUrl && (
                    <img src={mod.imageUrl} alt="" className="w-12 h-12 rounded object-cover" />
                  )}
                  <div className="ml-3 flex-1">
                    <h4 className="font-medium">{mod.name}</h4>
                    <p className="text-sm text-muted-foreground">{mod.size}</p>
                  </div>
                  <ExternalLink
                    className="h-4 w-4 text-muted-foreground cursor-pointer"
                    onClick={() =>
                      window.electron.ipcRenderer.send(
                        "open-external",
                        `https://steamcommunity.com/sharedfiles/filedetails/?id=${mod.id}`
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderDownloading = () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex justify-between">
          <span className="text-sm font-medium">Overall Progress</span>
          <span className="text-sm text-muted-foreground">{state.overallProgress}%</span>
        </div>
        <Progress value={state.overallProgress} className="h-2" />
      </div>

      <div className="space-y-3">
        {state.mods.map((mod) => (
          <div key={mod.id} className="flex items-center space-x-3 p-3 rounded-lg border bg-card">
            <Package className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <div className="flex justify-between">
                <p className="text-sm font-medium truncate">{mod.name}</p>
                <span className="text-sm text-muted-foreground">{mod.progress || 0}%</span>
              </div>
              <Progress value={mod.progress || 0} className="h-1 mt-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-6 p-6">
      {state.step === "input" && renderInput()}
      {state.step === "preview" && renderPreview()}
      {state.step === "downloading" && renderDownloading()}

      <div className="flex justify-end space-x-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        {state.step === "preview" && (
          <Button onClick={startDownload} className="min-w-[120px]">
            <Download className="mr-2 h-4 w-4" />
            Start Download
          </Button>
        )}
      </div>
    </div>
  )
}

export default SteamWorkshopImport
