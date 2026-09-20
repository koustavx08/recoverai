import { Topbar } from "@/components/layout/topbar";
import { CardGridSkeleton } from "@/components/loading/skeletons";

export default function DemoLoading() {
  return (
    <>
      <Topbar
        title="Demo Scenarios"
        description="Five hand-picked cases run through the real RecoverAI pipeline — proof it knows when to act, and when not to"
      />
      <main className="flex-1 overflow-y-auto p-6">
        <CardGridSkeleton count={5} />
      </main>
    </>
  );
}
