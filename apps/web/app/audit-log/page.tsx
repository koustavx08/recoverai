import { ScrollText } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadAuditTrail } from "@/lib/audit";
import { formatDateTime } from "@/lib/format";
import type { AuditEventType } from "@recoverai/core";

const EVENT_BADGE_VARIANT: Readonly<Record<AuditEventType, BadgeProps["variant"]>> = {
  transaction_ingested: "neutral",
  risk_assessed: "accent",
  strategy_selected: "accent",
  recovery_action_executed: "warning",
  recovery_verified: "success",
  agent_decision_recorded: "neutral",
  system_error: "danger",
};

export default async function AuditLogPage() {
  const view = await loadAuditTrail();

  return (
    <>
      <Topbar
        title="Audit Log"
        description="Every stage decision the pipeline recorded for the bundled sample dataset"
      />
      <main className="flex-1 overflow-y-auto p-6">
        {!view ? (
          <EmptyState
            icon={ScrollText}
            title="No audit events recorded yet"
            description="This log is derived from a real run of the RecoveryPipeline over the bundled sample dataset — ingest data first to populate it."
            hint="recoverai ingest --file data/samples/transactions.json"
          />
        ) : (
          <div className="flex flex-col gap-4">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Transaction</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Summary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(event.occurredAt)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{event.transactionId}</TableCell>
                      <TableCell>
                        <Badge variant={EVENT_BADGE_VARIANT[event.type]}>
                          {event.type.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {event.actorId}
                      </TableCell>
                      <TableCell className="text-foreground">{event.summary}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {view.events.length === 0 ? (
                <EmptyState
                  icon={ScrollText}
                  title="No events recorded"
                  description="Every ingested transaction was skipped before any stage ran."
                  className="rounded-none border-0 border-t"
                />
              ) : null}
            </Card>

            <p className="text-xs text-muted-foreground">
              {view.events.length} event(s) derived from a real run of the RecoveryPipeline over{" "}
              {view.file}. Every event above comes from an actual stage output — nothing here is
              invented for display, and no event represents a real payment action.
            </p>
          </div>
        )}
      </main>
    </>
  );
}
