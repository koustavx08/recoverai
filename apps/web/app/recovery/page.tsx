import { RefreshCcw } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Table, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const COLUMNS = ["Action", "Transaction", "Strategy", "Status", "Executed", "Verified"];

export default function RecoveryActivityPage() {
  return (
    <>
      <Topbar
        title="Recovery Activity"
        description="Recovery actions selected and executed by the agent pipeline"
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
            icon={RefreshCcw}
            title="No recovery actions yet"
            description="The recovery agent pipeline is not implemented yet. Once transactions are analyzed and a strategy is selected, executed actions will appear here."
            hint="recoverai recover --transaction <id>"
            className="rounded-none border-0 border-t"
          />
        </Card>
      </main>
    </>
  );
}
