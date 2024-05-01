import React from 'react'
import ReactDOM from 'react-dom/client'
import './global.css'
import App from './App'
import { ThemeProvider } from './components/theme-provider'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <App className="font-mono min-h-screen bg-background antialiased" />
    </ThemeProvider>
  </React.StrictMode>
)
