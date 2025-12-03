/**
 * Vercel既存システム統合
 * 既存システム（Vercel + Redis）からのデータ転送を受信
 */

/**
 * 既存システムからのWebhook受信
 * doPost()から呼び出される
 * @param {Object} payload メッセージデータ
 * @return {boolean} 成功/失敗
 */
function handleVercelWebhook(payload) {
  try {
    logInfo('Vercel既存システムからメッセージ受信');
    
    // ペイロード検証
    if (!payload || !payload.messageData) {
      logWarning('無効なペイロード: messageDataが存在しません');
      return false;
    }
    
    const messageData = payload.messageData;
    
    // スプレッドシートに保存
    const spreadsheet = getMasterSpreadsheet();
    const sheet = spreadsheet.getSheetByName('メッセージ一覧');
    
    if (!sheet) {
      throw new Error('メッセージ一覧シートが見つかりません');
    }
    
    // 行データ作成
    const row = [
      new Date(messageData.createdTime || new Date()),  // 日時
      messageData.sender?.displayName || 'Unknown',  // 送信者
      '[日报] おひさま農園',  // ルーム名
      messageData.content?.text || '',  // メッセージ
      messageData.content?.attachments ? messageData.content.attachments.length + '件' : '',  // 添付
      messageData.messageId || '',  // メッセージID
      messageData.channelId || '',  // チャンネルID
      extractKeywords(messageData.content?.text || ''),  // キーワード
      categorizeMessage(messageData.content?.text || ''),  // カテゴリ
      payload.source || 'Vercel'  // データソース
    ];
    
    // データを追加（最新が上）
    sheet.insertRowAfter(1);
    sheet.getRange(2, 1, 1, row.length).setValues([row]);
    
    logInfo(`✅ メッセージ保存: ${messageData.sender?.displayName} - ${messageData.content?.text?.substring(0, 30)}`);
    
    return true;
    
  } catch (error) {
    logError('Vercelメッセージ保存エラー', error);
    return false;
  }
}

/**
 * 既存システムから過去データを取得
 * @param {number} days 何日分取得するか
 * @return {Object} 取得結果
 */
function fetchHistoricalDataFromVercel(days = 7) {
  logInfo('========================================');
  logInfo('📥 既存システムから過去データ取得開始');
  logInfo('========================================');
  
  const startTime = new Date();
  const stats = {
    totalFetched: 0,
    totalSaved: 0,
    errors: []
  };
  
  try {
    // 既存システムのAPIエンドポイント
    const vercelUrl = 'https://shift-lineworks-k2wo299u6-daishimuratas-projects.vercel.app/api/read-stored-messages-redis-v2';
    const url = `${vercelUrl}?days=${days}&limit=100`;
    
    logInfo(`データ取得URL: ${url}`);
    
    // APIリクエスト
    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true
    });
    
    const responseCode = response.getResponseCode();
    
    if (responseCode !== 200) {
      throw new Error(`API Error (${responseCode}): ${response.getContentText()}`);
    }
    
    const result = JSON.parse(response.getContentText());
    
    if (!result.success) {
      throw new Error(`API Failed: ${result.message}`);
    }
    
    const messages = result.data?.messages || [];
    stats.totalFetched = messages.length;
    
    logInfo(`取得メッセージ数: ${messages.length}件`);
    
    if (messages.length === 0) {
      logInfo('メッセージがありません');
      return stats;
    }
    
    // スプレッドシートに保存
    const spreadsheet = getMasterSpreadsheet();
    const sheet = spreadsheet.getSheetByName('メッセージ一覧');
    
    if (!sheet) {
      throw new Error('メッセージ一覧シートが見つかりません');
    }
    
    // バッチで保存（逆順：古いメッセージを先に追加）
    const rows = [];
    messages.reverse().forEach(msg => {
      try {
        const row = [
          new Date(msg.createdTime),
          msg.sender?.displayName || 'Unknown',
          '[日报] おひさま農園',
          msg.content?.text || '',
          '',  // 添付ファイル
          msg.messageId || '',
          msg.channelId || '',
          extractKeywords(msg.content?.text || ''),
          categorizeMessage(msg.content?.text || ''),
          'Vercel (過去データ)'
        ];
        rows.push(row);
      } catch (e) {
        logError('メッセージ変換エラー', e);
      }
    });
    
    if (rows.length > 0) {
      // 既存データの下に追加
      const lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, rows.length, rows[0].length).setValues(rows);
      stats.totalSaved = rows.length;
      
      logInfo(`✅ 保存完了: ${rows.length}件`);
    }
    
  } catch (error) {
    logError('過去データ取得エラー', error);
    stats.errors.push(error.message);
  }
  
  const duration = ((new Date() - startTime) / 1000).toFixed(1);
  
  logInfo('\n========================================');
  logInfo('📊 取得結果');
  logInfo('========================================');
  logInfo(`取得: ${stats.totalFetched}件`);
  logInfo(`保存: ${stats.totalSaved}件`);
  logInfo(`処理時間: ${duration}秒`);
  
  if (stats.errors.length > 0) {
    logInfo(`\n⚠️ エラー: ${stats.errors.join(', ')}`);
  }
  
  logInfo('========================================');
  
  return stats;
}

/**
 * GAS Webhook URLを取得
 * このURLを既存システム（Vercel）に設定する
 */
function getGASWebhookUrl() {
  const url = ScriptApp.getService().getUrl();
  
  logInfo('========================================');
  logInfo('🔗 GAS Webhook URL（既存システム設定用）');
  logInfo('========================================');
  logInfo(url);
  logInfo('');
  logInfo('📋 次のステップ:');
  logInfo('1. このURLをコピー');
  logInfo('2. Vercelプロジェクト（shift-lineworks-api）を開く');
  logInfo('3. api/lineworks-callback-redis-v2.js に転送処理を追加:');
  logInfo('');
  logInfo('   // GASへ転送（追加）');
  logInfo('   try {');
  logInfo('     await fetch("' + url + '", {');
  logInfo('       method: "POST",');
  logInfo('       headers: { "Content-Type": "application/json" },');
  logInfo('       body: JSON.stringify({');
  logInfo('         source: "vercel",');
  logInfo('         messageData: messageData');
  logInfo('       })');
  logInfo('     });');
  logInfo('   } catch (e) { console.log("GAS転送エラー:", e); }');
  logInfo('');
  logInfo('4. Vercelにデプロイ: vercel --prod');
  logInfo('========================================');
  
  return url;
}

/**
 * 統合システムのテスト
 */
function testVercelIntegration() {
  logInfo('========================================');
  logInfo('🧪 Vercel統合テスト');
  logInfo('========================================');
  
  try {
    // テスト1: 過去データ取得
    logInfo('\n[テスト1] 過去データ取得（1日分）');
    const result1 = fetchHistoricalDataFromVercel(1);
    logInfo(`結果: 取得${result1.totalFetched}件、保存${result1.totalSaved}件`);
    
    // テスト2: Webhook受信テスト
    logInfo('\n[テスト2] Webhook受信テスト');
    const testPayload = {
      source: 'vercel-test',
      messageData: {
        messageId: 'test_' + Date.now(),
        channelId: '2ddfe141-b9d5-6c2a-8027-43e009a916bc',
        createdTime: new Date().toISOString(),
        sender: {
          displayName: 'テストユーザー',
          userId: 'test_user'
        },
        content: {
          type: 'text',
          text: 'これはVercel統合のテストメッセージです'
        }
      }
    };
    
    const result2 = handleVercelWebhook(testPayload);
    logInfo(`結果: ${result2 ? '成功' : '失敗'}`);
    
    logInfo('\n========================================');
    logInfo('✅ 統合テスト完了');
    logInfo('========================================');
    logInfo('');
    logInfo('次のステップ:');
    logInfo('1. getGASWebhookUrl() でURLを取得');
    logInfo('2. 既存システムに転送処理を追加');
    logInfo('3. 実際のメッセージで動作確認');
    
    return true;
    
  } catch (error) {
    logError('統合テスト失敗', error);
    return false;
  }
}

/**
 * 統計情報の取得
 */
function getVercelIntegrationStats() {
  try {
    const spreadsheet = getMasterSpreadsheet();
    const sheet = spreadsheet.getSheetByName('メッセージ一覧');
    
    if (!sheet) {
      return { error: 'シートが見つかりません' };
    }
    
    const data = sheet.getDataRange().getValues();
    const headers = data.shift();  // ヘッダー除去
    
    // データソース別カウント
    const vercelCount = data.filter(row => row[9] && row[9].includes('Vercel')).length;
    const totalCount = data.length;
    
    logInfo('========================================');
    logInfo('📊 Vercel統合統計');
    logInfo('========================================');
    logInfo(`総メッセージ数: ${totalCount}件`);
    logInfo(`Vercel経由: ${vercelCount}件`);
    logInfo(`直接保存: ${totalCount - vercelCount}件`);
    logInfo('========================================');
    
    return {
      total: totalCount,
      fromVercel: vercelCount,
      direct: totalCount - vercelCount
    };
    
  } catch (error) {
    logError('統計取得エラー', error);
    return { error: error.message };
  }
}

/**
 * 取得可能な全データを取得（最大100件、重複除外）
 * @return {Object} 取得結果
 */
function fetchAllHistoricalData() {
  logInfo('========================================');
  logInfo('📥 全データ取得開始（最大100件）');
  logInfo('========================================');
  
  const startTime = new Date();
  const stats = {
    totalFetched: 0,
    totalSaved: 0,
    duplicates: 0,
    errors: []
  };
  
  try {
    // より長い期間（30日）と大きいlimit（100件）で取得
    const vercelUrl = 'https://shift-lineworks-k2wo299u6-daishimuratas-projects.vercel.app/api/read-stored-messages-redis-v2';
    const url = `${vercelUrl}?days=30&limit=100`;
    
    logInfo('データ取得URL: ' + url);
    logInfo('取得設定: 過去30日分、最大100件');
    
    // APIリクエスト
    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true
    });
    
    const responseCode = response.getResponseCode();
    
    if (responseCode !== 200) {
      throw new Error('API Error (' + responseCode + '): ' + response.getContentText());
    }
    
    const result = JSON.parse(response.getContentText());
    
    if (!result.success) {
      throw new Error('API Failed: ' + result.message);
    }
    
    const messages = result.data?.messages || [];
    stats.totalFetched = messages.length;
    
    logInfo('✅ 取得メッセージ数: ' + messages.length + '件');
    
    if (result.data?.statistics) {
      logInfo('Redis統計: ' + JSON.stringify(result.data.statistics));
    }
    
    if (messages.length === 0) {
      logInfo('⚠️ メッセージがありません');
      return stats;
    }
    
    // スプレッドシート準備
    const spreadsheet = getMasterSpreadsheet();
    const sheet = spreadsheet.getSheetByName('メッセージ一覧');
    
    if (!sheet) {
      throw new Error('メッセージ一覧シートが見つかりません');
    }
    
    // 既存データと重複チェック用
    const existingData = sheet.getDataRange().getValues();
    const existingIds = new Set();
    existingData.forEach((row, index) => {
      if (index > 0 && row[5]) {  // ヘッダー除外、メッセージIDが6列目
        existingIds.add(row[5]);
      }
    });
    
    logInfo('既存メッセージ数: ' + existingIds.size + '件');
    
    // バッチで保存（重複除外、古い順）
    const rows = [];
    messages.reverse().forEach(msg => {
      try {
        const messageId = msg.messageId || '';
        
        // 重複チェック
        if (messageId && existingIds.has(messageId)) {
          stats.duplicates++;
          return;
        }
        
        const row = [
          new Date(msg.createdTime),
          msg.sender?.displayName || 'Unknown',
          '[日报] おひさま農園',
          msg.content?.text || '',
          '',  // 添付ファイル
          messageId,
          msg.channelId || '',
          extractKeywords(msg.content?.text || ''),
          categorizeMessage(msg.content?.text || ''),
          'Vercel (全データ取得)'
        ];
        rows.push(row);
      } catch (e) {
        logError('メッセージ変換エラー', e);
      }
    });
    
    if (rows.length > 0) {
      // 既存データの下に追加
      const lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, rows.length, rows[0].length).setValues(rows);
      stats.totalSaved = rows.length;
      
      logInfo('✅ 保存完了: ' + rows.length + '件（重複除外後）');
    } else {
      logInfo('⚠️ 新規データなし（すべて重複）');
    }
    
  } catch (error) {
    logError('全データ取得エラー', error);
    stats.errors.push(error.message);
  }
  
  const duration = ((new Date() - startTime) / 1000).toFixed(1);
  
  logInfo('');
  logInfo('========================================');
  logInfo('📊 取得結果');
  logInfo('========================================');
  logInfo('取得: ' + stats.totalFetched + '件');
  logInfo('新規保存: ' + stats.totalSaved + '件');
  logInfo('重複スキップ: ' + stats.duplicates + '件');
  logInfo('処理時間: ' + duration + '秒');
  
  if (stats.errors.length > 0) {
    logInfo('');
    logInfo('⚠️ エラー: ' + stats.errors.join(', '));
  }
  
  logInfo('========================================');
  
  return stats;
}

