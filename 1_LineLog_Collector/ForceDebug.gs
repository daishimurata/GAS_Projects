/**
 * 強制デバッグ - キャッシュを完全にバイパス
 */

function forceDebugWithNewToken() {
  Logger.log('===== 強制デバッグ開始 =====');
  
  try {
    // 1. キャッシュを完全削除
    const props = PropertiesService.getScriptProperties();
    props.deleteProperty('ACCESS_TOKEN');
    props.deleteProperty('ACCESS_TOKEN_EXPIRY');
    Logger.log('✅ キャッシュを削除しました');
    
    // 2. 新しいJWT作成
    Logger.log('JWT作成中...');
    const jwt = createSignedJWT();
    Logger.log(`JWT（先頭50文字）: ${jwt.substring(0, 50)}...`);
    
    // 3. トークンリクエスト
    Logger.log('トークンリクエスト送信中...');
    const payload = {
      assertion: jwt,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      client_id: CONFIG.LINEWORKS.CLIENT_ID,
      client_secret: CONFIG.LINEWORKS.CLIENT_SECRET,
      scope: 'calendar.read user.read'
    };
    
    Logger.log(`Client ID: ${CONFIG.LINEWORKS.CLIENT_ID}`);
    Logger.log(`Scope: ${payload.scope}`);
    
    const tokenOptions = {
      method: 'post',
      payload: payload,
      muteHttpExceptions: true
    };
    
    const tokenResponse = UrlFetchApp.fetch(CONFIG.ENDPOINTS.AUTH, tokenOptions);
    const tokenCode = tokenResponse.getResponseCode();
    const tokenBody = tokenResponse.getContentText();
    
    Logger.log(`トークンレスポンスコード: ${tokenCode}`);
    Logger.log(`トークンレスポンスボディ: ${tokenBody}`);
    
    if (tokenCode !== 200) {
      throw new Error(`トークン取得失敗 (${tokenCode}): ${tokenBody}`);
    }
    
    const tokenData = JSON.parse(tokenBody);
    const newToken = tokenData.access_token;
    Logger.log(`✅ 新しいトークン取得成功！`);
    Logger.log(`新トークン（先頭50文字）: ${newToken.substring(0, 50)}...`);
    
    // 4. Users APIを呼び出し
    Logger.log('');
    Logger.log('Users API呼び出し中...');
    const usersUrl = `${CONFIG.ENDPOINTS.CALENDAR_BASE}/users`;
    Logger.log(`APIエンドポイント: ${usersUrl}`);
    
    const usersOptions = {
      method: 'get',
      headers: {
        'Authorization': `Bearer ${newToken}`
      },
      muteHttpExceptions: true
    };
    
    const usersResponse = UrlFetchApp.fetch(usersUrl, usersOptions);
    const usersCode = usersResponse.getResponseCode();
    const usersBody = usersResponse.getContentText();
    
    Logger.log(`レスポンスコード: ${usersCode}`);
    Logger.log(`レスポンスボディ: ${usersBody}`);
    
    if (usersCode === 200) {
      Logger.log('');
      Logger.log('✅✅✅ 成功！ ✅✅✅');
      const data = JSON.parse(usersBody);
      if (data.users) {
        Logger.log(`メンバー数: ${data.users.length}`);
        Logger.log(`メンバー一覧（最初の5人）:`);
        data.users.slice(0, 5).forEach(user => {
          Logger.log(`  - ${user.userName || user.name} (${user.userId})`);
        });
      }
    } else {
      Logger.log('');
      Logger.log('❌ 失敗');
      Logger.log(`エラー: ${usersBody}`);
    }
    
  } catch (e) {
    Logger.log('');
    Logger.log('❌ エラーが発生しました');
    Logger.log(`エラー詳細: ${e.message}`);
    Logger.log(`スタック: ${e.stack}`);
  }
  
  Logger.log('');
  Logger.log('===== 強制デバッグ終了 =====');
}






