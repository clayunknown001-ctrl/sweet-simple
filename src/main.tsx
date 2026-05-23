import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
// SafeNet lokal NSFW dvigatelini avtomatik yuklash (window.classifyImage)
import "./lib/safenet_engine.js";

createRoot(document.getElementById("root")!).render(<App />);
