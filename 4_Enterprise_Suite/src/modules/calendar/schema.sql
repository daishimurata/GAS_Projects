-- BigQuery Schema Definition for Calendar Events
-- Project: Enterprise Productivity Suite
-- Author: @DB_Agent

-- ----------------------------------------------------------------------
-- Table: calendar_events
-- Description: Stores synchronized calendar events for analysis and backup.
-- ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `enterprise_suite_data.calendar_events`
(
  -- Identifiers
  event_id STRING OPTIONS(description = 'Google Calendar Event ID'),
  lw_event_id STRING OPTIONS(description = 'Line Works Event ID'),
  calendar_id STRING OPTIONS(description = 'Owner Email / Calendar ID'),
  
  -- Event Details
  summary STRING OPTIONS(description = 'Event Title'),
  description STRING OPTIONS(description = 'Event Description'),
  start_time TIMESTAMP OPTIONS(description = 'Event Start Time'),
  end_time TIMESTAMP OPTIONS(description = 'Event End Time'),
  location STRING OPTIONS(description = 'Event Location'),
  
  -- Metadata
  status STRING OPTIONS(description = 'confirmed, tentative, cancelled'),
  html_link STRING OPTIONS(description = 'Google Calendar Link'),
  last_synced_at TIMESTAMP OPTIONS(description = 'Sync timestamp')
)
PARTITION BY DATE(start_time)
CLUSTER BY calendar_id, event_id
OPTIONS (
  description = 'Calendar events synchronized from LINE WORKS.'
);
