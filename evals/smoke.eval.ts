import { defineEval } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description: "Felix reports only when asked, and a report reads evidence before it posts.",
  cases: [
    {
      id: "greeting",
      description: "A greeting does not publish a report.",
      async test(t) {
        await t.send("Hello");
        t.succeeded();
        t.notCalledTool("post_ops_report");
        t.notCalledTool("mark_handled");
      },
    },
    {
      id: "manual-report",
      description: "The manual trigger reads observations and known skills.",
      async test(t) {
        await t.send("Run the process drift report now");
        t.succeeded();
        t.calledTool("list_observations");
        t.calledTool("list_known_skills");
        t.notCalledTool("mark_handled");
      },
    },
  ],
});
