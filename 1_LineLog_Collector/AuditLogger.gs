/**
 * 監査ログ（Audit API）を使用したメッセージ取得
 * Botが参加していないチャットルームのメッセージも取得可能
 */

/**
 * 監査ログからメッセージを取得
 * @param {Date} fromDate 取得開始日時
 * @param {Date} toDate 取得終了日時
 * @param {string} targetUserId フィルタする対象ユーザーID（オプション）
 * @return {Array} メッセージオブジェクトの配列
 */
function getAuditMessages(fromDate, toDate, targetUserId = null) {
  const token = getAccessToken();
  if (!token) {
    throw new Error('アクセストークンの取得に失敗しました');
  }
  
  const url = CONFIG.ENDPOINTS.AUDIT_MESSAGES.replace('{domainId}', CONFIG.LINEWORKS.API_ID);
  
  // クエリパラメータ設定
  const params = {
    from: fromDate.getTime(),
    to: toDate.getTime(),
    limit: 1000  // 最大1000件
  };
  
  // 対象ユーザーでフィルタ
  if (targetUserId) {
    params.userId = targetUserId;
  }
  
  const queryString = Object.keys(params)
    .map(key => `${key}=${encodeURIComponent(params[key])}`)
    .join('&');
  
  const fullUrl = `${url}?${queryString}`;
  
  const options = {
    method: 'get',
    headers: {
      'Authorization': `Bearer ${token}`,
      'consumerKey': CONFIG.LINEWORKS.CLIENT_ID
    },
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(fullUrl, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode !== 200) {
      const errorBody = response.getContentText();
      
      // 404エラーは想定内（APIが利用できない場合）
      if (responseCode === 404) {
        logWarning(`Audit API利用不可 (404): APIが存在しないか、権限がありません。Webhook経由でメッセージを取得してください。`);
        return []; // 空の配列を返して処理を続行
      }
      
      logError(`Audit API Error (${responseCode})`, new Error(errorBody));
      throw new Error(`Audit API Error (${responseCode}): ${errorBody}`);
    }
    
    const data = JSON.parse(response.getContentText());
    return data.logs || [];
  } catch (error) {
    // 404エラーの場合は警告のみで処理を続行
    if (error.message && error.message.includes('404')) {
      logWarning(`Audit API利用不可: ${error.message}。Webhook経由でメッセージを取得してください。`);
      return [];
    }
    
    logError('監査ログ取得エラー', error);
    throw error;
  }
}

/**
 * 特定ユーザーとのメッセージを全て取得
 * @param {string} targetUserId 対象ユーザーID（例：staff@ohisamafarm）
 * @param {number} daysBack 何日前から取得するか
 * @return {Array} メッセージオブジェクトの配列
 */
function getUserMessages(targetUserId, daysBack = 7) {
  logInfo(`${targetUserId} のメッセージを取得中...（過去${daysBack}日分）`);
  
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - daysBack);
  
  const allMessages = [];
  let currentFrom = fromDate;
  
  // Audit APIは1回のリクエストで最大31日分なので、分割して取得
  while (currentFrom < toDate) {
    const currentTo = new Date(currentFrom);
    currentTo.setDate(currentTo.getDate() + 30);
    
    if (currentTo > toDate) {
      currentTo.setTime(toDate.getTime());
    }
    
    logInfo(`  期間: ${formatDate(currentFrom)} 〜 ${formatDate(currentTo)}`);
    
    try {
      const messages = getAuditMessages(currentFrom, currentTo, targetUserId);
      allMessages.push(...messages);
      logInfo(`  取得: ${messages.length}件`);
      
      // レート制限対策
      Utilities.sleep(1000);
    } catch (error) {
      logError(`期間 ${formatDate(currentFrom)} 〜 ${formatDate(currentTo)} の取得エラー`, error);
    }
    
    currentFrom = new Date(currentTo);
    currentFrom.setDate(currentFrom.getDate() + 1);
  }
  
  logInfo(`合計取得: ${allMessages.length}件`);
  return allMessages;
}

/**
 * 複数ユーザーのメッセージを取得
 * @param {Array<string>} userIds ユーザーIDの配列
 * @param {number} daysBack 何日前から取得するか
 * @return {Object} ユーザーIDをキーとしたメッセージの配列
 */
function getMultipleUserMessages(userIds, daysBack = 7) {
  const results = {};
  
  userIds.forEach((userId, index) => {
    try {
      logInfo(`\n[${index + 1}/${userIds.length}] ${userId}`);
      results[userId] = getUserMessages(userId, daysBack);
      
      // レート制限対策
      if (index < userIds.length - 1) {
        Utilities.sleep(2000);
      }
    } catch (error) {
      logError(`${userId} のメッセージ取得エラー`, error);
      results[userId] = { error: error.message };
    }
  });
  
  return results;
}

/**
 * 監査ログメッセージをスプレッドシートに保存
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet スプレッドシート
 * @param {string} userId ユーザーID
 * @param {Array} messages メッセージ配列
 * @return {number} 保存件数
 */
function saveAuditMessagesToSpreadsheet(spreadsheet, userId, messages) {
  const sheet = spreadsheet.getSheetByName('メッセージ一覧');
  if (!sheet) {
    throw new Error('メッセージ一覧シートが見つかりません');
  }
  
  if (messages.length === 0) {
    return 0;
  }
  
  // ユーザー情報を取得
  let userName = userId;
  try {
    const userInfo = getLineWorksUserInfo(userId);
    userName = `${userInfo.userName.lastName} ${userInfo.userName.firstName}`;
  } catch (e) {
    logDebug(`ユーザー情報取得失敗: ${userId}`);
  }
  
  const rows = [];
  
  messages.forEach(msg => {
    // 送信者名を取得して正規化
    let senderName = msg.senderName || msg.senderId || userName;
    
    // 名前マッピングを適用
    if (typeof normalizeName === 'function') {
      senderName = normalizeName(senderName);
    }
    
    // 監査ログの構造に合わせて変換
    const row = [
      new Date(msg.logTime || msg.sendTime),  // 日時
      senderName,  // 送信者（正規化済み）
      `[Audit] ${userName}とのチャット`,  // ルーム名
      msg.content || msg.text || '',  // メッセージ
      msg.attachments ? msg.attachments.length + '件' : '',  // 添付ファイル
      msg.messageId || msg.logId || '',  // メッセージID
      msg.channelId || userId,  // チャンネルID
      extractKeywords(msg.content || msg.text || '').join(', '),  // キーワード
      categorizeMessage(msg.content || msg.text || ''),  // カテゴリ
      ''  // URL
    ];
    rows.push(row);
  });
  
  // データを追加（最新が上に来るように）
  if (rows.length > 0) {
    sheet.insertRowsAfter(1, rows.length);
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  
  return rows.length;
}

/**
 * おひさま農園アカウントとのメッセージを取得して保存
 * @param {number} daysBack 何日前から取得するか
 * @return {Object} 同期結果
 */
function syncOhisamaAccountMessages(daysBack = 7) {
  logInfo('========================================');
  logInfo('📨 おひさま農園アカウントのメッセージ同期開始');
  logInfo('========================================');
  
  const startTime = new Date();
  const targetUserId = 'staff@ohisamafarm';  // おひさま農園アカウント
  
  const stats = {
    userId: targetUserId,
    messagesTotal: 0,
    messagesSaved: 0,
    errors: []
  };
  
  try {
    // マスタースプレッドシート準備
    const spreadsheet = getMasterSpreadsheet();
    logInfo(`スプレッドシート: ${spreadsheet.getName()}`);
    
    // メッセージ取得
    const messages = getUserMessages(targetUserId, daysBack);
    stats.messagesTotal = messages.length;
    
    if (messages.length > 0) {
      // スプレッドシートに保存
      const savedCount = saveAuditMessagesToSpreadsheet(spreadsheet, targetUserId, messages);
      stats.messagesSaved = savedCount;
      
      logInfo(`✅ 保存完了: ${savedCount}件`);
    } else {
      logInfo('新しいメッセージはありません');
    }
    
  } catch (error) {
    logError('おひさま農園アカウント同期エラー', error);
    stats.errors.push(error.message);
  }
  
  const duration = ((new Date() - startTime) / 1000).toFixed(1);
  
  logInfo('\n========================================');
  logInfo('📊 同期結果');
  logInfo('========================================');
  logInfo(`対象ユーザー: ${stats.userId}`);
  logInfo(`取得メッセージ: ${stats.messagesTotal}件`);
  logInfo(`保存メッセージ: ${stats.messagesSaved}件`);
  logInfo(`処理時間: ${duration}秒`);
  
  if (stats.errors.length > 0) {
    logInfo(`\n⚠️ エラー: ${stats.errors.join(', ')}`);
  }
  
  logInfo('========================================');
  
  return stats;
}

/**
 * 全メンバーのメッセージを取得して保存
 * @param {number} daysBack 何日前から取得するか
 * @return {Object} 同期結果
 */
function syncAllUserMessages(daysBack = 7) {
  logInfo('========================================');
  logInfo('📨 全メンバーのメッセージ同期開始');
  logInfo('========================================');
  
  const startTime = new Date();
  
  const stats = {
    usersTotal: 0,
    usersSuccess: 0,
    usersError: 0,
    messagesTotal: 0,
    messagesSaved: 0,
    errors: []
  };
  
  try {
    // マスタースプレッドシート準備
    const spreadsheet = getMasterSpreadsheet();
    
    // 全メンバー取得
    logInfo('メンバー一覧を取得中...');
    const users = getLineWorksUserList();
    stats.usersTotal = users.length;
    logInfo(`対象メンバー: ${users.length}人`);
    
    // 各メンバーのメッセージを取得
    users.forEach((user, index) => {
      try {
        const userId = user.email || user.userId;
        const userName = `${user.userName.lastName} ${user.userName.firstName}`;
        
        logInfo(`\n[${index + 1}/${users.length}] ${userName} (${userId})`);
        
        const messages = getUserMessages(userId, daysBack);
        stats.messagesTotal += messages.length;
        
        if (messages.length > 0) {
          const savedCount = saveAuditMessagesToSpreadsheet(spreadsheet, userId, messages);
          stats.messagesSaved += savedCount;
          logInfo(`  ✅ 保存: ${savedCount}件`);
        } else {
          logInfo(`  メッセージなし`);
        }
        
        stats.usersSuccess++;
        
        // レート制限対策
        if (index < users.length - 1) {
          Utilities.sleep(2000);
        }
        
      } catch (error) {
        stats.usersError++;
        stats.errors.push(`${user.email}: ${error.message}`);
        logError(`メンバー同期エラー`, error);
      }
    });
    
  } catch (error) {
    logError('全メンバー同期エラー', error);
    stats.errors.push(`システムエラー: ${error.message}`);
  }
  
  const duration = ((new Date() - startTime) / 1000).toFixed(1);
  
  logInfo('\n========================================');
  logInfo('📊 同期結果サマリー');
  logInfo('========================================');
  logInfo(`メンバー: ${stats.usersSuccess}/${stats.usersTotal}人成功 (エラー:${stats.usersError}人)`);
  logInfo(`取得メッセージ: ${stats.messagesTotal}件`);
  logInfo(`保存メッセージ: ${stats.messagesSaved}件`);
  logInfo(`処理時間: ${duration}秒`);
  
  if (stats.errors.length > 0) {
    logInfo(`\n⚠️ エラー詳細 (${stats.errors.length}件):`);
    stats.errors.slice(0, 5).forEach(err => logInfo(`  - ${err}`));
  }
  
  logInfo('========================================');
  
  return stats;
}

/**
 * LINE WORKSユーザー情報を取得
 * @param {string} userId ユーザーID
 * @return {Object} ユーザー情報
 */
function getLineWorksUserInfo(userId) {
  const token = getAccessToken();
  if (!token) {
    throw new Error('アクセストークンの取得に失敗しました');
  }
  
  const url = CONFIG.ENDPOINTS.USER_INFO.replace('{userId}', encodeURIComponent(userId));
  
  const options = {
    method: 'get',
    headers: {
      'Authorization': `Bearer ${token}`,
      'consumerKey': CONFIG.LINEWORKS.CLIENT_ID
    },
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  
  if (responseCode !== 200) {
    throw new Error(`User API Error (${responseCode}): ${response.getContentText()}`);
  }
  
  return JSON.parse(response.getContentText());
}






