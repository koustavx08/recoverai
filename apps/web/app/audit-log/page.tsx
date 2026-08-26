import { ScrollText } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Table, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const COLUMNS = ["Timestamp", "Event", "Actor", "Summary"];

export default function AuditLogPage() {
  return (
    <>
      <Topbar
        title="Audit Log"
        description="Immutable record of every state-changing action RecoverAI takes"
      />
      <main className="flex-1 overflow-y-auto p-6">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                {COLUMNS.map((column) => (
                  <TableHead key={column}>{column}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
          </Table>
          <EmptyState
            icon={ScrollText}
            title="No audit events recorded yet"
            description="Every ingestion, analysis, strategy selection, and recovery action will be recorded here once the underlying pipeline is implemented."
            className="rounded-none border-0 border-t"
          />
        </Card>
      </main>
    </>
  );
}
