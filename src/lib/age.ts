import type { Scenario } from "@/models/scenario";

// Compute the user's current age, accounting for whether they've reached
// their birthday month yet this year. birthMonth is 1-12 (Jan = 1) to match
// the wizard's MonthInput; Date.getMonth() is 0-11 (Jan = 0). The off-by-one
// matters around year-end: a December baby on Jan 1 should still be one year
// younger than calendar year - birth year, or the FanChart "you are here"
// marker lands on the wrong band.
export function getCurrentAge(scenario: Scenario): number {
  const now = new Date();
  const calendarAge = now.getFullYear() - scenario.profile.birthYear;
  const birthMonth = scenario.profile.birthMonth;
  const beforeBirthday = now.getMonth() + 1 < birthMonth;
  return calendarAge - (beforeBirthday ? 1 : 0);
}
