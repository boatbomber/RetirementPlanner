import type { Dollars, Age, Rate, Year } from "./core";

export interface SocialSecurityPerson {
  enabled: boolean;
  fraMonthlyBenefit: Dollars;
  claimingAge: Age;
  fra: Age;
}

export interface SocialSecurityConfig {
  self: SocialSecurityPerson;
  spouse: SocialSecurityPerson | null;
  colaRate: Rate;
  useSolvencyHaircut: boolean;
  solvencyHaircutYear: Year;
  solvencyHaircutFactor: Rate;
}
