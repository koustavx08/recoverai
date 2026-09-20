import { Topbar } from "@/components/layout/topbar";
import { StatCardGridSkeleton, TableSkeleton } from "@/components/loading/skeletons";

export default function RecoveryLoading() {
  return (
    <>
      <Topbar
        title="Recovery Pipeline"
        description="Portfolio-level detection, prioritization, diagnosis, strategy, SIMULATED execution, and verification"
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-6">
          <StatCardGridSkeleton />
          <TableSkeleton rows={4} />
        </div>
      </main>
    </>
  );
}
