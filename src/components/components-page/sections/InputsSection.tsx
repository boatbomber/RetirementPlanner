import { useState } from "react";
import {
  FieldShell,
  TextInput,
  Select,
  Slider,
  Switch,
  Checkbox,
  RadioGroup,
  DateInput,
  TagInput,
} from "@/components/primitives";

export function InputsSection() {
  const [switchOn, setSwitchOn] = useState(false);
  const [checked, setChecked] = useState<boolean | "indeterminate">(false);
  const [tags, setTags] = useState(["Roth", "HSA"]);

  return (
    <section className="flex flex-col gap-[var(--space-7)]">
      <div>
        <h2 className="text-metric-lg font-semibold tracking-tight text-text-primary">Inputs</h2>
        <p className="mt-1 text-body text-text-secondary">
          Text, currency, percent, select, slider, switch, checkbox, radio, date, tags.
        </p>
      </div>

      <div className="grid max-w-2xl grid-cols-2 gap-6">
        <FieldShell label="Full name" helper="As it appears on your tax return">
          <TextInput placeholder="e.g., Jane Doe" />
        </FieldShell>

        <FieldShell label="Annual income" helper="Gross pre-tax">
          <TextInput inputType="currency" placeholder="120,000" />
        </FieldShell>

        <FieldShell label="Savings rate">
          <TextInput inputType="percent" placeholder="15" />
        </FieldShell>

        <FieldShell label="Retirement age">
          <TextInput inputType="number" placeholder="65" />
        </FieldShell>

        <FieldShell label="With error" error="This value must be between 0 and 150.">
          <TextInput inputType="number" defaultValue="200" error />
        </FieldShell>

        <FieldShell label="Disabled">
          <TextInput disabled placeholder="Not editable" />
        </FieldShell>

        <FieldShell label="Filing status">
          <Select
            options={[
              { value: "single", label: "Single" },
              { value: "mfj", label: "Married Filing Jointly" },
              { value: "mfs", label: "Married Filing Separately" },
              { value: "hoh", label: "Head of Household" },
            ]}
            placeholder="Select status…"
          />
        </FieldShell>

        <FieldShell label="Start date">
          <DateInput />
        </FieldShell>
      </div>

      <div className="max-w-md">
        <FieldShell label="Equity allocation">
          <Slider
            defaultValue={[60]}
            min={0}
            max={100}
            step={5}
            formatValue={(v) => `${v}%`}
            aria-label="Equity allocation"
          />
        </FieldShell>
      </div>

      <div className="flex flex-wrap items-center gap-8">
        <label className="flex items-center gap-2 text-body text-text-primary">
          <Switch checked={switchOn} onCheckedChange={setSwitchOn} />
          Dark mode
        </label>

        <label className="flex items-center gap-2 text-body text-text-primary">
          <Checkbox checked={checked} onCheckedChange={setChecked} />
          Include Social Security
        </label>
      </div>

      <div className="max-w-xs">
        <RadioGroup
          defaultValue="moderate"
          options={[
            { value: "conservative", label: "Conservative" },
            { value: "moderate", label: "Moderate" },
            { value: "aggressive", label: "Aggressive" },
          ]}
        />
      </div>

      <div className="max-w-md">
        <FieldShell label="Account tags">
          <TagInput value={tags} onChange={setTags} placeholder="Add a tag…" />
        </FieldShell>
      </div>
    </section>
  );
}
