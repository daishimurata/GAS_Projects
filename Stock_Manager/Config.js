/**
 * 在庫管理システム設定
 */
const CONFIG = {
  // LINE WORKS設定（ログ蓄積GASと同じものを使用）
  LINEWORKS: {
    BOT_ID: 'YOUR_BOT_ID', // ログ蓄積GASと同じBot ID
    // トークンはCacheServiceまたはPropertiesServiceから取得するため設定不要
  },

  // Googleドライブ設定
  GOOGLE_DRIVE: {
    ROOT_FOLDER_NAME: 'LINE WORKS統合ログ', // ログ保存先ルートフォルダ
    MONTHLY_ORGANIZATION: true // 月次フォルダで整理するか
  },

  // 在庫管理設定
  STOCK_MANAGEMENT: {
    ENABLED: true,
    // 書き込み先スプレッドシートID
    SPREADSHEET_ID: '1Os9PiyJIy_KR8I1AW8AIWpfTCZrmHSkt3PAhwfJPYg4',
    
    // シート名設定
    SHEET_STOCK: '在庫管理',
    SHEET_LOG: '売上履歴',
    
    // Gmail検索クエリ
    GMAIL_QUERY: 'subject:(売上 OR 速報 OR 日報) is:unread',
    
    // 通知設定
    NOTIFY_LINE: true,  // LINE WORKSへ通知するか
    NOTIFY_LOW_STOCK: true // 在庫不足時に警告するか
  }
};



