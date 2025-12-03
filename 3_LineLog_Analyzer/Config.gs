/**
 * 設定ファイル
 */
const CONFIG = {
  // Gemini API設定
  GEMINI: {
    API_KEY: 'YOUR_API_KEY_HERE', // スクリプトプロパティ推奨
    MODEL: 'gemini-1.5-pro-latest',
  },
  
  // スプレッドシート設定
  SPREADSHEET: {
    // ログ蓄積用スプレッドシートID（読み取り元）
    SOURCE_ID: 'YOUR_SOURCE_SPREADSHEET_ID',
    // 解析結果保存用スプレッドシートID（書き込み先）
    DEST_ID: 'YOUR_DEST_SPREADSHEET_ID'
  },
  
  // 解析設定
  ANALYSIS: {
    BATCH_SIZE: 20, // 一度にGeminiに投げるログ数
    TARGET_SHEET_NAME: '利用者記録'
  }
};






