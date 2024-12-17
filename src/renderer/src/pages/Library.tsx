import { useState, useEffect } from "react"
import { Search, Play, Trash2, Edit2, MoreHorizontal, Gamepad } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@renderer/components/ui/dropdown-menu"
import { Input } from "@renderer/components/ui/input"
import { Button } from "@renderer/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@renderer/components/ui/select"
import { motion } from "framer-motion"
import { InstanceData } from "@renderer/types"

function Library(): JSX.Element {
  const [instances, setInstances] = useState<InstanceData[]>([])
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState("lastPlayed")

  useEffect(() => {
    // Initial fetch
    window.electron.ipcRenderer.invoke("instance:list").then((fetchedInstances) => {
      setInstances(fetchedInstances)
    })

    // Listen for new instance creation
    const removeListener = window.electron.ipcRenderer.on("instance:created", () => {
      window.electron.ipcRenderer.invoke("instance:list").then((fetchedInstances) => {
        setInstances(fetchedInstances)
      })
    })

    // Cleanup listener on unmount
    return (): void => {
      removeListener()
    }
  }, [])

  const handleLaunch = async (instanceId: string): Promise<void> => {
    await window.electron.ipcRenderer.invoke("instance:launch", instanceId)
  }

  const handleDelete = async (instanceId: string): Promise<void> => {
    await window.electron.ipcRenderer.invoke("instance:delete", instanceId)
    setInstances(instances.filter((instance) => instance.id !== instanceId))
  }

  const filteredInstances = instances.filter((instance) =>
    instance.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex h-full gap-6 p-6 overflow-hidden">
      {/* Main content area */}
      <motion.div
        className="flex-1 flex flex-col min-w-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {/* Header with filters */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search instances..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-muted/50"
            />
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lastPlayed">Last Played</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="playtime">Playtime</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Grid of instances with proper overflow */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 h-full">
            {filteredInstances.map((instance) => (
              <motion.div
                key={instance.id}
                className="group relative bg-muted/50 rounded-xl overflow-hidden border border-border hover:border-primary/50 transition-colors"
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                {/* Instance Image */}
                <div className="aspect-square relative overflow-hidden">
                  {instance.iconPath ? (
                    <img
                      src={instance.iconPath}
                      alt={instance.name}
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Gamepad className="w-16 h-16 text-muted-foreground/50" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                {/* Play Button Overlay */}
                <Button
                  size="icon"
                  className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-primary/90 hover:bg-primary"
                  onClick={() => handleLaunch(instance.id)}
                >
                  <Play className="h-6 w-6" />
                </Button>

                {/* Instance Name and Actions */}
                <div className="absolute bottom-0 left-0 right-0 p-3 flex items-center justify-between">
                  <span className="text-sm font-medium truncate text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    {instance.name}
                  </span>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleLaunch(instance.id)}>
                        <Play className="h-4 w-4 mr-2" />
                        Launch
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDelete(instance.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Advertisement space with fixed height */}
      <div className="w-72 h-full bg-muted/50 rounded-xl border border-border flex flex-col shrink-0">
        <div className="p-2 border-b border-border">
          <span className="text-sm font-medium">Sponsored</span>
        </div>
        <div className="flex-1 p-2">
          {/* Placeholder for actual ad content */}
          <div className="h-full bg-muted rounded-lg flex items-center justify-center">
            <span className="text-sm text-muted-foreground">Advertisement Space</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Library
