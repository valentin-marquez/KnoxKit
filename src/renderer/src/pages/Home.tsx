import React from "react"
import { motion } from "framer-motion"

export const Home: React.FC = () => {
  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <h1 className="text-2xl font-bold">Home</h1>
      <p>Welcome to the application!</p>
    </motion.div>
  )
}
