import { Topbar } from "@/components/layout/topbar";
import { TableSkeleton } from "@/components/loading/skeletons";

export default function TransactionsLoading() {
  return (
    <>
      <Topbar
        title="Transactions"
        description="Payment events ingested from the bundled sample dataset"
      />
      <main className="flex-1 overflow-y-auto p-6">
        <TableSkeleton rows={8} />
      </main>
    </>
  );
}
