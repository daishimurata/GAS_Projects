/**
 * キャッシュクリア用ユーティリティ
 */

/**
 * すべてのキャッシュをクリア
 */
function clearAllCache() {
  Logger.log('===== キャッシュクリア開始 =====');
  
  // CacheService（Auth.gsが使用）
  const cache = CacheService.getScriptCache();
  cache.remove('lineworks_access_token');
  cache.remove('lineworks_bot_token');
  Logger.log('✅ CacheServiceをクリアしました');
  
  // PropertiesService（念のため）
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('ACCESS_TOKEN');
  props.deleteProperty('ACCESS_TOKEN_EXPIRY');
  props.deleteProperty('BOT_TOKEN');
  props.deleteProperty('BOT_TOKEN_EXPIRY');
  Logger.log('✅ PropertiesServiceをクリアしました');
  
  // 同期状態をクリア（オプション）
  // props.deleteProperty('LAST_SYNC_TIME');
  // Logger.log('✅ 同期状態をクリアしました');
  
  Logger.log('===== キャッシュクリア完了 =====');
  Logger.log('');
  Logger.log('次回のAPI呼び出し時に新しいトークンが自動取得されます。');
}

/**
 * アクセストークンのみクリア
 */
function clearAccessToken() {
  CacheService.getScriptCache().remove('lineworks_access_token');
  PropertiesService.getScriptProperties().deleteProperty('ACCESS_TOKEN');
  PropertiesService.getScriptProperties().deleteProperty('ACCESS_TOKEN_EXPIRY');
  Logger.log('✅ アクセストークンをクリアしました');
}

/**
 * 現在のキャッシュ状態を確認
 */
function checkCacheStatus() {
  Logger.log('===== キャッシュ状態確認 =====');
  
  // CacheService
  const cache = CacheService.getScriptCache();
  const cachedAccessToken = cache.get('lineworks_access_token');
  const cachedBotToken = cache.get('lineworks_bot_token');
  
  Logger.log('[CacheService]');
  Logger.log(`  アクセストークン: ${cachedAccessToken ? '存在（先頭20文字: ' + cachedAccessToken.substring(0, 20) + '...）' : 'なし'}`);
  Logger.log(`  Botトークン: ${cachedBotToken ? '存在' : 'なし'}`);
  
  // PropertiesService
  const props = PropertiesService.getScriptProperties();
  const accessToken = props.getProperty('ACCESS_TOKEN');
  const accessTokenExpiry = props.getProperty('ACCESS_TOKEN_EXPIRY');
  const botToken = props.getProperty('BOT_TOKEN');
  const botTokenExpiry = props.getProperty('BOT_TOKEN_EXPIRY');
  
  Logger.log('[PropertiesService]');
  Logger.log(`  アクセストークン: ${accessToken ? '存在' : 'なし'}`);
  if (accessTokenExpiry) {
    const expiryDate = new Date(parseInt(accessTokenExpiry));
    Logger.log(`    有効期限: ${expiryDate.toLocaleString('ja-JP')}`);
    Logger.log(`    残り時間: ${Math.floor((expiryDate - new Date()) / 1000 / 60)}分`);
  }
  
  Logger.log(`  Botトークン: ${botToken ? '存在' : 'なし'}`);
  if (botTokenExpiry) {
    const expiryDate = new Date(parseInt(botTokenExpiry));
    Logger.log(`    有効期限: ${expiryDate.toLocaleString('ja-JP')}`);
    Logger.log(`    残り時間: ${Math.floor((expiryDate - new Date()) / 1000 / 60)}分`);
  }
  
  Logger.log('===== 確認完了 =====');
}

