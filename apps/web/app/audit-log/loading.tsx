import { Topbar } from "@/components/layout/topbar";
import { TableSkeleton } from "@/components/loading/skeletons";

export default function AuditLogLoading() {
  return (
    <>
      <Topbar
        title="Audit Log"
        description="Every stage decision the pipeline recorded for the bundled sample dataset"
      />
      <main className="flex-1 overflow-y-auto p-6">
        <TableSkeleton rows={8} />
      </main>
    </>
  );
}
