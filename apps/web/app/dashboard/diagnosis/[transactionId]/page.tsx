import { notFound } from "next/navigation";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadTransactionDiagnosis } from "@/lib/diagnosis";
import { formatMoney } from "@/lib/format";
import { FAILURE_LABELS } from "@/lib/labels";

const PIPELINE_STAGES = [
  "Payment Failed",
  "Facts Extracted",
  "Evidence Generated",
  "Diagnosis",
  "Risk Context",
  "Allowed Strategies",
  "Selected Strategy",
  "Execution Plan",
  "Simulation",
  "Verification",
];

const OUTCOME_BADGE_VARIANT: Readonly<Record<string, "success" | "danger" | "warning" | "neutral">> = {
  success: "success",
  failure: "danger",
  pending: "warning",
  blocked: "warning",
  not_executed: "neutral",
};

interface DiagnosisPageProps {
  readonly params: Promise<{ transactionId: string }>;
}

export default async function DiagnosisPage({ params }: DiagnosisPageProps) {
  const { transactionId } = await params;
  const view = await loadTransactionDiagnosis(transactionId);
  if (!view) notFound();

  const {
    transaction,
    failureReason,
    risk,
    amount,
    outcome,
    strategyOutcome,
    allowedStrategies,
    strategyConstraints,
    executionOutcome,
    verificationOutcome,
    simulationProfile,
  } = view;
  const { diagnosis, meta } = outcome;
  const { decision, meta: strategyMeta } = strategyOutcome;
  const { result: execution, meta: executionMeta } = executionOutcome;
  const { verification } = verificationOutcome;

  return (
    <>
      <Topbar
        title={`Diagnosis · ${transaction.id}`}
        description="Structured, evidence-grounded AI diagnosis of one failed payment"
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-2 p-4 text-xs text-muted-foreground">
              {PIPELINE_STAGES.map((stage, index) => (
                <div key={stage} className="flex items-center gap-2">
                  <span className="rounded-full border border-border bg-muted px-2 py-1 font-medium text-foreground">
                    {stage}
                  </span>
                  {index < PIPELINE_STAGES.length - 1 ? (
                    <ArrowRight className="h-3 w-3" />
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Transaction</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <Row label="Transaction" value={transaction.id} mono />
                <Row label="Amount" value={formatMoney(amount)} />
                <Row label="Status" value={transaction.status} />
                <Row label="Payment method" value={transaction.paymentMethod} />
                <Row label="Attempts" value={String(transaction.attemptCount)} />
                <Row label="Failure" value={FAILURE_LABELS[failureReason.code]} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Deterministic risk signals</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <Row label="Risk score" value={`${risk.riskScore}/100`} />
                <Row label="Recoverability score" value={`${risk.recoverabilityScore}/100`} />
                <Row label="Priority" value={risk.priority} />
                <Row label="Expected recovery" value={formatMoney(risk.expectedRecoveryAmount)} />
                <Row label="Recommended strategy" value={risk.recommendedStrategy} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>AI diagnosis</CardTitle>
                <Badge variant={meta.mode === "llm" ? "accent" : "neutral"}>
                  {meta.mode === "llm" ? "AI GENERATED" : "DETERMINISTIC FALLBACK"}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <Row label="Category" value={diagnosis.category} />
                <Row label="Recoverability" value={diagnosis.recoverabilityAssessment} />
                <Row label="Confidence" value={`${Math.round(diagnosis.confidence * 100)}%`} />
                <Row
                  label="Retry recommended"
                  value={diagnosis.retryRecommendation.recommended ? "Yes" : "No"}
                />
                <Row
                  label="Eligible interventions"
                  value={diagnosis.interventionEligibility.join(", ")}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Primary cause</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-foreground">{diagnosis.explanation}</CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Why (evidence used)</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {diagnosis.evidence.map((item) => (
                  <div key={item.id} className="rounded border border-border p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{item.id}</span>
                      <Badge variant="neutral">weight {item.weight.toFixed(2)}</Badge>
                    </div>
                    <p className="text-foreground">{item.fact}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.relevance}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Uncertainty &amp; limitations</CardTitle>
              </CardHeader>
              <CardContent>
                {diagnosis.limitations.length > 0 ? (
                  <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                    {diagnosis.limitations.map((limitation) => (
                      <li key={limitation} className="flex gap-2">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                        <span>{limitation}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No limitations reported.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Audit metadata — diagnosis</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              <Row label="Mode" value={meta.mode} />
              <Row label="Provider" value={meta.provider ?? "—"} />
              <Row label="Model" value={meta.model ?? "—"} />
              <Row label="Latency" value={`${meta.latencyMs}ms`} />
              <Row label="Validation" value={meta.validationSuccess ? "passed" : "failed"} />
              <Row label="Fallback used" value={meta.fallbackUsed ? "yes" : "no"} />
              <Row label="Agent" value={diagnosis.metadata.agentVersion} />
              <Row label="Generated at" value={diagnosis.metadata.generatedAt} />
              {meta.fallbackReason ? (
                <div className="col-span-2 sm:col-span-4">
                  <Row label="Fallback reason" value={meta.fallbackReason} />
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Strategy selection</CardTitle>
              <Badge variant={strategyMeta.mode === "llm" ? "accent" : "neutral"}>
                {strategyMeta.mode === "llm" ? "AI GENERATED" : "DETERMINISTIC FALLBACK"}
              </Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2 text-sm">
                  <Row label="Allowed strategies" value={allowedStrategies.join(", ")} />
                  <Row label="Selected strategy" value={decision.strategy} />
                  <Row label="Confidence" value={`${Math.round(decision.confidence * 100)}%`} />
                  <Row
                    label="Approval requirement"
                    value={decision.requiresHumanApproval ? "Human approval required" : "Not required"}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  {decision.requiresHumanApproval ? (
                    <Badge variant="warning" className="w-fit">
                      requires human approval
                    </Badge>
                  ) : (
                    <Badge variant="success" className="w-fit">
                      no approval required
                    </Badge>
                  )}
                  {strategyConstraints.length > 0 ? (
                    <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                      {strategyConstraints.map((constraint) => (
                        <li key={constraint}>- {constraint}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>

              <div>
                <p className="mb-1 text-sm font-medium text-foreground">Why this strategy</p>
                <p className="text-sm text-muted-foreground">{decision.rationale}</p>
              </div>

              <div>
                <p className="mb-1 text-sm font-medium text-foreground">Expected outcome</p>
                <p className="text-sm text-muted-foreground">{decision.expectedOutcome}</p>
              </div>

              {decision.limitations.length > 0 ? (
                <div>
                  <p className="mb-1 text-sm font-medium text-foreground">Limitations</p>
                  <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                    {decision.limitations.map((limitation) => (
                      <li key={limitation} className="flex gap-2">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                        <span>{limitation}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Audit metadata — strategy</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              <Row label="Mode" value={strategyMeta.mode} />
              <Row label="Provider" value={strategyMeta.provider ?? "—"} />
              <Row label="Model" value={strategyMeta.model ?? "—"} />
              <Row label="Latency" value={`${strategyMeta.latencyMs}ms`} />
              <Row label="Validation" value={strategyMeta.validationSuccess ? "passed" : "failed"} />
              <Row label="Fallback used" value={strategyMeta.fallbackUsed ? "yes" : "no"} />
              <Row label="Agent" value={decision.metadata.agentVersion} />
              <Row label="Generated at" value={decision.metadata.generatedAt} />
              {strategyMeta.fallbackReason ? (
                <div className="col-span-2 sm:col-span-4">
                  <Row label="Fallback reason" value={strategyMeta.fallbackReason} />
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-2 border-warning/40">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recovery execution</CardTitle>
              <Badge variant="warning" className="uppercase">
                Simulation mode
              </Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="rounded border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
                No real payment provider is connected. No real Razorpay action occurs. Every
                figure below is a <strong>SIMULATED</strong> outcome, computed by a deterministic,
                seeded simulator — never a claim of actual recovered revenue.
              </p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2 text-sm">
                  <Row label="Mapped action" value={execution.action} />
                  <Row label="Outcome" value={execution.outcome} />
                  <Row label="Simulated recovery" value={`${formatMoney(execution.recoveredAmount)} (SIMULATED)`} />
                  {execution.blockedReason ? (
                    <Row label="Blocked reason" value={execution.blockedReason} />
                  ) : null}
                </div>
                <div className="flex flex-col gap-2">
                  <Badge
                    variant={OUTCOME_BADGE_VARIANT[execution.outcome] ?? "neutral"}
                    className="w-fit uppercase"
                  >
                    {execution.outcome.replace(/_/g, " ")}
                  </Badge>
                </div>
              </div>

              <div>
                <p className="mb-1 text-sm font-medium text-foreground">
                  Simulation estimate: {Math.round(simulationProfile.probabilityOfSuccess * 100)}%
                  (not a real-world prediction)
                </p>
                <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {simulationProfile.factors.map((factor) => (
                    <li key={factor}>- {factor}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Verification</CardTitle>
              <Badge variant={verification.verified ? "success" : "danger"} className="uppercase">
                {verification.verified ? "Passed" : "Failed"}
              </Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                Independently re-checked for internal consistency — never trusting the recovery
                agent&apos;s own report.
              </p>
              {verification.reasons.length > 0 ? (
                <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                  {verification.reasons.map((reason) => (
                    <li key={reason} className="flex gap-2">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Audit metadata — execution &amp; verification</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              <Row label="Simulation mode" value={String(execution.simulationMode)} />
              <Row label="Execution latency" value={`${executionMeta.latencyMs}ms`} />
              <Row label="Execution ID" value={execution.executionId} mono />
              <Row label="Executed at" value={execution.executedAt} />
              <Row label="Verified" value={verification.verified ? "yes" : "no"} />
              <Row label="Verified at" value={verification.checkedAt} />
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            This page shows a structured diagnosis, a bounded strategy recommendation, and a
            SIMULATED recovery execution — never a live payment action. No payment, refund,
            notification, or retry has actually been executed, and no real money has been
            recovered.
          </p>
        </div>
      </main>
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs text-foreground" : "text-foreground"}>
        {value}
      </span>
    </div>
  );
}
