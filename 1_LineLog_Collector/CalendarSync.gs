/**
 * カレンダー同期メイン処理
 * LINE WORKSの全カレンダーからイベントを取得し、Googleカレンダーに同期
 */

/**
 * カレンダー同期実行（メイン関数）
 */
function syncCalendars() {
  const startTime = new Date();
  logInfo('========================================');
  logInfo('📅 カレンダー同期開始');
  logInfo('========================================');
  
  const stats = {
    calendarsTotal: 0,
    calendarsSuccess: 0,
    calendarsError: 0,
    eventsTotal: 0,
    eventsCreated: 0,
    eventsUpdated: 0,
    eventsSkipped: 0,
    eventsDeleted: 0,
    errors: []
  };
  
  try {
    // 設定検証
    const validation = validateConfig();
    if (!validation.valid) {
      throw new Error(`設定エラー: ${validation.errors.join(', ')}`);
    }
    
    // Googleカレンダー取得
    const googleCalendar = CalendarApp.getCalendarById(CONFIG.GOOGLE_CALENDAR.MASTER_CALENDAR_ID);
    if (!googleCalendar) {
      throw new Error('Googleカレンダーが見つかりません。IDを確認してください。');
    }
    logInfo(`✅ Googleカレンダー接続成功: ${googleCalendar.getName()}`);
    
    // 同期期間設定
    const now = new Date();
    const syncStart = addDays(now, -CONFIG.SYNC.CALENDAR_PAST_DAYS);
    const syncEnd = addDays(now, CONFIG.SYNC.CALENDAR_FUTURE_DAYS);
    logInfo(`同期期間: ${formatDate(syncStart)} 〜 ${formatDate(syncEnd)}`);
    
    // LINE WORKSカレンダー一覧取得
    logInfo('LINE WORKSカレンダー一覧を取得中...');
    const lwCalendars = getLineWorksCalendarList();
    stats.calendarsTotal = lwCalendars.length;
    logInfo(`✅ 対象カレンダー数: ${stats.calendarsTotal}`);
    
    if (lwCalendars.length === 0) {
      logWarning('同期対象のカレンダーがありません');
      return stats;
    }
    
    // 各カレンダーを同期
    lwCalendars.forEach((lwCalendar, index) => {
      try {
        logInfo(`\n[${index + 1}/${lwCalendars.length}] ${lwCalendar.ownerName || lwCalendar.calendarId}`);
        
        // カレンダーのイベント取得
        const lwEvents = getLineWorksCalendarEvents(
          lwCalendar.ownerUserId,
          lwCalendar.calendarId,
          syncStart,
          syncEnd
        );
        
        logInfo(`  イベント数: ${lwEvents.length}件`);
        stats.eventsTotal += lwEvents.length;
        
        if (lwEvents.length > 0) {
          // イベントを同期
          const syncResult = syncCalendarEvents(
            googleCalendar,
            lwEvents,
            lwCalendar.ownerName || lwCalendar.calendarId,
            syncStart,
            syncEnd
          );
          
          stats.eventsCreated += syncResult.created;
          stats.eventsUpdated += syncResult.updated;
          stats.eventsSkipped += syncResult.skipped;
          stats.eventsDeleted += syncResult.deleted;
          
          logInfo(`  ✅ 作成:${syncResult.created} 更新:${syncResult.updated} スキップ:${syncResult.skipped} 削除:${syncResult.deleted}`);
        }
        
        stats.calendarsSuccess++;
        
        // レート制限対策
        handleRateLimit(index);
        
      } catch (error) {
        stats.calendarsError++;
        const errorMsg = `${lwCalendar.ownerName || lwCalendar.calendarId}: ${error.message}`;
        stats.errors.push(errorMsg);
        logError(`カレンダー同期エラー`, error);
      }
    });
    
    // イベントマッピングのクリーンアップ
    cleanupEventMappings();
    
  } catch (error) {
    logError('カレンダー同期処理エラー', error);
    stats.errors.push(`システムエラー: ${error.message}`);
  }
  
  // 結果サマリー
  const duration = ((new Date() - startTime) / 1000).toFixed(1);
  
  logInfo('\n========================================');
  logInfo('📊 同期結果サマリー');
  logInfo('========================================');
  logInfo(`カレンダー: ${stats.calendarsSuccess}/${stats.calendarsTotal}件成功 (エラー:${stats.calendarsError}件)`);
  logInfo(`イベント合計: ${stats.eventsTotal}件`);
  logInfo(`  - 新規作成: ${stats.eventsCreated}件`);
  logInfo(`  - 更新: ${stats.eventsUpdated}件`);
  logInfo(`  - スキップ: ${stats.eventsSkipped}件`);
  logInfo(`  - 削除: ${stats.eventsDeleted}件`);
  logInfo(`処理時間: ${duration}秒`);
  
  if (stats.errors.length > 0) {
    logInfo(`\n⚠️ エラー詳細 (${stats.errors.length}件):`);
    stats.errors.forEach(err => logInfo(`  - ${err}`));
  }
  
  logInfo('========================================');
  
  // 通知送信
  sendSyncNotification('calendar', stats, duration);
  
  return stats;
}

/**
 * 特定のカレンダーのみ同期
 * @param {string} calendarId 同期するカレンダーID
 * @return {Object} 同期結果
 */
function syncSingleCalendar(calendarId) {
  logInfo(`単一カレンダー同期: ${calendarId}`);
  
  try {
    const googleCalendar = CalendarApp.getCalendarById(CONFIG.GOOGLE_CALENDAR.MASTER_CALENDAR_ID);
    if (!googleCalendar) {
      throw new Error('Googleカレンダーが見つかりません');
    }
    
    const now = new Date();
    const syncStart = addDays(now, -CONFIG.SYNC.CALENDAR_PAST_DAYS);
    const syncEnd = addDays(now, CONFIG.SYNC.CALENDAR_FUTURE_DAYS);
    
    // イベント取得（userIdはcalendarIdから推測、またはADMIN_USER_IDを使用）
    const userId = CONFIG.NOTIFICATION.ADMIN_USER_ID;  // TODO: calendarIdから取得するよう改善
    const lwEvents = getLineWorksCalendarEvents(userId, calendarId, syncStart, syncEnd);
    logInfo(`イベント数: ${lwEvents.length}件`);
    
    // 同期実行
    const result = syncCalendarEvents(
      googleCalendar,
      lwEvents,
      calendarId,
      syncStart,
      syncEnd
    );
    
    logInfo(`✅ 同期完了: 作成:${result.created} 更新:${result.updated} スキップ:${result.skipped} 削除:${result.deleted}`);
    
    return result;
  } catch (error) {
    logError('単一カレンダー同期エラー', error);
    throw error;
  }
}

/**
 * カレンダー同期状態を取得
 * @return {Object} 同期状態情報
 */
function getCalendarSyncStatus() {
  const lastSyncTime = getProperty('lastCalendarSync');
  const lastSyncResult = getProperty('lastCalendarSyncResult');
  
  return {
    lastSyncTime: lastSyncTime ? new Date(lastSyncTime) : null,
    lastSyncResult: lastSyncResult ? JSON.parse(lastSyncResult) : null,
    nextScheduledSync: getNextScheduledSyncTime()
  };
}

/**
 * 次回の同期予定時刻を取得
 * @return {Date} 次回同期時刻
 */
function getNextScheduledSyncTime() {
  const now = new Date();
  const schedules = CONFIG.SYNC.SCHEDULE.TIMES.map(time => {
    const [hour, minute] = time.split(':').map(Number);
    const scheduled = new Date(now);
    scheduled.setHours(hour, minute, 0, 0);
    
    // 過去の時刻の場合は翌日に
    if (scheduled <= now) {
      scheduled.setDate(scheduled.getDate() + 1);
    }
    
    return scheduled;
  });
  
  // 最も近い時刻を返す
  schedules.sort((a, b) => a - b);
  return schedules[0];
}

/**
 * カレンダー同期履歴を保存
 * @param {Object} stats 統計情報
 */
function saveCalendarSyncHistory(stats) {
  setProperty('lastCalendarSync', new Date().toISOString());
  setProperty('lastCalendarSyncResult', JSON.stringify(stats));
  
  // スプレッドシートにも記録（オプション）
  try {
    const folder = getOrCreateFolder(CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME);
    const fileName = 'カレンダー同期履歴.txt';
    const logEntry = `${formatDateTime(new Date())} - ` +
                    `カレンダー:${stats.calendarsSuccess}/${stats.calendarsTotal} ` +
                    `イベント:作成${stats.eventsCreated} 更新${stats.eventsUpdated} 削除${stats.eventsDeleted}\n`;
    
    const file = findFileInFolder(folder, fileName);
    if (file) {
      const existingContent = file.getBlob().getDataAsString();
      file.setContent(existingContent + logEntry);
    } else {
      folder.createFile(fileName, logEntry);
    }
  } catch (e) {
    logDebug('同期履歴保存エラー: ' + e.message);
  }
}

/**
 * カレンダー情報をスプレッドシートにエクスポート
 * （オプション：管理・分析用）
 */
function exportCalendarInfo() {
  logInfo('カレンダー情報をエクスポート中...');
  
  try {
    const folder = getOrCreateFolder(CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/' + CONFIG.GOOGLE_DRIVE.CALENDAR_FOLDER);
    const fileName = 'カレンダー一覧.csv';
    
    const lwCalendars = getLineWorksCalendarList();
    
    let csv = 'カレンダーID,所有者名,種類,最終更新\n';
    lwCalendars.forEach(cal => {
      csv += `"${cal.calendarId}","${cal.ownerName || ''}","${cal.type || ''}","${formatDateTime(new Date())}"\n`;
    });
    
    const file = findFileInFolder(folder, fileName);
    if (file) {
      file.setContent(csv);
    } else {
      folder.createFile(fileName, csv, MimeType.CSV);
    }
    
    logInfo(`✅ カレンダー情報をエクスポートしました: ${lwCalendars.length}件`);
  } catch (error) {
    logError('カレンダー情報エクスポートエラー', error);
  }
}

/**
 * 同期通知を送信
 * @param {string} type 同期タイプ ('calendar' or 'chat')
 * @param {Object} stats 統計情報
 * @param {number} duration 処理時間（秒）
 */
function sendSyncNotification(type, stats, duration) {
  const hasErrors = (stats.errors && stats.errors.length > 0) || stats.calendarsError > 0;
  
  // エラーがある場合、または成功通知が有効な場合のみ送信
  if (!hasErrors && !CONFIG.NOTIFICATION.NOTIFY_ON_SUCCESS) {
    return;
  }
  
  let icon = hasErrors ? '⚠️' : '✅';
  let status = hasErrors ? '完了（エラーあり）' : '完了';
  
  let message = '';
  
  if (type === 'calendar') {
    message = `${icon} カレンダー同期${status}\n\n`;
    message += `【結果】\n`;
    message += `カレンダー: ${stats.calendarsSuccess}/${stats.calendarsTotal}件\n`;
    message += `イベント: ${stats.eventsTotal}件\n`;
    message += `  新規作成: ${stats.eventsCreated}件\n`;
    message += `  更新: ${stats.eventsUpdated}件\n`;
    message += `  削除: ${stats.eventsDeleted}件\n`;
    message += `処理時間: ${duration}秒\n`;
    
    if (hasErrors) {
      message += `\n⚠️ エラー: ${stats.calendarsError}件\n`;
      if (stats.errors.length > 0 && stats.errors.length <= 3) {
        message += stats.errors.slice(0, 3).join('\n');
      }
    }
  }
  
  // LINE通知送信
  sendLineNotification(CONFIG.NOTIFICATION.ADMIN_USER_ID, message);
}


