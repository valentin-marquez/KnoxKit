import React from "react"
import { motion } from "framer-motion"
import { X } from "lucide-react"

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
  showCloseButton?: boolean
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  className = "",
  showCloseButton = true
}) => {
  if (!isOpen) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className={`relative w-full max-w-lg rounded-lg z-50 bg-zinc-900 p-6 shadow-xl ${className}`}
      >
        {showCloseButton && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        {title && (
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            {description && <p className="mt-1 text-sm text-zinc-400">{description}</p>}
          </div>
        )}

        {children}
      </motion.div>
    </motion.div>
  )
}

export default Modal
