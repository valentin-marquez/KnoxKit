import { useState } from "react"
import { Box, FolderOpen, FileText } from "lucide-react"
import { Slider } from "@renderer/components/ui/slider"

import { BaseInstanceConfig } from "@renderer/types"
import { Textarea } from "@renderer/components/ui/textarea"
import { toast } from "@renderer/hooks/use-toast"
import { Input } from "@renderer/components/ui/input"

interface NewInstanceProps {
  onClose: () => void
}

function NewInstance({ onClose }: NewInstanceProps): JSX.Element {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const [config, setConfig] = useState<BaseInstanceConfig>({
    name: "",
    memory: 2048,
    javaArgs: "-Xmx2048M -XX:+UseG1GC",
    description: ""
  })

  const memorySteps = [1024, 2048, 4096, 8192, 16384, 32768]

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!config.name.trim()) {
      newErrors.name = "Instance name is required"
    } else if (config.name.length < 3) {
      newErrors.name = "Name must be at least 3 characters long"
    }

    if (config.memory < 1024) {
      newErrors.memory = "Minimum memory must be 1024MB"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleMemoryChange = (value: number[]): void => {
    const memoryValue = memorySteps[value[0]]
    setConfig({
      ...config,
      memory: memoryValue,
      javaArgs: `-Xmx${memoryValue}M -XX:+UseG1GC`
    })
  }

  const getCurrentMemoryIndex = (): number => {
    return memorySteps.findIndex((step) => step === config.memory)
  }

  const handleIconSelect = async (): Promise<void> => {
    try {
      const result = await window.api.openFileDialog({
        title: "Select instance icon",
        filters: [{ name: "Images", extensions: ["jpg", "png", "gif", "jpeg"] }]
      })

      if (!result.canceled && result.base64) {
        setConfig({
          ...config,
          iconBase64: result.base64
        })
      }
    } catch (error) {
      console.error("Error selecting icon:", error)
      setErrors({
        ...errors,
        icon: "Failed to set instance icon"
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setLoading(true)

    // Show loading toast
    const loadingToast = toast({
      title: "Creating instance...",
      description: "Please wait while we set up your instance",
      duration: Infinity, // Keep toast until dismissed
      loading: true // Shows infinite progress bar
    })

    try {
      if (!validateForm()) {
        setLoading(false)
        loadingToast.dismiss()
        return
      }

      await window.api.createInstance({
        ...config,
        iconBase64: config.iconBase64
      })

      loadingToast.dismiss() // Remove loading toast
      toast({
        title: "Success",
        description: "Instance created successfully",
        variant: "success"
      })
      onClose()
    } catch (error) {
      loadingToast.dismiss()
      toast({
        title: "Error",
        description: "Failed to create instance",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-1 px-4 md:px-0">
      <div className="grid gap-4 md:gap-6">
        {/* Icon and Name section */}
        <div className="grid gap-4 md:grid-cols-[auto,1fr]">
          <div className="flex flex-col items-center space-y-3">
            <div className="relative h-32 w-32 overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/25 bg-secondary/50 hover:border-primary/50 transition-colors">
              {config.iconBase64 ? (
                <img
                  src={config.iconBase64}
                  alt="Instance icon"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Box className="h-16 w-16 text-muted-foreground" />
                </div>
              )}
            </div>
            <button
              onClick={handleIconSelect}
              className="flex w-full items-center justify-center space-x-2 rounded-md bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground hover:bg-accent transition-colors"
            >
              <FolderOpen className="h-4 w-4" />
              <span>Select Icon</span>
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Instance Name</label>
              <Input
                type="text"
                value={config.name}
                onChange={(e) => setConfig({ ...config, name: e.target.value })}
                placeholder="e.g. Kentucky Survival"
              />
              {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center space-x-2">
                <FileText className="h-4 w-4" />
                <span>Description</span>
              </label>
              <Textarea
                value={config.description}
                onChange={(e) => setConfig({ ...config, description: e.target.value })}
                placeholder="Describe your instance setup..."
                className="h-20 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Memory Settings */}
        <div className="space-y-4 rounded-lg bg-secondary/50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Memory Allocation</span>
            <span className="text-sm text-muted-foreground">
              {config.memory} MB ({(config.memory / 1024).toFixed(1)} GB)
            </span>
          </div>
          <Slider
            value={[getCurrentMemoryIndex()]}
            max={memorySteps.length - 1}
            step={1}
            onValueChange={handleMemoryChange}
          />
          {errors.memory && <p className="text-xs text-red-500">{errors.memory}</p>}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end space-x-3 pt-4">
        <button
          onClick={onClose}
          disabled={loading}
          className="rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {loading ? "Creating..." : "Create Instance"}
        </button>
      </div>
    </div>
  )
}

export default NewInstance
