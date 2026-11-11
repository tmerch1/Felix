import { defineTool } from "@grok/agent-sdk/tools";

import { listKnownSkills } from "../lib/drift.js";

export default defineTool({
  description:
    "List skills this bot already has, with the description used to decide whether a repeated process is already covered.",
  effect: "read",
  async execute() {
    const skills = await listKnownSkills();
    return { skills };
  },
});
