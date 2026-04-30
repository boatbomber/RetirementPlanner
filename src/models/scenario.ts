import type { UUID } from "./core";
import type { UserProfile } from "./profile";
import type { Account } from "./account";
import type { IncomeSource } from "./income";
import type { Expense } from "./expense";
import type { LifeEvent } from "./life-event";
import type { SocialSecurityConfig } from "./social-security";
import type { WithdrawalStrategy, WithdrawalOrder } from "./withdrawal";
import type { SimulationConfig } from "./simulation-config";
import type { Goal } from "./goal";

export interface Scenario {
  id: UUID;
  name: string;
  description: string;
  color: string;
  parentId: UUID | null;
  isBaseline: boolean;

  profile: UserProfile;
  accounts: Account[];
  incomeSources: IncomeSource[];
  expenses: Expense[];
  lifeEvents: LifeEvent[];
  socialSecurity: SocialSecurityConfig;
  withdrawalStrategy: WithdrawalStrategy;
  withdrawalOrder: WithdrawalOrder;
  simulationConfig: SimulationConfig;

  // Cached prescriptive solver outputs ("when can I retire at 90% confidence"
  // and "how much extra do I need to save to hit my target age"). Auto-solve
  // populates this from scenario fields after each edit; the dashboard reads
  // it directly. Optional because new scenarios start without it.
  goal?: Goal;

  createdAt: string;
  updatedAt: string;
}
