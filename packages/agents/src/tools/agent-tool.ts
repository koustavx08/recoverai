/**
 * Contract for a "tool" an agent can invoke as part of reaching a decision
 * (e.g. looking up prior transactions for a customer, computing a
 * recoverability heuristic). Concrete tools will be added alongside the
 * real agent implementations; this package only establishes the shape.
 */
export interface AgentTool<Input, Output> {
  readonly name: string;
  readonly description: string;
  run(input: Input): Promise<Output>;
}
