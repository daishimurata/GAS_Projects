# Project Specifications: Enterprise Productivity Suite

## Module 1: Intelligent Calendar
- **Goal:** Auto-scheduling with conflict resolution.
- **Logic:** Check availability via `CalendarApp`. If `[Priority: High]` conflict exists, alert Slack. Low priority events are rescheduled.
- **Artifacts:** Generate "Meeting Prep Doc" 30 mins before meetings using attendee's recent "Nippo" data.

## Module 2: Nippo (Daily Report)
- **Goal:** Analyze employee daily reports from Gmail/Forms.
- **AI Integration:** Use Gemini API (via UrlFetchApp) to extract:
  1. Summary (3 lines)
  2. Sentiment Score (1-10)
  3. Blockers
- **Reporting:** Weekly PDF summary to managers on Friday 17:00.

## Module 3: Sales Dashboard
- **Goal:** Ingest CSVs from Drive, normalize currency to JPY, save to BigQuery.
- **Process:** - Watch `Sales_DropBox` folder.
  - Convert currency using external API (cached for 6 hours).
  - Stream to BigQuery.
  - Alert Slack if daily sales drop >20%.
