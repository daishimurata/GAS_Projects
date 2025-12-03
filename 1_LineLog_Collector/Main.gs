/**
 * メイン実行・エントリーポイント
 * トリガーから呼び出される関数
 */

/**
 * カレンダー同期実行（トリガー用）
 */
function executeCalendarSync() {
  logInfo('===== カレンダー同期トリガー実行 =====');
  
  try {
    const stats = syncCalendars();
    
    // 同期履歴を保存
    saveCalendarSyncHistory(stats);
    
    return stats;
  } catch (error) {
    logError('カレンダー同期トリガーエラー', error);
    sendErrorNotification('カレンダー同期失敗', error, 'executeCalendarSync');
    throw error;
  }
}

/**
 * チャット同期実行（トリガー用）
 */
function executeChatSync() {
  logInfo('===== チャット同期トリガー実行 =====');
  
  try {
    const stats = syncChatLogs();
    
    // 同期履歴を保存
    saveChatSyncHistory(stats);
    
    return stats;
  } catch (error) {
    logError('チャット同期トリガーエラー', error);
    sendErrorNotification('チャット同期失敗', error, 'executeChatSync');
    throw error;
  }
}

/**
 * 統合同期実行（カレンダー + チャット）
 */
function executeFullSync() {
  const startTime = new Date();
  logInfo('========================================');
  logInfo('🔄 統合同期開始（カレンダー + チャット）');
  logInfo('========================================');
  
  const results = {
    calendar: null,
    chat: null,
    errors: []
  };
  
  // カレンダー同期
  try {
    logInfo('\n--- カレンダー同期 ---');
    results.calendar = syncCalendars();
  } catch (error) {
    logError('カレンダー同期エラー', error);
    results.errors.push(`カレンダー: ${error.message}`);
  }
  
  // チャット同期
  try {
    logInfo('\n--- チャット同期 ---');
    results.chat = syncChatLogs();
  } catch (error) {
    logError('チャット同期エラー', error);
    results.errors.push(`チャット: ${error.message}`);
  }
  
  // 結果サマリー
  const duration = ((new Date() - startTime) / 1000).toFixed(1);
  
  logInfo('\n========================================');
  logInfo('📊 統合同期完了');
  logInfo('========================================');
  logInfo(`処理時間: ${duration}秒`);
  logInfo(`エラー数: ${results.errors.length}件`);
  
  if (results.errors.length > 0) {
    logInfo('\nエラー詳細:');
    results.errors.forEach(err => logInfo(`  - ${err}`));
  }
  
  // 通知送信
  sendSyncCompletionNotification('full', results, duration);
  
  return results;
}

/**
 * 初期セットアップ
 * 初回実行時に呼び出す
 */
function initialSetup() {
  logInfo('========================================');
  logInfo('🔧 初期セットアップ開始');
  logInfo('========================================');
  
  const steps = [];
  
  try {
    // 1. 設定検証
    logInfo('\n[1/6] 設定を検証中...');
    const validation = validateConfig();
    if (!validation.valid) {
      sendConfigErrorNotification(validation.errors);
      throw new Error(`設定エラー: ${validation.errors.join(', ')}`);
    }
    steps.push('✅ 設定検証完了');
    logInfo('✅ 設定検証完了');
    
    // 2. 認証テスト
    logInfo('\n[2/6] 認証をテスト中...');
    const authResult = testAuthentication();
    if (!authResult.serviceAccount || !authResult.bot) {
      throw new Error('認証に失敗しました');
    }
    steps.push('✅ 認証テスト完了');
    logInfo('✅ 認証テスト完了');
    
    // 3. API接続テスト
    logInfo('\n[3/6] API接続をテスト中...');
    const apiResult = testAllAPIs();
    if (!apiResult) {
      throw new Error('API接続に失敗しました');
    }
    steps.push('✅ API接続テスト完了');
    logInfo('✅ API接続テスト完了');
    
    // 4. Googleドライブフォルダ作成
    logInfo('\n[4/6] Googleドライブフォルダを作成中...');
    getOrCreateFolder(CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME);
    getOrCreateFolder(CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/' + CONFIG.GOOGLE_DRIVE.CHAT_LOG_FOLDER);
    getOrCreateFolder(CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/' + CONFIG.GOOGLE_DRIVE.CALENDAR_FOLDER);
    steps.push('✅ フォルダ作成完了');
    logInfo('✅ フォルダ作成完了');
    
    // 5. マスタースプレッドシート作成
    logInfo('\n[5/6] マスタースプレッドシートを作成中...');
    const spreadsheet = getMasterSpreadsheet();
    steps.push(`✅ スプレッドシート作成完了: ${spreadsheet.getName()}`);
    logInfo(`✅ スプレッドシート作成完了: ${spreadsheet.getName()}`);
    
    // 6. テスト通知送信
    logInfo('\n[6/6] テスト通知を送信中...');
    const notificationResult = sendTestNotification();
    if (notificationResult) {
      steps.push('✅ テスト通知送信成功');
      logInfo('✅ テスト通知送信成功');
    } else {
      steps.push('⚠️ テスト通知送信失敗（通知設定を確認）');
      logWarning('テスト通知送信失敗');
    }
    
    logInfo('\n========================================');
    logInfo('🎉 初期セットアップ完了！');
    logInfo('========================================');
    logInfo('\n次のステップ:');
    logInfo('1. GASエディタで「トリガー」を設定');
    logInfo('2. executeCalendarSync と executeChatSync の時間ベーストリガーを作成');
    logInfo('3. 最初の同期を手動実行してテスト');
    logInfo('');
    logInfo('設定した時刻に自動的に同期が開始されます。');
    logInfo('========================================');
    
    // セットアップ完了通知
    const message = `🎉 初期セットアップ完了\n\n` +
                   steps.join('\n') +
                   `\n\n次回同期予定: ${formatDateTime(getNextScheduledSyncTime())}`;
    sendInfoNotification('セットアップ完了', message);
    
    return { success: true, steps: steps };
    
  } catch (error) {
    logError('初期セットアップエラー', error);
    sendErrorNotification('初期セットアップ失敗', error, 'initialSetup');
    
    return {
      success: false,
      error: error.message,
      steps: steps
    };
  }
}

/**
 * システム状態確認
 * 定期的にシステムの健全性をチェック
 */
function checkSystemHealth() {
  logInfo('システム状態確認中...');
  
  const health = {
    timestamp: new Date(),
    config: true,
    auth: true,
    calendar: true,
    chat: true,
    storage: true,
    issues: []
  };
  
  try {
    // 設定確認
    const validation = validateConfig();
    if (!validation.valid) {
      health.config = false;
      health.issues.push(`設定エラー: ${validation.errors.join(', ')}`);
    }
    
    // 認証確認
    const authResult = testAuthentication();
    if (!authResult.serviceAccount) {
      health.auth = false;
      health.issues.push('Service Account認証失敗');
    }
    if (!authResult.bot) {
      health.auth = false;
      health.issues.push('Bot認証失敗');
    }
    
    // カレンダーAPI確認
    try {
      const calendars = getLineWorksCalendarList();
      health.calendar = calendars.length > 0;
      if (!health.calendar) {
        health.issues.push('カレンダーが取得できません');
      }
    } catch (e) {
      health.calendar = false;
      health.issues.push(`Calendar APIエラー: ${e.message}`);
    }
    
    // チャットAPI確認
    try {
      const channels = getLineWorksBotChannels();
      health.chat = channels.length > 0;
      if (!health.chat) {
        health.issues.push('チャンネルが取得できません');
      }
    } catch (e) {
      health.chat = false;
      health.issues.push(`Chat APIエラー: ${e.message}`);
    }
    
    // ストレージ確認
    try {
      const folder = getOrCreateFolder(CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME);
      health.storage = folder !== null;
    } catch (e) {
      health.storage = false;
      health.issues.push(`ストレージエラー: ${e.message}`);
    }
    
  } catch (error) {
    health.issues.push(`システムエラー: ${error.message}`);
  }
  
  // 結果ログ
  const allHealthy = health.config && health.auth && health.calendar && health.chat && health.storage;
  
  if (allHealthy) {
    logInfo('✅ システム正常');
  } else {
    logWarning(`⚠️ システムに問題があります: ${health.issues.join(', ')}`);
    sendWarningNotification('システム状態確認', health.issues.join('\n'));
  }
  
  return health;
}

/**
 * システム統計情報を取得
 */
function getSystemStatistics() {
  try {
    const stats = {
      calendar: {
        lastSync: getCalendarSyncStatus(),
        totalCalendars: 0,
        totalEvents: 0
      },
      chat: {
        lastSync: getChatSyncStatus(),
        statistics: getChatStatistics()
      },
      storage: {
        rootFolder: CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME,
        folders: []
      }
    };
    
    // カレンダー情報
    try {
      const calendars = getLineWorksCalendarList();
      stats.calendar.totalCalendars = calendars.length;
    } catch (e) {
      logDebug('カレンダー情報取得エラー: ' + e.message);
    }
    
    logInfo('システム統計情報:');
    logInfo(JSON.stringify(stats, null, 2));
    
    return stats;
  } catch (error) {
    logError('統計情報取得エラー', error);
    return { error: error.message };
  }
}

/**
 * メンテナンスタスク実行
 * 定期的にクリーンアップなどを実行
 */
function runMaintenanceTasks() {
  logInfo('========================================');
  logInfo('🔧 メンテナンスタスク開始');
  logInfo('========================================');
  
  try {
    // 古いログ削除
    logInfo('\n古いチャットログを削除中...');
    cleanupOldChatLogs(CONFIG.LOGGING.AUTO_DELETE_DAYS);
    
    // イベントマッピングクリーンアップ
    logInfo('\nイベントマッピングをクリーンアップ中...');
    cleanupEventMappings();
    
    // キャッシュクリア
    logInfo('\nキャッシュをクリア中...');
    clearTokenCache();
    
    // システム状態確認
    logInfo('\nシステム状態を確認中...');
    checkSystemHealth();
    
    logInfo('\n========================================');
    logInfo('✅ メンテナンスタスク完了');
    logInfo('========================================');
    
    return { success: true };
  } catch (error) {
    logError('メンテナンスタスクエラー', error);
    return { success: false, error: error.message };
  }
}

/**
 * 緊急停止
 * 問題発生時に同期を停止
 */
function emergencyStop() {
  logInfo('========================================');
  logInfo('🛑 緊急停止が実行されました');
  logInfo('========================================');
  
  const message = `🛑 緊急停止\n\n` +
                 `システムが緊急停止されました。\n` +
                 `停止時刻: ${formatDateTime(new Date())}\n\n` +
                 `再開するには、トリガーを再設定してください。`;
  
  sendWarningNotification('緊急停止', message);
  
  // すべてのトリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    ScriptApp.deleteTrigger(trigger);
    logInfo(`トリガー削除: ${trigger.getHandlerFunction()}`);
  });
  
  logInfo('全てのトリガーを削除しました');
}







