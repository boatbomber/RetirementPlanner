import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { AppShell } from "./AppShell";
import { DisclaimerGate } from "./DisclaimerGate";
import { RootRedirect } from "./RootRedirect";
import { WizardShell } from "./wizard/WizardShell";
import { WizardPage } from "./wizard/WizardPage";
import { DashboardPage } from "./dashboard/DashboardPage";
import { PlanPage } from "./plan/PlanPage";
import { ScenarioListPage } from "./scenarios/ScenarioListPage";
import { Footer } from "@/components/layout/Footer";
import { Spinner } from "@/components/primitives/Progress/Spinner";

// Heavy/secondary routes are split out so they don't ship in the initial
// bundle. ScenarioComparePage pulls in extra chart code; ReportsPage and
// SettingsPage are infrequently visited; ComponentsPage is dev-only and
// shouldn't burden first-paint for end users.
const ScenarioComparePage = lazy(() =>
  import("./scenarios/ScenarioComparePage").then((m) => ({ default: m.ScenarioComparePage })),
);
const ReportsPage = lazy(() => import("./reports/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import("./settings/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const ComponentsPage = lazy(() =>
  import("@/components/components-page/ComponentsPage").then((m) => ({ default: m.ComponentsPage })),
);

function RouteSuspense({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Spinner size={24} />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

function RootLayout() {
  return (
    <div className="flex h-dvh flex-col">
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
      <Footer />
      <DisclaimerGate />
    </div>
  );
}

export function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<RootLayout />}>
          <Route path="/" element={<RootRedirect />} />

          <Route path="/wizard" element={<WizardShell />}>
            <Route index element={<WizardPage />} />
            <Route path=":step" element={<WizardPage />} />
          </Route>

          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/scenario" element={<PlanPage />} />
            <Route path="/scenario/:tab" element={<PlanPage />} />
            <Route path="/comparisons" element={<ScenarioListPage />} />
            <Route
              path="/comparisons/compare"
              element={
                <RouteSuspense>
                  <ScenarioComparePage />
                </RouteSuspense>
              }
            />
            <Route
              path="/reports"
              element={
                <RouteSuspense>
                  <ReportsPage />
                </RouteSuspense>
              }
            />
            <Route
              path="/settings"
              element={
                <RouteSuspense>
                  <SettingsPage />
                </RouteSuspense>
              }
            />
          </Route>

          <Route
            path="/components"
            element={
              <RouteSuspense>
                <ComponentsPage />
              </RouteSuspense>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
