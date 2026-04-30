import { type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/primitives/Button";

interface NavItem {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface BottomNavProps {
  items: NavItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  className?: string;
}

export function BottomNav({ items, activeId, onSelect, className }: BottomNavProps) {
  return (
    <nav
      className={cn(
        "flex w-full shrink-0 items-stretch border-t border-[var(--color-border-subtle)] bg-surface",
        "pb-[env(safe-area-inset-bottom)]",
        className,
      )}
      aria-label="Primary"
    >
      {items.map((item) => {
        const active = activeId === item.id;
        return (
          <Button
            key={item.id}
            variant="ghost"
            onClick={() => onSelect?.(item.id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "h-auto min-w-0 flex-1 basis-0 flex-col gap-[2px] rounded-none px-[2px] py-[var(--space-2)]",
              active ? "text-primary hover:text-primary" : "text-text-tertiary hover:text-text-primary",
            )}
          >
            {item.icon && <span className="shrink-0">{item.icon}</span>}
            <span className="block w-full truncate text-caption font-medium leading-tight">{item.label}</span>
          </Button>
        );
      })}
    </nav>
  );
}
