import { createRoot } from "react-dom/client";
import App from "./App";
import { startOfflineLogSync } from "@/lib/offline-queue";
import { bootstrapNativeShell } from "@/lib/native-bootstrap";
import "./index.css";

startOfflineLogSync();
createRoot(document.getElementById("root")!).render(<App />);
void bootstrapNativeShell();
