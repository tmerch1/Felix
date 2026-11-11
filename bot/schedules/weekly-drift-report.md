---
cron: "0 13 * * 3"
---

Run the weekly Process Drift & Automation Report.

This cron is 13:00 UTC every Wednesday, which is 8:00 AM Eastern Standard Time and 9:00 AM Eastern Daylight Time.

Follow the process-drift-report skill. This is the scheduled report, so post with kind drift-report and source schedule. Use only evidence from list_observations and list_known_skills. Do not invent processes, counts, or people. If a ticket tool is not connected, say ticket evidence was not connected. If post_ops_report returns already_posted, stop without posting again.
