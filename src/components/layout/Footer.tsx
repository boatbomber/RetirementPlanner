import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="hidden md:flex shrink-0 items-center justify-between gap-[var(--space-5)] border-t border-[var(--color-border-subtle)] bg-canvas px-[var(--space-7)] py-[var(--space-3)] text-overline text-text-tertiary">
      <p className="leading-snug opacity-70">
        This tool is for educational illustration. Projections are probabilistic, not guarantees. Tax rules
        reflect 2026 US law and do not predict future legislation. See{" "}
        <Link to="/scenario/assumptions" className="underline">
          assumptions
        </Link>{" "}
        for detail.
      </p>
      <span className="shrink-0">© {new Date().getFullYear()} Zack Williams</span>
    </footer>
  );
}
