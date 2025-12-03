/**
 * LINE WORKS Service Account認証
 * JWT (RS256) 署名とアクセストークン取得
 */

/**
 * アクセストークンを取得（キャッシュ対応）
 * @return {string|null} Access Token
 */
function getAccessToken() {
  const cache = CacheService.getScriptCache();
  const cachedToken = cache.get('lineworks_access_token');
  
  if (cachedToken) {
    logDebug('キャッシュからアクセストークンを取得');
    return cachedToken;
  }
  
  logInfo('新規アクセストークンを取得中...');
  const token = fetchNewAccessToken();
  
  if (token) {
    // 50分キャッシュ（トークン有効期限は60分）
    cache.put('lineworks_access_token', token, 50 * 60);
    logInfo('アクセストークン取得成功');
  }
  
  return token;
}

/**
 * 新規アクセストークンを取得
 * @return {string|null} Access Token
 */
function fetchNewAccessToken() {
  try {
    // JWTを作成して署名
    const jwt = createSignedJWT();
    
    // トークンリクエストのペイロード
    const payload = {
      assertion: jwt,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      client_id: CONFIG.LINEWORKS.CLIENT_ID,
      client_secret: CONFIG.LINEWORKS.CLIENT_SECRET,
      scope: 'calendar.read user.read audit.read'
    };
    
    const options = {
      method: 'post',
      payload: payload,
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(CONFIG.ENDPOINTS.AUTH, options);
    const responseCode = response.getResponseCode();
    const result = JSON.parse(response.getContentText());
    
    if (responseCode === 200 && result.access_token) {
      return result.access_token;
    } else {
      throw new Error(`トークン取得失敗 (${responseCode}): ${JSON.stringify(result)}`);
    }
  } catch (error) {
    logError('アクセストークン取得エラー', error);
    return null;
  }
}

/**
 * JWT生成と署名（RS256）
 * @return {string} 署名済みJWT
 */
function createSignedJWT() {
  const now = Math.floor(Date.now() / 1000);
  
  // JWTヘッダー
  const header = {
    "alg": "RS256",
    "typ": "JWT"
  };
  
  // JWTペイロード（クレームセット）
  const payload = {
    "iss": CONFIG.LINEWORKS.CLIENT_ID,
    "sub": CONFIG.LINEWORKS.SERVICE_ACCOUNT,
    "iat": now,
    "exp": now + 3600  // 1時間有効
  };
  
  // Base64URLエンコード
  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  
  // 署名対象文字列
  const signatureInput = headerEncoded + '.' + payloadEncoded;
  
  // RS256で署名
  // Utilities.computeRsaSha256Signature は秘密鍵でRSA-SHA256署名を計算
  const signature = Utilities.computeRsaSha256Signature(
    signatureInput,
    CONFIG.LINEWORKS.PRIVATE_KEY
  );
  
  // 署名をBase64URLエンコード
  const signatureEncoded = base64UrlEncode(signature);
  
  // JWT = header.payload.signature
  const jwt = signatureInput + '.' + signatureEncoded;
  
  logDebug(`JWT生成完了: ${jwt.substring(0, 50)}...`);
  
  return jwt;
}

/**
 * Base64URLエンコード
 * @param {string|byte[]} data エンコード対象データ
 * @return {string} Base64URLエンコード済み文字列
 */
function base64UrlEncode(data) {
  let encoded;
  
  if (typeof data === 'string') {
    // 文字列の場合
    encoded = Utilities.base64Encode(data, Utilities.Charset.UTF_8);
  } else {
    // バイト配列の場合（署名データ）
    encoded = Utilities.base64Encode(data);
  }
  
  // Base64をBase64URLに変換
  // + を - に、/ を _ に、末尾の = を削除
  return encoded
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Bot用アクセストークン取得
 * @return {string|null} Bot Access Token
 */
function getBotAccessToken() {
  const cache = CacheService.getScriptCache();
  const cachedToken = cache.get('lineworks_bot_token');
  
  if (cachedToken) {
    logDebug('キャッシュからBotトークンを取得');
    return cachedToken;
  }
  
  logInfo('新規Botトークンを取得中...');
  const token = fetchBotToken();
  
  if (token) {
    cache.put('lineworks_bot_token', token, 50 * 60);
    logInfo('Botトークン取得成功');
  }
  
  return token;
}

/**
 * Bot専用トークン取得
 * Bot APIはService Accountと同じ認証方式を使用
 * @return {string|null} Bot Token
 */
function fetchBotToken() {
  try {
    const jwt = createSignedJWT();
    
    const payload = {
      assertion: jwt,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      client_id: CONFIG.LINEWORKS.CLIENT_ID,
      client_secret: CONFIG.LINEWORKS.CLIENT_SECRET,
      scope: 'bot bot.read bot.message'
    };
    
    const options = {
      method: 'post',
      payload: payload,
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(CONFIG.ENDPOINTS.AUTH, options);
    const responseCode = response.getResponseCode();
    const result = JSON.parse(response.getContentText());
    
    if (responseCode === 200 && result.access_token) {
      return result.access_token;
    } else {
      throw new Error(`Botトークン取得失敗 (${responseCode}): ${JSON.stringify(result)}`);
    }
  } catch (error) {
    logError('Botトークン取得エラー', error);
    return null;
  }
}

/**
 * トークンのキャッシュをクリア（デバッグ用）
 */
function clearTokenCache() {
  const cache = CacheService.getScriptCache();
  cache.remove('lineworks_access_token');
  cache.remove('lineworks_bot_token');
  logInfo('トークンキャッシュをクリアしました');
}

/**
 * 認証テスト
 * @return {Object} テスト結果
 */
function testAuthentication() {
  logInfo('========== 認証テスト開始 ==========');
  
  const result = {
    serviceAccount: false,
    bot: false,
    errors: []
  };
  
  try {
    // Service Account認証テスト
    logInfo('Service Account認証をテスト中...');
    const token = getAccessToken();
    if (token) {
      result.serviceAccount = true;
      logInfo('✅ Service Account認証成功');
    } else {
      result.errors.push('Service Account認証失敗');
      logError('❌ Service Account認証失敗');
    }
  } catch (error) {
    result.errors.push(`Service Account認証エラー: ${error.message}`);
    logError('Service Account認証エラー', error);
  }
  
  try {
    // Bot認証テスト
    logInfo('Bot認証をテスト中...');
    const botToken = getBotAccessToken();
    if (botToken) {
      result.bot = true;
      logInfo('✅ Bot認証成功');
    } else {
      result.errors.push('Bot認証失敗');
      logError('❌ Bot認証失敗');
    }
  } catch (error) {
    result.errors.push(`Bot認証エラー: ${error.message}`);
    logError('Bot認証エラー', error);
  }
  
  logInfo('========== 認証テスト完了 ==========');
  logInfo(`結果: Service Account=${result.serviceAccount}, Bot=${result.bot}`);
  
  if (result.errors.length > 0) {
    logInfo('エラー詳細:');
    result.errors.forEach(err => logInfo(`  - ${err}`));
  }
  
  return result;
}

/**
 * JWT検証（デバッグ用）
 * JWTをデコードして内容を表示
 */
function debugJWT() {
  try {
    const jwt = createSignedJWT();
    const parts = jwt.split('.');
    
    logInfo('========== JWT デバッグ ==========');
    logInfo(`JWT: ${jwt.substring(0, 100)}...`);
    
    // ヘッダーデコード
    const headerDecoded = Utilities.newBlob(
      Utilities.base64Decode(parts[0].replace(/-/g, '+').replace(/_/g, '/'))
    ).getDataAsString();
    logInfo(`Header: ${headerDecoded}`);
    
    // ペイロードデコード
    const payloadDecoded = Utilities.newBlob(
      Utilities.base64Decode(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    ).getDataAsString();
    logInfo(`Payload: ${payloadDecoded}`);
    
    logInfo(`Signature: ${parts[2].substring(0, 50)}...`);
    logInfo('================================');
  } catch (error) {
    logError('JWT デバッグエラー', error);
  }
}

/**
 * ログイン実行（認証テスト）
 * GASエディタで実行するか、この関数を呼び出してください
 */
function login() {
  Logger.log('========================================');
  Logger.log('🔐 LINE WORKS 認証開始');
  Logger.log('========================================');
  
  const result = testAuthentication();
  
  Logger.log('\n========================================');
  Logger.log('📊 認証結果');
  Logger.log('========================================');
  Logger.log(`Service Account: ${result.serviceAccount ? '✅ 成功' : '❌ 失敗'}`);
  Logger.log(`Bot: ${result.bot ? '✅ 成功' : '❌ 失敗'}`);
  
  if (result.errors.length > 0) {
    Logger.log('\nエラー詳細:');
    result.errors.forEach(err => Logger.log(`  - ${err}`));
  }
  
  if (result.serviceAccount && result.bot) {
    Logger.log('\n✅ 認証が正常に完了しました！');
  } else {
    Logger.log('\n❌ 認証に失敗しました。設定を確認してください。');
  }
  
  Logger.log('========================================');
  
  return result;
}


