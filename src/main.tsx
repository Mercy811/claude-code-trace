import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { openUrl } from "./lib/openUrl";
import { App } from "./App";
import { initTheme } from "./lib/themeMode";
import "./styles/global.css";

// Apply the persisted light/dark theme before first paint to avoid a flash.
initTheme();

// Intercept all link clicks and open external URLs in the system browser
document.addEventListener("click", (e) => {
  const anchor = (e.target as HTMLElement).closest("a");
  if (!anchor) return;
  const href = anchor.getAttribute("href");
  if (href && (href.startsWith("http://") || href.startsWith("https://"))) {
    e.preventDefault();
    openUrl(href);
  }
});

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
