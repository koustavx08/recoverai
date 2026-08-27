/**
 * @recoverai/agents
 *
 * Contracts for the Detection -> Diagnosis -> Prioritization -> Strategy ->
 * Recovery -> Verification agent pipeline, plus a thin orchestration layer.
 * Diagnosis, Strategy Selection, Recovery Execution, and Verification are
 * all implemented: ./diagnosis/ (GroundedDiagnosisAgent) and ./strategy/
 * (GroundedStrategyAgent) are LLM-assisted with a deterministic fallback;
 * ./recovery/ (SimulatedRecoveryAgent, DeterministicVerificationAgent) is
 * fully deterministic and simulation-only — every recovery execution in
 * this phase is labeled `simulationMode: true` and no code path here can
 * move real money or call a real payment provider. Detection and
 * Prioritization still throw AgentNotImplementedError via RecoveryPipeline.
 */
export * from "./agents/index.js";
export * from "./orchestration/index.js";
export * from "./tools/index.js";
export * from "./diagnosis/index.js";
export * from "./strategy/index.js";
export * from "./recovery/index.js";
