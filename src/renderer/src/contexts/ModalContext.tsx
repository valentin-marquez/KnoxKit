import React, { createContext, useContext, useState } from "react"

type ModalType = "instanceType" | "newInstance" | "steamCollection" | "importInstance"

interface ModalContextType {
  activeModal: ModalType | null
  openModal: (type: ModalType) => void
  closeModal: () => void
}

const ModalContext = createContext<ModalContextType | undefined>(undefined)

export const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeModal, setActiveModal] = useState<ModalType | null>(null)

  const openModal = (type: ModalType): void => {
    setActiveModal(type)
  }

  const closeModal = (): void => {
    setActiveModal(null)
  }

  return (
    <ModalContext.Provider value={{ activeModal, openModal, closeModal }}>
      {children}
    </ModalContext.Provider>
  )
}

export const useModal = (): ModalContextType => {
  const context = useContext(ModalContext)
  if (context === undefined) {
    throw new Error("useModal must be used within a ModalProvider")
  }
  return context
}
