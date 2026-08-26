import { describe, expect, it } from "vitest";
import {
  agentCommand,
  analyzeCommand,
  ingestCommand,
  initCommand,
  recoverCommand,
  reportCommand,
  simulateCommand,
} from "./index.js";

describe("CLI command registration", () => {
  const builders = {
    init: initCommand,
    ingest: ingestCommand,
    analyze: analyzeCommand,
    simulate: simulateCommand,
    recover: recoverCommand,
    report: reportCommand,
    agent: agentCommand,
  };

  for (const [name, build] of Object.entries(builders)) {
    it(`registers the "${name}" command with a name and description`, () => {
      const command = build();
      expect(command.name()).toBe(name);
      expect(command.description().length).toBeGreaterThan(0);
    });
  }
});
