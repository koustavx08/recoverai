import { AlertTriangle, ArrowLeftRight, RefreshCcw, TrendingUp } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/empty-state";

export default function DashboardPage() {
  return (
    <>
      <Topbar
        title="Dashboard"
        description="Revenue-risk and recovery overview across all merchants"
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Transactions monitored"
            value="—"
            helper="Awaiting ingestion"
            icon={ArrowLeftRight}
          />
          <StatCard
            label="Revenue at risk"
            value="—"
            helper="Awaiting risk analysis"
            icon={AlertTriangle}
          />
          <StatCard
            label="Recovery actions run"
            value="—"
            helper="Awaiting agent pipeline"
            icon={RefreshCcw}
          />
          <StatCard
            label="Recovery rate"
            value="—"
            helper="No verified recoveries yet"
            icon={TrendingUp}
          />
        </div>

        <div className="mt-6">
          <EmptyState
            icon={TrendingUp}
            title="No analysis data yet"
            description="This dashboard will populate once transactions are ingested and the risk-analysis engine has run. Nothing shown here is simulated or estimated."
            hint="recoverai ingest --file data/samples/transactions.json"
          />
        </div>
      </main>
    </>
  );
}
