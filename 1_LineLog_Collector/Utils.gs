/**
 * 共通ユーティリティ関数
 * ログ管理、ファイル操作、日付処理など
 */

// ==================== ログ関連 ====================

/**
 * DEBUGレベルログ
 */
function logDebug(message) {
  if (CONFIG.LOGGING.LEVEL === 'DEBUG') {
    const timestamp = new Date().toISOString();
    Logger.log(`[DEBUG] ${timestamp}: ${message}`);
  }
}

/**
 * INFOレベルログ
 */
function logInfo(message) {
  if (['DEBUG', 'INFO'].includes(CONFIG.LOGGING.LEVEL)) {
    const timestamp = new Date().toISOString();
    Logger.log(`[INFO] ${timestamp}: ${message}`);
    appendToSyncLog('INFO', message);
  }
}

/**
 * WARNINGレベルログ
 */
function logWarning(message) {
  if (['DEBUG', 'INFO', 'WARNING'].includes(CONFIG.LOGGING.LEVEL)) {
    const timestamp = new Date().toISOString();
    Logger.log(`[WARNING] ${timestamp}: ${message}`);
    appendToSyncLog('WARNING', message);
  }
}

/**
 * ERRORレベルログ
 */
function logError(message, error) {
  const timestamp = new Date().toISOString();
  const errorMsg = error ? ` - ${error.toString()}` : '';
  const stackTrace = error && error.stack ? `\nStack: ${error.stack}` : '';
  Logger.log(`[ERROR] ${timestamp}: ${message}${errorMsg}${stackTrace}`);
  appendToSyncLog('ERROR', `${message}${errorMsg}`);
}

/**
 * 同期ログファイルに追記（月次フォルダ対応）
 */
function appendToSyncLog(level, message) {
  try {
    const now = new Date();
    const timestamp = now.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    const logEntry = `[${level}] ${timestamp}: ${message}\n`;
    
    // 月次フォルダで整理する場合
    let folder;
    let fileName;
    
    if (CONFIG.GOOGLE_DRIVE.MONTHLY_ORGANIZATION) {
      // 月フォルダを作成（例: 2025-01）
      const monthFolder = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM');
      folder = getOrCreateFolder(
        CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/' +
        CONFIG.GOOGLE_DRIVE.SYSTEM_LOG_FOLDER + '/' +
        monthFolder
      );
      fileName = CONFIG.LOGGING.SYNC_LOG_FILE;
    } else {
      // 従来通りルートフォルダに保存
      folder = getOrCreateFolder(CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME);
      fileName = CONFIG.LOGGING.SYNC_LOG_FILE;
    }
    
    const files = folder.getFilesByName(fileName);
    
    if (files.hasNext()) {
      const file = files.next();
      let existingContent = '';
      
      try {
        existingContent = file.getBlob().getDataAsString();
      } catch (e) {
        // ファイルが大きすぎる場合は読み込みをスキップ
        logDebug('ログファイルが大きすぎるため、追記のみ実行');
      }
      
      // ログファイルが大きくなりすぎないように制限
      if (existingContent.length > CONFIG.LOGGING.MAX_LOG_SIZE) {
        // 古いログを削除して新しいログのみ保持
        const lines = existingContent.split('\n');
        existingContent = lines.slice(-5000).join('\n');  // 最新5000行のみ保持
      }
      
      file.setContent(existingContent + logEntry);
    } else {
      folder.createFile(fileName, logEntry);
    }
  } catch (e) {
    Logger.log(`ログファイル書き込みエラー: ${e}`);
  }
}

// ==================== フォルダ・ファイル操作 ====================

/**
 * フォルダを取得または作成
 * @param {string} folderPath スラッシュ区切りのフォルダパス
 * @return {GoogleAppsScript.Drive.Folder} フォルダオブジェクト
 */
function getOrCreateFolder(folderPath) {
  const parts = folderPath.split('/').filter(p => p);
  let currentFolder = DriveApp.getRootFolder();
  
  parts.forEach(part => {
    const folders = currentFolder.getFoldersByName(part);
    if (folders.hasNext()) {
      currentFolder = folders.next();
    } else {
      currentFolder = currentFolder.createFolder(part);
      logInfo(`フォルダ作成: ${part}`);
    }
  });
  
  return currentFolder;
}

/**
 * ファイル名のサニタイズ
 * ファイル名に使用できない文字を置換
 * @param {string} fileName 元のファイル名
 * @return {string} サニタイズ済みファイル名
 */
function sanitizeFileName(fileName) {
  if (!fileName) return 'untitled';
  return fileName
    .replace(/[\/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 100);  // 最大100文字に制限
}

/**
 * ファイルをフォルダから検索
 * @param {GoogleAppsScript.Drive.Folder} folder フォルダ
 * @param {string} fileName ファイル名
 * @return {GoogleAppsScript.Drive.File|null} ファイル（見つからない場合null）
 */
function findFileInFolder(folder, fileName) {
  const files = folder.getFilesByName(fileName);
  return files.hasNext() ? files.next() : null;
}

/**
 * 古いファイルを削除
 * @param {GoogleAppsScript.Drive.Folder} folder 対象フォルダ
 * @param {number} daysToKeep 保持する日数
 */
function deleteOldFiles(folder, daysToKeep) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  const files = folder.getFiles();
  let deletedCount = 0;
  
  while (files.hasNext()) {
    const file = files.next();
    if (file.getLastUpdated() < cutoffDate) {
      file.setTrashed(true);
      deletedCount++;
    }
  }
  
  if (deletedCount > 0) {
    logInfo(`古いファイルを${deletedCount}件削除しました`);
  }
}

// ==================== 日付・時刻処理 ====================

/**
 * 日付を YYYY-MM-DD 形式でフォーマット
 * @param {Date} date 日付オブジェクト
 * @return {string} フォーマット済み日付文字列
 */
function formatDate(date) {
  return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd');
}

/**
 * 日付を YYYY-MM-DD HH:mm:ss 形式でフォーマット
 * @param {Date} date 日付オブジェクト
 * @return {string} フォーマット済み日時文字列
 */
function formatDateTime(date) {
  return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
}

/**
 * 日本語形式の日付文字列を取得
 * @param {Date} date 日付オブジェクト
 * @return {string} 日本語日付文字列（例: 2025年10月16日）
 */
function formatDateJapanese(date) {
  return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy年MM月dd日');
}

/**
 * ISO 8601形式の日付文字列を取得
 * @param {Date} date 日付オブジェクト
 * @return {string} ISO 8601文字列
 */
function toISOString(date) {
  return Utilities.formatDate(date, 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
}

/**
 * 日数を加算した日付を取得
 * @param {Date} date 基準日
 * @param {number} days 加算する日数（負の値で過去）
 * @return {Date} 計算後の日付
 */
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * 月の開始日を取得
 * @param {Date} date 基準日
 * @return {Date} 月の開始日（1日 00:00:00）
 */
function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * 月の終了日を取得
 * @param {Date} date 基準日
 * @return {Date} 月の終了日（最終日 23:59:59）
 */
function getMonthEnd(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
}

/**
 * 年月フォルダ名を取得（YYYY-MM形式）
 * @param {Date} date 日付オブジェクト
 * @return {string} 年月フォルダ名（例: 2025-01）
 */
function getMonthFolderName(date) {
  return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM');
}

// ==================== 文字列処理 ====================

/**
 * 文字列を指定文字数で切り詰め
 * @param {string} str 元の文字列
 * @param {number} maxLength 最大文字数
 * @param {string} suffix 省略記号（デフォルト: ...）
 * @return {string} 切り詰められた文字列
 */
function truncate(str, maxLength, suffix = '...') {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * HTMLタグを除去
 * @param {string} html HTML文字列
 * @return {string} プレーンテキスト
 */
function stripHtmlTags(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '');
}

/**
 * 改行を<br>に変換
 * @param {string} text テキスト
 * @return {string} 変換後のテキスト
 */
function nl2br(text) {
  if (!text) return '';
  return text.replace(/\n/g, '<br>');
}

/**
 * 文字列をエスケープ
 * @param {string} str エスケープする文字列
 * @return {string} エスケープ済み文字列
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ==================== プロパティストア ====================

/**
 * スクリプトプロパティに値を保存
 * @param {string} key キー
 * @param {string} value 値
 */
function setProperty(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
}

/**
 * スクリプトプロパティから値を取得
 * @param {string} key キー
 * @param {string} defaultValue デフォルト値
 * @return {string} 取得した値
 */
function getProperty(key, defaultValue = null) {
  return PropertiesService.getScriptProperties().getProperty(key) || defaultValue;
}

/**
 * スクリプトプロパティを削除
 * @param {string} key キー
 */
function deleteProperty(key) {
  PropertiesService.getScriptProperties().deleteProperty(key);
}

/**
 * 全てのスクリプトプロパティを取得
 * @return {Object} プロパティオブジェクト
 */
function getAllProperties() {
  return PropertiesService.getScriptProperties().getProperties();
}

// ==================== 配列・オブジェクト処理 ====================

/**
 * 配列をチャンクに分割
 * @param {Array} array 元の配列
 * @param {number} chunkSize チャンクサイズ
 * @return {Array[]} チャンクの配列
 */
function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * 配列から重複を削除
 * @param {Array} array 元の配列
 * @return {Array} 重複削除後の配列
 */
function uniqueArray(array) {
  return [...new Set(array)];
}

/**
 * オブジェクトをJSON文字列に変換（整形付き）
 * @param {Object} obj オブジェクト
 * @return {string} JSON文字列
 */
function toJsonString(obj) {
  return JSON.stringify(obj, null, 2);
}

// ==================== その他のユーティリティ ====================

/**
 * スリープ（指定ミリ秒待機）
 * @param {number} milliseconds 待機時間（ミリ秒）
 */
function sleep(milliseconds) {
  Utilities.sleep(milliseconds);
}

/**
 * ランダムな文字列を生成
 * @param {number} length 文字列の長さ
 * @return {string} ランダム文字列
 */
function generateRandomString(length = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * リトライ実行
 * @param {Function} func 実行する関数
 * @param {number} maxRetries 最大リトライ回数
 * @param {number} delayMs リトライ間隔（ミリ秒）
 * @return {*} 関数の実行結果
 */
function retryExecution(func, maxRetries = 3, delayMs = 1000) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return func();
    } catch (error) {
      lastError = error;
      logWarning(`実行失敗（${i + 1}/${maxRetries}回目）: ${error.message}`);
      if (i < maxRetries - 1) {
        sleep(delayMs);
      }
    }
  }
  
  throw lastError;
}

/**
 * URLからファイル名を抽出
 * @param {string} url URL
 * @return {string} ファイル名
 */
function extractFileNameFromUrl(url) {
  try {
    const parts = url.split('/');
    return parts[parts.length - 1].split('?')[0];
  } catch (e) {
    return 'download';
  }
}

/**
 * バイトサイズを人間が読みやすい形式に変換
 * @param {number} bytes バイト数
 * @return {string} フォーマット済みサイズ（例: 1.5 MB）
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * 進捗表示
 * @param {number} current 現在の値
 * @param {number} total 合計
 * @param {string} label ラベル
 */
function logProgress(current, total, label = '処理中') {
  const percentage = Math.round((current / total) * 100);
  logInfo(`${label}: ${current}/${total} (${percentage}%)`);
}

// ==================== Gemini最適化機能 ====================

/**
 * メッセージからキーワードを抽出
 * @param {string} text メッセージテキスト
 * @return {Array<string>} キーワードの配列
 */
function extractKeywords(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  
  // 重要キーワードのリスト
  const importantKeywords = [
    '会議', 'ミーティング', '打ち合わせ',
    '休暇', '休み', '有給', '欠勤',
    '報告', '完了', '結果', '状況',
    '決定', '承認', '確定', '決まり',
    '問題', 'エラー', 'トラブル', '困っ',
    '依頼', 'お願い', 'してほしい',
    '確認', '質問', '教えて',
    '入荷', '納品', '補充', '在庫',
    '売上', '販売', '注文',
    'みどりの大地', '四季彩', '尾平', 'エーコープ', 'Aコープ',
    'じゃがいも', '白ねぎ', 'サツマイモ', '野菜', '農産物'
  ];
  
  const foundKeywords = [];
  
  importantKeywords.forEach(keyword => {
    if (text.includes(keyword)) {
      foundKeywords.push(keyword);
    }
  });
  
  // 最大10個まで
  return foundKeywords.slice(0, 10);
}

/**
 * メッセージをカテゴリに分類
 * @param {string} text メッセージテキスト
 * @return {string} カテゴリ名
 */
function categorizeMessage(text) {
  if (!text || typeof text !== 'string') {
    return 'その他';
  }
  
  const lowerText = text.toLowerCase();
  
  // 在庫関連
  if (text.includes('入荷') || text.includes('納品') || text.includes('補充') || text.includes('在庫')) {
    return '在庫補充';
  }
  
  if (text.includes('売上') || text.includes('販売') || text.includes('注文')) {
    return '売上';
  }
  
  // 会議関連
  if (text.includes('会議') || text.includes('ミーティング') || text.includes('打ち合わせ')) {
    return '会議';
  }
  
  // 休暇関連
  if (text.includes('休暇') || text.includes('休み') || text.includes('有給') || text.includes('欠勤')) {
    return '休暇連絡';
  }
  
  // 報告関連
  if (text.includes('報告') || text.includes('完了') || text.includes('結果') || text.includes('状況')) {
    return '報告';
  }
  
  // 質問関連
  if (text.includes('質問') || text.includes('教えて') || text.includes('どうすれば') || text.includes('？') || text.includes('?')) {
    return '質問';
  }
  
  // 決定事項
  if (text.includes('決定') || text.includes('決まり') || text.includes('承認') || text.includes('確定')) {
    return '決定事項';
  }
  
  // 問題関連
  if (text.includes('問題') || text.includes('エラー') || text.includes('トラブル') || text.includes('困っ')) {
    return '問題';
  }
  
  // 依頼関連
  if (text.includes('依頼') || text.includes('お願い') || text.includes('してほしい')) {
    return '依頼';
  }
  
  // デフォルト
  return 'その他';
}





