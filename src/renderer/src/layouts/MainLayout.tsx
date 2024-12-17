import { Link, useLocation, Outlet } from "react-router"
import { Home, Library, Plus, Settings } from "lucide-react"
import React from "react"
import { Button } from "../components/ui/button"
import TitleBar from "../components/titlebar"
import { useModal } from "../contexts/ModalContext"
import Modal from "@renderer/components/modal"
import InstanceTypeSelector from "@renderer/components/instance-type-selector"
import NewInstance from "@renderer/components/new-instance"
import SteamCollectionImport from "@renderer/components/steam-collection-import"

interface NavItem {
  path: string
  label: string
  icon: React.FC<{ className?: string }>
}

const navItems: NavItem[] = [
  { path: "/", label: "Home", icon: Home },
  { path: "/library", label: "Library", icon: Library }
]

const bottomNavItems: NavItem[] = [{ path: "/settings", label: "Settings", icon: Settings }]

const MainLayout: React.FC = () => {
  const location = useLocation()
  const { activeModal, openModal, closeModal } = useModal()

  const handleInstanceTypeSelect = (type: "new" | "import" | "steam"): void => {
    closeModal() // Close the type selector modal

    // Open the corresponding modal based on selection
    switch (type) {
      case "new":
        openModal("newInstance")
        break
      case "import":
        openModal("importInstance")
        break
      case "steam":
        openModal("steamCollection")
        break
    }
  }

  const renderModalContent = (): React.ReactNode => {
    switch (activeModal) {
      case "instanceType":
        return (
          <Modal
            isOpen={true}
            onClose={closeModal}
            title="Select Instance Type"
            description="Choose how you want to create your instance"
            className="max-w-md"
          >
            <InstanceTypeSelector onSelect={handleInstanceTypeSelect} onClose={closeModal} />
          </Modal>
        )
      case "newInstance":
        return (
          <Modal
            isOpen={true}
            onClose={closeModal}
            title="Create New Instance"
            className="max-w-2xl"
          >
            <NewInstance onClose={closeModal} />
          </Modal>
        )
      case "steamCollection":
        return (
          <Modal
            isOpen={true}
            onClose={closeModal}
            title="Import Steam Collection"
            className="max-w-2xl"
          >
            <SteamCollectionImport onClose={closeModal} />
          </Modal>
        )
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col h-screen bg-background font-sans antialiased">
      <TitleBar />
      <div className="flex flex-1">
        <div className="w-20 flex flex-col justify-between py-6 bg-muted/50 shadow-xl border-r border-border">
          <div className="flex-1">
            <nav className="flex flex-col items-center space-y-6">
              {navItems.map((item) => (
                <Button
                  key={item.path}
                  variant="ghost"
                  size="icon"
                  asChild
                  className={`w-12 h-12 rounded-xl transition-all duration-200 ${
                    location.pathname === item.path
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  <Link to={item.path} title={item.label}>
                    <item.icon className="h-7 w-7" />
                    <span className="sr-only">{item.label}</span>
                  </Link>
                </Button>
              ))}
            </nav>
          </div>

          <div className="flex flex-col items-center space-y-6">
            <Button
              size="icon"
              variant="default"
              className="w-12 h-12 rounded-xl bg-primary/90 hover:bg-primary/80 shadow-lg transition-colors duration-200"
              onClick={() => openModal("instanceType")}
            >
              <Plus className="h-7 w-7 text-primary-foreground" />
              <span className="sr-only">New Instance</span>
            </Button>
            {bottomNavItems.map((item) => (
              <Button
                key={item.path}
                variant={location.pathname === item.path ? "default" : "ghost"}
                size="icon"
                asChild
                className={`w-12 h-12 rounded-xl transition-all duration-200 ${
                  location.pathname === item.path
                    ? "bg-primary text-primary-foreground shadow-lg"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <Link to={item.path} title={item.label}>
                  <item.icon className="h-7 w-7" />
                  <span className="sr-only">{item.label}</span>
                </Link>
              </Button>
            ))}
          </div>
        </div>

        <div className="flex-1 rounded-tl-3xl shadow-inner overflow-auto">
          <div className="select-none p-8">
            <Outlet />
          </div>
        </div>
      </div>
      {renderModalContent()}
    </div>
  )
}

export default MainLayout
