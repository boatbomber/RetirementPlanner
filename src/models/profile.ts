import type { UUID, Year, Month, Sex, Age, FilingStatus } from "./core";

export interface SpouseProfile {
  name: string;
  birthYear: Year;
  birthMonth: Month;
  sex: Sex;
  retirementAge: Age;
}

export interface UserProfile {
  id: UUID;
  name: string;
  birthYear: Year;
  birthMonth: Month;
  sex: Sex;
  retirementAge: Age;
  filingStatus: FilingStatus;
  stateOfResidence: string;
  spouse: SpouseProfile | null;
  planningHorizonAge: Age;
}
