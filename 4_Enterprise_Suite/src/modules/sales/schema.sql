-- BigQuery Schema Definition for Sales Transactions
-- Project: Enterprise Productivity Suite
-- Author: @DB_Agent

-- ----------------------------------------------------------------------
-- Dataset: enterprise_suite_data
-- ----------------------------------------------------------------------

-- Create Dataset (if not exists)
-- Location: asia-northeast1 (Tokyo) recommended for latency
CREATE SCHEMA IF NOT EXISTS `enterprise_suite_data`
OPTIONS (
  location = 'asia-northeast1',
  description = 'Data warehouse for Enterprise Productivity Suite (Sales, Chat Logs, etc.)'
);

-- ----------------------------------------------------------------------
-- Table: sales_transactions
-- Description: Stores individual sales items extracted from emails.
-- ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `enterprise_suite_data.sales_transactions`
(
  -- Business Data
  transaction_date DATE OPTIONS(description = 'Date of the sale (extracted from email)'),
  store_name STRING OPTIONS(description = 'Normalized store name (e.g., みどりの大地)'),
  item_name STRING OPTIONS(description = 'Product name'),
  quantity INT64 OPTIONS(description = 'Sold quantity'),
  amount INT64 OPTIONS(description = 'Sales amount (Quantity * Unit Price) or estimated portion of total'),
  
  -- Metadata / Traceability
  created_at TIMESTAMP OPTIONS(description = 'Record insertion timestamp (UTC)'),
  email_subject STRING OPTIONS(description = 'Source email subject'),
  email_id STRING OPTIONS(description = 'Gmail Message ID for deduplication/traceability'),
  note STRING OPTIONS(description = 'Analysis warnings or additional context')
)
PARTITION BY transaction_date
CLUSTER BY store_name, item_name
OPTIONS (
  description = 'Daily sales transaction records ingested from email reports.'
);

-- ----------------------------------------------------------------------
-- View: daily_sales_summary
-- Description: Helper view for easy visualization
-- ----------------------------------------------------------------------

CREATE OR REPLACE VIEW `enterprise_suite_data.daily_sales_summary` AS
SELECT
  transaction_date,
  store_name,
  SUM(amount) as total_sales,
  SUM(quantity) as total_items,
  COUNT(*) as transaction_count
FROM
  `enterprise_suite_data.sales_transactions`
GROUP BY
  1, 2;
