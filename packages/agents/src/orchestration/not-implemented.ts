export class AgentNotImplementedError extends Error {
  constructor(stage: string) {
    super(
      `RecoverAI agent pipeline stage "${stage}" is not implemented yet. ` +
        "This is expected at this stage of the project — see docs/agent-architecture.md.",
    );
    this.name = "AgentNotImplementedError";
  }
}
