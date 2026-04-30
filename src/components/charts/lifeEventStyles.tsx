import {
  Briefcase,
  Home,
  Hammer,
  GraduationCap,
  Heart,
  HeartCrack,
  HeartPulse,
  Baby,
  Gift,
  MapPin,
  TrendingUp,
  Coffee,
  Calendar,
  Car,
  Sparkles,
  PartyPopper,
  Accessibility,
  Building2,
} from "lucide-react";
import type { LifeEvent, LifeEventType, FinancialImpact } from "@/models/life-event";
import { formatCurrency } from "@/lib/format";

// Color is grouped by event type so timeline + chart markers stay legibly
// categorical. 11 types map to 8 viz slots; near-duplicate types intentionally
// share a slot (career/part-time, health/insurance, inheritance/windfall).
export const EVENT_COLORS: Record<LifeEventType, string> = {
  career_change: "var(--viz-3)",
  part_time_work: "var(--viz-3)",
  major_expense: "var(--viz-2)",
  education: "var(--viz-4)",
  health_event: "var(--viz-5)",
  insurance_change: "var(--viz-5)",
  family_change: "var(--viz-7)",
  inheritance: "var(--viz-1)",
  windfall: "var(--viz-1)",
  relocation: "var(--viz-8)",
  custom: "var(--viz-6)",
};

const ICON_SIZE = 16;

export interface LifeEventTemplate {
  /** Stable identifier persisted on each created LifeEvent so the icon stays consistent
   *  across editor, timeline, and chart markers even after the user renames the event. */
  id: string;
  type: LifeEventType;
  label: string;
  icon: React.ReactNode;
  category: string;
  defaults: {
    description: string;
    triggerAge: number;
    durationYears: number | null;
    financialImpact: Partial<FinancialImpact>;
  };
}

export const LIFE_EVENT_TEMPLATES: LifeEventTemplate[] = [
  {
    id: "job_change",
    type: "career_change",
    label: "Job change / raise",
    icon: <Briefcase size={ICON_SIZE} />,
    category: "Career",
    defaults: {
      description: "",
      triggerAge: 40,
      durationYears: null,
      financialImpact: {
        incomeChanges: [{ existingIncomeId: null, newIncome: { annualAmount: 0 } }],
      },
    },
  },
  {
    id: "sabbatical",
    type: "career_change",
    label: "Sabbatical",
    icon: <Coffee size={ICON_SIZE} />,
    category: "Career",
    defaults: {
      description: "Time away from work",
      triggerAge: 45,
      durationYears: 1,
      financialImpact: {
        incomeChanges: [{ existingIncomeId: null, newIncome: { annualAmount: 0 } }],
      },
    },
  },
  {
    id: "buy_home",
    type: "major_expense",
    label: "Buy a home",
    icon: <Home size={ICON_SIZE} />,
    category: "Expenses",
    defaults: {
      description: "Down payment + ongoing housing costs",
      triggerAge: 35,
      durationYears: null,
      financialImpact: {
        oneTimeOutflow: 100_000,
        expenseChanges: [{ existingExpenseId: null, newExpense: { annualAmount: 30_000 } }],
      },
    },
  },
  {
    id: "home_renovation",
    type: "major_expense",
    label: "Home renovation",
    icon: <Hammer size={ICON_SIZE} />,
    category: "Expenses",
    defaults: {
      description: "",
      triggerAge: 45,
      durationYears: null,
      financialImpact: { oneTimeOutflow: 50_000 },
    },
  },
  {
    id: "child_college",
    type: "education",
    label: "Child's college",
    icon: <GraduationCap size={ICON_SIZE} />,
    category: "Family",
    defaults: {
      description: "College tuition",
      triggerAge: 50,
      durationYears: 4,
      financialImpact: { oneTimeOutflow: 40_000 },
    },
  },
  {
    id: "child_born",
    type: "family_change",
    label: "Child born",
    icon: <Baby size={ICON_SIZE} />,
    category: "Family",
    defaults: {
      description: "",
      triggerAge: 32,
      durationYears: 18,
      financialImpact: {
        expenseChanges: [{ existingExpenseId: null, newExpense: { annualAmount: 15_000 } }],
      },
    },
  },
  {
    id: "inheritance",
    type: "inheritance",
    label: "Inheritance received",
    icon: <Gift size={ICON_SIZE} />,
    category: "Other",
    defaults: {
      description: "",
      triggerAge: 55,
      durationYears: null,
      financialImpact: { oneTimeInflow: 200_000 },
    },
  },
  {
    id: "long_term_care",
    type: "health_event",
    label: "Long-term care",
    icon: <HeartPulse size={ICON_SIZE} />,
    category: "Health",
    defaults: {
      description: "Long-term care expenses (medical CPI rate)",
      triggerAge: 80,
      durationYears: 3,
      financialImpact: {
        // Long-term care costs have outpaced general CPI for decades, so
        // default to ~5% medical inflation rather than CPI.
        expenseChanges: [
          { existingExpenseId: null, newExpense: { annualAmount: 111_000, inflationRate: 0.05 } },
        ],
      },
    },
  },
  {
    id: "relocate",
    type: "relocation",
    label: "Relocate",
    icon: <MapPin size={ICON_SIZE} />,
    category: "Other",
    defaults: {
      description: "Moving costs and adjusted cost-of-living expense",
      triggerAge: 55,
      durationYears: null,
      financialImpact: {
        oneTimeOutflow: 20_000,
        expenseChanges: [{ existingExpenseId: null, newExpense: { annualAmount: 5_000 } }],
      },
    },
  },
  {
    id: "sell_business",
    type: "windfall",
    label: "Sell business",
    icon: <Building2 size={ICON_SIZE} />,
    category: "Other",
    defaults: {
      description: "",
      triggerAge: 55,
      durationYears: null,
      financialImpact: { oneTimeInflow: 500_000 },
    },
  },
  {
    id: "part_time_consulting",
    type: "part_time_work",
    label: "Part-time consulting",
    icon: <Briefcase size={ICON_SIZE} />,
    category: "Career",
    defaults: {
      description: "Part-time income in retirement",
      triggerAge: 65,
      durationYears: 5,
      financialImpact: {
        incomeChanges: [
          {
            existingIncomeId: null,
            newIncome: {
              annualAmount: 30_000,
              taxable: true,
              inflationAdjusted: true,
              growthRate: 0,
            },
          },
        ],
      },
    },
  },
  {
    id: "phased_retirement",
    type: "career_change",
    label: "Phased retirement",
    icon: <TrendingUp size={ICON_SIZE} />,
    category: "Career",
    defaults: {
      description: "Reduce hours / shift to part-time before full retirement",
      triggerAge: 60,
      durationYears: 5,
      financialImpact: {
        incomeChanges: [{ existingIncomeId: null, newIncome: { annualAmount: 50_000 } }],
      },
    },
  },
  {
    id: "downsize",
    type: "major_expense",
    label: "Sell home / downsize",
    icon: <Home size={ICON_SIZE} />,
    category: "Expenses",
    defaults: {
      description: "Net proceeds from selling primary residence; lower ongoing costs",
      triggerAge: 65,
      durationYears: null,
      financialImpact: {
        oneTimeInflow: 200_000,
        expenseChanges: [{ existingExpenseId: null, newExpense: { annualAmount: 12_000 } }],
      },
    },
  },
  {
    id: "buy_car",
    type: "major_expense",
    label: "Buy a new car",
    icon: <Car size={ICON_SIZE} />,
    category: "Expenses",
    defaults: {
      description: "",
      triggerAge: 50,
      durationYears: null,
      financialImpact: { oneTimeOutflow: 35_000 },
    },
  },
  {
    id: "wedding",
    type: "family_change",
    label: "Wedding",
    icon: <PartyPopper size={ICON_SIZE} />,
    category: "Family",
    defaults: {
      description: "",
      triggerAge: 30,
      durationYears: null,
      financialImpact: { oneTimeOutflow: 30_000 },
    },
  },
  {
    id: "marriage",
    type: "family_change",
    label: "Marriage (financial join)",
    icon: <Heart size={ICON_SIZE} />,
    category: "Family",
    defaults: {
      description: "Combine households / change filing status",
      triggerAge: 35,
      durationYears: null,
      financialImpact: {},
    },
  },
  {
    id: "divorce",
    type: "family_change",
    label: "Divorce",
    icon: <HeartCrack size={ICON_SIZE} />,
    category: "Family",
    defaults: {
      description: "Asset split / changed expenses",
      triggerAge: 50,
      durationYears: null,
      financialImpact: { oneTimeOutflow: 50_000 },
    },
  },
  {
    id: "disability",
    type: "health_event",
    label: "Disability",
    icon: <Accessibility size={ICON_SIZE} />,
    category: "Health",
    defaults: {
      description: "Income loss + healthcare expense",
      triggerAge: 55,
      durationYears: null,
      financialImpact: {
        // Wage replacement (e.g. SSDI / LTD) often runs ~60% of pre-disability
        // wages. Start with a $30K placeholder. User overrides their primary
        // income source to zero or reduced via the income-changes section.
        incomeChanges: [
          {
            existingIncomeId: null,
            newIncome: { annualAmount: 30_000, taxable: false, inflationAdjusted: true },
          },
        ],
        expenseChanges: [{ existingExpenseId: null, newExpense: { annualAmount: 30_000 } }],
      },
    },
  },
  {
    id: "custom",
    type: "custom",
    label: "Custom event",
    icon: <Sparkles size={ICON_SIZE} />,
    category: "Other",
    defaults: {
      description: "",
      triggerAge: 50,
      durationYears: null,
      financialImpact: {},
    },
  },
];

const TEMPLATE_BY_ID: Record<string, LifeEventTemplate> = Object.fromEntries(
  LIFE_EVENT_TEMPLATES.map((t) => [t.id, t]),
);
const TEMPLATE_BY_LABEL: Record<string, LifeEventTemplate> = Object.fromEntries(
  LIFE_EVENT_TEMPLATES.map((t) => [t.label.toLowerCase(), t]),
);

// Type-level fallback used when a custom event is not matched against a template.
const TYPE_FALLBACK_ICON: Record<LifeEventType, React.ReactNode> = {
  career_change: <Briefcase size={ICON_SIZE} />,
  major_expense: <Home size={ICON_SIZE} />,
  education: <GraduationCap size={ICON_SIZE} />,
  health_event: <HeartPulse size={ICON_SIZE} />,
  family_change: <Heart size={ICON_SIZE} />,
  inheritance: <Gift size={ICON_SIZE} />,
  relocation: <MapPin size={ICON_SIZE} />,
  windfall: <TrendingUp size={ICON_SIZE} />,
  part_time_work: <Coffee size={ICON_SIZE} />,
  insurance_change: <HeartPulse size={ICON_SIZE} />,
  custom: <Calendar size={ICON_SIZE} />,
};

export function getEventTemplate(event: LifeEvent): LifeEventTemplate | undefined {
  if (event.iconKey && TEMPLATE_BY_ID[event.iconKey]) return TEMPLATE_BY_ID[event.iconKey];
  // Legacy events (created before iconKey existed) fall back to label match.
  return TEMPLATE_BY_LABEL[event.label.toLowerCase()];
}

export function getEventIcon(event: LifeEvent): React.ReactNode {
  const template = getEventTemplate(event);
  if (template) return template.icon;
  return TYPE_FALLBACK_ICON[event.type];
}

export function getEventColor(event: LifeEvent): string {
  return EVENT_COLORS[event.type];
}

export function LifeEventTooltipContent({ event }: { event: LifeEvent }) {
  const { financialImpact: fi } = event;
  const ageRange = event.durationYears
    ? `Age ${event.triggerAge}–${event.triggerAge + event.durationYears - 1}`
    : `Age ${event.triggerAge}`;
  const incomeRows = fi.incomeChanges.filter((ic) => (ic.newIncome.annualAmount ?? 0) !== 0);
  const expenseRows = fi.expenseChanges.filter((ec) => (ec.newExpense.annualAmount ?? 0) !== 0);
  const contribRows = fi.contributionChanges;
  const hasAny =
    fi.oneTimeInflow > 0 ||
    fi.oneTimeOutflow > 0 ||
    incomeRows.length > 0 ||
    expenseRows.length > 0 ||
    contribRows.length > 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="font-semibold text-text-primary">{event.label}</div>
      <div className="text-caption text-text-tertiary">{ageRange}</div>
      {hasAny && (
        <div className="mt-0.5 flex flex-col gap-0.5 text-caption tabular-nums text-text-secondary">
          {fi.oneTimeInflow > 0 && <span>+{formatCurrency(fi.oneTimeInflow)} one-time</span>}
          {fi.oneTimeOutflow > 0 && <span>-{formatCurrency(fi.oneTimeOutflow)} one-time</span>}
          {incomeRows.map((ic, i) => (
            <span key={`inc-${i}`}>
              {ic.existingIncomeId
                ? `Income → ${formatCurrency(ic.newIncome.annualAmount ?? 0)}/yr`
                : `+${formatCurrency(ic.newIncome.annualAmount ?? 0)}/yr income`}
            </span>
          ))}
          {expenseRows.map((ec, i) => (
            <span key={`exp-${i}`}>+{formatCurrency(ec.newExpense.annualAmount ?? 0)}/yr expense</span>
          ))}
          {contribRows.map((cc, i) => (
            <span key={`con-${i}`}>Contribution → {formatCurrency(cc.newAnnualContribution)}/yr</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function RetirementTooltipContent({ age }: { age: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="font-semibold text-text-primary">Retirement</div>
      <div className="text-caption text-text-tertiary">Age {age}</div>
    </div>
  );
}
