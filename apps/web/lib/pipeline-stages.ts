import type { PipelineResult, PipelineStatus } from "@recoverai/agents";
import type { StageStatus, StageTrackerItem } from "@/components/pipeline/stage-tracker";

const TERMINAL_STATUS_TO_STAGE_STATUS: Readonly<Record<PipelineStatus, StageStatus>> = {
  completed: "success",
  blocked: "warning",
  skipped: "neutral",
  failed: "danger",
};

const STAGE_DEFS = [
  { key: "detection", label: "Detected" },
  { key: "prioritization", label: "Prioritized" },
  { key: "diagnosis", label: "Diagnosed" },
  { key: "strategy", label: "Strategized" },
  { key: "execution", label: "Simulated" },
  { key: "verification", label: "Verified" },
] as const;

/**
 * Maps one real `PipelineResult` to a `StageTracker` item list — never
 * fabricated, purely derived from which stages the pipeline actually ran.
 * The last stage that ran is colored by the pipeline's final status;
 * every stage after it is "not-reached" because the pipeline stopped.
 */
export function buildPipelineStageItems(result: PipelineResult): readonly StageTrackerItem[] {
  const present: readonly boolean[] = [
    Boolean(result.detection),
    Boolean(result.prioritization),
    Boolean(result.diagnosis),
    Boolean(result.strategy),
    Boolean(result.execution),
    Boolean(result.verification),
  ];

  const lastPresentIndex = present.lastIndexOf(true);

  return STAGE_DEFS.map((stage, index) => {
    if (!present[index]) return { key: stage.key, label: stage.label, status: "not-reached" };
    const isTerminal = index === lastPresentIndex;
    return {
      key: stage.key,
      label: stage.label,
      status: isTerminal ? TERMINAL_STATUS_TO_STAGE_STATUS[result.status] : "done",
    };
  });
}
