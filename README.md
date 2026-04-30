# Retirement Planner

An in-depth, browser-based retirement planner. Build scenarios for your accounts, income, expenses, and life events, then run thousands of Monte Carlo simulations to see how your plan holds up across realistic market and inflation paths.

**Try it now: [plan-your-retirement.onrender.com](https://plan-your-retirement.onrender.com/)**

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fboatbomber%2FRetirementPlanner)

## Your data stays on your device

This is a static site that runs entirely in your browser. There is no backend, no telemetry, and no analytics. Scenarios are saved locally in IndexedDB; nothing is ever sent to a server. You can fork the repo and deploy your own copy with the button above if you prefer not to take my word for it.

## What it does

- **Monte Carlo simulation engine.** Year-by-year projections with correlated asset-class returns, stochastic or fixed inflation, optional stochastic mortality (SSA period or SOA RP-2014), tax-aware withdrawals, RMDs, Roth conversions, and federal tax estimation. Runs in a Web Worker so the UI stays responsive.
- **Eight withdrawal strategies.** Fixed real (the "4% rule"), Guyton-Klinger guardrails, Vanguard Dynamic Spending, VPW, RMD method, ARVA, Kitces ratchet, and risk-based.
- **Account-level modeling.** Traditional / Roth IRAs and 401(k)s, taxable brokerage, HYSA, CDs, money market, I-bonds. Each with its own asset allocation and optional glide path.
- **Income, expenses, and life events.** Wages, pensions, Social Security (with claiming-age tradeoffs), one-off and recurring expenses, and dated life events (downsizing, inheritances, etc.) all flow through the same yearly engine.
- **Scenario comparisons.** Branch a baseline scenario, tweak one variable, and compare success rate, percentile balances, and cash flow side by side.
- **Goal solver.** "When can I retire at 90% confidence?" and "How much more do I need to save to hit my target age?" auto-solved from the current scenario.
- **Reports.** Percentile balance bands, cash-flow tables, withdrawal schedules, account balances over time, Social Security timing. Exportable to CSV for further analysis.

## Tech stack

React 19 + TypeScript + Vite, Tailwind v4, Radix UI primitives, visx for charts, Zustand for state (persisted to IndexedDB via `idb-keyval`), Vitest + jsdom for tests. The simulation engine is pure TypeScript with a seeded PRNG, so iterations are deterministic and unit-testable.

## Local development

Requires Node 20+ and Yarn.

```bash
yarn install
yarn dev          # Vite dev server
yarn test         # run the test suite
yarn validate     # format check + typecheck + tests (run before committing)
yarn build        # typecheck and produce a production build
```

## Disclaimer

This is a planning tool, not financial advice. The simulation makes simplifying assumptions about the complexities of reality. Use the results to explore tradeoffs, not as a guarantee of any outcome. Talk to a fiduciary before making real decisions.
