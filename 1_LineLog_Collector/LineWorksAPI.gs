/**
 * LINE WORKS API 基本呼び出し機能
 * Calendar API、Message API、Bot APIのラッパー関数
 */

// ==================== User/Directory API ====================

/**
 * 全メンバーのリストを取得
 * @return {Array} ユーザーオブジェクトの配列
 */
function getLineWorksUserList() {
  const token = getAccessToken();
  if (!token) {
    throw new Error('アクセストークンの取得に失敗しました');
  }
  
  const url = `${CONFIG.ENDPOINTS.CALENDAR_BASE}/users`;
  
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
    return data.users || [];
  } catch (error) {
    logError('メンバーリスト取得エラー', error);
    throw error;
  }
}

// ==================== Calendar API ====================

/**
 * カレンダー一覧を取得（全メンバー対応版）
 * @return {Array} カレンダーオブジェクトの配列
 */
function getLineWorksCalendarList() {
  // 全メンバーのリストを取得
  const users = getLineWorksUserList();
  logInfo(`メンバー数: ${users.length}`);
  
  const allCalendars = [];
  const processedCalendarIds = new Set(); // 処理済みカレンダーIDを記録
  
  // 各メンバーのカレンダーを取得
  users.forEach((user, index) => {
    try {
      const calendars = getLineWorksUserCalendars(user.userId);
      
      // ユーザー名を取得（オブジェクトの場合は連結）
      let displayName = user.userId;
      if (user.userName) {
        if (typeof user.userName === 'object') {
          displayName = `${user.userName.lastName || ''} ${user.userName.firstName || ''}`.trim();
        } else {
          displayName = user.userName;
        }
      }
      
      let addedCount = 0;
      let skippedCount = 0;
      
      // カレンダーに所有者情報を追加
      calendars.forEach(cal => {
        // 既に処理済みのカレンダーIDはスキップ（共有カレンダーの重複を防ぐ）
        if (processedCalendarIds.has(cal.calendarId)) {
          skippedCount++;
          return;
        }
        
        processedCalendarIds.add(cal.calendarId);
        cal.ownerName = displayName;
        cal.ownerUserId = user.userId;
        cal.ownerEmail = user.email;
        allCalendars.push(cal);
        addedCount++;
      });
      
      logDebug(`[${index + 1}/${users.length}] ${displayName}: ${addedCount}個のカレンダー追加（${skippedCount}個スキップ）`);
      
      // レート制限対策
      if (index > 0 && index % 10 === 0) {
        Utilities.sleep(1000);
      }
    } catch (error) {
      logError(`${user.email}のカレンダー取得エラー`, error);
    }
  });
  
  return allCalendars;
}

/**
 * 特定ユーザーのカレンダー一覧を取得（基本カレンダー + 共有カレンダー）
 * @param {string} userId ユーザーID
 * @return {Array} カレンダーオブジェクトの配列
 */
function getLineWorksUserCalendars(userId) {
  const token = getAccessToken();
  if (!token) {
    throw new Error('アクセストークンの取得に失敗しました');
  }
  
  const allCalendars = [];
  
  // 1. 基本カレンダー（プライマリーカレンダー）を追加
  // 基本カレンダーのIDは特別な形式を使用
  const primaryCalendar = {
    calendarId: `primary_${userId}`,
    calendarName: '基本カレンダー',
    isPrimary: true,
    userId: userId,
    displayOrder: 0,
    isShowOnLNBList: true
  };
  allCalendars.push(primaryCalendar);
  
  // 2. その他のカレンダー（共有カレンダーなど）を取得
  try {
    const url = `${CONFIG.ENDPOINTS.CALENDAR_BASE}/users/${encodeURIComponent(userId)}/calendar-personals`;
    const options = {
      method: 'get',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode === 200) {
      const data = JSON.parse(response.getContentText());
      const personals = data.calendarPersonals || data.calendars || [];
      allCalendars.push(...personals);
    }
  } catch (error) {
    logDebug(`カレンダーリスト取得エラー (${userId}): ${error.message}`);
  }
  
  return allCalendars;
}

/**
 * カレンダーのイベント一覧を取得（31日制限対応）
 * @param {string} userId ユーザーID
 * @param {string} calendarId カレンダーID
 * @param {Date} timeMin 開始日時
 * @param {Date} timeMax 終了日時
 * @return {Array} イベントオブジェクトの配列
 */
function getLineWorksCalendarEvents(userId, calendarId, timeMin, timeMax) {
  const allEvents = [];
  const maxDays = 30; // 31日制限を考慮して30日ずつ取得
  
  let currentStart = new Date(timeMin);
  const finalEnd = new Date(timeMax);
  
  // 31日ずつ分割して取得
  while (currentStart < finalEnd) {
    const currentEnd = new Date(currentStart);
    currentEnd.setDate(currentEnd.getDate() + maxDays);
    
    // 終了日が最終日を超えないように調整
    if (currentEnd > finalEnd) {
      currentEnd.setTime(finalEnd.getTime());
    }
    
    try {
      const events = fetchCalendarEventsChunk(userId, calendarId, currentStart, currentEnd);
      allEvents.push(...events);
      
      // 次の期間へ
      currentStart = new Date(currentEnd);
      currentStart.setDate(currentStart.getDate() + 1);
      
      // レート制限対策
      if (currentStart < finalEnd) {
        Utilities.sleep(200);
      }
    } catch (error) {
      logError(`イベント取得エラー (${calendarId}, ${currentStart.toISOString()})`, error);
      // エラーが発生しても次の期間を試す
    }
  }
  
  return allEvents;
}

/**
 * カレンダーのイベント一覧を取得（単一期間）
 * @param {string} userId ユーザーID
 * @param {string} calendarId カレンダーID
 * @param {Date} timeMin 開始日時
 * @param {Date} timeMax 終了日時
 * @return {Array} イベントオブジェクトの配列
 */
function fetchCalendarEventsChunk(userId, calendarId, timeMin, timeMax) {
  const token = getAccessToken();
  if (!token) {
    throw new Error('アクセストークンの取得に失敗しました');
  }
  
  // 基本カレンダーの場合は専用のエンドポイントを使用
  const isPrimaryCalendar = calendarId.startsWith('primary_');
  let url;
  
  if (isPrimaryCalendar) {
    // 基本カレンダー用エンドポイント
    url = `${CONFIG.ENDPOINTS.CALENDAR_BASE}/users/${encodeURIComponent(userId)}/calendar/events` +
          `?fromDateTime=${toISOString(timeMin)}` +
          `&untilDateTime=${toISOString(timeMax)}` +
          `&limit=${CONFIG.SYNC.MAX_EVENTS_PER_CALENDAR}`;
  } else {
    // その他のカレンダー用エンドポイント
    url = `${CONFIG.ENDPOINTS.CALENDAR_BASE}/users/${encodeURIComponent(userId)}/calendars/${encodeURIComponent(calendarId)}/events` +
          `?fromDateTime=${toISOString(timeMin)}` +
          `&untilDateTime=${toISOString(timeMax)}` +
          `&limit=${CONFIG.SYNC.MAX_EVENTS_PER_CALENDAR}`;
  }
  
  const options = {
    method: 'get',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  
  if (responseCode !== 200) {
    throw new Error(`API Error (${responseCode}): ${response.getContentText()}`);
  }
  
  const data = JSON.parse(response.getContentText());
  
  // LINE WORKS APIのレスポンス構造：
  // { events: [ { eventComponents: [...], organizerCalendarId: "..." } ] }
  const allEvents = [];
  
  if (data.events && Array.isArray(data.events)) {
    data.events.forEach(eventWrapper => {
      if (eventWrapper.eventComponents && Array.isArray(eventWrapper.eventComponents)) {
        // 各eventComponentがイベント情報を持つ
        eventWrapper.eventComponents.forEach(component => {
          allEvents.push(component);
        });
      }
    });
  }
  
  return allEvents;
}

/**
 * 特定のイベント詳細を取得
 * @param {string} calendarId カレンダーID
 * @param {string} eventId イベントID
 * @return {Object} イベントオブジェクト
 */
function getLineWorksCalendarEvent(calendarId, eventId) {
  const token = getAccessToken();
  if (!token) {
    throw new Error('アクセストークンの取得に失敗しました');
  }
  
  const url = `${CONFIG.ENDPOINTS.CALENDAR_BASE}/${CONFIG.LINEWORKS.API_ID}/calendar/v1/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  
  const options = {
    method: 'get',
    headers: {
      'Authorization': `Bearer ${token}`,
      'consumerKey': CONFIG.LINEWORKS.CLIENT_ID
    },
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode !== 200) {
      throw new Error(`API Error (${responseCode}): ${response.getContentText()}`);
    }
    
    return JSON.parse(response.getContentText());
  } catch (error) {
    logError(`イベント詳細取得エラー (${eventId})`, error);
    throw error;
  }
}

// ==================== Message/Bot API ====================

/**
 * Bot が参加している全チャンネル一覧を取得
 * @return {Array} チャンネルオブジェクトの配列
 */
function getLineWorksBotChannels() {
  const token = getBotAccessToken();
  if (!token) {
    throw new Error('Botアクセストークンの取得に失敗しました');
  }
  
  const url = CONFIG.ENDPOINTS.CHANNEL_LIST.replace('{botId}', CONFIG.LINEWORKS.BOT_ID);
  
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
    return data.channels || [];
  } catch (error) {
    logError('チャンネル一覧取得エラー', error);
    throw error;
  }
}

/**
 * チャンネルのメッセージ一覧を取得
 * @param {string} channelId チャンネルID
 * @param {Date} since この日時以降のメッセージを取得
 * @return {Array} メッセージオブジェクトの配列
 */
function getLineWorksChannelMessages(channelId, since = null) {
  const token = getBotAccessToken();
  if (!token) {
    throw new Error('Botアクセストークンの取得に失敗しました');
  }
  
  let url = CONFIG.ENDPOINTS.CHANNEL_MESSAGES
    .replace('{botId}', CONFIG.LINEWORKS.BOT_ID)
    .replace('{channelId}', encodeURIComponent(channelId)) +
    `?limit=${CONFIG.SYNC.MAX_MESSAGES_PER_CHANNEL}`;
  
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
    logError(`チャンネルメッセージ取得エラー (${channelId})`, error);
    throw error;
  }
}

/**
 * 添付ファイルをダウンロード
 * @param {string} fileUrl 添付ファイルのダウンロードURL
 * @return {GoogleAppsScript.Base.Blob} ファイルBlob
 */
function downloadLineWorksAttachment(fileUrl) {
  const token = getBotAccessToken();
  if (!token) {
    throw new Error('Botアクセストークンの取得に失敗しました');
  }
  
  const options = {
    method: 'get',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(fileUrl, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode !== 200) {
      throw new Error(`ファイルダウンロードエラー (${responseCode})`);
    }
    
    return response.getBlob();
  } catch (error) {
    logError('添付ファイルダウンロードエラー', error);
    throw error;
  }
}

/**
 * ユーザーにメッセージを送信
 * @param {string} userId 送信先ユーザーID
 * @param {string} message メッセージ本文
 * @return {boolean} 送信成功/失敗
 */
function sendLineWorksMessage(userId, message) {
  const token = getBotAccessToken();
  if (!token) {
    logError('Botアクセストークンの取得に失敗しました');
    return false;
  }
  
  const url = CONFIG.ENDPOINTS.USER_MESSAGE
    .replace('{botId}', CONFIG.LINEWORKS.BOT_ID)
    .replace('{userId}', encodeURIComponent(userId));
  
  const payload = {
    content: {
      type: 'text',
      text: message
    }
  };
  
  const options = {
    method: 'post',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode !== 200 && responseCode !== 201) {
      throw new Error(`メッセージ送信エラー (${responseCode}): ${response.getContentText()}`);
    }
    
    logInfo(`メッセージ送信成功: ${userId}`);
    return true;
  } catch (error) {
    logError('メッセージ送信エラー', error);
    return false;
  }
}

// ==================== ユーザー情報API ====================

/**
 * ユーザー情報を取得
 * @param {string} userId ユーザーID
 * @return {Object|null} ユーザー情報オブジェクト
 */
function getLineWorksUserInfo(userId) {
  const token = getAccessToken();
  if (!token) {
    throw new Error('アクセストークンの取得に失敗しました');
  }
  
  const url = `${CONFIG.ENDPOINTS.CALENDAR_BASE}/${CONFIG.LINEWORKS.API_ID}/users/${encodeURIComponent(userId)}`;
  
  const options = {
    method: 'get',
    headers: {
      'Authorization': `Bearer ${token}`,
      'consumerKey': CONFIG.LINEWORKS.CLIENT_ID
    },
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode !== 200) {
      logWarning(`ユーザー情報取得失敗 (${userId}): ${responseCode}`);
      return null;
    }
    
    return JSON.parse(response.getContentText());
  } catch (error) {
    logError(`ユーザー情報取得エラー (${userId})`, error);
    return null;
  }
}

// ==================== API レート制限対策 ====================

/**
 * API呼び出しのレート制限を考慮した遅延処理
 * @param {number} callCount これまでの呼び出し回数
 */
function handleRateLimit(callCount) {
  // 10回ごとに1秒待機（APIレート制限対策）
  if (callCount > 0 && callCount % 10 === 0) {
    logDebug(`レート制限対策: 1秒待機 (${callCount}回目)`);
    sleep(1000);
  }
  
  // 100回ごとに5秒待機
  if (callCount > 0 && callCount % 100 === 0) {
    logDebug(`レート制限対策: 5秒待機 (${callCount}回目)`);
    sleep(5000);
  }
}

/**
 * APIエラーのリトライ判定
 * @param {number} responseCode HTTPレスポンスコード
 * @return {boolean} リトライすべきかどうか
 */
function shouldRetryApiCall(responseCode) {
  // 429 (Too Many Requests) または 5xx系エラーはリトライ
  return responseCode === 429 || (responseCode >= 500 && responseCode < 600);
}

/**
 * API呼び出し（リトライ付き）
 * @param {string} url API URL
 * @param {Object} options リクエストオプション
 * @param {number} maxRetries 最大リトライ回数
 * @return {GoogleAppsScript.URL_Fetch.HTTPResponse} レスポンス
 */
function fetchWithRetry(url, options, maxRetries = 3) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = UrlFetchApp.fetch(url, options);
      const responseCode = response.getResponseCode();
      
      if (responseCode === 200 || responseCode === 201) {
        return response;
      }
      
      if (shouldRetryApiCall(responseCode)) {
        logWarning(`API呼び出しリトライ (${i + 1}/${maxRetries}): ${responseCode}`);
        sleep(Math.pow(2, i) * 1000);  // 指数バックオフ
        continue;
      }
      
      throw new Error(`API Error (${responseCode}): ${response.getContentText()}`);
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        logWarning(`API呼び出しエラー、リトライ (${i + 1}/${maxRetries}): ${error.message}`);
        sleep(Math.pow(2, i) * 1000);
      }
    }
  }
  
  throw lastError || new Error('API呼び出しに失敗しました');
}

// ==================== テスト関数 ====================

/**
 * Calendar API接続テスト
 */
function testCalendarAPI() {
  logInfo('========== Calendar API テスト ==========');
  
  try {
    const calendars = getLineWorksCalendarList();
    logInfo(`✅ カレンダー取得成功: ${calendars.length}件`);
    
    if (calendars.length > 0) {
      const calendar = calendars[0];
      logInfo(`  - サンプル: ${calendar.ownerName || calendar.calendarId}`);
      
      // イベント取得テスト
      const now = new Date();
      const events = getLineWorksCalendarEvents(
        calendar.calendarId,
        addDays(now, -7),
        addDays(now, 7)
      );
      logInfo(`✅ イベント取得成功: ${events.length}件`);
    }
    
    return true;
  } catch (error) {
    logError('❌ Calendar API テスト失敗', error);
    return false;
  }
}

/**
 * Bot API接続テスト
 */
function testBotAPI() {
  logInfo('========== Bot API テスト ==========');
  
  try {
    const channels = getLineWorksBotChannels();
    logInfo(`✅ チャンネル取得成功: ${channels.length}件`);
    
    if (channels.length > 0) {
      const channel = channels[0];
      logInfo(`  - サンプル: ${channel.name || channel.channelId}`);
      
      // メッセージ取得テスト
      const messages = getLineWorksChannelMessages(channel.channelId);
      logInfo(`✅ メッセージ取得成功: ${messages.length}件`);
    }
    
    return true;
  } catch (error) {
    logError('❌ Bot API テスト失敗', error);
    return false;
  }
}

/**
 * 全API接続テスト
 */
function testAllAPIs() {
  logInfo('========== 全API接続テスト開始 ==========');
  
  const results = {
    calendar: testCalendarAPI(),
    bot: testBotAPI()
  };
  
  logInfo('========== テスト結果 ==========');
  logInfo(`Calendar API: ${results.calendar ? '✅ 成功' : '❌ 失敗'}`);
  logInfo(`Bot API: ${results.bot ? '✅ 成功' : '❌ 失敗'}`);
  logInfo('==============================');
  
  return results.calendar && results.bot;
}


