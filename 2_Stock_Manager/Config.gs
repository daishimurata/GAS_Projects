/**
 * 在庫管理システム 設定ファイル
 */

// ==================== 設定 ====================
const CONFIG = {
  // LINE WORKS認証情報（2_Stock_Manager用）
  // 注意: スクリプトプロパティから取得する場合は、以下の設定は不要です
  LINEWORKS: {
    BOT_ID: '10746138', // LINE WORKS Bot ID
    BOT_SECRET: 'i4AxB7JBLsgBe2GbhZk9ZSUDfxGKbF' // LINE WORKS Bot Secret
  },
  
  GOOGLE_DRIVE: {
    ROOT_FOLDER_NAME: 'LINE WORKS統合ログ',
    CHAT_LOG_FOLDER: 'チャットログ',
    MONTHLY_ORGANIZATION: true
  },
  
  STOCK_MANAGEMENT: {
    ENABLED: true,
    SPREADSHEET_ID: '1Os9PiyJIy_KR8I1AW8AIWpfTCZrmHSkt3PAhwfJPYg4',
    SHEET_STOCK: '在庫管理',
    SHEET_LOG: '売上履歴',
    // 店舗ごとのラベルに対応（既読・未読問わず、未保存なら保存）
    GMAIL_QUERY: '(label:直売所売上-四季彩 OR label:直売所売上-エーコープ OR label:直売所売上-みどりの大地) (subject:売上 OR subject:速報)',
    STORE_KEYWORDS: {
      'みどりの大地': ['みどりの大地', '鈴鹿'],
      '四季菜 尾平': ['尾平', '四季菜', '四季彩'],
      'Aコープ': ['Aコープ', 'エーコープ', 'JAストア']
    },
    NOTIFY_LOW_STOCK: true,
    DAILY_REPORT: {
      ENABLED: false,
      TIME: '18:00'
    },
    // 在庫管理・売上管理用LINE WORKSチャンネル設定
    LINE_CHANNEL: {
      ENABLED: true,
      CHANNEL_ID: '7d6b452d-2dce-09ac-7663-a2f47d622e91', // 在庫管理・売上管理用チャンネル
      NOTIFY_SHIPMENT: true,  // 出荷情報を通知
      NOTIFY_SALES: true,     // 売上情報を通知
      NOTIFY_STOCK_UPDATE: true  // 在庫更新を通知
    },
    // 在庫管理専用チャットログ設定
    STOCK_CHAT_LOG: {
      ENABLED: true,
      CHANNEL_ID: '7d6b452d-2dce-09ac-7663-a2f47d622e91', // 在庫管理専用チャンネルID
      SPREADSHEET_NAME: '在庫管理チャットログ', // 専用スプレッドシート名
      SHEET_NAME: 'メッセージ一覧' // メッセージ保存シート名
    }
  },
  
  GEMINI: {
    // Gemini API Keyはスクリプトプロパティで設定してください
    // 設定方法: スクリプトエディタ > プロジェクトの設定 > スクリプトプロパティ > GEMINI_API_KEY
    MODEL: 'gemini-2.5-pro',  // 利用可能なモデル: gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash など
    BATCH_SIZE: 5  // 一度に処理するメール数
  }
};

function validateConfig() {
  const errors = [];
  if (!CONFIG.STOCK_MANAGEMENT.SPREADSHEET_ID) {
    errors.push('SPREADSHEET_ID設定なし');
  }
  return { valid: errors.length === 0, errors: errors };
}

function showConfig() {
  Logger.log(JSON.stringify(CONFIG, null, 2));
}

