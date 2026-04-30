import { useState } from "react";
import { SideNav } from "@/components/layout/SideNav";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { LayoutDashboard, LineChart, Wallet, Layers, FileBarChart } from "lucide-react";

const navItems = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: <LayoutDashboard size={20} strokeWidth={1.75} />,
  },
  {
    id: "scenario",
    label: "Scenario",
    icon: <LineChart size={20} strokeWidth={1.75} />,
  },
  {
    id: "accounts",
    label: "Accounts",
    icon: <Wallet size={20} strokeWidth={1.75} />,
  },
  {
    id: "comparisons",
    label: "Comparisons",
    icon: <Layers size={20} strokeWidth={1.75} />,
  },
  {
    id: "reports",
    label: "Reports",
    icon: <FileBarChart size={20} strokeWidth={1.75} />,
  },
];

export function NavigationSection() {
  const [activeId, setActiveId] = useState("dashboard");

  return (
    <section className="flex flex-col gap-[var(--space-7)]">
      <div>
        <h2 className="text-metric-lg font-semibold tracking-tight text-text-primary">Navigation</h2>
        <p className="mt-1 text-body text-text-secondary">Side nav (expanded + collapsed) and breadcrumbs.</p>
      </div>

      <div>
        <h4 className="mb-3 text-body font-semibold text-text-primary">Side nav (expanded)</h4>
        <div className="h-64 w-60 overflow-hidden rounded-md border border-[var(--color-border-subtle)]">
          <SideNav items={navItems} activeId={activeId} onSelect={setActiveId} />
        </div>
      </div>

      <div>
        <h4 className="mb-3 text-body font-semibold text-text-primary">Side nav (collapsed)</h4>
        <div className="h-64 w-16 overflow-hidden rounded-md border border-[var(--color-border-subtle)]">
          <SideNav items={navItems} activeId={activeId} onSelect={setActiveId} collapsed />
        </div>
      </div>

      <div>
        <h4 className="mb-3 text-body font-semibold text-text-primary">Breadcrumbs</h4>
        <Breadcrumbs
          items={[
            { label: "Comparisons", onClick: () => {} },
            { label: "Retire at 65", onClick: () => {} },
            { label: "Year 2040" },
          ]}
        />
      </div>
    </section>
  );
}
