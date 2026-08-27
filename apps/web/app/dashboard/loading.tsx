import { Topbar } from "@/components/layout/topbar";
import { StatCardGridSkeleton, TableSkeleton } from "@/components/loading/skeletons";

export default function DashboardLoading() {
  return (
    <>
      <Topbar
        title="Dashboard"
        description="Revenue-risk and recovery overview, computed from ingested transaction data"
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-6">
          <StatCardGridSkeleton />
          <TableSkeleton rows={5} />
        </div>
      </main>
    </>
  );
}
