/**
 * Config.js
 * システム全体の設定を管理するモジュール。
 * 機密情報はPropertiesServiceから取得し、ハードコーディングを回避する。
 */
const Config = {
  // LINE WORKS設定
  LINEWORKS: {
    get CLIENT_ID() { return PropertiesService.getScriptProperties().getProperty('LINEWORKS_CLIENT_ID'); },
    get CLIENT_SECRET() { return PropertiesService.getScriptProperties().getProperty('LINEWORKS_CLIENT_SECRET'); },
    get SERVICE_ACCOUNT() { return PropertiesService.getScriptProperties().getProperty('LINEWORKS_SERVICE_ACCOUNT'); },
    get PRIVATE_KEY() { return PropertiesService.getScriptProperties().getProperty('LINEWORKS_PRIVATE_KEY'); },
    get BOT_ID() { return PropertiesService.getScriptProperties().getProperty('LINEWORKS_BOT_ID'); },
    get BOT_SECRET() { return PropertiesService.getScriptProperties().getProperty('LINEWORKS_BOT_SECRET'); },
    get DOMAIN_ID() { return PropertiesService.getScriptProperties().getProperty('LINEWORKS_DOMAIN_ID'); },
    get MONITOR_CHANNEL_IDS() { return (PropertiesService.getScriptProperties().getProperty('MONITOR_CHANNEL_IDS') || '').split(',').filter(id => id.trim()); },
    // 日報などレポート送付先のチャンネルID
    get REPORT_CHANNEL_ID() { return PropertiesService.getScriptProperties().getProperty('REPORT_CHANNEL_ID'); },
  },

  // BigQuery設定
  BIGQUERY: {
    get PROJECT_ID() { return PropertiesService.getScriptProperties().getProperty('BIGQUERY_PROJECT_ID') || 'YOUR_GCP_PROJECT_ID'; },
    DATASET_ID: 'enterprise_suite_data',
    TABLES: {
      SALES: 'sales_transactions',
      CHAT_LOGS: 'chat_logs',
      CALENDAR_EVENTS: 'calendar_events'
    },
    QUERY_TEMPLATES: {
      MONTHLY_SALES: "SELECT * FROM `@DATASET@.@TABLE@` WHERE transaction_date >= '@START_DATE@' AND transaction_date <= '@END_DATE@' ORDER BY transaction_date ASC",
      MONTHLY_CHAT: "SELECT * FROM `@DATASET@.@TABLE@` WHERE created_at >= '@START_DATE@' AND created_at <= '@END_DATE@' ORDER BY created_at ASC"
    }
  },

  // アーカイブ設定
  ARCHIVE: {
    ROOT_FOLDER_ID: '1SWegPeNg4A6PaZN_ndjhjZe8YZ102PAG', // 「BigQuery 可視化ダッシュボード」
    TARGETS: [
      {
        id: 'sales',
        name: '売上明細',
        tableName: 'sales_transactions',
        parentFolderName: '01_売上明細（全期間）',
        queryKey: 'MONTHLY_SALES'
      },
      {
        id: 'chat',
        name: 'チャットログ',
        tableName: 'chat_logs',
        parentFolderName: '02_チャット履歴（分割管理）',
        queryKey: 'MONTHLY_CHAT'
      }
    ]
  },

  // Gemini設定
  GEMINI: {
    get API_KEY() { return PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY'); },
    MODEL: 'gemini-2.5-flash'
  },

  // アプリケーション設定
  APP: {
    NAME: 'Enterprise Productivity Suite',
    ENV: 'production', // 'development' or 'production'
    ADMIN_EMAIL: 'pr.12187@ohisamafarm' // エラー通知先
  },

  // Google Calendar設定
  GOOGLE_CALENDAR: {
    get MASTER_CALENDAR_ID() { return PropertiesService.getScriptProperties().getProperty('GOOGLE_CALENDAR_ID') || 'd.murata@izaya.llc'; },

    // 双方向同期の設定 (Google -> LW 用)
    // ここで指定されたペアで Google から LINE WORKS へ同期を行います
    SYNC_PAIRS: [
      {
        displayName: '村田太志',
        gCalId: 'd.murata@izaya.llc', // 村田様 Googleカレンダー
        lwUserId: 'd28b88f0-24ba-4fa0-1a14-046ff737ee66', // 特定された内部ID
        lwCalendarId: 'c_400854414_adc46355-89ee-4a95-bf95-1c4229f910ef' // 「村田太志」カレンダー
      }
    ]
  },

  // Gmail設定
  GMAIL: {
    // スクリーンショットに基づいた売上メールの検索クエリ
    // ラベルによる絞り込みで、不要なメールを排除
    get SEARCH_QUERY() {
      return 'label:直売所売上 OR label:直売所売上/エーコープ OR label:直売所売上/みどりの大地 OR label:直売所売上/一号館 OR label:直売所売上/四季彩';
    }
  }
};

/**
 * 必須の設定値が設定されているかチェックする
 */
function checkConfiguration() {
  const requiredProps = [
    'LINEWORKS_CLIENT_ID',
    'LINEWORKS_PRIVATE_KEY',
    'GEMINI_API_KEY'
  ];
  const missing = requiredProps.filter(key => !PropertiesService.getScriptProperties().getProperty(key));

  if (missing.length > 0) {
    throw new Error(`Missing required Script Properties: ${missing.join(', ')}`);
  }
  return true;
}
