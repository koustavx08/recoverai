import type { Metadata } from "@recoverai/core";

/** SQLite has no JSON column type in Prisma — Metadata is stored as a JSON string. */
export function encodeMetadata(metadata: Metadata | undefined): string | null {
  return metadata ? JSON.stringify(metadata) : null;
}

export function decodeMetadata(raw: string | null): Metadata | undefined {
  return raw ? (JSON.parse(raw) as Metadata) : undefined;
}

/** For the one string-array field (RevenueRisk.failureReason.evidence). */
export function encodeStringArray(values: readonly string[]): string {
  return JSON.stringify(values);
}

export function decodeStringArray(raw: string): readonly string[] {
  return JSON.parse(raw) as readonly string[];
}
