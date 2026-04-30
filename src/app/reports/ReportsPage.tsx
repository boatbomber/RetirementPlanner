import { useNavigate } from "react-router-dom";
import { BarChart3, TableProperties } from "lucide-react";
import { useAppStore } from "@/store";
import { Tabs, TabContent, EmptyState, Button, Select } from "@/components/primitives";
import { PageHeader } from "@/components/layout/PageHeader";
import { TAX_REPORT_DISCLAIMER } from "@/lib/disclaimers";
import { CashFlowTable } from "./tables/CashFlowTable";
import { PercentileTable } from "./tables/PercentileTable";
import { WithdrawalScheduleTable } from "./tables/WithdrawalScheduleTable";
import { AccountBalancesTable } from "./tables/AccountBalancesTable";
import { SocialSecurityTable } from "./tables/SocialSecurityTable";
import type { TableDensity } from "@/store/slices/uiSlice";

const REPORT_TABS = [
  { value: "cash-flow", label: "Cash Flow" },
  { value: "tax", label: "Tax Projections" },
  { value: "accounts", label: "Account Balances" },
  { value: "withdrawal-schedule", label: "Withdrawal Schedule" },
  { value: "social-security", label: "Social Security" },
];

const DENSITY_OPTIONS = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
  { value: "dense", label: "Dense" },
];

export function ReportsPage() {
  const navigate = useNavigate();
  const scenario = useAppStore((s) => s.getActiveScenario());
  const simEntry = useAppStore((s) => (scenario ? s.simulations[scenario.id] : undefined));
  const tableDensity = useAppStore((s) => s.tableDensity);
  const setTableDensity = useAppStore((s) => s.setTableDensity);

  if (!scenario) {
    return (
      <EmptyState
        icon={<BarChart3 size={40} />}
        title="No scenario"
        description="Create a scenario to see detailed reports."
        action={<Button onClick={() => navigate("/wizard")}>Start wizard</Button>}
      />
    );
  }

  const result = simEntry?.result ?? null;

  if (!result) {
    return (
      <EmptyState
        icon={<TableProperties size={40} />}
        title="No simulation data"
        description="Run a simulation from the dashboard to generate reports."
        action={<Button onClick={() => navigate("/dashboard")}>Go to dashboard</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-[var(--space-7)]">
      <PageHeader
        title="Reports"
        subtitle={`${scenario.name}: year-by-year projections`}
        actions={
          <div className="flex items-center gap-[var(--space-2)]">
            <span className="text-body-sm text-text-tertiary">Density</span>
            <div className="w-40">
              <Select
                value={tableDensity}
                onValueChange={(v) => setTableDensity(v as TableDensity)}
                options={DENSITY_OPTIONS}
              />
            </div>
          </div>
        }
      />

      <Tabs tabs={REPORT_TABS} defaultValue="cash-flow">
        <TabContent value="cash-flow">
          <CashFlowTable
            wealth={result.wealthByYear}
            income={result.incomeByYear}
            spending={result.spendingByYear}
            tax={result.taxByYear}
            ssIncome={result.ssIncomeByYear}
            withdrawals={result.withdrawalsByYear}
            density={tableDensity}
            retirementAge={scenario.profile.retirementAge}
          />
        </TabContent>
        <TabContent value="tax">
          <p className="mb-[var(--space-3)] text-caption leading-relaxed text-text-tertiary">
            {TAX_REPORT_DISCLAIMER}
          </p>
          <PercentileTable
            data={result.taxByYear}
            density={tableDensity}
            retirementAge={scenario.profile.retirementAge}
            exportFilename="tax-projections.csv"
          />
        </TabContent>
        <TabContent value="accounts">
          <AccountBalancesTable
            series={result.accountBalancesByYear}
            accounts={scenario.accounts}
            density={tableDensity}
            retirementAge={scenario.profile.retirementAge}
          />
        </TabContent>
        <TabContent value="withdrawal-schedule">
          <WithdrawalScheduleTable
            withdrawals={result.withdrawalsByYear}
            rmd={result.rmdByYear}
            rothConversion={result.rothConversionByYear}
            density={tableDensity}
            retirementAge={scenario.profile.retirementAge}
          />
        </TabContent>
        <TabContent value="social-security">
          <SocialSecurityTable scenario={scenario} density={tableDensity} />
        </TabContent>
      </Tabs>
    </div>
  );
}
