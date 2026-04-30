import { useCallback, useSyncExternalStore } from "react";

type Theme = "light" | "dark";

// Theme preference is the ONLY thing this app writes to localStorage. All
// scenario data lives in IndexedDB via the persist middleware (see
// src/store/index.ts). Do not repurpose this key for anything other than
// "light" | "dark". Anything sensitive must go through the IndexedDB store
// so the Settings → Reset flow can clear it.
const STORAGE_KEY = "rp-theme";

function getSnapshot(): Theme {
  return (document.documentElement.dataset.theme as Theme) || "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

function subscribe(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const toggle = useCallback(() => {
    setTheme(getSnapshot() === "light" ? "dark" : "light");
  }, [setTheme]);

  return { theme, setTheme, toggle } as const;
}

// Eagerly apply saved preference before React hydrates
if (typeof window !== "undefined") {
  const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (saved) document.documentElement.dataset.theme = saved;
}
