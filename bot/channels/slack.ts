import { defaultSlackAuth, slackChannel } from "@grok/agent-sdk/channels/slack";

import { classifyTrigger, OPS_CHANNEL_ID, recordObservation } from "../lib/drift.js";

const OPS_CHANNEL = "#cornerstone-ops";

export default slackChannel({
  envPrefix: "FELIX",
  suggestedPrompts: [
    {
      title: "Run the report",
      message: "Run the process drift report now",
    },
    {
      title: "Build a skill",
      message: "Egg bot, build the skill for ",
    },
  ],
  engagement: {
    channelPosts: {
      allow: [OPS_CHANNEL_ID, OPS_CHANNEL],
      posts: "all",
    },
  },
  onChannelPost: async (ctx, message) => {
    const text = message.markdown.trim();
    if (text.length > 0 && message.author?.isBot !== true) {
      await recordObservation(ctx.host.kv, {
        channelId: message.channelId,
        ts: message.ts,
        threadTs: message.threadTs,
        userId: message.author?.userId ?? "",
        userName: message.author?.userName ?? "",
        text,
        source: "slack",
      }).catch(() => undefined);
    }

    const kind = classifyTrigger(text);
    if (kind === null) return null;

    const auth = defaultSlackAuth(message, ctx, { engagement: "channel_post" });
    if (auth === null) return null;

    const instruction =
      kind === "report"
        ? "Follow the process-drift-report skill. This is a manual trigger. Post with kind drift-report and source manual."
        : "Follow the build-approved-skill skill. Use the approved candidate in this message. Do not declare the skill live until it is attached and callable.";

    return {
      auth,
      title: kind === "report" ? "Process drift report" : "Build approved skill",
      message: `${instruction}\n\nOriginal message:\n${text}`,
    };
  },
});
