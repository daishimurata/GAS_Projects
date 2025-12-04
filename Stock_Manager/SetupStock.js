function myFunction() {
  
}

/**
 * 在庫管理システム 初回セットアップ用スクリプト
 */
function setupStockManagement() {
  console.log('在庫管理システムのセットアップを開始します...');
  
  try {
    // スプレッドシートを作成（既存のロジックを使用）
    // StockManagement.gsの関数を呼び出し
    const spreadsheet = getStockManagementSpreadsheet();
    const id = spreadsheet.getId();
    
    console.log('----------------------------------------');
    console.log('✅ スプレッドシートの作成に成功しました！');
    console.log('以下のIDを Config.gs の STOCK_MANAGEMENT.SPREADSHEET_ID に設定してください：');
    console.log('');
    console.log(id);
    console.log('');
    console.log('スプレッドシートURL: ' + spreadsheet.getUrl());
    console.log('----------------------------------------');
    
  } catch (error) {
    console.error('❌ セットアップ中にエラーが発生しました:');
    console.error(error.toString());
  }
}

/**
 * Bot API接続テスト
 * Configを経由せず直接URLを叩いて原因を特定する
 */
function testBotConnectionDirect() {
  console.log('🤖 Bot API接続テスト開始');
  
  try {
    // 1. アクセストークン取得
    const token = getAccessToken();
    if (!token) throw new Error('アクセストークン取得失敗');
    console.log('✅ アクセストークン取得成功');
    
    // 2. Bot ID確認
    const botId = CONFIG.LINEWORKS.BOT_ID;
    console.log(`Bot ID: ${botId}`);
    
    // 3. 直接URLを構築してリクエスト（Bot情報取得）
    // これで404ならBot IDが無効、200ならBotは生きている
    const url = `https://www.worksapis.com/v1.0/bots/${botId}`;
    
    const options = {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + token
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    const content = response.getContentText();
    
    console.log(`レスポンスコード: ${code}`);
    console.log(`レスポンス内容: ${content}`);
    
    if (code === 200) {
      console.log('🎉 成功！APIは正常に動作しています。');
      const data = JSON.parse(content);
      console.log(`Bot名: ${data.botName}`);
      console.log(`ステータス: ${data.status}`);
    } else {
      console.log('❌ 失敗。APIエラーが発生しました。');
    }
    
  } catch (e) {
    console.error('例外発生:', e);
  }
}

/**
 * キャッシュクリア（トークン再発行用）
 */
function clearTokenCache() {
  const cache = CacheService.getScriptCache();
  cache.remove('lineworks_token');
  console.log('🗑️ トークンキャッシュを削除しました。');
  console.log('次回実行時に新しい権限設定でトークンが再発行されます。');
}

/**
 * 在庫管理シートの強制初期化（手動実行用）
 */
function forceInitializeSheets() {
  console.log('シートの強制初期化を開始します...');
  
  try {
    const spreadsheet = getStockManagementSpreadsheet();
    
    // 既存のシート名を確認
    const sheets = spreadsheet.getSheets();
    console.log('現在のシート一覧:');
    sheets.forEach(s => console.log(`- ${s.getName()}`));
    
    // 初期化関数を呼び出し（StockManagement.gsで定義）
    if (typeof initializeStockManagementSheets === 'function') {
      initializeStockManagementSheets(spreadsheet);
      console.log('✅ 初期化処理を実行しました。スプレッドシートを確認してください。');
    } else {
      console.error('❌ initializeStockManagementSheets 関数が見つかりません。');
    }
    
  } catch (e) {
    console.error('エラーが発生しました:', e);
  }
}

