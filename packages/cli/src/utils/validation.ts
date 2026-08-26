import type { z, ZodSchema } from "zod";

export class CliValidationError extends Error {
  constructor(issues: readonly string[]) {
    super(`Invalid arguments:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "CliValidationError";
  }
}

/**
 * Parses CLI options against a Zod schema, throwing a readable
 * CliValidationError on failure. The generic is bound to the schema itself
 * (rather than its output) so the return type reflects the schema's parsed
 * *output* — e.g. an `.optional().default(false)` field comes back as a
 * required `boolean`, not `boolean | undefined`.
 */
export function parseOptions<S extends ZodSchema>(
  schema: S,
  options: unknown,
): z.infer<S> {
  const result = schema.safeParse(options);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
    throw new CliValidationError(issues);
  }
  return result.data;
}
