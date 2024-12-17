import React from "react"
import ReactDOM from "react-dom/client"
import { HashRouter } from "react-router"
import App from "./App"
import "@fontsource-variable/red-hat-display"
import "./styles/index.css"

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
)
