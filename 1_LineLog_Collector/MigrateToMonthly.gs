/**
 * 既存ログファイルを月次フォルダ構造に移行
 * 初回実行時または月次整理を有効化した際に使用
 */

/**
 * システムログを月次フォルダに移行
 * @return {Object} 移行結果
 */
function migrateSystemLogsToMonthly() {
  logInfo('========================================');
  logInfo('📦 システムログの月次移行を開始');
  logInfo('========================================');
  
  const stats = {
    success: false,
    filesMoved: 0,
    errors: []
  };
  
  try {
    const rootFolder = getOrCreateFolder(CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME);
    const fileName = CONFIG.LOGGING.SYNC_LOG_FILE;
    
    // ルートフォルダにある古いログファイルを検索
    const files = rootFolder.getFilesByName(fileName);
    
    if (files.hasNext()) {
      const file = files.next();
      const lastModified = file.getLastUpdated();
      const monthFolder = getMonthFolderName(lastModified);
      
      // 月次フォルダを作成
      const targetFolder = getOrCreateFolder(
        CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/' +
        CONFIG.GOOGLE_DRIVE.SYSTEM_LOG_FOLDER + '/' +
        monthFolder
      );
      
      // ファイルを移動
      file.moveTo(targetFolder);
      stats.filesMoved++;
      
      logInfo(`✅ ${fileName} を ${monthFolder} フォルダに移動しました`);
    } else {
      logInfo('移行対象のシステムログファイルはありません');
    }
    
    stats.success = true;
  } catch (error) {
    logError('システムログ移行エラー', error);
    stats.errors.push(error.message);
  }
  
  logInfo('========================================');
  logInfo(`移行ファイル数: ${stats.filesMoved}件`);
  logInfo('========================================');
  
  return stats;
}

/**
 * チャットログを月次フォルダに移行
 * @return {Object} 移行結果
 */
function migrateChatLogsToMonthly() {
  logInfo('========================================');
  logInfo('📦 チャットログの月次移行を開始');
  logInfo('========================================');
  
  const stats = {
    success: false,
    dailyLogsMoved: 0,
    roomLogsMoved: 0,
    errors: []
  };
  
  try {
    // 日次ログの移行
    logInfo('\n--- 日次ログを移行中 ---');
    stats.dailyLogsMoved = migrateDailyLogs();
    
    // ルーム別ログの移行
    logInfo('\n--- ルーム別ログを移行中 ---');
    stats.roomLogsMoved = migrateRoomLogs();
    
    stats.success = true;
  } catch (error) {
    logError('チャットログ移行エラー', error);
    stats.errors.push(error.message);
  }
  
  logInfo('\n========================================');
  logInfo('📊 移行結果');
  logInfo('========================================');
  logInfo(`日次ログ: ${stats.dailyLogsMoved}件`);
  logInfo(`ルーム別ログ: ${stats.roomLogsMoved}件`);
  if (stats.errors.length > 0) {
    logInfo(`エラー: ${stats.errors.length}件`);
  }
  logInfo('========================================');
  
  return stats;
}

/**
 * 日次ログを月次フォルダに移行
 * @return {number} 移行したファイル数
 */
function migrateDailyLogs() {
  let movedCount = 0;
  
  try {
    const dailyLogFolder = getOrCreateFolder(
      CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/' +
      CONFIG.GOOGLE_DRIVE.CHAT_LOG_FOLDER + '/' +
      CONFIG.GOOGLE_DRIVE.DAILY_LOG_FOLDER
    );
    
    const files = dailyLogFolder.getFiles();
    
    while (files.hasNext()) {
      const file = files.next();
      const fileName = file.getName();
      
      // ファイル名から日付を抽出（YYYY-MM-DD形式を想定）
      const dateMatch = fileName.match(/(\d{4})-(\d{2})-\d{2}/);
      
      if (dateMatch) {
        const yearMonth = `${dateMatch[1]}-${dateMatch[2]}`;
        
        // 月次フォルダを作成
        const monthFolder = getOrCreateFolder(
          CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/' +
          CONFIG.GOOGLE_DRIVE.CHAT_LOG_FOLDER + '/' +
          CONFIG.GOOGLE_DRIVE.DAILY_LOG_FOLDER + '/' +
          yearMonth
        );
        
        // ファイルを移動
        file.moveTo(monthFolder);
        movedCount++;
        
        logDebug(`  ${fileName} → ${yearMonth}/`);
      }
    }
    
    logInfo(`✅ 日次ログ ${movedCount}件を移行しました`);
  } catch (error) {
    logError('日次ログ移行エラー', error);
  }
  
  return movedCount;
}

/**
 * ルーム別ログを月次フォルダに移行
 * @return {number} 移行したファイル数
 */
function migrateRoomLogs() {
  let movedCount = 0;
  
  try {
    const roomLogFolder = getOrCreateFolder(
      CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/' +
      CONFIG.GOOGLE_DRIVE.CHAT_LOG_FOLDER + '/' +
      CONFIG.GOOGLE_DRIVE.ROOM_LOG_FOLDER
    );
    
    const files = roomLogFolder.getFiles();
    
    while (files.hasNext()) {
      const file = files.next();
      const fileName = file.getName();
      const lastModified = file.getLastUpdated();
      const monthFolder = getMonthFolderName(lastModified);
      
      // 月次フォルダを作成
      const targetFolder = getOrCreateFolder(
        CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/' +
        CONFIG.GOOGLE_DRIVE.CHAT_LOG_FOLDER + '/' +
        CONFIG.GOOGLE_DRIVE.ROOM_LOG_FOLDER + '/' +
        monthFolder
      );
      
      // ファイルを移動
      file.moveTo(targetFolder);
      movedCount++;
      
      logDebug(`  ${fileName} → ${monthFolder}/`);
    }
    
    logInfo(`✅ ルーム別ログ ${movedCount}件を移行しました`);
  } catch (error) {
    logError('ルーム別ログ移行エラー', error);
  }
  
  return movedCount;
}

/**
 * 全ログファイルを月次フォルダに移行（一括実行）
 * @return {Object} 移行結果の統合
 */
function migrateAllLogsToMonthly() {
  logInfo('========================================');
  logInfo('📦 全ログファイルの月次移行を開始');
  logInfo('========================================');
  
  const startTime = new Date();
  
  const results = {
    systemLogs: null,
    chatLogs: null,
    totalFilesMoved: 0,
    errors: []
  };
  
  // システムログ移行
  try {
    logInfo('\n🔧 システムログを移行中...');
    results.systemLogs = migrateSystemLogsToMonthly();
    results.totalFilesMoved += results.systemLogs.filesMoved;
  } catch (error) {
    logError('システムログ移行エラー', error);
    results.errors.push(`システムログ: ${error.message}`);
  }
  
  // チャットログ移行
  try {
    logInfo('\n💬 チャットログを移行中...');
    results.chatLogs = migrateChatLogsToMonthly();
    results.totalFilesMoved += results.chatLogs.dailyLogsMoved + results.chatLogs.roomLogsMoved;
  } catch (error) {
    logError('チャットログ移行エラー', error);
    results.errors.push(`チャットログ: ${error.message}`);
  }
  
  const duration = ((new Date() - startTime) / 1000).toFixed(1);
  
  logInfo('\n========================================');
  logInfo('🎉 月次移行完了');
  logInfo('========================================');
  logInfo(`合計移行ファイル数: ${results.totalFilesMoved}件`);
  logInfo(`処理時間: ${duration}秒`);
  
  if (results.errors.length > 0) {
    logInfo(`\n⚠️ エラー: ${results.errors.length}件`);
    results.errors.forEach(err => logInfo(`  - ${err}`));
  }
  
  logInfo('\n次回以降のログは自動的に月次フォルダに保存されます。');
  logInfo('========================================');
  
  // 完了通知
  if (CONFIG.NOTIFICATION.NOTIFY_ON_SUCCESS) {
    const message = `📦 ログファイルの月次移行が完了しました\n\n` +
                   `移行ファイル数: ${results.totalFilesMoved}件\n` +
                   `処理時間: ${duration}秒`;
    sendInfoNotification('月次移行完了', message);
  }
  
  return results;
}

/**
 * 古い月のログフォルダをアーカイブ
 * @param {number} monthsToKeep 保持する月数（デフォルト: 12ヶ月）
 * @return {Object} アーカイブ結果
 */
function archiveOldMonthlyLogs(monthsToKeep = 12) {
  logInfo('========================================');
  logInfo(`📚 古い月のログをアーカイブ（${monthsToKeep}ヶ月より前）`);
  logInfo('========================================');
  
  const stats = {
    foldersArchived: 0,
    errors: []
  };
  
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - monthsToKeep);
  const cutoffYearMonth = getMonthFolderName(cutoffDate);
  
  logInfo(`基準日: ${cutoffYearMonth} より前のフォルダをアーカイブします`);
  
  try {
    // アーカイブフォルダを作成
    const archiveFolder = getOrCreateFolder(
      CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/アーカイブ'
    );
    
    // システムログのアーカイブ
    const systemLogFolder = getOrCreateFolder(
      CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/' +
      CONFIG.GOOGLE_DRIVE.SYSTEM_LOG_FOLDER
    );
    
    stats.foldersArchived += archiveOldFolders(systemLogFolder, cutoffYearMonth, archiveFolder);
    
    // 日次ログのアーカイブ
    const dailyLogFolder = getOrCreateFolder(
      CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/' +
      CONFIG.GOOGLE_DRIVE.CHAT_LOG_FOLDER + '/' +
      CONFIG.GOOGLE_DRIVE.DAILY_LOG_FOLDER
    );
    
    stats.foldersArchived += archiveOldFolders(dailyLogFolder, cutoffYearMonth, archiveFolder);
    
    // ルーム別ログのアーカイブ
    const roomLogFolder = getOrCreateFolder(
      CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/' +
      CONFIG.GOOGLE_DRIVE.CHAT_LOG_FOLDER + '/' +
      CONFIG.GOOGLE_DRIVE.ROOM_LOG_FOLDER
    );
    
    stats.foldersArchived += archiveOldFolders(roomLogFolder, cutoffYearMonth, archiveFolder);
    
  } catch (error) {
    logError('アーカイブエラー', error);
    stats.errors.push(error.message);
  }
  
  logInfo('\n========================================');
  logInfo(`アーカイブ完了: ${stats.foldersArchived}フォルダ`);
  logInfo('========================================');
  
  return stats;
}

/**
 * 古いフォルダをアーカイブ
 * @param {GoogleAppsScript.Drive.Folder} parentFolder 親フォルダ
 * @param {string} cutoffYearMonth 基準年月（YYYY-MM）
 * @param {GoogleAppsScript.Drive.Folder} archiveFolder アーカイブ先フォルダ
 * @return {number} アーカイブしたフォルダ数
 */
function archiveOldFolders(parentFolder, cutoffYearMonth, archiveFolder) {
  let count = 0;
  const folders = parentFolder.getFolders();
  
  while (folders.hasNext()) {
    const folder = folders.next();
    const folderName = folder.getName();
    
    // YYYY-MM形式のフォルダ名かチェック
    if (/^\d{4}-\d{2}$/.test(folderName)) {
      if (folderName < cutoffYearMonth) {
        folder.moveTo(archiveFolder);
        count++;
        logInfo(`  ${folderName} をアーカイブしました`);
      }
    }
  }
  
  return count;
}



