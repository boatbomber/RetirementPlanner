import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/primitives/Card";
import { Button } from "@/components/primitives/Button";

interface SummarySectionProps {
  title: string;
  editStep?: string;
  children: ReactNode;
}

export function SummarySection({ title, editStep, children }: SummarySectionProps) {
  const navigate = useNavigate();
  return (
    <Card variant="sunken" className="overflow-hidden">
      <div className="flex items-center justify-between px-[var(--space-5)] pt-[var(--space-4)] pb-[var(--space-2)]">
        <span className="text-overline text-text-tertiary">{title}</span>
        {editStep && (
          <Button variant="ghost" size="sm" onClick={() => navigate(`/wizard/${editStep}`)}>
            Edit
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-[var(--space-2)] px-[var(--space-5)] pb-[var(--space-4)]">
        {children}
      </div>
    </Card>
  );
}

export function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-body-sm">
      <span className="text-text-secondary">{label}</span>
      <span className="font-medium text-text-primary">{value}</span>
    </div>
  );
}
