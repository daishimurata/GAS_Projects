-- BigQuery Schema Definition for Chat Logs
-- Project: Enterprise Productivity Suite
-- Author: @DB_Agent

-- ----------------------------------------------------------------------
-- Table: chat_logs
-- Description: Stores chat messages from LINE WORKS for archiving and analysis.
-- ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `enterprise_suite_data.chat_logs`
(
  -- Identifiers
  message_id STRING OPTIONS(description = 'LINE WORKS Message ID'),
  channel_id STRING OPTIONS(description = 'Channel (Room) ID'),
  user_id STRING OPTIONS(description = 'Sender User ID'),
  
  -- Content
  content STRING OPTIONS(description = 'Message text content'),
  content_type STRING OPTIONS(description = 'text, image, sticker, file, etc.'),
  created_at TIMESTAMP OPTIONS(description = 'Message sent time'),
  
  -- AI Analysis (Enriched Data)
  sentiment_score FLOAT64 OPTIONS(description = 'Sentiment score (-1.0 to 1.0) analyzed by Gemini'),
  keywords ARRAY<STRING> OPTIONS(description = 'Extracted keywords for search optimization'),
  summary STRING OPTIONS(description = 'Short summary if the message is long'),
  
  -- System Metadata
  ingested_at TIMESTAMP OPTIONS(description = 'Record insertion timestamp')
)
PARTITION BY DATE(created_at)
CLUSTER BY channel_id, user_id
OPTIONS (
  description = 'Chat logs synchronized from LINE WORKS Bot API.'
);
