import { type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-[var(--space-4)] md:flex-row md:items-start md:justify-between md:gap-[var(--space-5)]",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-[var(--space-1)]">
        {typeof title === "string" ? (
          <h1 className="text-heading-lg font-semibold text-text-primary">{title}</h1>
        ) : (
          title
        )}
        {subtitle && <p className="text-body-sm text-text-secondary">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-[var(--space-3)] md:shrink-0 md:flex-nowrap">
          {actions}
        </div>
      )}
    </div>
  );
}
