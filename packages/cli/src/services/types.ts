export type CommandName =
  "init" | "ingest" | "analyze" | "simulate" | "recover" | "report" | "agent";

export interface NotImplementedResult {
  readonly status: "not_implemented";
  readonly command: CommandName;
  readonly detail?: string;
}

export interface OkResult {
  readonly status: "ok";
  readonly command: CommandName;
  readonly message: string;
}

export type CommandResult = NotImplementedResult | OkResult;

export function notImplemented(
  command: CommandName,
  detail?: string,
): NotImplementedResult {
  return { status: "not_implemented", command, detail };
}
