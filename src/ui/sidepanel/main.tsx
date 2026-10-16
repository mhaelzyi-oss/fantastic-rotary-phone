import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FinderApp } from "../components/FinderApp";
import "../tokens.css";
import "./shell.css";

const root = document.querySelector("#root");
if (!root) throw new Error("Missing #root");
createRoot(root).render(
  <StrictMode>
    <FinderApp layout="panel" />
  </StrictMode>,
);
