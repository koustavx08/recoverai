import { AlertTriangle, ArrowLeftRight, ListChecks, TrendingUp } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { loadDashboardAnalysis } from "@/lib/analysis";
import { formatCount, formatMoney } from "@/lib/format";
import { FAILURE_LABELS, PRIORITY_BADGE_VARIANT } from "@/lib/labels";

export default async function DashboardPage() {
  const analysis = await loadDashboardAnalysis();

  return (
    <>
      <Topbar
        title="Dashboard"
        description="Revenue-risk and recovery overview, computed from ingested transaction data"
      />
      <main className="flex-1 overflow-y-auto p-6">
        {!analysis ? (
          <EmptyState
            icon={TrendingUp}
            title="No analysis data yet"
            description="This dashboard will populate once transactions are ingested and the risk-analysis engine has run. Nothing shown here is simulated or estimated."
            hint="recoverai ingest --file data/samples/transactions.json"
          />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Total GMV"
                value={formatMoney(analysis.revenue.totalGmv)}
                helper={`${formatCount(analysis.transactionCount)} transactions analyzed`}
                icon={ArrowLeftRight}
              />
              <StatCard
                label="Revenue at risk"
                value={formatMoney(analysis.revenue.revenueAtRiskAmount)}
                helper="Failed + abandoned transactions"
                icon={AlertTriangle}
              />
              <StatCard
                label="Estimated recoverable"
                value={formatMoney(analysis.revenue.estimatedRecoverableAmount)}
                helper="Projection, not confirmed recovery"
                icon={TrendingUp}
              />
              <StatCard
                label="Recovery candidates"
                value={formatCount(analysis.candidates.length)}
                helper="Transactions worth pursuing"
                icon={ListChecks}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Failure breakdown</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 p-0">
                  <Table>
                    <TableBody>
                      {Object.entries(analysis.failureBreakdown)
                        .sort(([, a], [, b]) => b - a)
                        .map(([code, count]) => (
                          <TableRow key={code}>
                            <TableCell className="text-muted-foreground">
                              {FAILURE_LABELS[code as keyof typeof FAILURE_LABELS]}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCount(count)}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recovery candidates by priority</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {(["critical", "high", "medium", "low"] as const).map((priority) => (
                    <div key={priority} className="flex items-center justify-between">
                      <Badge
                        variant={PRIORITY_BADGE_VARIANT[priority]}
                        className="uppercase"
                      >
                        {priority}
                      </Badge>
                      <span className="tabular-nums text-sm text-foreground">
                        {formatCount(analysis.priorityBreakdown[priority])}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Top recovery opportunities</CardTitle>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transaction</TableHead>
                    <TableHead>Failure</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead className="text-right">Risk</TableHead>
                    <TableHead className="text-right">Recoverability</TableHead>
                    <TableHead className="text-right">Expected recovery</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysis.candidates.slice(0, 10).map((candidate) => (
                    <TableRow key={candidate.transactionId}>
                      <TableCell className="font-mono text-xs">
                        {candidate.transactionId}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {FAILURE_LABELS[candidate.failureReason.code]}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={PRIORITY_BADGE_VARIANT[candidate.priority]}
                          className="uppercase"
                        >
                          {candidate.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {candidate.riskScore}/100
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {candidate.recoverabilityScore}/100
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(candidate.expectedRecoveryAmount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {analysis.candidates.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  No recovery candidates in this dataset.
                </div>
              ) : null}
            </Card>

            <p className="text-xs text-muted-foreground">
              &ldquo;Estimated recoverable&rdquo; and each candidate&apos;s
              &ldquo;expected recovery&rdquo; are deterministic projections computed from
              this data — not confirmed recovered revenue. No recovery action has been
              executed.
            </p>
          </div>
        )}
      </main>
    </>
  );
}
