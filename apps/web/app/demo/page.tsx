import { Ban, CheckCircle2, Clock, PlayCircle, ShieldAlert, UserCheck, Zap } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { EmptyState } from "@/components/empty-state";
import { StageTracker } from "@/components/pipeline/stage-tracker";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadDemoScenarios, type DemoScenarioView } from "@/lib/demo";
import { formatMoney } from "@/lib/format";
import { buildPipelineStageItems } from "@/lib/pipeline-stages";
import type { PipelineStatus } from "@recoverai/agents";

export default async function DemoPage() {
  const view = await loadDemoScenarios();

  return (
    <>
      <Topbar
        title="Demo Scenarios"
        description="Five hand-picked cases run through the real RecoverAI pipeline — proof it knows when to act, and when not to"
      />
      <main className="flex-1 overflow-y-auto p-6">
        {!view || view.scenarios.length === 0 ? (
          <EmptyState
            icon={PlayCircle}
            title="No demo data yet"
            description="This view runs the real pipeline over data/demo/scenarios.json — a small, curated set of cases chosen to show the full range of outcomes."
            hint="recoverai pipeline run --file data/demo/scenarios.json"
          />
        ) : (
          <div className="flex flex-col gap-6">
            <Card className="border-2 border-warning/40">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <p className="text-sm text-foreground">
                  Every outcome below comes from a real run of the six-stage RecoverAI pipeline —
                  nothing here is scripted or hand-written. Recovery execution is always a{" "}
                  <strong>SIMULATED</strong> result; no real payment provider is connected and no
                  real money has moved.
                </p>
                <Badge variant="warning" className="shrink-0 uppercase">
                  Simulation mode
                </Badge>
              </CardContent>
            </Card>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                RecoverAI doesn&apos;t try to recover every payment — it decides
              </p>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <DecisionTile
                  icon={Zap}
                  label="Act"
                  description="Diagnosed, planned, and simulated automatically."
                  href="#demo_txn_01"
                />
                <DecisionTile
                  icon={Clock}
                  label="Wait"
                  description="Plan is ready, but a human must approve first."
                  href="#demo_txn_05"
                />
                <DecisionTile
                  icon={Ban}
                  label="Block"
                  description="Already tried enough — refuses to keep retrying."
                  href="#demo_txn_03"
                />
                <DecisionTile
                  icon={UserCheck}
                  label="Escalate"
                  description="Signal too ambiguous to trust to automation."
                  href="#demo_txn_04"
                />
              </div>
            </div>

            <nav className="flex flex-wrap gap-2" aria-label="Jump to scenario">
              {view.scenarios.map((scenario) => (
                <a
                  key={scenario.id}
                  href={`#${scenario.id}`}
                  className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
                >
                  {scenario.title}
                </a>
              ))}
            </nav>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {view.scenarios.map((scenario) => (
                <ScenarioCard key={scenario.id} scenario={scenario} />
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Computed live from {view.file} via the real RecoveryPipeline (Detection →
              Prioritization → Diagnosis → Strategy → Recovery Simulation → Verification). No
              stage output on this page is fabricated, and no recovery figure is real merchant
              revenue.
            </p>
          </div>
        )}
      </main>
    </>
  );
}

function DecisionTile({
  icon: Icon,
  label,
  description,
  href,
}: {
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly label: string;
  readonly description: string;
  readonly href: string;
}) {
  return (
    <a
      href={href}
      className="flex flex-col gap-1 rounded border border-border bg-card p-3 transition-colors hover:border-accent/40"
    >
      <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-accent" />
        {label}
      </span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </a>
  );
}

function ScenarioCard({ scenario }: { scenario: DemoScenarioView }) {
  const { result } = scenario;

  return (
    <Card id={scenario.id} className="scroll-mt-6">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex flex-col gap-1">
          <CardTitle>{scenario.title}</CardTitle>
          <span className="text-xs text-muted-foreground">
            {scenario.id} · {formatMoney(scenario.amount)}
          </span>
        </div>
        <StatusBadge status={result.status} />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{scenario.narrative}</p>

        <StageTracker items={buildPipelineStageItems(result)} />

        <ol className="flex flex-col gap-2 border-l border-border pl-4">
          <StageRow label="Detection">
            {result.detection ? (
              <span>
                {result.detection.result.detected ? "Detected" : "Not detected"}
                {result.detection.result.detected
                  ? ` · ${result.detection.result.actionable ? "actionable" : "blocked"} · severity ${result.detection.result.severity}`
                  : ""}
              </span>
            ) : (
              <Muted />
            )}
          </StageRow>

          <StageRow label="Prioritization">
            {result.prioritization ? (
              <span className="capitalize">
                {result.prioritization.result.priority} (score {result.prioritization.result.score})
              </span>
            ) : (
              <Muted />
            )}
          </StageRow>

          <StageRow label="Diagnosis — why it failed">
            {result.diagnosis ? (
              <span>
                <strong className="text-foreground">{result.diagnosis.diagnosis.category}</strong>{" "}
                ({Math.round(result.diagnosis.diagnosis.confidence * 100)}% confidence,{" "}
                {result.diagnosis.meta.mode}). {result.diagnosis.diagnosis.explanation}
              </span>
            ) : (
              <Muted />
            )}
          </StageRow>

          <StageRow label="Strategy — why this fix">
            {result.strategy ? (
              <span>
                <strong className="text-foreground">{result.strategy.decision.strategy}</strong>{" "}
                (
                {result.strategy.decision.requiresHumanApproval
                  ? "human approval required"
                  : "no approval required"}
                ). {result.strategy.decision.rationale}
              </span>
            ) : (
              <Muted />
            )}
          </StageRow>

          <StageRow label="Recovery simulation">
            {result.execution ? (
              <span>
                {result.execution.result.action} → {result.execution.result.outcome}
                {result.execution.result.outcome === "success"
                  ? ` · SIMULATED ${formatMoney(result.execution.result.recoveredAmount)}`
                  : ""}
              </span>
            ) : (
              <Muted />
            )}
          </StageRow>

          <StageRow label="Verification">
            {result.verification ? (
              <span
                className={
                  result.verification.verification.verified ? "text-success" : "text-danger"
                }
              >
                {result.verification.verification.verified ? "PASSED" : "FAILED"}
              </span>
            ) : (
              <Muted />
            )}
          </StageRow>
        </ol>

        {result.statusReason ? (
          <p className="rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
            {result.statusReason}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StageRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-0.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <span className="text-muted-foreground">{children}</span>
    </li>
  );
}

function Muted() {
  return <span className="italic">did not run — pipeline stopped earlier</span>;
}

function StatusBadge({ status }: { status: PipelineStatus }) {
  const config: Record<PipelineStatus, { variant: BadgeProps["variant"]; icon: React.ReactNode }> = {
    completed: { variant: "success", icon: <CheckCircle2 className="h-3 w-3" /> },
    blocked: { variant: "warning", icon: <ShieldAlert className="h-3 w-3" /> },
    skipped: { variant: "neutral", icon: <CheckCircle2 className="h-3 w-3" /> },
    failed: { variant: "danger", icon: <ShieldAlert className="h-3 w-3" /> },
  };
  const { variant, icon } = config[status];

  return (
    <Badge variant={variant} className="flex shrink-0 items-center gap-1 uppercase">
      {icon}
      {status}
    </Badge>
  );
}
