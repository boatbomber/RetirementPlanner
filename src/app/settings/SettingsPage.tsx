import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Upload, Trash2 } from "lucide-react";
import { del as idbDel } from "idb-keyval";
import { useAppStore, STORE_NAME } from "@/store";
import { importSchema, type ImportData } from "@/store/schema";
import type { Scenario } from "@/models";
import { ITERATION_OPTIONS, normalizeScenario } from "@/models/defaults";
import { Button } from "@/components/primitives/Button";
import { Card, CardHeader, CardBody } from "@/components/primitives/Card";
import { RadioGroup } from "@/components/primitives/Input/RadioGroup";
import { Select } from "@/components/primitives/Input/Select";
import { FieldShell } from "@/components/primitives/Input/FieldShell";
import { Modal } from "@/components/primitives/Modal";
import { useToast } from "@/components/primitives/Toast";
import { PageHeader } from "@/components/layout/PageHeader";
import type { TableDensity } from "@/store/slices/uiSlice";

const DENSITY_OPTIONS = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
  { value: "dense", label: "Dense" },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const scenarios = useAppStore((s) => s.scenarios);
  const activeScenarioId = useAppStore((s) => s.activeScenarioId);
  const wizardCompleted = useAppStore((s) => s.wizardCompleted);
  const tableDensity = useAppStore((s) => s.tableDensity);
  const setTableDensity = useAppStore((s) => s.setTableDensity);
  const defaultIterations = useAppStore((s) => s.defaultIterations);
  const setDefaultIterations = useAppStore((s) => s.setDefaultIterations);

  const [importPreview, setImportPreview] = useState<ImportData | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const handleExport = useCallback(() => {
    const data = {
      scenarios,
      activeScenarioId,
      wizardCompleted,
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `retirement-plan-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ variant: "success", title: "Scenarios exported" });
  }, [scenarios, activeScenarioId, wizardCompleted, toast]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // 10 MB ceiling. Real exports of even a dozen scenarios are <100 KB; an
    // upload past this is either a wrong file or hostile, and FileReader +
    // JSON.parse on a multi-hundred-MB blob will OOM the tab before Zod
    // validation can reject it.
    const MAX_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      setImportPreview(null);
      setImportError(
        `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_BYTES / 1024 / 1024} MB.`,
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(reader.result as string);
        const result = importSchema.safeParse(raw);
        if (result.success) {
          setImportPreview(result.data);
          setImportError(null);
        } else {
          setImportPreview(null);
          const issues = result.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
          setImportError(`Validation failed: ${issues}`);
        }
      } catch {
        setImportPreview(null);
        setImportError("Could not parse JSON file.");
      }
    };
    reader.readAsText(file);
  }, []);

  const confirmImport = useCallback(() => {
    if (!importPreview) return;
    // Wipe simulations so each imported scenario triggers a fresh run on next
    // viewing. Otherwise useSimulation's fingerprint compares against
    // pre-import results that are no longer valid for the imported state.
    useAppStore.setState({
      // Normalize so older exports that pre-date a given invariant (e.g. an
      // MFJ scenario whose `socialSecurity.spouse` was never seeded) self-heal
      // on import, matching the behavior of the persistence migrate hook.
      scenarios: (importPreview.scenarios as Scenario[]).map(normalizeScenario),
      activeScenarioId: importPreview.activeScenarioId,
      wizardCompleted: importPreview.wizardCompleted,
      simulations: {},
    });
    setImportPreview(null);
    toast({
      variant: "success",
      title: `Imported ${importPreview.scenarios.length} scenario${importPreview.scenarios.length > 1 ? "s" : ""}`,
    });
    navigate("/dashboard");
  }, [importPreview, toast, navigate]);

  const handleReset = useCallback(async () => {
    useAppStore.setState({
      scenarios: [],
      activeScenarioId: null,
      comparisonScenarioId: null,
      wizardCompleted: false,
      simulations: {},
    });
    // Wipe IndexedDB synchronously so a fast tab close doesn't leave stale
    // persisted state behind from before the persist middleware's debounce
    // can write the cleared values back.
    try {
      await idbDel(STORE_NAME);
    } catch {
      // Best-effort cleanup; the in-memory reset above is what the user
      // actually sees.
    }
    setResetOpen(false);
    toast({ variant: "success", title: "All data cleared" });
    navigate("/wizard/basics");
  }, [toast, navigate]);

  return (
    <div className="flex flex-col gap-[var(--space-7)]">
      <PageHeader title="Settings" subtitle="Export, import, and manage your data." />

      <Card>
        <CardHeader>
          <span className="text-heading-sm font-semibold text-text-primary">Data Management</span>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap gap-[var(--space-3)]">
            <Button variant="secondary" icon={<Download size={16} />} onClick={handleExport}>
              Export Scenarios
            </Button>

            <Button variant="secondary" icon={<Upload size={16} />} onClick={() => fileRef.current?.click()}>
              Import Scenarios
            </Button>
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFileSelect} />

            <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => setResetOpen(true)}>
              Reset All Data
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <span className="text-heading-sm font-semibold text-text-primary">Preferences</span>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-[var(--space-5)]">
            <FieldShell label="Table density">
              <RadioGroup
                value={tableDensity}
                onValueChange={(v) => setTableDensity(v as TableDensity)}
                options={DENSITY_OPTIONS}
                orientation="horizontal"
              />
            </FieldShell>

            <FieldShell
              label="Default simulation iterations"
              helper="Used for newly created scenarios. Existing scenarios keep their own value."
            >
              <Select
                value={String(defaultIterations)}
                onValueChange={(v) => setDefaultIterations(parseInt(v))}
                options={ITERATION_OPTIONS}
              />
            </FieldShell>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <span className="text-heading-sm font-semibold text-text-primary">About</span>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-[var(--space-2)]">
            <p className="text-body-sm text-text-secondary">Retirement Planner v0.1.0</p>
            <p className="text-body-sm text-text-tertiary">
              Data is stored locally in your browser. Nothing is sent to any server.
            </p>
            <p className="text-body-sm text-text-tertiary">
              Built with data from IRS publications, SSA.gov, and peer-reviewed retirement research.
            </p>
          </div>
        </CardBody>
      </Card>

      {/* Import Preview Modal */}
      <Modal
        open={importPreview !== null || importError !== null}
        onOpenChange={(open) => {
          if (!open) {
            setImportPreview(null);
            setImportError(null);
          }
        }}
        title={importError ? "Import Error" : "Import Scenarios"}
      >
        {importError ? (
          <div className="flex flex-col gap-[var(--space-5)]">
            <p className="text-body text-text-secondary">{importError}</p>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setImportError(null)}>
                Close
              </Button>
            </div>
          </div>
        ) : importPreview ? (
          <div className="flex flex-col gap-[var(--space-5)]">
            <p className="text-body text-text-secondary">
              Found {importPreview.scenarios.length} scenario
              {importPreview.scenarios.length > 1 ? "s" : ""}:
            </p>
            <ul className="flex flex-col gap-[var(--space-2)]">
              {importPreview.scenarios.map((s) => (
                <li key={s.id} className="text-body-sm font-medium text-text-primary">
                  {s.name}
                </li>
              ))}
            </ul>
            <p className="text-body-sm text-text-tertiary">This will replace all your current data.</p>
            <div className="flex justify-end gap-[var(--space-3)]">
              <Button variant="secondary" onClick={() => setImportPreview(null)}>
                Cancel
              </Button>
              <Button onClick={confirmImport}>Import</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Reset Confirmation Modal */}
      <Modal
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset everything?"
        description="This will delete all your scenarios and data. This cannot be undone."
      >
        <div className="flex justify-end gap-[var(--space-3)] pt-[var(--space-5)]">
          <Button variant="secondary" onClick={() => setResetOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleReset}>
            Reset
          </Button>
        </div>
      </Modal>
    </div>
  );
}
