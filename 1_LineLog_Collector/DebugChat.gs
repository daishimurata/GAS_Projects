/**
 * チャット同期デバッグ用関数
 * Botトークンの取得とチャンネル一覧の確認
 */

/**
 * チャット機能の動作確認
 */
function debugChatFeature() {
  Logger.log('===== チャット機能デバッグ開始 =====');
  
  try {
    // 1. Bot設定確認
    Logger.log('\n[1/4] Bot設定を確認...');
    Logger.log('Bot ID: ' + CONFIG.LINEWORKS.BOT_ID);
    Logger.log('Bot Secret: ' + CONFIG.LINEWORKS.BOT_SECRET.substring(0, 10) + '...');
    
    // 2. Botトークン取得
    Logger.log('\n[2/4] Botトークンを取得...');
    CacheService.getScriptCache().remove('botAccessToken'); // キャッシュクリア
    
    const token = getBotAccessToken();
    if (token) {
      Logger.log('✅ Botトークン取得成功');
      Logger.log('トークン（先頭50文字）: ' + token.substring(0, 50) + '...');
    } else {
      Logger.log('❌ Botトークン取得失敗');
      return;
    }
    
    // 3. チャンネル一覧取得
    Logger.log('\n[3/4] Botが参加しているチャンネル一覧を取得...');
    const url = CONFIG.ENDPOINTS.CHANNEL_LIST.replace('{botId}', CONFIG.LINEWORKS.BOT_ID);
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
    
    if (responseCode === 200) {
      const data = JSON.parse(responseBody);
      Logger.log('✅ チャンネル一覧取得成功');
      Logger.log('チャンネル数: ' + (data.channels ? data.channels.length : 0));
      
      if (data.channels && data.channels.length > 0) {
        Logger.log('\nチャンネル一覧:');
        data.channels.forEach((channel, index) => {
          Logger.log(`  ${index + 1}. ${channel.channelName || channel.channelId}`);
          Logger.log(`     ID: ${channel.channelId}`);
          Logger.log(`     タイプ: ${channel.type || 'N/A'}`);
        });
        
        // 4. 最初のチャンネルのメッセージを取得してみる
        Logger.log('\n[4/4] サンプルメッセージを取得...');
        const testChannel = data.channels[0];
        const messageUrl = CONFIG.ENDPOINTS.CHANNEL_MESSAGES
          .replace('{botId}', CONFIG.LINEWORKS.BOT_ID)
          .replace('{channelId}', testChannel.channelId) +
          '?limit=5';
        
        Logger.log('メッセージ取得URL: ' + messageUrl);
        
        const msgResponse = UrlFetchApp.fetch(messageUrl, options);
        const msgCode = msgResponse.getResponseCode();
        
        Logger.log('メッセージAPIレスポンスコード: ' + msgCode);
        
        if (msgCode === 200) {
          const msgData = JSON.parse(msgResponse.getContentText());
          Logger.log('✅ メッセージ取得成功');
          Logger.log('メッセージ数: ' + (msgData.messages ? msgData.messages.length : 0));
          
          if (msgData.messages && msgData.messages.length > 0) {
            Logger.log('\n最新メッセージ（サンプル）:');
            msgData.messages.slice(0, 3).forEach((msg, idx) => {
              Logger.log(`  ${idx + 1}. [${msg.sendTime}] ${msg.text || '（添付ファイル等）'}`);
            });
          }
        } else {
          Logger.log('❌ メッセージ取得エラー: ' + msgResponse.getContentText());
        }
        
      } else {
        Logger.log('⚠️ Botが参加しているチャンネルがありません');
        Logger.log('');
        Logger.log('【対処方法】');
        Logger.log('1. LINE WORKSアプリを開く');
        Logger.log('2. 同期したいトークルームに移動');
        Logger.log('3. メニュー > メンバー招待 > Bot「日向」を追加');
      }
      
    } else {
      Logger.log('❌ チャンネル一覧取得エラー');
      Logger.log('エラー内容: ' + responseBody);
    }
    
    Logger.log('\n===== チャット機能デバッグ終了 =====');
    
  } catch (error) {
    Logger.log('❌ エラー発生: ' + error.toString());
    Logger.log('スタック: ' + error.stack);
  }
}

/**
 * チャット同期のテスト実行（実際に1チャンネルだけ同期）
 */
function testChatSync() {
  Logger.log('===== チャット同期テスト開始 =====');
  
  try {
    // チャンネル一覧取得
    const channels = getLineWorksBotChannels();
    
    if (channels.length === 0) {
      Logger.log('⚠️ Botが参加しているチャンネルがありません');
      Logger.log('まず、LINE WORKSアプリでBotをトークルームに追加してください。');
      return;
    }
    
    Logger.log(`対象チャンネル数: ${channels.length}`);
    
    // 最初のチャンネルだけテスト
    const testChannel = channels[0];
    Logger.log(`\nテスト対象: ${testChannel.channelName || testChannel.channelId}`);
    
    // メッセージ取得
    const lastSyncTime = getChannelLastSyncTime(testChannel.channelId);
    Logger.log(`最終同期: ${lastSyncTime ? formatDateTime(lastSyncTime) : '初回'}`);
    
    const messages = getLineWorksChannelMessages(testChannel.channelId, lastSyncTime);
    Logger.log(`取得メッセージ数: ${messages.length}`);
    
    if (messages.length > 0) {
      // スプレッドシート作成・保存
      const spreadsheet = getMasterSpreadsheet();
      Logger.log(`スプレッドシート: ${spreadsheet.getName()}`);
      
      const savedCount = saveMessagesToSpreadsheet(spreadsheet, testChannel, messages);
      Logger.log(`✅ 保存完了: ${savedCount}件`);
      
      // 最終同期時刻を更新
      setChannelLastSyncTime(testChannel.channelId, new Date());
      
      Logger.log('\n✅ テスト成功！チャット同期が正常に動作しています。');
      Logger.log('');
      Logger.log('スプレッドシートURL: ' + spreadsheet.getUrl());
      
    } else {
      Logger.log('⚠️ 新しいメッセージがありません');
    }
    
    Logger.log('\n===== チャット同期テスト終了 =====');
    
  } catch (error) {
    Logger.log('❌ エラー発生: ' + error.toString());
    Logger.log('スタック: ' + error.stack);
  }
}






