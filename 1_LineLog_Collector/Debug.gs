/**
 * デバッグ用関数
 */

/**
 * Calendar API レスポンスをデバッグ
 */
function debugCalendarAPI() {
  Logger.log('===== Calendar API デバッグ開始 =====');
  
  try {
    // アクセストークン取得
    const token = getAccessToken();
    Logger.log('✅ アクセストークン取得成功');
    Logger.log(`トークン（先頭50文字）: ${token.substring(0, 50)}...`);
    
    // APIエンドポイント構築（ユーザーリスト取得）
    const url = `${CONFIG.ENDPOINTS.CALENDAR_BASE}/users`;
    Logger.log(`APIエンドポイント: ${url}`);
    
    // リクエスト送信
    const options = {
      method: 'get',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      muteHttpExceptions: true
    };
    
    Logger.log('API リクエスト送信中...');
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();
    
    Logger.log(`レスポンスコード: ${responseCode}`);
    Logger.log(`レスポンスボディ: ${responseBody}`);
    
    if (responseCode === 200) {
      const data = JSON.parse(responseBody);
      Logger.log(`✅ 成功！`);
      Logger.log(`取得データ: ${JSON.stringify(data, null, 2)}`);
      
      if (data.users) {
        Logger.log(`メンバー数: ${data.users.length}`);
        Logger.log(`メンバー一覧（最初の3人）:`);
        data.users.slice(0, 3).forEach(user => {
          Logger.log(`  - ${user.userName} (${user.userId})`);
        });
      } else {
        Logger.log(`⚠️ users プロパティが存在しません`);
        Logger.log(`利用可能なプロパティ: ${Object.keys(data).join(', ')}`);
      }
    } else {
      Logger.log(`❌ エラー: ${responseCode}`);
      Logger.log(`エラー詳細: ${responseBody}`);
    }
    
  } catch (error) {
    Logger.log(`❌ 例外発生: ${error.message}`);
    Logger.log(`スタックトレース: ${error.stack}`);
  }
  
  Logger.log('===== Calendar API デバッグ終了 =====');
}

/**
 * 設定情報をデバッグ
 */
function debugConfig() {
  Logger.log('===== 設定情報デバッグ =====');
  Logger.log(`CLIENT_ID: ${CONFIG.LINEWORKS.CLIENT_ID}`);
  Logger.log(`API_ID: ${CONFIG.LINEWORKS.API_ID}`);
  Logger.log(`SERVICE_ACCOUNT: ${CONFIG.LINEWORKS.SERVICE_ACCOUNT}`);
  Logger.log(`CALENDAR_BASE: ${CONFIG.ENDPOINTS.CALENDAR_BASE}`);
  Logger.log(`GOOGLE_CALENDAR_ID: ${CONFIG.GOOGLE_CALENDAR.MASTER_CALENDAR_ID}`);
  Logger.log('===== デバッグ終了 =====');
}

