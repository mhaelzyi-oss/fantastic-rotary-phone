import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../src/ui/tokens.css";
import { installChromeMock } from "./chromeMock";

installChromeMock();
const { OptionsApp } = await import("../src/ui/options/OptionsApp");

const root = document.querySelector("#root");
if (!root) throw new Error("Missing #root");
createRoot(root).render(
  <StrictMode>
    <OptionsApp />
  </StrictMode>,
);
