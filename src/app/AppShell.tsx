import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, ClipboardList, FileBarChart, Scale, Settings } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { SideNav } from "@/components/layout/SideNav";
import { BottomNav } from "@/components/layout/BottomNav";
import { ErrorBoundary, TooltipProvider } from "@/components/primitives";
import { useAppStore } from "@/store";
import { useSimulation } from "@/hooks/useSimulation";
import { useAutoSolve } from "@/hooks/useAutoSolve";

const NAV_ITEMS = [
  { id: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
  { id: "/scenario", label: "Scenario", icon: <ClipboardList size={20} /> },
  { id: "/comparisons", label: "Compare", icon: <Scale size={20} /> },
  { id: "/reports", label: "Reports", icon: <FileBarChart size={20} /> },
  { id: "/settings", label: "Settings", icon: <Settings size={20} /> },
];

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const collapsed = useAppStore((s) => s.sideNavCollapsed);
  const setSideNavCollapsed = useAppStore((s) => s.setSideNavCollapsed);
  const activeScenario = useAppStore((s) => s.getActiveScenario());

  // Auto-sim and auto-solve are mounted at the shell level so any scenario
  // edit on any page triggers them. The user no longer has to navigate to
  // the dashboard to refresh projections. Auto-solve waits for auto-sim to
  // settle, so they share the worker pool without preempting each other.
  useSimulation(activeScenario);
  useAutoSolve(activeScenario);

  const activeId = NAV_ITEMS.find((item) => location.pathname.startsWith(item.id))?.id;

  return (
    <TooltipProvider>
      <PageShell
        sidebar={
          <SideNav
            items={NAV_ITEMS}
            activeId={activeId}
            onSelect={(id) => navigate(id)}
            collapsed={collapsed}
            onToggleCollapsed={() => setSideNavCollapsed(!collapsed)}
          />
        }
        mobileNav={<BottomNav items={NAV_ITEMS} activeId={activeId} onSelect={(id) => navigate(id)} />}
      >
        {/* Per-route boundary so a render exception inside any page doesn't
            white-screen the shell. resetKeys keys on the path so navigating
            away clears a stuck error. */}
        <ErrorBoundary resetKeys={[location.pathname]}>
          <Outlet />
        </ErrorBoundary>
      </PageShell>
    </TooltipProvider>
  );
}
