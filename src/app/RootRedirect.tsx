import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAppStore } from "@/store";

export function RootRedirect() {
  // The persist middleware hydrates from IndexedDB asynchronously. On a
  // returning user, the store is briefly at slice defaults (wizardCompleted
  // false) before the persisted true value lands, which would otherwise
  // bounce them into /wizard/basics for one render tick. Gate the redirect
  // on persist.hasHydrated() so we render a no-op until the real value is
  // available.
  const [hydrated, setHydrated] = useState(() => useAppStore.persist.hasHydrated());
  const wizardCompleted = useAppStore((s) => s.wizardCompleted);

  useEffect(() => {
    if (hydrated) return;
    return useAppStore.persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated]);

  if (!hydrated) return null;
  return <Navigate to={wizardCompleted ? "/dashboard" : "/wizard/basics"} replace />;
}
