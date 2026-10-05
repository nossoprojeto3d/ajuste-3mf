import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import "./index.css"
import { initAnalytics } from "./lib/analytics"

initAnalytics()

// A identidade da marca é escura: o app usa sempre o tema escuro (classe .dark do shadcn).
document.documentElement.classList.add("dark")

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
