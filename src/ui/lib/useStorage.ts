import { useEffect } from "react";
import { subscribeMessages } from "./messaging";
import { useFinderStore } from "../state/finderStore";

/** Hydrate prefs/scan/history/queue from the worker and keep them in Zustand. UI never reads chrome.storage. */
export function useStorage(): void {
  const hydrate = useFinderStore((s) => s.hydrate);
  const onMessage = useFinderStore((s) => s.onMessage);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => subscribeMessages(onMessage), [onMessage]);
}
