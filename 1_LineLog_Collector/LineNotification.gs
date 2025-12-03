/**
 * LINE通知機能
 * エラーや同期完了を管理者に通知
 */

/**
 * LINE WORKSメッセージ送信（共通関数）
 * @param {string} userId 送信先ユーザーID
 * @param {string} message メッセージ本文
 * @return {boolean} 送信成功/失敗
 */
function sendLineNotification(userId, message) {
  // 通知が無効の場合はスキップ
  if (!CONFIG.NOTIFICATION.NOTIFY_ON_ERROR && !CONFIG.NOTIFICATION.NOTIFY_ON_SUCCESS) {
    logDebug('通知設定が無効なため、送信をスキップ');
    return false;
  }
  
  // ユーザーIDが未設定の場合は管理者IDを使用
  const targetUserId = userId || CONFIG.NOTIFICATION.ADMIN_USER_ID;
  
  if (!targetUserId || targetUserId === 'YOUR_ADMIN_USER_ID_HERE') {
    logWarning('通知先ユーザーIDが設定されていません');
    return false;
  }
  
  // BOT_IDが未設定の場合は通知をスキップ
  if (!CONFIG.LINEWORKS.BOT_ID || CONFIG.LINEWORKS.BOT_ID === 'YOUR_BOT_ID_HERE') {
    logWarning('BOT_IDが設定されていないため、LINE通知をスキップします');
    return false;
  }
  
  return sendLineWorksMessage(targetUserId, message);
}

/**
 * 同期完了通知
 * @param {string} syncType 同期タイプ ('calendar' | 'chat' | 'full')
 * @param {Object} stats 統計情報
 * @param {number} duration 処理時間（秒）
 */
function sendSyncCompletionNotification(syncType, stats, duration) {
  const hasErrors = (stats.errors && stats.errors.length > 0) || 
                   stats.calendarsError > 0 || 
                   stats.channelsError > 0;
  
  // エラーがある場合、または成功通知が有効な場合のみ送信
  if (!hasErrors && !CONFIG.NOTIFICATION.NOTIFY_ON_SUCCESS) {
    return;
  }
  
  let icon = hasErrors ? '⚠️' : '✅';
  let status = hasErrors ? '完了（エラーあり）' : '完了';
  let message = '';
  
  switch (syncType) {
    case 'calendar':
      message = buildCalendarNotification(icon, status, stats, duration);
      break;
    case 'chat':
      message = buildChatNotification(icon, status, stats, duration);
      break;
    case 'full':
      message = buildFullSyncNotification(icon, status, stats, duration);
      break;
    default:
      message = `${icon} 同期${status}\n処理時間: ${duration}秒`;
  }
  
  sendLineNotification(CONFIG.NOTIFICATION.ADMIN_USER_ID, message);
}

/**
 * カレンダー同期通知メッセージ作成
 */
function buildCalendarNotification(icon, status, stats, duration) {
  let msg = `${icon} カレンダー同期${status}\n\n`;
  msg += `【結果】\n`;
  msg += `カレンダー: ${stats.calendarsSuccess}/${stats.calendarsTotal}件\n`;
  msg += `イベント合計: ${stats.eventsTotal}件\n`;
  msg += `  ├ 新規作成: ${stats.eventsCreated}件\n`;
  msg += `  ├ 更新: ${stats.eventsUpdated}件\n`;
  msg += `  ├ スキップ: ${stats.eventsSkipped}件\n`;
  msg += `  └ 削除: ${stats.eventsDeleted}件\n`;
  msg += `処理時間: ${duration}秒\n`;
  
  if (stats.calendarsError > 0) {
    msg += `\n⚠️ エラー: ${stats.calendarsError}件\n`;
    if (stats.errors && stats.errors.length > 0) {
      const errorSample = stats.errors.slice(0, 3).join('\n');
      msg += `${errorSample}\n`;
      if (stats.errors.length > 3) {
        msg += `... 他${stats.errors.length - 3}件\n`;
      }
    }
  }
  
  return msg;
}

/**
 * チャット同期通知メッセージ作成
 */
function buildChatNotification(icon, status, stats, duration) {
  let msg = `${icon} チャット同期${status}\n\n`;
  msg += `【結果】\n`;
  msg += `チャンネル: ${stats.channelsSuccess}/${stats.channelsTotal}件\n`;
  msg += `メッセージ: ${stats.messagesSaved}件保存\n`;
  msg += `添付ファイル: ${stats.attachmentsDownloaded}/${stats.attachmentsTotal}件\n`;
  msg += `処理時間: ${duration}秒\n`;
  
  if (stats.channelsError > 0) {
    msg += `\n⚠️ エラー: ${stats.channelsError}件\n`;
    if (stats.errors && stats.errors.length > 0) {
      const errorSample = stats.errors.slice(0, 3).join('\n');
      msg += `${errorSample}\n`;
      if (stats.errors.length > 3) {
        msg += `... 他${stats.errors.length - 3}件\n`;
      }
    }
  }
  
  return msg;
}

/**
 * 統合同期通知メッセージ作成
 */
function buildFullSyncNotification(icon, status, stats, duration) {
  let msg = `${icon} 統合同期${status}\n\n`;
  
  if (stats.calendar) {
    msg += `📅 カレンダー\n`;
    msg += `  ${stats.calendar.calendarsSuccess}/${stats.calendar.calendarsTotal}件 (イベント:${stats.calendar.eventsTotal}件)\n`;
  }
  
  if (stats.chat) {
    msg += `💬 チャット\n`;
    msg += `  ${stats.chat.channelsSuccess}/${stats.chat.channelsTotal}件 (メッセージ:${stats.chat.messagesSaved}件)\n`;
  }
  
  msg += `\n処理時間: ${duration}秒`;
  
  const totalErrors = (stats.calendar?.calendarsError || 0) + (stats.chat?.channelsError || 0);
  if (totalErrors > 0) {
    msg += `\n\n⚠️ エラー: ${totalErrors}件`;
  }
  
  return msg;
}

/**
 * エラー通知
 * @param {string} title エラータイトル
 * @param {Error} error エラーオブジェクト
 * @param {string} context エラー発生箇所
 */
function sendErrorNotification(title, error, context = '') {
  if (!CONFIG.NOTIFICATION.NOTIFY_ON_ERROR) {
    return;
  }
  
  let message = `❌ ${title}\n\n`;
  message += `【エラー内容】\n${error.message}\n`;
  
  if (context) {
    message += `\n【発生箇所】\n${context}\n`;
  }
  
  if (error.stack) {
    const stackLines = error.stack.split('\n').slice(0, 3).join('\n');
    message += `\n【スタックトレース】\n${stackLines}\n`;
  }
  
  message += `\n【発生時刻】\n${formatDateTime(new Date())}`;
  
  sendLineNotification(CONFIG.NOTIFICATION.ADMIN_USER_ID, message);
}

/**
 * 警告通知
 * @param {string} title 警告タイトル
 * @param {string} description 警告内容
 */
function sendWarningNotification(title, description) {
  if (!CONFIG.NOTIFICATION.NOTIFY_ON_WARNING) {
    return;
  }
  
  let message = `⚠️ ${title}\n\n`;
  message += description;
  message += `\n\n【発生時刻】\n${formatDateTime(new Date())}`;
  
  sendLineNotification(CONFIG.NOTIFICATION.ADMIN_USER_ID, message);
}

/**
 * 情報通知（成功時など）
 * @param {string} title タイトル
 * @param {string} description 内容
 */
function sendInfoNotification(title, description) {
  if (!CONFIG.NOTIFICATION.NOTIFY_ON_SUCCESS) {
    return;
  }
  
  let message = `ℹ️ ${title}\n\n`;
  message += description;
  
  sendLineNotification(CONFIG.NOTIFICATION.ADMIN_USER_ID, message);
}

/**
 * システム起動通知
 */
function sendSystemStartNotification() {
  const message = `🚀 LINE WORKS統合システム起動\n\n` +
                 `システムが正常に起動しました。\n` +
                 `次回同期: ${formatDateTime(getNextScheduledSyncTime())}`;
  
  sendInfoNotification('システム起動', message);
}

/**
 * 設定エラー通知
 * @param {Array} errors エラーリスト
 */
function sendConfigErrorNotification(errors) {
  let message = `⚙️ 設定エラーが検出されました\n\n`;
  message += `以下の項目を確認してください:\n\n`;
  errors.forEach((err, i) => {
    message += `${i + 1}. ${err}\n`;
  });
  message += `\nConfig.gsを確認して正しい値を設定してください。`;
  
  sendErrorNotification('設定エラー', new Error(errors.join(', ')), 'Config.gs');
}

/**
 * 日次レポート送信
 * 1日の同期結果をまとめて送信
 */
function sendDailyReport() {
  try {
    const calendarStatus = getCalendarSyncStatus();
    const chatStatus = getChatSyncStatus();
    
    let message = `📊 本日の同期レポート\n`;
    message += `日付: ${formatDateJapanese(new Date())}\n\n`;
    
    // カレンダー同期状況
    message += `📅 カレンダー同期\n`;
    if (calendarStatus.lastSyncResult) {
      const result = calendarStatus.lastSyncResult;
      message += `  最終同期: ${formatDateTime(calendarStatus.lastSyncTime)}\n`;
      message += `  カレンダー: ${result.calendarsSuccess}件\n`;
      message += `  イベント: ${result.eventsTotal}件\n`;
    } else {
      message += `  本日の同期なし\n`;
    }
    
    message += `\n`;
    
    // チャット同期状況
    message += `💬 チャット同期\n`;
    if (chatStatus.lastSyncResult) {
      const result = chatStatus.lastSyncResult;
      message += `  最終同期: ${formatDateTime(chatStatus.lastSyncTime)}\n`;
      message += `  チャンネル: ${result.channelsSuccess}件\n`;
      message += `  メッセージ: ${result.messagesSaved}件\n`;
    } else {
      message += `  本日の同期なし\n`;
    }
    
    message += `\n次回同期: ${formatDateTime(getNextScheduledSyncTime())}`;
    
    sendInfoNotification('日次レポート', message);
  } catch (error) {
    logError('日次レポート送信エラー', error);
  }
}

/**
 * テスト通知送信
 * セットアップ時の動作確認用
 */
function sendTestNotification() {
  const message = `🧪 テスト通知\n\n` +
                 `LINE WORKS通知機能が正常に動作しています。\n` +
                 `送信時刻: ${formatDateTime(new Date())}\n\n` +
                 `この通知を受信できていれば、設定は正しく完了しています。`;
  
  const result = sendLineNotification(CONFIG.NOTIFICATION.ADMIN_USER_ID, message);
  
  if (result) {
    logInfo('✅ テスト通知送信成功');
  } else {
    logError('❌ テスト通知送信失敗');
  }
  
  return result;
}

/**
 * 通知履歴を記録
 * @param {string} type 通知タイプ
 * @param {string} message メッセージ
 * @param {boolean} success 送信成功/失敗
 */
function logNotification(type, message, success) {
  try {
    const folder = getOrCreateFolder(CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME);
    const fileName = '通知履歴.txt';
    const timestamp = formatDateTime(new Date());
    const status = success ? '成功' : '失敗';
    const logEntry = `[${timestamp}] [${type}] [${status}] ${truncate(message, 100)}\n`;
    
    const file = findFileInFolder(folder, fileName);
    if (file) {
      const existingContent = file.getBlob().getDataAsString();
      // ファイルサイズ制限（最新1000行のみ保持）
      const lines = existingContent.split('\n');
      const content = lines.slice(-1000).join('\n');
      file.setContent(content + logEntry);
    } else {
      folder.createFile(fileName, logEntry);
    }
  } catch (e) {
    logDebug('通知履歴記録エラー: ' + e.message);
  }
}


