/**
 * システム診断ツール
 * 稼働状況を総合的にチェックし、レポートを生成
 */

/**
 * 総合診断を実行
 * @return {Object} 診断結果
 */
function runCompleteDiagnostics() {
  logInfo('========================================');
  logInfo('🔍 システム総合診断開始');
  logInfo('========================================');
  
  const report = {
    timestamp: new Date(),
    version: '1.0.0',
    sections: {}
  };
  
  try {
    // 1. 基本情報
    logInfo('\n[1/7] 基本情報を収集中...');
    report.sections.basic = getDiagnosticBasicInfo();
    
    // 2. 設定確認
    logInfo('\n[2/7] 設定を確認中...');
    report.sections.config = getDiagnosticConfigStatus();
    
    // 3. 認証状態
    logInfo('\n[3/7] 認証状態を確認中...');
    report.sections.auth = getDiagnosticAuthStatus();
    
    // 4. トリガー状態
    logInfo('\n[4/7] トリガーを確認中...');
    report.sections.triggers = getDiagnosticTriggerStatus();
    
    // 5. API接続テスト
    logInfo('\n[5/7] API接続をテスト中...');
    report.sections.api = getDiagnosticAPIStatus();
    
    // 6. ストレージ状態
    logInfo('\n[6/7] ストレージを確認中...');
    report.sections.storage = getDiagnosticStorageStatus();
    
    // 7. 最新同期状況
    logInfo('\n[7/7] 最新同期状況を取得中...');
    report.sections.sync = getDiagnosticSyncStatus();
    
    // 総合判定
    report.summary = generateDiagnosticSummary(report.sections);
    
  } catch (error) {
    logError('診断エラー', error);
    report.error = error.message;
  }
  
  // レポート出力
  logInfo('\n========================================');
  logInfo('📊 診断結果サマリー');
  logInfo('========================================');
  displayDiagnosticReport(report);
  
  // レポートをファイルに保存
  saveDiagnosticReport(report);
  
  return report;
}

/**
 * 基本情報を取得
 */
function getDiagnosticBasicInfo() {
  return {
    projectName: 'LINE WORKS統合システム',
    scriptId: ScriptApp.getScriptId(),
    timezone: Session.getScriptTimeZone(),
    currentTime: new Date(),
    user: Session.getEffectiveUser().getEmail()
  };
}

/**
 * 設定状態を取得
 */
function getDiagnosticConfigStatus() {
  const validation = validateConfig();
  
  return {
    valid: validation.valid,
    errors: validation.errors,
    calendarId: CONFIG.GOOGLE_CALENDAR.MASTER_CALENDAR_ID,
    adminUserId: CONFIG.NOTIFICATION.ADMIN_USER_ID,
    syncSchedule: CONFIG.SYNC.SCHEDULE.TIMES,
    monthlyOrganization: CONFIG.GOOGLE_DRIVE.MONTHLY_ORGANIZATION,
    logLevel: CONFIG.LOGGING.LEVEL
  };
}

/**
 * 認証状態を取得
 */
function getDiagnosticAuthStatus() {
  const status = {
    serviceAccount: false,
    bot: false,
    errors: []
  };
  
  try {
    const token = getAccessToken();
    status.serviceAccount = token && token.length > 0;
  } catch (error) {
    status.errors.push(`Service Account: ${error.message}`);
  }
  
  try {
    const botToken = getBotAccessToken();
    status.bot = botToken && botToken.length > 0;
  } catch (error) {
    status.errors.push(`Bot: ${error.message}`);
  }
  
  return status;
}

/**
 * トリガー状態を取得
 */
function getDiagnosticTriggerStatus() {
  const triggers = ScriptApp.getProjectTriggers();
  
  const status = {
    total: triggers.length,
    triggers: [],
    calendarSync: 0,
    chatSync: 0
  };
  
  triggers.forEach(trigger => {
    const handlerFunction = trigger.getHandlerFunction();
    const info = {
      function: handlerFunction,
      eventType: trigger.getEventType().toString(),
      source: trigger.getTriggerSource().toString()
    };
    
    if (handlerFunction === 'executeCalendarSync') {
      status.calendarSync++;
    } else if (handlerFunction === 'executeChatSync') {
      status.chatSync++;
    }
    
    status.triggers.push(info);
  });
  
  return status;
}

/**
 * API接続状態を取得
 */
function getDiagnosticAPIStatus() {
  const status = {
    calendar: { connected: false, count: 0, error: null },
    chat: { connected: false, count: 0, error: null }
  };
  
  // Calendar API
  try {
    const calendars = getLineWorksCalendarList();
    status.calendar.connected = true;
    status.calendar.count = calendars.length;
  } catch (error) {
    status.calendar.error = error.message;
  }
  
  // Chat API
  try {
    const channels = getLineWorksBotChannels();
    status.chat.connected = true;
    status.chat.count = channels.length;
  } catch (error) {
    status.chat.error = error.message;
  }
  
  return status;
}

/**
 * ストレージ状態を取得
 */
function getDiagnosticStorageStatus() {
  const status = {
    rootFolder: { exists: false, id: null, name: CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME },
    chatLogFolder: { exists: false, id: null },
    systemLogFolder: { exists: false, id: null },
    masterSpreadsheet: { exists: false, id: null, url: null }
  };
  
  try {
    // ルートフォルダ確認
    const rootFolder = getOrCreateFolder(CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME);
    status.rootFolder.exists = true;
    status.rootFolder.id = rootFolder.getId();
    
    // チャットログフォルダ
    const chatLogFolder = getOrCreateFolder(
      CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/' + CONFIG.GOOGLE_DRIVE.CHAT_LOG_FOLDER
    );
    status.chatLogFolder.exists = true;
    status.chatLogFolder.id = chatLogFolder.getId();
    
    // システムログフォルダ
    const systemLogFolder = getOrCreateFolder(
      CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/' + CONFIG.GOOGLE_DRIVE.SYSTEM_LOG_FOLDER
    );
    status.systemLogFolder.exists = true;
    status.systemLogFolder.id = systemLogFolder.getId();
    
    // マスタースプレッドシート
    try {
      const spreadsheet = getMasterSpreadsheet();
      status.masterSpreadsheet.exists = true;
      status.masterSpreadsheet.id = spreadsheet.getId();
      status.masterSpreadsheet.url = spreadsheet.getUrl();
    } catch (e) {
      status.masterSpreadsheet.error = e.message;
    }
    
  } catch (error) {
    status.error = error.message;
  }
  
  return status;
}

/**
 * 最新同期状況を取得
 */
function getDiagnosticSyncStatus() {
  const status = {
    calendar: { lastSync: null, status: 'unknown' },
    chat: { lastSync: null, status: 'unknown' }
  };
  
  try {
    // プロパティから最新同期情報を取得
    const calendarLastSync = getProperty('LAST_CALENDAR_SYNC');
    if (calendarLastSync) {
      status.calendar.lastSync = new Date(calendarLastSync);
      status.calendar.status = getProperty('LAST_CALENDAR_SYNC_STATUS') || 'unknown';
    }
    
    const chatLastSync = getProperty('LAST_CHAT_SYNC');
    if (chatLastSync) {
      status.chat.lastSync = new Date(chatLastSync);
      status.chat.status = getProperty('LAST_CHAT_SYNC_STATUS') || 'unknown';
    }
  } catch (error) {
    status.error = error.message;
  }
  
  return status;
}

/**
 * 診断サマリーを生成
 */
function generateDiagnosticSummary(sections) {
  const summary = {
    overall: 'healthy',
    issues: [],
    warnings: [],
    recommendations: []
  };
  
  // 設定チェック
  if (!sections.config.valid) {
    summary.overall = 'error';
    summary.issues.push(`設定エラー: ${sections.config.errors.join(', ')}`);
  }
  
  // 認証チェック
  if (!sections.auth.serviceAccount || !sections.auth.bot) {
    summary.overall = 'error';
    summary.issues.push(...sections.auth.errors);
  }
  
  // トリガーチェック
  if (sections.triggers.total === 0) {
    summary.overall = summary.overall === 'healthy' ? 'warning' : summary.overall;
    summary.warnings.push('トリガーが設定されていません');
    summary.recommendations.push('setupTriggers() を実行してトリガーを設定してください');
  }
  
  if (sections.triggers.calendarSync === 0) {
    summary.warnings.push('カレンダー同期トリガーがありません');
  }
  
  if (sections.triggers.chatSync === 0) {
    summary.warnings.push('チャット同期トリガーがありません');
  }
  
  // API接続チェック
  if (!sections.api.calendar.connected) {
    summary.overall = 'error';
    summary.issues.push(`Calendar API: ${sections.api.calendar.error}`);
  }
  
  if (!sections.api.chat.connected) {
    summary.overall = 'error';
    summary.issues.push(`Chat API: ${sections.api.chat.error}`);
  }
  
  // ストレージチェック
  if (!sections.storage.rootFolder.exists) {
    summary.overall = 'error';
    summary.issues.push('ルートフォルダが作成できません');
  }
  
  // 同期状況チェック
  if (!sections.sync.calendar.lastSync) {
    summary.warnings.push('カレンダー同期が一度も実行されていません');
    summary.recommendations.push('executeCalendarSync() を実行して初回同期を行ってください');
  }
  
  if (!sections.sync.chat.lastSync) {
    summary.warnings.push('チャット同期が一度も実行されていません');
    summary.recommendations.push('executeChatSync() を実行して初回同期を行ってください');
  }
  
  return summary;
}

/**
 * 診断レポートを表示
 */
function displayDiagnosticReport(report) {
  const summary = report.summary;
  
  // 総合ステータス
  const statusEmoji = {
    'healthy': '✅',
    'warning': '⚠️',
    'error': '❌'
  };
  
  logInfo(`\n総合ステータス: ${statusEmoji[summary.overall]} ${summary.overall.toUpperCase()}`);
  logInfo(`診断時刻: ${formatDateTime(report.timestamp)}`);
  
  // 問題点
  if (summary.issues.length > 0) {
    logInfo('\n❌ 問題点:');
    summary.issues.forEach(issue => logInfo(`  - ${issue}`));
  }
  
  // 警告
  if (summary.warnings.length > 0) {
    logInfo('\n⚠️  警告:');
    summary.warnings.forEach(warning => logInfo(`  - ${warning}`));
  }
  
  // 推奨事項
  if (summary.recommendations.length > 0) {
    logInfo('\n💡 推奨事項:');
    summary.recommendations.forEach(rec => logInfo(`  - ${rec}`));
  }
  
  // 詳細情報
  logInfo('\n--- 詳細情報 ---');
  
  // トリガー
  logInfo(`\nトリガー: ${report.sections.triggers.total}個`);
  logInfo(`  - カレンダー同期: ${report.sections.triggers.calendarSync}個`);
  logInfo(`  - チャット同期: ${report.sections.triggers.chatSync}個`);
  
  // API
  logInfo(`\nAPI接続:`);
  logInfo(`  - Calendar API: ${report.sections.api.calendar.connected ? '✅' : '❌'} (${report.sections.api.calendar.count}カレンダー)`);
  logInfo(`  - Chat API: ${report.sections.api.chat.connected ? '✅' : '❌'} (${report.sections.api.chat.count}チャンネル)`);
  
  // 最新同期
  logInfo(`\n最新同期:`);
  if (report.sections.sync.calendar.lastSync) {
    logInfo(`  - カレンダー: ${formatDateTime(report.sections.sync.calendar.lastSync)} (${report.sections.sync.calendar.status})`);
  } else {
    logInfo(`  - カレンダー: 未実行`);
  }
  
  if (report.sections.sync.chat.lastSync) {
    logInfo(`  - チャット: ${formatDateTime(report.sections.sync.chat.lastSync)} (${report.sections.sync.chat.status})`);
  } else {
    logInfo(`  - チャット: 未実行`);
  }
  
  // ストレージ
  if (report.sections.storage.masterSpreadsheet.exists) {
    logInfo(`\nマスタースプレッドシート:`);
    logInfo(`  ${report.sections.storage.masterSpreadsheet.url}`);
  }
  
  logInfo('\n========================================');
}

/**
 * 診断レポートをファイルに保存
 */
function saveDiagnosticReport(report) {
  try {
    const now = new Date();
    const fileName = `診断レポート_${Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMdd_HHmmss')}.txt`;
    
    // 月次フォルダで整理
    let folder;
    if (CONFIG.GOOGLE_DRIVE.MONTHLY_ORGANIZATION) {
      const monthFolder = getMonthFolderName(now);
      folder = getOrCreateFolder(
        CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/' +
        CONFIG.GOOGLE_DRIVE.SYSTEM_LOG_FOLDER + '/' +
        monthFolder
      );
    } else {
      folder = getOrCreateFolder(CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME);
    }
    
    // JSON形式で保存
    const content = JSON.stringify(report, null, 2);
    folder.createFile(fileName, content, MimeType.PLAIN_TEXT);
    
    logInfo(`診断レポートを保存しました: ${fileName}`);
  } catch (error) {
    logError('診断レポート保存エラー', error);
  }
}

/**
 * クイック診断（簡易版）
 */
function quickDiagnostics() {
  logInfo('========================================');
  logInfo('⚡ クイック診断');
  logInfo('========================================');
  
  const results = [];
  
  // 設定
  const configValid = validateConfig().valid;
  results.push(`設定: ${configValid ? '✅' : '❌'}`);
  
  // 認証
  let authOK = false;
  try {
    const token = getAccessToken();
    authOK = token && token.length > 0;
  } catch (e) {}
  results.push(`認証: ${authOK ? '✅' : '❌'}`);
  
  // トリガー
  const triggerCount = ScriptApp.getProjectTriggers().length;
  results.push(`トリガー: ${triggerCount}個 ${triggerCount > 0 ? '✅' : '⚠️'}`);
  
  // API
  let calendarOK = false;
  try {
    getLineWorksCalendarList();
    calendarOK = true;
  } catch (e) {}
  results.push(`Calendar API: ${calendarOK ? '✅' : '❌'}`);
  
  let chatOK = false;
  try {
    getLineWorksBotChannels();
    chatOK = true;
  } catch (e) {}
  results.push(`Chat API: ${chatOK ? '✅' : '❌'}`);
  
  logInfo('\n結果:');
  results.forEach(r => logInfo(`  ${r}`));
  
  const allOK = configValid && authOK && triggerCount > 0 && calendarOK && chatOK;
  logInfo(`\n総合: ${allOK ? '✅ 正常' : '⚠️ 要確認'}`);
  logInfo('========================================');
  
  return allOK;
}


