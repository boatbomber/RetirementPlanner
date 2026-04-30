// Single source of truth for static engine-capability disclaimers shown in
// the UI. When engine capabilities change (e.g. a new tax provision is
// added or removed), update the relevant constant here and every surface
// that imports it stays consistent. Run a project-wide search for the
// constant name to see every place a given disclaimer is rendered.
//
// Style rules (per .claude/CLAUDE.md):
//   - no em-dashes, en-dashes, or prose semicolons
//   - plain strings only (no JSX), so this module stays trivially importable
//
// Dynamic engine warnings (`SimulationResult.warnings`) are NOT stored here.
// Those are runtime values produced by the engine and rendered separately.

/** Reminder that simulation outputs are nominal, not real. */
export const NOMINAL_DOLLARS_DISCLAIMER =
  "All dollar figures in these reports are nominal (future dollars including inflation), not adjusted to today's purchasing power. Long horizons can make terminal balances look much larger than they are in today's spending power.";

/** Federal + state tax modeling scope. */
export const TAX_MODELING_DISCLAIMER =
  "The tax engine models federal ordinary brackets (inflation indexed), LTCG and qualified dividends with stacking, the NIIT 3.8% surtax, Social Security taxability under IRC §86, the OBBBA senior bonus deduction (2025 through 2028), and bracketed state income tax and standard deductions. State brackets and deductions are not inflation indexed year over year. State-specific pension or Social Security exclusions, tax credits, and Washington's capital gains excise are not modeled. AMT, the 0.9% Additional Medicare Tax, IRMAA premium adjustments, itemized deductions, and local or property taxes are not modeled either, so high income paths and large Roth conversions may still look slightly more favorable than reality.";

/** Time stepping, SS scope, healthcare, and other engine simplifications. */
export const ENGINE_SIMPLIFICATIONS_DISCLAIMER =
  "Time steps are annual, not monthly or quarterly. Social Security covers primary benefits, survivor benefits with the survivor FRA early claim reduction, and the pre FRA earnings test, but spousal benefits, GPO/WEP, and the year of FRA recoupment rule are not modeled. Healthcare is folded into general expenses with a 2x CPI bump after age 85. The inherited IRA 10 year payout rule and the Roth 5 year holding period are not enforced, and statutory contribution limits are not validated against user inputs.";

/** Asset return and inflation modeling. */
export const MARKET_MODELING_DISCLAIMER =
  "Asset returns are drawn from a correlated lognormal distribution across seven asset classes (US large/small cap, international developed/emerging, US bonds, TIPS, cash) using a Cholesky decomposed correlation matrix. Inflation follows an AR(1) process with reflection at the boundaries, and the TIPS to stock correlation regime switches between low and high inflation states. Returns are otherwise iid year over year, with no tail dependence, jump risk, transaction costs, or tactical rebalancing.";

/**
 * Reports tax tab disclaimer. Same scope as TAX_MODELING_DISCLAIMER but kept
 * as its own export so the tax tab can diverge later without touching the
 * Dashboard. For now the two surfaces stay in lockstep.
 */
export const TAX_REPORT_DISCLAIMER = TAX_MODELING_DISCLAIMER;

/** Social Security editor scope note. Rendered for any filing status. */
export const SOCIAL_SECURITY_SCOPE_NOTE =
  "Note: the engine models primary benefits, survivor benefits, and the pre FRA earnings test. For married scenarios, when one spouse dies the survivor steps up to the higher of their own benefit or the deceased's, with the standard survivor FRA early claim reduction (up to 28.5% at age 60). Spousal benefits (a non-working spouse claiming up to 50% of the higher earner's PIA), GPO/WEP, and the year of FRA recoupment rule are not modeled.";

/** Profile editor "state of residence" field helper. */
export const STATE_OF_RESIDENCE_HELPER =
  "Engine applies each state's 2026 income tax brackets and standard deduction (with personal exemptions folded in) for Single and MFJ filers. Head-of-household uses single brackets, MFS uses MFJ divided by 2. Eight states with preferential LTCG treatment are modeled. State-specific pension or Social Security exclusions, tax credits, local taxes, and Washington's capital gains excise are not modeled.";

/**
 * First-run disclaimer items. The DisclaimerGate blocks app use until the
 * user acknowledges each one. Each entry has an `id` (used as the storage
 * key for the checkbox state), a short `label` shown next to the checkbox,
 * and a longer `body` shown beneath. Update the list here to change what the
 * user must acknowledge.
 */
export interface FirstRunDisclaimerItem {
  id: string;
  label: string;
  body: string;
}

export const FIRST_RUN_DISCLAIMER_ITEMS: readonly FirstRunDisclaimerItem[] = [
  {
    id: "not_financial_advice",
    label: "This is not financial advice.",
    body: "Outputs are illustrative projections produced by a Monte Carlo engine, not personalized recommendations. Consult a qualified fiduciary financial advisor before making decisions about your retirement, investments, or insurance.",
  },
  {
    id: "not_tax_or_legal_advice",
    label: "This is not tax, legal, or accounting advice.",
    body: "The tax engine is a simplified model of US federal and state law and is not a substitute for a CPA, enrolled agent, or attorney. Do not rely on these figures to file a return, plan a Roth conversion, or make any decision with legal or tax consequences.",
  },
  {
    id: "projections_not_guarantees",
    label: "Projections are probabilistic, not guarantees.",
    body: "Future returns, inflation, longevity, and tax law are uncertain. Success rates and percentile bands describe what the model produced under its assumptions and will not match real outcomes. Past performance does not predict future results.",
  },
  {
    id: "data_stays_local",
    label: "Your data never leaves this device.",
    body: "Everything you enter is stored only in this browser's IndexedDB. No data is sent to any server. Clearing browser storage or switching devices wipes your scenarios, so use the Settings page to export a backup if you want one.",
  },
  {
    id: "user_responsibility",
    label: "You are responsible for how you use this tool.",
    body: "The author provides this software as-is, with no warranty, and accepts no liability for decisions made using it. Verify any number that matters before acting on it.",
  },
];
