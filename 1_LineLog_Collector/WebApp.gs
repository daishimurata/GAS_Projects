/**
 * オンデマンド同期用Web App
 * HTTP APIとして外部から同期をトリガー可能
 * Geminiからのリアルタイム同期リクエストに対応
 */

/**
 * Web Appのエントリーポイント（GETリクエスト）
 * @param {Object} e イベントオブジェクト
 * @return {GoogleAppsScript.Content.TextOutput} レスポンス
 */
function doGet(e) {
  const action = e.parameter.action || 'status';
  const token = e.parameter.token || '';
  
  // 簡易的な認証チェック（オプション）
  // if (!validateWebAppToken(token)) {
  //   return createJsonResponse({ error: 'Unauthorized' }, 401);
  // }
  
  let result;
  
  try {
    switch (action) {
      case 'status':
        result = getSystemStatus();
        break;
        
      case 'calendar':
        result = { message: 'カレンダー同期はPOSTメソッドを使用してください' };
        break;
        
      case 'chat':
        result = { message: 'チャット同期はPOSTメソッドを使用してください' };
        break;
        
      case 'health':
        result = checkSystemHealth();
        break;
        
      case 'stats':
        result = getSystemStatistics();
        break;
        
      default:
        result = {
          error: 'Invalid action',
          availableActions: ['status', 'health', 'stats']
        };
    }
    
    return createJsonResponse(result);
  } catch (error) {
    logError('Web App GET エラー', error);
    return createJsonResponse({ error: error.message }, 500);
  }
}

/**
 * Web Appのエントリーポイント（POSTリクエスト）
 * ※ doPost()関数はWebhookHandler.gsに実装されています
 * 
 * LINE WORKS Webhook または Web App同期リクエストを処理
 * 詳細は WebhookHandler.gs を参照
 */

/**
 * システム状態取得
 * @return {Object} システム状態
 */
function getSystemStatus() {
  const calendarStatus = getCalendarSyncStatus();
  const chatStatus = getChatSyncStatus();
  
  return {
    system: 'LINE WORKS統合システム',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    calendar: {
      lastSync: calendarStatus.lastSyncTime ? calendarStatus.lastSyncTime.toISOString() : null,
      nextSync: calendarStatus.nextScheduledSync ? calendarStatus.nextScheduledSync.toISOString() : null,
      lastResult: calendarStatus.lastSyncResult
    },
    chat: {
      lastSync: chatStatus.lastSyncTime ? chatStatus.lastSyncTime.toISOString() : null,
      nextSync: chatStatus.nextScheduledSync ? chatStatus.nextScheduledSync.toISOString() : null,
      lastResult: chatStatus.lastSyncResult
    }
  };
}

/**
 * JSONレスポンスを作成
 * @param {Object} data レスポンスデータ
 * @param {number} statusCode HTTPステータスコード
 * @return {GoogleAppsScript.Content.TextOutput} レスポンス
 */
function createJsonResponse(data, statusCode = 200) {
  const output = ContentService.createTextOutput(JSON.stringify(data, null, 2));
  output.setMimeType(ContentService.MimeType.JSON);
  
  // HTTPステータスコードは設定できないため、データに含める
  if (statusCode !== 200) {
    data._statusCode = statusCode;
  }
  
  return output;
}

/**
 * Web Appトークン検証（オプション）
 * セキュリティ強化が必要な場合に使用
 * @param {string} token リクエストトークン
 * @return {boolean} 有効/無効
 */
function validateWebAppToken(token) {
  // スクリプトプロパティに保存されたトークンと比較
  const validToken = getProperty('webAppToken');
  
  if (!validToken) {
    // トークンが設定されていない場合は無効化
    logWarning('Web Appトークンが設定されていません');
    return false;
  }
  
  return token === validToken;
}

/**
 * Web Appトークン生成
 * 初回セットアップ時に実行
 */
function generateWebAppToken() {
  const token = generateRandomString(32);
  setProperty('webAppToken', token);
  
  logInfo(`Web Appトークンを生成しました: ${token}`);
  logInfo('このトークンをリクエスト時に使用してください');
  
  return token;
}

/**
 * Web App URL取得
 * デプロイ後のURLを確認
 */
function getWebAppUrl() {
  const url = ScriptApp.getService().getUrl();
  
  logInfo('========================================');
  logInfo('Web App URL:');
  logInfo(url);
  logInfo('========================================');
  logInfo('\n使用例:');
  logInfo(`GET  ${url}?action=status`);
  logInfo(`POST ${url}?action=syncAll`);
  logInfo('========================================');
  
  return url;
}

/**
 * Gemini用オンデマンド同期API
 * Geminiから質問があった時に最新データを取得
 * @return {Object} 同期結果
 */
function geminiTriggerSync() {
  logInfo('Geminiからの同期リクエストを受信');
  
  // 最終同期からの経過時間をチェック
  const calendarStatus = getCalendarSyncStatus();
  const chatStatus = getChatSyncStatus();
  
  const now = new Date();
  const needsCalendarSync = !calendarStatus.lastSyncTime || 
    (now - calendarStatus.lastSyncTime) > 30 * 60 * 1000;  // 30分以上経過
  const needsChatSync = !chatStatus.lastSyncTime || 
    (now - chatStatus.lastSyncTime) > 30 * 60 * 1000;
  
  const results = {
    calendar: null,
    chat: null,
    skipped: []
  };
  
  // カレンダー同期
  if (needsCalendarSync) {
    logInfo('カレンダーを同期中...');
    results.calendar = syncCalendars();
  } else {
    logInfo('カレンダーは最近同期されたためスキップ');
    results.skipped.push('calendar');
  }
  
  // チャット同期
  if (needsChatSync) {
    logInfo('チャットを同期中...');
    results.chat = syncChatLogs();
  } else {
    logInfo('チャットは最近同期されたためスキップ');
    results.skipped.push('chat');
  }
  
  return results;
}

/**
 * Web Appのテスト
 * デプロイ後の動作確認用
 */
function testWebApp() {
  logInfo('========================================');
  logInfo('Web App テスト');
  logInfo('========================================');
  
  try {
    // 状態取得テスト
    logInfo('\n[テスト1] 状態取得');
    const statusResult = doGet({ parameter: { action: 'status' } });
    logInfo('結果: ' + statusResult.getContent());
    
    // システムヘルスチェックテスト
    logInfo('\n[テスト2] ヘルスチェック');
    const healthResult = doGet({ parameter: { action: 'health' } });
    logInfo('結果: ' + healthResult.getContent());
    
    logInfo('\n========================================');
    logInfo('✅ Web App テスト完了');
    logInfo('========================================');
    logInfo('\n次のステップ:');
    logInfo('1. GASエディタの「デプロイ」→「新しいデプロイ」');
    logInfo('2. 種類を「ウェブアプリ」に選択');
    logInfo('3. アクセス権限を設定');
    logInfo('4. デプロイしてURLを取得');
    logInfo('5. getWebAppUrl() でURLを確認');
    
    return true;
  } catch (error) {
    logError('Web App テストエラー', error);
    return false;
  }
}

/**
 * Web App使用方法の表示
 */
function showWebAppUsage() {
  const usage = `
========================================
Web App 使用方法
========================================

■ エンドポイント
${ScriptApp.getService().getUrl()}

■ GETリクエスト（状態確認）

1. システム状態
   GET ?action=status
   
2. ヘルスチェック
   GET ?action=health
   
3. 統計情報
   GET ?action=stats

■ POSTリクエスト（同期実行）

1. 統合同期（カレンダー + チャット）
   POST ?action=syncAll
   
2. カレンダーのみ同期
   POST ?action=syncCalendar
   
3. チャットのみ同期
   POST ?action=syncChat
   
4. 特定カレンダーのみ同期
   POST ?action=syncSingleCalendar&calendarId=CALENDAR_ID
   
5. 特定チャンネルのみ同期
   POST ?action=syncSingleChannel&channelId=CHANNEL_ID

■ cURLでの使用例

# 状態確認
curl "${ScriptApp.getService().getUrl()}?action=status"

# 統合同期実行
curl -X POST "${ScriptApp.getService().getUrl()}?action=syncAll"

# カレンダー同期
curl -X POST "${ScriptApp.getService().getUrl()}?action=syncCalendar"

■ Gemini連携

Geminiから「最新の情報を確認して」と言われた時に、
このWeb AppのURLにPOSTリクエストを送ることで、
リアルタイムで最新データを取得できます。

========================================
  `;
  
  logInfo(usage);
  Logger.log(usage);
}


