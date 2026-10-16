import { isMessage, type RuntimeMessage } from "../../shared/messages";

export function sendMessage<T = unknown>(message: RuntimeMessage): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

export function subscribeMessages(handler: (message: RuntimeMessage) => void): () => void {
  const listener = (raw: unknown) => {
    if (isMessage(raw)) handler(raw);
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
