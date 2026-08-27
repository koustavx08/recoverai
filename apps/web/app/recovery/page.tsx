import { AlertTriangle, RefreshCcw, ShieldCheck, TrendingUp } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadPortfolioPipeline } from "@/lib/pipeline";
import { formatCount, formatMoney } from "@/lib/format";

export default async function RecoveryActivityPage() {
  const view = await loadPortfolioPipeline();

  return (
    <>
      <Topbar
        title="Recovery Pipeline"
        description="Portfolio-level detection, prioritization, diagnosis, strategy, SIMULATED execution, and verification"
      />
      <main className="flex-1 overflow-y-auto p-6">
        {!view ? (
          <EmptyState
            icon={RefreshCcw}
            title="No pipeline data yet"
            description="This view runs the full RecoverAI pipeline over the bundled sample dataset. Nothing shown here is real recovered revenue."
            hint="recoverai pipeline run"
          />
        ) : (
          <div className="flex flex-col gap-6">
            <Card className="border-2 border-warning/40">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <p className="text-sm text-foreground">
                  Every recovery outcome below is a <strong>SIMULATED</strong> result from a
                  deterministic, seeded simulator — no real payment provider is connected and no
                  real money has moved.
                </p>
                <Badge variant="warning" className="shrink-0 uppercase">
                  Simulation mode
                </Badge>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Transactions processed"
                value={formatCount(view.batch.total)}
                helper={`${formatCount(view.batch.metrics.actionableTransactions)} actionable`}
                icon={RefreshCcw}
              />
              <StatCard
                label="Revenue at risk"
                value={formatMoney(view.batch.metrics.revenueAtRisk)}
                helper="Failed + abandoned transactions detected"
                icon={AlertTriangle}
              />
              <StatCard
                label="Simulated recovery"
                value={formatMoney(view.batch.metrics.simulatedRecoveredAmount)}
                helper="SIMULATED — not confirmed recovered revenue"
                icon={TrendingUp}
              />
              <StatCard
                label="Simulation recovery rate"
                value={`${view.batch.metrics.simulationRecoveryRate.toFixed(1)}%`}
                helper={`${view.batch.metrics.verificationPassed} verified / ${view.batch.metrics.verificationFailed} failed`}
                icon={ShieldCheck}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Pipeline status</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <StatusRow label="Completed" value={view.batch.completed} variant="success" />
                  <StatusRow label="Blocked" value={view.batch.blocked} variant="warning" />
                  <StatusRow label="Skipped" value={view.batch.skipped} variant="neutral" />
                  <StatusRow label="Failed" value={view.batch.failed} variant="danger" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Priority distribution</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {(["critical", "high", "medium", "low"] as const).map((priority) => (
                    <div key={priority} className="flex items-center justify-between">
                      <Badge variant={priorityVariant(priority)} className="uppercase">
                        {priority}
                      </Badge>
                      <span className="tabular-nums text-sm text-foreground">
                        {formatCount(view.batch.metrics.priorityBreakdown[priority])}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recovery simulation outcomes</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <StatusRow
                    label="Simulated success"
                    value={view.batch.metrics.executionBreakdown.success}
                    variant="success"
                  />
                  <StatusRow
                    label="Simulated failure"
                    value={view.batch.metrics.executionBreakdown.failure}
                    variant="danger"
                  />
                  <StatusRow
                    label="Pending approval"
                    value={view.batch.metrics.executionBreakdown.pending}
                    variant="warning"
                  />
                  <StatusRow
                    label="Blocked"
                    value={view.batch.metrics.executionBreakdown.blocked}
                    variant="warning"
                  />
                  <StatusRow
                    label="Not executed"
                    value={view.batch.metrics.executionBreakdown.not_executed}
                    variant="neutral"
                  />
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Diagnosis distribution</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {Object.entries(view.batch.metrics.diagnosisBreakdown)
                    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
                    .map(([category, count]) => (
                      <div key={category} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{category}</span>
                        <span className="tabular-nums text-foreground">{formatCount(count ?? 0)}</span>
                      </div>
                    ))}
                  {Object.keys(view.batch.metrics.diagnosisBreakdown).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No transactions reached diagnosis.</p>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Strategy distribution</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {Object.entries(view.batch.metrics.strategyBreakdown)
                    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
                    .map(([strategy, count]) => (
                      <div key={strategy} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{strategy}</span>
                        <span className="tabular-nums text-foreground">{formatCount(count ?? 0)}</span>
                      </div>
                    ))}
                  {Object.keys(view.batch.metrics.strategyBreakdown).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No transactions reached strategy selection.</p>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            <p className="text-xs text-muted-foreground">
              Computed live from {view.file} via the real six-stage RecoverAI pipeline (Detection
              → Prioritization → Diagnosis → Strategy → Recovery Simulation → Verification). No
              chart or number on this page is fabricated — everything is aggregated from actual
              pipeline runs, and every recovery figure is explicitly SIMULATED, never real
              merchant revenue.
            </p>
          </div>
        )}
      </main>
    </>
  );
}

function StatusRow({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: "success" | "warning" | "danger" | "neutral";
}) {
  return (
    <div className="flex items-center justify-between">
      <Badge variant={variant}>{label}</Badge>
      <span className="tabular-nums text-sm text-foreground">{formatCount(value)}</span>
    </div>
  );
}

function priorityVariant(priority: "critical" | "high" | "medium" | "low"): "danger" | "warning" | "accent" | "neutral" {
  if (priority === "critical") return "danger";
  if (priority === "high") return "warning";
  if (priority === "medium") return "accent";
  return "neutral";
}
