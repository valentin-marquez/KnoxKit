import React from "react"
import { motion } from "framer-motion"

export const Settings: React.FC = () => {
  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <h1 className="text-2xl font-bold">Settings</h1>
      <p>Configure your settings here</p>
    </motion.div>
  )
}
