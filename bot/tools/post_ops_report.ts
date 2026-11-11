import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";

import {
  claimScheduledPost,
  etYmd,
  isoWeekKey,
  missingReportSections,
  OPS_CHANNEL_ID,
  OPS_CHANNEL_NAME,
  REPORT_MAX_CHARS,
  scheduledPostStatus,
  tagLine,
} from "../lib/drift.js";

export default defineTool({
  description:
    "Post to #cornerstone-ops. kind drift-report publishes the weekly report. kind skill-note publishes a skill draft or live-skill confirmation. A scheduled drift report posts once per Eastern week. Eval sessions do not post.",
  effect: "write",
  dryRunResult: () => ({ posted: false, reason: "dry_run" }),
  inputSchema: z.object({
    kind: z.enum(["drift-report", "skill-note"]),
    source: z.enum(["schedule", "manual"]),
    body: z.string().min(1),
  }),
  async execute(input, ctx) {
    const body = input.body.trim();
    if (body.length > REPORT_MAX_CHARS) {
      return {
        posted: false,
        reason: "too_long",
        maxChars: REPORT_MAX_CHARS,
        length: body.length,
      };
    }
    if (input.kind === "drift-report") {
      const missing = missingReportSections(body);
      if (missing.length > 0) {
        return { posted: false, reason: "missing_sections", missing };
      }
    } else if (!/skill/i.test(body)) {
      return { posted: false, reason: "missing_skill_name" };
    }

    const weekKey = isoWeekKey(etYmd(new Date()));
    if (input.kind === "drift-report" && input.source === "schedule") {
      const status = await scheduledPostStatus(ctx.host.kv, weekKey);
      if (status.alreadyPosted) {
        return { posted: false, reason: "already_posted", weekKey };
      }
    }

    if (ctx.session.purpose === "eval" || ctx.session.dryRun === true) {
      return { posted: false, reason: "eval", weekKey, channel: OPS_CHANNEL_NAME };
    }

    const text = body.includes("<@") ? body : `${tagLine()}\n${body}`;
    try {
      const client = await ctx.host.slack.getClient();
      const result = await client.chat.postMessage({
        channel: OPS_CHANNEL_ID,
        text,
        mrkdwn: true,
        unfurl_links: false,
        unfurl_media: false,
      });
      if (result.ok !== true) {
        return {
          posted: false,
          reason: "slack_rejected",
          channel: OPS_CHANNEL_NAME,
          weekKey,
        };
      }
      if (input.kind === "drift-report" && input.source === "schedule") {
        await claimScheduledPost(ctx.host.kv, weekKey, new Date().toISOString());
      }
      return {
        posted: true,
        channel: OPS_CHANNEL_NAME,
        ts: typeof result.ts === "string" ? result.ts : "",
        weekKey,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Slack post failed";
      const safe = /xox[baprs]-/i.test(message)
        ? "Slack rejected the post."
        : message.slice(0, 300);
      const notConfigured = /token|not configured|missing/i.test(safe);
      return {
        posted: false,
        reason: notConfigured ? "slack_not_configured" : "slack_error",
        detail: safe,
        channel: OPS_CHANNEL_NAME,
      };
    }
  },
});
