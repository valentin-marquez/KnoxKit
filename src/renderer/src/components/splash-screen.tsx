import { useEffect, useState } from "react"

const SplashScreen = (): JSX.Element => {
  const [status, setStatus] = useState({
    message: "Initializing...",
    operational: false,
    timestamp: null
  })

  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let progressInterval

    // Simulate progress until server is operational
    const startProgressSimulation = (): void => {
      progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) return prev // Cap at 90% until server is ready
          return prev + Math.random() * 2
        })
      }, 100)
    }

    // Handle WebSocket messages
    const handleWSMessage = (_, message): void => {
      try {
        console.log("Message received:", message)
        const data = typeof message === "string" ? JSON.parse(message) : message

        if (data.type === "server_status") {
          setStatus({
            message: data.message,
            operational: data.operational,
            timestamp: data.timestamp
          })

          if (data.operational) {
            setProgress(100)
            clearInterval(progressInterval)
          }
        }
      } catch (error) {
        console.error("Error handling WebSocket message:", error)
      }
    }

    // Set up listener and start progress simulation
    window.electron.ipcRenderer.on("ws:message", handleWSMessage)
    startProgressSimulation()

    // Request initial server status
    window.electron.ipcRenderer.send(
      "ws:send",
      JSON.stringify({
        type: "server_status"
      })
    )

    return (): void => {
      clearInterval(progressInterval)
      window.electron.ipcRenderer.removeListener("ws:message", handleWSMessage)
    }
  }, [])

  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center min-h-screen">
      <div className="w-full max-w-sm px-8 py-12 space-y-8">
        {/* Logo and App Name */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-full">
            <svg viewBox="0 0 24 24" className="w-8 h-8 text-primary" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
            </svg>
            <span className="ml-2 text-2xl font-semibold tracking-tight">
              Knox<span className="text-primary">Kit</span>
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-4">
          <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground text-center">{status.message}</p>
          {status.timestamp && (
            <p className="text-xs text-muted-foreground text-center">
              Last updated: {new Date(status.timestamp).toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default SplashScreen
