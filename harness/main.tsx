import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../src/ui/tokens.css";
import "./harness.css";
import { installChromeMock } from "./chromeMock";

const params = new URLSearchParams(location.search);
const theme = params.get("theme");
const mock = installChromeMock(theme === "dark" || theme === "light" ? { theme } : {});

// 1. The real content script registers its listeners and scans this page.
await import("../src/content/index");
// 2. Then the real UI mounts and talks to the (mock) worker.
mock.enterUiPhase();
const { FinderApp } = await import("../src/ui/components/FinderApp");

const root = document.querySelector("#ui");
if (!root) throw new Error("Missing #ui");
createRoot(root).render(
  <StrictMode>
    <FinderApp layout={params.get("layout") === "panel" ? "panel" : "popup"} />
  </StrictMode>,
);
