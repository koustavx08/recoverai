import { ArrowLeftRight } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Table, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const COLUMNS = ["Transaction", "Customer", "Amount", "Method", "Status", "Created"];

export default function TransactionsPage() {
  return (
    <>
      <Topbar
        title="Transactions"
        description="Payment events ingested from your merchant account"
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
            icon={ArrowLeftRight}
            title="No transactions ingested yet"
            description="Run the ingest command to load sample or real transaction data into RecoverAI."
            hint="recoverai ingest --file data/samples/transactions.json"
            className="rounded-none border-0 border-t"
          />
        </Card>
      </main>
    </>
  );
}
