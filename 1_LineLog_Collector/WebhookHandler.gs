/**
 * LINE WORKS Bot Webhook ハンドラー
 * Botが受信したメッセージをリアルタイムで保存
 */

/**
 * Webhookエンドポイント
 * LINE WORKS BotのCallback URLまたはVercel既存システムからのデータ転送
 * @param {Object} e イベントオブジェクト
 * @return {GoogleAppsScript.Content.TextOutput} レスポンス
 */
function doPost(e) {
  // 1. チャレンジレスポンス（LINE WORKS初回検証）
  if (e && e.parameter && e.parameter.challenge) {
    logInfo('チャレンジレスポンス受信: ' + e.parameter.challenge);
    return ContentService.createTextOutput(e.parameter.challenge)
      .setMimeType(ContentService.MimeType.TEXT);
  }
  
  // 2. 通常のWebhook処理
  if (e && e.postData && e.postData.contents) {
    try {
      const payload = JSON.parse(e.postData.contents);
      
      // 署名検証（セキュリティ強化）
      if (e.parameter && e.parameter['X-WORKS-Signature']) {
        const isValid = verifyLineWorksSignature(
          e.postData.contents, 
          e.parameter['X-WORKS-Signature']
        );
        if (!isValid) {
          logWarning('署名検証失敗');
          return createJsonResponse({ error: 'Invalid signature' }, 401);
        }
      }
      
      // Vercel既存システムからの転送の場合
      if (payload.source === 'vercel' && payload.messageData) {
        const success = handleVercelWebhook(payload);
        return ContentService.createTextOutput(JSON.stringify({ 
          success: success,
          message: 'GASに保存完了'
        })).setMimeType(ContentService.MimeType.JSON);
      }
      
      // LINE WORKS Webhookの場合
      if (payload.type || payload.source) {
        return handleLineWorksWebhook(payload);
      }
      
      // その他のWebhook（既存のWeb App機能）
      return handleWebAppPost(e);
      
    } catch (error) {
      logError('Webhook処理エラー', error);
      return createJsonResponse({ error: error.message }, 500);
    }
  }
  
  // 通常のWeb App POSTリクエスト
  return handleWebAppPost(e);
}

/**
 * LINE WORKS Bot Webhookを処理
 * @param {Object} payload Webhookペイロード
 * @return {GoogleAppsScript.Content.TextOutput} レスポンス
 */
function handleLineWorksWebhook(payload) {
  logInfo('LINE WORKS Webhook受信: ' + JSON.stringify(payload));
  
  try {
    // イベントタイプに応じて処理
    switch (payload.type) {
      case 'message':
        // メッセージイベント
        handleMessageEvent(payload);
        break;
        
      case 'join':
        // Botがトークルームに参加
        handleJoinEvent(payload);
        break;
        
      case 'leave':
        // Botがトークルームから退出
        handleLeaveEvent(payload);
        break;
        
      default:
        logInfo('未対応のイベントタイプ: ' + payload.type);
    }
    
    // LINE WORKSには200を返す必要がある
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    logError('Webhookイベント処理エラー', error);
    // エラーでも200を返す（再送を防ぐため）
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * メッセージイベントを処理
 * @param {Object} payload イベントペイロード
 */
function handleMessageEvent(payload) {
  try {
    // LINE WORKS Webhookペイロード構造に対応
    const content = payload.content || {};
    const source = payload.source || {};
    
    // メッセージタイプを判定
    const messageType = content.type || 'unknown';
    let messageText = '';
    let attachmentInfo = '';
    
    switch (messageType) {
      case 'text':
        messageText = content.text || '';
        break;
      case 'image':
        messageText = '[画像]';
        attachmentInfo = '1件';
        break;
      case 'file':
        messageText = '[ファイル]';
        attachmentInfo = '1件';
        break;
      case 'sticker':
        messageText = '[スタンプ]';
        break;
      case 'location':
        messageText = '[位置情報]';
        break;
      default:
        messageText = `[${messageType}]`;
    }
    
    // スプレッドシートに保存
    const spreadsheet = getMasterSpreadsheet();
    const sheet = spreadsheet.getSheetByName('メッセージ一覧');
    
    if (!sheet) {
      throw new Error('メッセージ一覧シートが見つかりません');
    }
    
    // 送信者情報を取得
    const senderName = source.userName || source.accountId || source.userId || 'Unknown';
    
    // 1:1チャットかグループチャットかを判定
    let chatType = '';
    let channelName = '';
    
    if (source.channelId) {
      // グループチャット（トークルーム）
      chatType = 'group';
      channelName = source.channelName || source.channelId;
    } else {
      // 1:1チャット（個人メッセージ）
      chatType = 'direct';
      channelName = `[個人チャット] ${senderName}`;
    }
    
    // メッセージデータを整形
    const row = [
      new Date(),  // 日時
      senderName,  // 送信者
      channelName,  // ルーム名（または「[個人チャット] ユーザー名」）
      messageText,  // メッセージ
      attachmentInfo,  // 添付
      content.messageId || payload.messageId || '',  // メッセージID
      source.channelId || source.userId || '',  // チャンネルID（または個人チャットのユーザーID）
      extractKeywords(messageText),  // キーワード
      categorizeMessage(messageText),  // カテゴリ
      `LINE WORKS (Webhook - ${chatType})`  // データソース
    ];
    
    // データを追加（最新が上）
    sheet.insertRowAfter(1);
    sheet.getRange(2, 1, 1, row.length).setValues([row]);
    
    const chatTypeLabel = chatType === 'direct' ? '個人チャット' : 'グループチャット';
    logInfo(`✅ メッセージを保存 [${chatTypeLabel}]: ${senderName} - ${messageText.substring(0, 50)}`);
    
    // 在庫管理システム連携: チャットから在庫補充・売上を検知
    try {
      if (typeof updateStockFromChatMessage === 'function') {
        updateStockFromChatMessage(messageText, senderName, new Date());
      }
    } catch (stockError) {
      logError('在庫連携処理エラー', stockError);
    }
    
    // 添付ファイルがあればダウンロード
    if (content.type === 'image' || content.type === 'file') {
      try {
        if (content.resourceUrl) {
          downloadAndSaveAttachment({
            fileId: content.resourceUrl,
            fileName: content.fileName || `${content.type}_${Date.now()}`,
            type: content.type
          }, source);
        }
      } catch (e) {
        logError('添付ファイルダウンロードエラー', e);
      }
    }
    
  } catch (error) {
    logError('メッセージイベント処理エラー', error);
    throw error;
  }
}

/**
 * Botがトークルームに参加したイベント
 * @param {Object} payload イベントペイロード
 */
function handleJoinEvent(payload) {
  const source = payload.source || {};
  logInfo(`Bot がトークルームに参加: ${source.channelName || source.channelId}`);
  
  // 参加通知をスプレッドシートに記録（オプション）
  try {
    const spreadsheet = getMasterSpreadsheet();
    const sheet = spreadsheet.getSheetByName('ルーム一覧');
    
    if (sheet) {
      const row = [
        source.channelName || source.channelId || 'Unknown',
        source.channelId || '',
        formatDateTime(new Date()),
        0,
        'Botが参加しました'
      ];
      
      sheet.appendRow(row);
    }
  } catch (error) {
    logError('参加イベント記録エラー', error);
  }
}

/**
 * Botがトークルームから退出したイベント
 * @param {Object} payload イベントペイロード
 */
function handleLeaveEvent(payload) {
  const source = payload.source || {};
  logInfo(`Bot がトークルームから退出: ${source.channelName || source.channelId}`);
}

/**
 * 添付ファイルをダウンロードして保存
 * @param {Object} attachment 添付ファイル情報
 * @param {Object} source 送信元情報
 */
function downloadAndSaveAttachment(attachment, source) {
  try {
    if (!attachment.fileId) {
      return;
    }
    
    // LINE WORKS APIで添付ファイルをダウンロード
    const blob = downloadLineWorksAttachment(attachment.fileId);
    
    if (!blob) {
      logWarning('添付ファイルのダウンロードに失敗: ' + attachment.fileId);
      return;
    }
    
    // Googleドライブに保存
    const folderPath = `${CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME}/${CONFIG.GOOGLE_DRIVE.CHAT_LOG_FOLDER}/${CONFIG.GOOGLE_DRIVE.ATTACHMENT_FOLDER}`;
    const folder = getOrCreateFolder(folderPath);
    
    const fileName = `${formatDate(new Date())}_${source.userName || 'Unknown'}_${attachment.fileName || attachment.fileId}`;
    const file = folder.createFile(blob.setName(fileName));
    
    logInfo(`✅ 添付ファイル保存: ${fileName}`);
    
  } catch (error) {
    logError('添付ファイル保存エラー', error);
  }
}

/**
 * 既存のWeb App POSTリクエストを処理
 * @param {Object} e イベントオブジェクト
 * @return {GoogleAppsScript.Content.TextOutput} レスポンス
 */
function handleWebAppPost(e) {
  const action = e.parameter.action || 'syncAll';
  
  let result;
  
  try {
    switch (action) {
      case 'syncAll':
        result = executeFullSync();
        break;
        
      case 'syncCalendar':
        result = syncCalendars();
        break;
        
      case 'syncChat':
        result = syncChatLogs();
        break;
        
      case 'syncSingleCalendar':
        const calendarId = e.parameter.calendarId;
        if (!calendarId) {
          return createJsonResponse({ error: 'calendarId is required' }, 400);
        }
        result = syncSingleCalendar(calendarId);
        break;
        
      case 'syncSingleChannel':
        const channelId = e.parameter.channelId;
        if (!channelId) {
          return createJsonResponse({ error: 'channelId is required' }, 400);
        }
        result = syncSingleChannel(channelId);
        break;
        
      default:
        result = {
          error: 'Invalid action',
          availableActions: ['syncAll', 'syncCalendar', 'syncChat', 'syncSingleCalendar', 'syncSingleChannel']
        };
    }
    
    return createJsonResponse({
      success: true,
      timestamp: new Date().toISOString(),
      action: action,
      result: result
    });
  } catch (error) {
    logError('Web App POST エラー', error);
    return createJsonResponse({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, 500);
  }
}

/**
 * Webhook URLを取得してLINE WORKS設定にコピーする
 */
function getWebhookUrl() {
  const url = ScriptApp.getService().getUrl();
  
  logInfo('========================================');
  logInfo('🔗 Webhook URL');
  logInfo('========================================');
  logInfo(url);
  logInfo('');
  logInfo('📋 次のステップ:');
  logInfo('1. LINE WORKS Developer Console を開く');
  logInfo('2. Bot「日向」の設定を開く');
  logInfo('3. Callback URL に上記URLを設定');
  logInfo('4. 保存');
  logInfo('');
  logInfo('これで、Botがメッセージを受信するたびに');
  logInfo('自動的にスプレッドシートに保存されます！');
  logInfo('========================================');
  
  return url;
}

/**
 * LINE WORKS Webhook署名検証
 * @param {string} body リクエストボディ
 * @param {string} signature X-WORKS-Signatureヘッダーの値
 * @return {boolean} 検証結果
 */
function verifyLineWorksSignature(body, signature) {
  try {
    // Bot Secretを使用してHMAC-SHA256で署名検証
    const botSecret = CONFIG.LINEWORKS.BOT_SECRET;
    if (!botSecret) {
      logWarning('BOT_SECRETが設定されていません');
      return true; // 設定なしの場合はスキップ
    }
    
    // HMAC-SHA256で署名を計算
    const expectedSignature = Utilities.computeHmacSha256Signature(
      Utilities.newBlob(body).getBytes(),
      botSecret
    );
    
    // Base64エンコード
    const expectedSignatureBase64 = Utilities.base64Encode(expectedSignature);
    
    // 比較
    return expectedSignatureBase64 === signature;
    
  } catch (error) {
    logError('署名検証エラー', error);
    return false;
  }
}

/**
 * Webhookのテスト（グループチャット）
 * テストペイロードで動作確認
 */
function testWebhook() {
  logInfo('========================================');
  logInfo('Webhook テスト（グループチャット）');
  logInfo('========================================');
  
  // テストメッセージペイロード（グループチャット）
  const testPayload = {
    type: 'message',
    source: {
      userId: 'test@ohisamafarm',
      userName: 'テストユーザー',
      channelId: 'test-channel-123',
      channelName: 'テストルーム'
    },
    content: {
      type: 'text',
      text: 'これはWebhookのテストメッセージです（グループチャット）',
      messageId: 'test-msg-' + new Date().getTime()
    }
  };
  
  try {
    handleLineWorksWebhook(testPayload);
    logInfo('✅ Webhookテスト成功！');
    logInfo('スプレッドシートを確認してください');
    
    return true;
  } catch (error) {
    logError('Webhookテスト失敗', error);
    return false;
  }
}

/**
 * Webhookのテスト（1:1チャット）
 * 個人チャットのテストペイロード
 */
function testWebhookDirectMessage() {
  logInfo('========================================');
  logInfo('Webhook テスト（1:1チャット）');
  logInfo('========================================');
  
  // テストメッセージペイロード（1:1チャット）
  const testPayload = {
    type: 'message',
    source: {
      userId: 'staff@ohisamafarm',
      userName: '村田 太志',
      // channelIdがない = 1:1チャット
    },
    content: {
      type: 'text',
      text: 'これは個人チャットのテストメッセージです',
      messageId: 'test-direct-msg-' + new Date().getTime()
    }
  };
  
  try {
    handleLineWorksWebhook(testPayload);
    logInfo('✅ 1:1チャットテスト成功！');
    logInfo('スプレッドシートを確認してください');
    logInfo('ルーム名が「[個人チャット] 村田 太志」と表示されているはずです');
    
    return true;
  } catch (error) {
    logError('1:1チャットテスト失敗', error);
    return false;
  }
}

/**
 * セットアップガイドを表示
 */
function showWebhookSetupGuide() {
  const webhookUrl = ScriptApp.getService().getUrl();
  
  logInfo('========================================');
  logInfo('📖 GAS Webhook セットアップガイド');
  logInfo('========================================');
  logInfo('');
  logInfo('🔗 Webhook URL:');
  logInfo(webhookUrl);
  logInfo('');
  logInfo('📋 LINE WORKS Developer Console での設定手順:');
  logInfo('');
  logInfo('1. LINE WORKS Developer Console にアクセス');
  logInfo('   https://developers.worksmobile.com/');
  logInfo('');
  logInfo('2. Bot「日向」を選択');
  logInfo('');
  logInfo('3. Callback URL に上記URLを設定');
  logInfo('   - Callback URL: ' + webhookUrl);
  logInfo('');
  logInfo('4. 保存して検証（チャレンジレスポンス）');
  logInfo('   → 自動的に検証されます');
  logInfo('');
  logInfo('5. Botをトークルームに追加');
  logInfo('   - 「日报」トークルームに追加してください');
  logInfo('');
  logInfo('6. テストメッセージを送信');
  logInfo('   → Google Sheetsに自動保存されます！');
  logInfo('');
  logInfo('========================================');
  logInfo('');
  logInfo('💡 動作確認方法:');
  logInfo('');
  logInfo('1. LINE WORKSでメッセージ送信');
  logInfo('2. Googleドライブを開く');
  logInfo('3. 「LINE WORKS統合ログ/チャットログ/マスターログ」');
  logInfo('4. 「メッセージ一覧」シートを確認');
  logInfo('');
  logInfo('========================================');
  
  return webhookUrl;
}


