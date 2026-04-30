import { useCallback, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BarChart3, Pencil, Check } from "lucide-react";
import { useAppStore } from "@/store";
import { Tabs, TabContent } from "@/components/primitives/Tabs";
import { EmptyState, Button } from "@/components/primitives";
import { TextInput } from "@/components/primitives/Input/TextInput";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  ProfileEditor,
  AccountsEditor,
  IncomeEditor,
  ExpensesEditor,
  LifeEventsEditor,
  WithdrawalEditor,
  AssumptionsEditor,
  SocialSecurityEditor,
} from "@/components/editors";
import type { Scenario } from "@/models";

const PLAN_TABS = [
  { value: "profile", label: "Profile" },
  { value: "accounts", label: "Accounts" },
  { value: "income", label: "Income" },
  { value: "expenses", label: "Expenses" },
  { value: "social-security", label: "Social Security" },
  { value: "events", label: "Life Events" },
  { value: "withdrawal", label: "Withdrawal" },
  { value: "assumptions", label: "Assumptions" },
];

const TAB_VALUES = PLAN_TABS.map((t) => t.value);

export function PlanPage() {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab: string }>();
  const activeTab = TAB_VALUES.includes(tab ?? "") ? tab! : "profile";

  const scenario = useAppStore((s) => s.getActiveScenario());
  const updateScenario = useAppStore((s) => s.updateScenario);

  const onUpdate = useCallback(
    (patch: Partial<Scenario>) => {
      if (scenario) {
        updateScenario(scenario.id, patch);
      }
    },
    [scenario, updateScenario],
  );

  const handleTabChange = useCallback(
    (value: string) => {
      navigate(`/scenario/${value}`, { replace: true });
    },
    [navigate],
  );

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = useCallback(() => {
    if (scenario) {
      setDraft(scenario.name);
      setEditing(true);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [scenario]);

  const commitName = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed && scenario && trimmed !== scenario.name) {
      updateScenario(scenario.id, { name: trimmed });
    }
    setEditing(false);
  }, [draft, scenario, updateScenario]);

  if (!scenario) {
    return (
      <EmptyState
        icon={<BarChart3 size={40} />}
        title="No scenario"
        description="Create a scenario in the wizard to get started."
        action={<Button onClick={() => navigate("/wizard")}>Start wizard</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-[var(--space-7)]">
      <PageHeader
        title={
          editing ? (
            <div className="flex items-center gap-[var(--space-3)]">
              <TextInput
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitName();
                  if (e.key === "Escape") setEditing(false);
                }}
                aria-label="Scenario name"
                className="text-heading-lg h-auto border-x-0 border-t-0 border-b-2 border-primary bg-transparent px-0 font-semibold focus-visible:border-primary"
              />
              <Button
                variant="icon-only"
                size="sm"
                onClick={commitName}
                aria-label="Save name"
                icon={<Check size={18} />}
              />
            </div>
          ) : (
            <div className="flex items-center gap-[var(--space-3)]">
              <h1 className="text-heading-lg font-semibold text-text-primary">{scenario.name}</h1>
              <Button
                variant="icon-only"
                size="sm"
                onClick={startEditing}
                aria-label="Rename scenario"
                icon={<Pencil size={16} />}
              />
            </div>
          )
        }
        subtitle="Edit your scenario details"
        actions={
          <Button variant="secondary" onClick={() => navigate("/dashboard")}>
            View dashboard
          </Button>
        }
      />

      <Tabs tabs={PLAN_TABS} value={activeTab} onValueChange={handleTabChange}>
        <TabContent value="profile">
          <ProfileEditor scenario={scenario} onUpdate={onUpdate} />
        </TabContent>
        <TabContent value="accounts">
          <AccountsEditor scenario={scenario} onUpdate={onUpdate} />
        </TabContent>
        <TabContent value="income">
          <IncomeEditor scenario={scenario} onUpdate={onUpdate} />
        </TabContent>
        <TabContent value="expenses">
          <ExpensesEditor scenario={scenario} onUpdate={onUpdate} />
        </TabContent>
        <TabContent value="social-security">
          <SocialSecurityEditor scenario={scenario} onUpdate={onUpdate} />
        </TabContent>
        <TabContent value="events">
          <LifeEventsEditor scenario={scenario} onUpdate={onUpdate} />
        </TabContent>
        <TabContent value="withdrawal">
          <WithdrawalEditor scenario={scenario} onUpdate={onUpdate} />
        </TabContent>
        <TabContent value="assumptions">
          <AssumptionsEditor scenario={scenario} onUpdate={onUpdate} />
        </TabContent>
      </Tabs>
    </div>
  );
}
