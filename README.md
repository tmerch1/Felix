# Felix

Felix watches #cornerstone-ops for repeated manual work and publishes a Process Drift & Automation Report every Wednesday at 13:00 UTC (8:00 AM Eastern Standard Time, 9:00 AM Eastern Daylight Time).

Say “Run the process drift report now” to publish the same report immediately. Say “Egg bot, build the skill for [candidate]” to draft a skill from an approved candidate. Ordinary channel posts are stored and do not get a reply.

Reports post to #cornerstone-ops and tag the operations owner and Egg bot.

## Run locally

```bash
npx @grok/agent-sdk validate --dir .
npx @grok/agent-sdk tool call list_known_skills --dir . --input '{}'
npx @grok/agent-sdk dev
```

Slack tokens are `FELIX_SLACK_BOT_TOKEN` and `FELIX_SLACK_APP_TOKEN`. Create the Slack app with `npx @grok/agent-sdk slack create --dir . --name Felix --channel-posts`, then invite Felix to #cornerstone-ops. Dispatch the Wednesday schedule locally with `POST /v1/dev/schedules/weekly-drift-report`. Dev mode does not fire the cron on its own.

Do not deploy until you intend to. The first `npx @grok/agent-sdk deploy --dir .` prints an alias token once.
