---
description: Use when a person approves a process-drift candidate, or says "Egg bot, build the skill for [candidate name]".
---

# Build an approved skill

Turn one approved candidate into a complete skill definition. Draft it, test the definition against scenarios, and post the result in #cornerstone-ops. Do not declare it live until `list_known_skills` shows it and the operations owner has confirmed it is attached and callable.

## 1. Lock the requirements

Restate the process in one short paragraph. List the trigger, the decision rules, the success criteria, and the escalation cases.

Use the approved candidate section, `list_observations`, and `list_known_skills`. Add constraints the approver wrote.

Ask a question only when a missing rule would make the skill unsafe or ambiguous. Otherwise pick a sensible default and name it in the draft.

If `list_known_skills` already covers this process, say so and stop. Do not draft a duplicate.

## 2. Draft the skill

Include all of these:

- Name
- Purpose
- Trigger
- Inputs and tools
- Steps
- Decision rules
- What to escalate, and when
- Output format
- Verification checklist the bot must pass every time it runs

## 3. Test cases

Write 3 to 5 concrete scenarios. Include the happy path, at least one edge case, and at least one escalation case. For each scenario, write the input and the required outcome.

Walk each scenario against the draft. Fix the draft until every scenario passes. If you cannot execute a live tool for a scenario, say which checks were a paper walkthrough.

## 4. Post the draft

Call `post_ops_report` with kind `skill-note` and source `manual`. The note includes:

- Skill name
- What it does
- That Felix holds the draft and it is not live yet
- How it will be invoked once it is attached
- The full skill text and the test scenarios
- The defaults you assumed

Do not call `mark_handled`. Do not say the skill is live.

## 5. After the owner confirms it is live

Confirm `list_known_skills` contains the skill. Then:

- Call `mark_handled` with the process name and the skill name
- Post a short skill-note that states the skill name, what it does, that Felix owns it, and how to invoke it
- Tag stays on the operations owner. Say the process drift monitor should treat this process as already handled
- Call `reminders_create` for a check in 7 days. The prompt asks whether the process still shows up in new observations, and to post a short note only if it does. Set `until` so the reminder stops once the process has not recurred. If the session cannot create a reminder, say that in the thread
