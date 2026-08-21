import { createRoot } from "react-dom/client";
import App from "./App";
import { startOfflineLogSync } from "@/lib/offline-queue";
import { startOfflineVideoSync } from "@/lib/video-offline-store";
import { bootstrapNativeShell } from "@/lib/native-bootstrap";
import "./index.css";

startOfflineLogSync();
startOfflineVideoSync();
createRoot(document.getElementById("root")!).render(<App />);
void bootstrapNativeShell();
