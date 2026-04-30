import { Outlet } from "react-router-dom";
import { TopBar } from "@/components/layout/TopBar";
import { TooltipProvider } from "@/components/primitives";

export function WizardShell() {
  return (
    <TooltipProvider>
      <div className="flex h-full flex-col bg-canvas">
        <TopBar />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <Outlet />
        </div>
      </div>
    </TooltipProvider>
  );
}
