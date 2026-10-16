import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../tokens.css";
import "./shell.css";
import { OptionsApp } from "./OptionsApp";

const root = document.querySelector("#root");
if (!root) throw new Error("Missing #root");
createRoot(root).render(
  <StrictMode>
    <OptionsApp />
  </StrictMode>,
);
