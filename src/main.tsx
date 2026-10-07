import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import "@fontsource-variable/geist"
import "@fontsource-variable/geist-mono"
import "./index.css"
import { initAnalytics } from "./lib/analytics"

initAnalytics()

// O visual é sempre escuro (classe .dark do shadcn).
document.documentElement.classList.add("dark")

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
