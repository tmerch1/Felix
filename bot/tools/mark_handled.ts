import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";

import { markHandled } from "../lib/drift.js";

export default defineTool({
  description:
    "Mark a repeated process as already handled by a live skill. Call this only after that skill is attached and callable. Repeating the same process name updates the skill name.",
  effect: "idempotent",
  inputSchema: z.object({
    processName: z.string().min(1),
    skillName: z.string().min(1),
  }),
  async execute(input, ctx) {
    return markHandled(ctx.host.kv, input);
  },
});
