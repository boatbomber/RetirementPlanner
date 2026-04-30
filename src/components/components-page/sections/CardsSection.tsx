import { Card, CardHeader, CardBody, CardFooter, MetricCard, Button } from "@/components/primitives";
import { TrendingUp, TrendingDown } from "lucide-react";

export function CardsSection() {
  return (
    <section className="flex flex-col gap-[var(--space-7)]">
      <div>
        <h2 className="text-metric-lg font-semibold tracking-tight text-text-primary">Cards</h2>
        <p className="mt-1 text-body text-text-secondary">
          5 variants: surface, raised, sunken, metric, interactive.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card variant="surface">
          <CardHeader>
            <h3 className="text-heading-sm font-semibold text-text-primary">Surface</h3>
          </CardHeader>
          <CardBody>
            <p className="text-body text-text-secondary">
              Default card with subtle border and shadow-1. Used for most content containers.
            </p>
          </CardBody>
          <CardFooter>
            <Button variant="tertiary" size="sm">
              Action
            </Button>
          </CardFooter>
        </Card>

        <Card variant="raised">
          <CardHeader>
            <h3 className="text-heading-sm font-semibold text-text-primary">Raised</h3>
          </CardHeader>
          <CardBody>
            <p className="text-body text-text-secondary">
              Elevated card with shadow-2. No border. Used for modals and popovers.
            </p>
          </CardBody>
        </Card>

        <Card variant="sunken">
          <CardHeader>
            <h3 className="text-heading-sm font-semibold text-text-primary">Sunken</h3>
          </CardHeader>
          <CardBody>
            <p className="text-body text-text-secondary">
              Recessed surface. Used for input wells, table headers, code blocks.
            </p>
          </CardBody>
        </Card>

        <Card variant="interactive">
          <CardHeader>
            <h3 className="text-heading-sm font-semibold text-text-primary">Interactive</h3>
          </CardHeader>
          <CardBody>
            <p className="text-body text-text-secondary">
              Clickable card. Hover lifts to shadow-2. Active presses down 1px.
            </p>
          </CardBody>
        </Card>
      </div>

      <div>
        <h4 className="mb-3 text-body font-semibold text-text-primary">Metric cards</h4>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            label="Portfolio Value"
            value="$1,284,500"
            sub={
              <span className="flex items-center gap-[var(--space-1)] text-success">
                <TrendingUp size={12} strokeWidth={1.75} />
                +12.4%
              </span>
            }
          />
          <MetricCard label="Annual Spending" value="$72,000" sub="$6,000/mo" />
          <MetricCard
            label="Success Rate"
            value="85%"
            sub={
              <span className="flex items-center gap-[var(--space-1)] text-danger">
                <TrendingDown size={12} strokeWidth={1.75} />
                -5pp vs. last
              </span>
            }
          />
        </div>
      </div>
    </section>
  );
}
