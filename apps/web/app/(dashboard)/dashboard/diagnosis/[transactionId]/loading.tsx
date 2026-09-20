import { Topbar } from "@/components/layout/topbar";
import { DetailSkeleton } from "@/components/loading/skeletons";

export default function DiagnosisLoading() {
  return (
    <>
      <Topbar
        title="Diagnosis"
        description="Structured, evidence-grounded AI diagnosis of one failed payment"
      />
      <main className="flex-1 overflow-y-auto p-6">
        <DetailSkeleton />
      </main>
    </>
  );
}
