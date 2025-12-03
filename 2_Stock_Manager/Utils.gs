/**
 * 在庫管理システム 共通ユーティリティ関数
 */

// ==================== ログ関連 ====================

/**
 * DEBUGレベルログ
 */
function logDebug(message) {
  Logger.log(`[DEBUG] ${new Date().toISOString()}: ${message}`);
}

/**
 * INFOレベルログ
 */
function logInfo(message) {
  Logger.log(`[INFO] ${new Date().toISOString()}: ${message}`);
}

/**
 * WARNINGレベルログ
 */
function logWarning(message) {
  Logger.log(`[WARNING] ${new Date().toISOString()}: ${message}`);
}

/**
 * ERRORレベルログ
 */
function logError(message, error) {
  const errorMsg = error ? ` - ${error.toString()}` : '';
  const stackTrace = error && error.stack ? `\nStack: ${error.stack}` : '';
  Logger.log(`[ERROR] ${new Date().toISOString()}: ${message}${errorMsg}${stackTrace}`);
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
 * @param {string} fileName 元のファイル名
 * @return {string} サニタイズ済みファイル名
 */
function sanitizeFileName(fileName) {
  if (!fileName) return 'untitled';
  return fileName
    .replace(/[\/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 100);
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
 * 月フォルダ名を取得（YYYY-MM形式）
 * @param {Date|string} date 日付オブジェクトまたは日付文字列
 * @return {string} 月フォルダ名（例: 2025-01）
 */
function getMonthFolderName(date) {
  // 文字列の場合はDateオブジェクトに変換
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return Utilities.formatDate(dateObj, 'Asia/Tokyo', 'yyyy-MM');
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

// ==================== 通知機能 ====================

/**
 * 情報通知（成功時など）
 * @param {string} title タイトル
 * @param {string} description 内容
 */
function sendInfoNotification(title, description) {
  // 通知機能は後で実装可能
  logInfo(`ℹ️ ${title}: ${description}`);
}

/**
 * 警告通知
 * @param {string} title タイトル
 * @param {string} description 内容
 */
function sendWarningNotification(title, description) {
  // 通知機能は後で実装可能
  logWarning(`⚠️ ${title}: ${description}`);
}

/**
 * エラー通知
 * @param {string} title タイトル
 * @param {Error} error エラーオブジェクト
 * @param {string} context コンテキスト
 */
function sendErrorNotification(title, error, context = '') {
  // 通知機能は後で実装可能
  logError(`${title}${context ? ` (${context})` : ''}`, error);
}

// ==================== 売上サマリー更新 ====================

/**
 * 日次売上サマリーを更新
 * @param {Spreadsheet} spreadsheet 在庫管理スプレッドシート
 * @param {string} storeName 店舗名
 * @param {Date} date 日付
 * @param {Array} salesData 売上データ配列（itemName, soldCount, unitPrice, salesAmount を含む）
 */
function updateDailySalesSummary(spreadsheet, storeName, date, salesData) {
  try {
    let dailySalesSheet = spreadsheet.getSheetByName('日次売上サマリー');
    
    if (!dailySalesSheet) {
      logWarning('日次売上サマリーシートが見つかりません');
      return;
    }
    
    // 日付を YYYY-MM-DD 形式に変換
    const dateObj = date instanceof Date ? date : new Date(date);
    const dateStr = Utilities.formatDate(dateObj, 'Asia/Tokyo', 'yyyy-MM-dd');
    
    // 既存データを取得
    const data = dailySalesSheet.getDataRange().getValues();
    const headers = data[0];
    
    // ヘッダーの列インデックスを取得
    const dateIndex = headers.indexOf('日付');
    const storeIndex = headers.indexOf('店舗');
    const itemCountIndex = headers.indexOf('商品数');
    const totalSalesIndex = headers.indexOf('総販売数');
    const totalRevenueIndex = headers.indexOf('総売上金額');
    
    if (dateIndex === -1 || storeIndex === -1 || itemCountIndex === -1 || 
        totalSalesIndex === -1 || totalRevenueIndex === -1) {
      logError('日次売上サマリーシートのヘッダーが不正です');
      return;
    }
    
    // 既存の行を検索（日付と店舗で一致）
    let existingRowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      const rowDate = data[i][dateIndex];
      const rowStore = data[i][storeIndex];
      
      // 日付の比較（Dateオブジェクトまたは文字列）
      let rowDateStr = '';
      if (rowDate instanceof Date) {
        rowDateStr = Utilities.formatDate(rowDate, 'Asia/Tokyo', 'yyyy-MM-dd');
      } else if (typeof rowDate === 'string') {
        rowDateStr = rowDate;
      }
      
      if (rowDateStr === dateStr && rowStore === storeName) {
        existingRowIndex = i + 1; // スプレッドシートの行番号（1ベース）
        break;
      }
    }
    
    // 売上データを集計
    const itemCount = salesData.length;
    const totalSoldCount = salesData.reduce((sum, item) => sum + (parseInt(item.soldCount, 10) || 0), 0);
    const totalRevenue = salesData.reduce((sum, item) => sum + (parseInt(item.salesAmount || 0, 10) || 0), 0);
    
    if (existingRowIndex > 0) {
      // 既存の行を更新（既存の値に加算）
      const currentItemCount = parseInt(dailySalesSheet.getRange(existingRowIndex, itemCountIndex + 1).getValue(), 10) || 0;
      const currentTotalSales = parseInt(dailySalesSheet.getRange(existingRowIndex, totalSalesIndex + 1).getValue(), 10) || 0;
      const currentTotalRevenue = parseInt(dailySalesSheet.getRange(existingRowIndex, totalRevenueIndex + 1).getValue(), 10) || 0;
      
      const newItemCount = currentItemCount + itemCount;
      const newTotalSales = currentTotalSales + totalSoldCount;
      const newTotalRevenue = currentTotalRevenue + totalRevenue;
      
      // 数値形式を設定してから書き込む
      dailySalesSheet.getRange(existingRowIndex, itemCountIndex + 1).setNumberFormat('0');
      dailySalesSheet.getRange(existingRowIndex, itemCountIndex + 1).setValue(newItemCount);
      
      dailySalesSheet.getRange(existingRowIndex, totalSalesIndex + 1).setNumberFormat('0');
      dailySalesSheet.getRange(existingRowIndex, totalSalesIndex + 1).setValue(newTotalSales);
      
      dailySalesSheet.getRange(existingRowIndex, totalRevenueIndex + 1).setNumberFormat('#,##0');
      dailySalesSheet.getRange(existingRowIndex, totalRevenueIndex + 1).setValue(newTotalRevenue);
      
      logInfo(`  📊 日次売上サマリー更新: ${storeName} (${dateStr}) - 商品数: ${currentItemCount} → ${newItemCount}, 総販売数: ${currentTotalSales} → ${newTotalSales}, 総売上金額: ¥${currentTotalRevenue.toLocaleString()} → ¥${newTotalRevenue.toLocaleString()}`);
    } else {
      // 新しい行を追加
      const newRow = [
        dateStr,
        storeName,
        itemCount,
        totalSoldCount,
        totalRevenue
      ];
      
      dailySalesSheet.appendRow(newRow);
      
      // 数値形式を設定
      const lastRow = dailySalesSheet.getLastRow();
      dailySalesSheet.getRange(lastRow, itemCountIndex + 1).setNumberFormat('0');
      dailySalesSheet.getRange(lastRow, totalSalesIndex + 1).setNumberFormat('0');
      dailySalesSheet.getRange(lastRow, totalRevenueIndex + 1).setNumberFormat('#,##0');
      
      logInfo(`  📊 日次売上サマリー追加: ${storeName} (${dateStr}) - 商品数: ${itemCount}, 総販売数: ${totalSoldCount}, 総売上金額: ¥${totalRevenue.toLocaleString()}`);
    }
    
  } catch (error) {
    logError('日次売上サマリー更新エラー', error);
  }
}

