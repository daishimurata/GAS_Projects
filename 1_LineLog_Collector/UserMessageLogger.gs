/**
 * Bot APIを使用したユーザー間メッセージ取得
 * Botと特定ユーザーの1:1メッセージを取得
 */

/**
 * Botと特定ユーザーの1:1メッセージを取得
 * @param {string} userId ユーザーID
 * @param {Date} since この日時以降のメッセージを取得
 * @return {Array} メッセージオブジェクトの配列
 */
function getBotUserMessages(userId, since = null) {
  const token = getBotAccessToken();
  if (!token) {
    throw new Error('Botアクセストークンの取得に失敗しました');
  }
  
  let url = CONFIG.ENDPOINTS.USER_MESSAGE
    .replace('{botId}', CONFIG.LINEWORKS.BOT_ID)
    .replace('{userId}', encodeURIComponent(userId)) +
    `?limit=${CONFIG.SYNC.MAX_MESSAGES_PER_CHANNEL || 1000}`;
  
  if (since) {
    url += `&since=${since.getTime()}`;
  }
  
  const options = {
    method: 'get',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode !== 200) {
      throw new Error(`API Error (${responseCode}): ${response.getContentText()}`);
    }
    
    const data = JSON.parse(response.getContentText());
    return data.messages || [];
  } catch (error) {
    logError(`Botユーザーメッセージ取得エラー (${userId})`, error);
    throw error;
  }
}

/**
 * 複数ユーザーのBot宛メッセージを取得
 * @param {Array<string>} userIds ユーザーIDの配列
 * @param {number} daysBack 何日前から取得するか
 * @return {Object} ユーザーIDをキーとしたメッセージの配列
 */
function getAllUserBotMessages(userIds, daysBack = 7) {
  logInfo('全ユーザーのBotメッセージを取得中...');
  
  const results = {};
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  
  userIds.forEach((userId, index) => {
    try {
      logInfo(`[${index + 1}/${userIds.length}] ${userId}`);
      const messages = getBotUserMessages(userId, since);
      results[userId] = messages;
      logInfo(`  取得: ${messages.length}件`);
      
      // レート制限対策
      if (index < userIds.length - 1) {
        Utilities.sleep(1000);
      }
    } catch (error) {
      logError(`${userId} のメッセージ取得エラー`, error);
      results[userId] = { error: error.message };
    }
  });
  
  return results;
}

/**
 * 全メンバーのBot宛メッセージを取得して保存
 * @param {number} daysBack 何日前から取得するか
 * @return {Object} 同期結果
 */
function syncAllUserBotMessages(daysBack = 7) {
  logInfo('========================================');
  logInfo('📨 全メンバーのBot宛メッセージ同期開始');
  logInfo('========================================');
  
  const startTime = new Date();
  
  const stats = {
    usersTotal: 0,
    usersSuccess: 0,
    usersWithMessages: 0,
    messagesTotal: 0,
    messagesSaved: 0,
    errors: []
  };
  
  try {
    // マスタースプレッドシート準備
    const spreadsheet = getMasterSpreadsheet();
    logInfo(`スプレッドシート: ${spreadsheet.getName()}`);
    
    // 全メンバー取得
    logInfo('\nメンバー一覧を取得中...');
    const users = getLineWorksUserList();
    stats.usersTotal = users.length;
    logInfo(`対象メンバー: ${users.length}人`);
    
    const since = new Date();
    since.setDate(since.getDate() - daysBack);
    
    // 各メンバーのメッセージを取得
    users.forEach((user, index) => {
      try {
        const userId = user.email || user.userId;
        const userName = `${user.userName.lastName} ${user.userName.firstName}`;
        
        logInfo(`\n[${index + 1}/${users.length}] ${userName} (${userId})`);
        
        const messages = getBotUserMessages(userId, since);
        stats.usersSuccess++;
        
        if (messages.length > 0) {
          stats.usersWithMessages++;
          stats.messagesTotal += messages.length;
          
          // スプレッドシートに保存
          const channel = {
            channelId: `bot_user_${userId}`,
            channelName: `Bot - ${userName}`,
            name: `Bot - ${userName}`
          };
          
          const savedCount = saveMessagesToSpreadsheet(spreadsheet, channel, messages);
          stats.messagesSaved += savedCount;
          logInfo(`  ✅ 保存: ${savedCount}件`);
        } else {
          logInfo(`  メッセージなし`);
        }
        
        // レート制限対策
        if (index < users.length - 1) {
          Utilities.sleep(1000);
        }
        
      } catch (error) {
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
  logInfo(`処理メンバー: ${stats.usersSuccess}/${stats.usersTotal}人`);
  logInfo(`メッセージがあったメンバー: ${stats.usersWithMessages}人`);
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
 * おひさま農園アカウントのBot宛メッセージを取得
 * @param {number} daysBack 何日前から取得するか
 * @return {Object} 同期結果
 */
function syncOhisamaBotMessages(daysBack = 7) {
  logInfo('========================================');
  logInfo('📨 おひさま農園アカウントのBot宛メッセージ同期');
  logInfo('========================================');
  
  const startTime = new Date();
  const targetUserId = 'staff@ohisamafarm';
  
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
    logInfo(`\n${targetUserId} のメッセージを取得中...（過去${daysBack}日分）`);
    
    const since = new Date();
    since.setDate(since.getDate() - daysBack);
    
    const messages = getBotUserMessages(targetUserId, since);
    stats.messagesTotal = messages.length;
    
    if (messages.length > 0) {
      // スプレッドシートに保存
      const channel = {
        channelId: `bot_user_${targetUserId}`,
        channelName: 'Bot - おひさま農園',
        name: 'Bot - おひさま農園'
      };
      
      const savedCount = saveMessagesToSpreadsheet(spreadsheet, channel, messages);
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
 * デバッグ：ユーザーメッセージAPI確認
 */
function debugUserMessageAPI() {
  Logger.log('===== ユーザーメッセージAPI デバッグ =====');
  
  try {
    const targetUserId = 'staff@ohisamafarm';
    
    Logger.log('対象ユーザー: ' + targetUserId);
    Logger.log('Bot ID: ' + CONFIG.LINEWORKS.BOT_ID);
    
    // Botトークン取得
    const token = getBotAccessToken();
    Logger.log('✅ Botトークン取得成功');
    
    // APIエンドポイント
    const url = CONFIG.ENDPOINTS.USER_MESSAGE
      .replace('{botId}', CONFIG.LINEWORKS.BOT_ID)
      .replace('{userId}', encodeURIComponent(targetUserId)) +
      '?limit=10';
    
    Logger.log('APIエンドポイント: ' + url);
    
    const options = {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + token
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();
    
    Logger.log('レスポンスコード: ' + responseCode);
    Logger.log('レスポンスボディ: ' + responseBody);
    
    if (responseCode === 200) {
      const data = JSON.parse(responseBody);
      Logger.log('✅ 成功！');
      Logger.log('メッセージ数: ' + (data.messages ? data.messages.length : 0));
      
      if (data.messages && data.messages.length > 0) {
        Logger.log('\n最新メッセージ（サンプル）:');
        data.messages.slice(0, 3).forEach((msg, idx) => {
          Logger.log(`  ${idx + 1}. [${msg.sendTime}] ${msg.text || '（添付等）'}`);
        });
      }
    } else {
      Logger.log('❌ エラー');
    }
    
    Logger.log('\n===== デバッグ終了 =====');
    
  } catch (error) {
    Logger.log('❌ エラー発生: ' + error.toString());
  }
}






