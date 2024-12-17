import React, { useEffect, useState } from "react"
import { Routes, Route } from "react-router"
import MainLayout from "./layouts/MainLayout"
import { Home } from "./pages/Home"
import Library from "./pages/Library"
import { Settings } from "./pages/Settings"

import { ModalProvider } from "./contexts/ModalContext"
import SplashScreen from "./components/splash-screen"
import { Toaster } from "@renderer/components/ui/toaster"

interface ServerStatus {
  message: string
  operational: boolean
  timestamp: string | null
}

const AppContent: React.FC = () => {
  const [serverStatus, setServerStatus] = useState<ServerStatus>({
    message: "Initializing...",
    operational: false,
    timestamp: null
  })

  useEffect(() => {
    const handleMessage = (_: unknown, message: unknown): void => {
      try {
        const data = typeof message === "string" ? JSON.parse(message) : message
        if (data.type === "server_status") {
          setServerStatus({
            message: data.message,
            operational: data.operational,
            timestamp: data.timestamp
          })
        }
      } catch (error) {
        console.error("Error handling WebSocket message:", error)
      }
    }

    window.electron.ipcRenderer.on("ws:message", handleMessage)
    window.electron.ipcRenderer.send("ws:send", JSON.stringify({ type: "server_status" }))

    return (): void => {
      window.electron.ipcRenderer.removeListener("ws:message", handleMessage)
    }
  }, [])

  return (
    <>
      {!serverStatus.operational && <SplashScreen />}
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<Home />} />
          <Route path="/library" element={<Library />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </>
  )
}

const App: React.FC = () => {
  return (
    <ModalProvider>
      <AppContent />
      <Toaster />
    </ModalProvider>
  )
}

export default App
