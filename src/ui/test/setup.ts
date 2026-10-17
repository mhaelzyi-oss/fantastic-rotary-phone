import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Vitest runs without globals, so RTL's automatic cleanup is not registered.
afterEach(() => cleanup());

const listeners = new Set<(message: unknown) => void>();

const sendMessage = vi.fn(async (message: { type: string }) => {
  if (message.type === "GET_PREFS") return undefined;
  if (message.type === "GET_SCAN") return { pageUrl: "", pageTitle: "", sources: [] };
  if (message.type === "GET_HISTORY") return [];
  if (message.type === "GET_QUEUE") return [];
  return { ok: true };
});

Object.assign(globalThis, {
  chrome: {
    runtime: {
      sendMessage,
      getURL: (path: string) => `chrome-extension://test/${path}`,
      onMessage: {
        addListener: (fn: (message: unknown) => void) => listeners.add(fn),
        removeListener: (fn: (message: unknown) => void) => listeners.delete(fn),
      },
    },
    tabs: { create: vi.fn(async () => ({ id: 2 })) },
  },
});

export { listeners, sendMessage };
