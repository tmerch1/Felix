import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";

import { recordObservation } from "../lib/drift.js";

export default defineTool({
  description:
    "Store one piece of process evidence. Slack posts are stored automatically. Use this for evidence pasted in a DM or mention. The same channel id and timestamp is stored once.",
  effect: "idempotent",
  inputSchema: z.object({
    text: z.string().min(1),
    channelId: z.string().min(1),
    ts: z.string().min(1),
    threadTs: z.string().optional(),
    userId: z.string().optional(),
    userName: z.string().optional(),
  }),
  async execute(input, ctx) {
    return recordObservation(ctx.host.kv, { ...input, source: "manual" });
  },
});
