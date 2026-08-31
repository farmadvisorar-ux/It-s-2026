import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Apply the stored theme before first paint so there is no flash.
const stored = localStorage.getItem("sikas_theme");
if (stored && stored !== "system") document.documentElement.setAttribute("data-theme", stored);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
