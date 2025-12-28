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
  logInfo('========================================');
  logInfo('📥 Webhook受信');
  logInfo('========================================');
  logInfo(`リクエストパラメータ: ${JSON.stringify(e.parameter || {})}`);
  logInfo(`POSTデータ有無: ${!!(e.postData && e.postData.contents)}`);
  
  // 1. チャレンジレスポンス（LINE WORKS初回検証）
  if (e && e.parameter && e.parameter.challenge) {
    logInfo('チャレンジレスポンス受信: ' + e.parameter.challenge);
    return ContentService.createTextOutput(e.parameter.challenge)
      .setMimeType(ContentService.MimeType.TEXT);
  }
  
  // 2. 通常のWebhook処理
  if (e && e.postData && e.postData.contents) {
    try {
      logInfo('POSTデータ受信');
      const payload = JSON.parse(e.postData.contents);
      logInfo(`ペイロードタイプ: ${payload.type || 'なし'}`);
      logInfo(`ペイロードソース: ${payload.source || 'なし'}`);
      logInfo(`ペイロード構造: ${JSON.stringify(Object.keys(payload))}`);
      
      // 署名検証（セキュリティ強化）
      if (e.parameter && e.parameter['X-WORKS-Signature']) {
        logInfo('署名検証を実行中...');
        const isValid = verifyLineWorksSignature(
          e.postData.contents, 
          e.parameter['X-WORKS-Signature']
        );
        if (!isValid) {
          logWarning('署名検証失敗');
          return createJsonResponse({ error: 'Invalid signature' }, 401);
        }
        logInfo('✅ 署名検証成功');
      } else {
        logInfo('署名ヘッダーなし（検証スキップ）');
      }
      
      // Vercel既存システムからの転送の場合
      if (payload.source === 'vercel' && payload.messageData) {
        logInfo('Vercelからの転送として処理');
        const success = handleVercelWebhook(payload);
        return ContentService.createTextOutput(JSON.stringify({ 
          success: success,
          message: 'GASに保存完了'
        })).setMimeType(ContentService.MimeType.JSON);
      }
      
      // LINE WORKS Webhookの場合
      if (payload.type || payload.source) {
        logInfo('LINE WORKS Webhookとして処理');
        return handleLineWorksWebhook(payload);
      }
      
      // その他のWebhook（既存のWeb App機能）
      logInfo('Web App POSTとして処理');
      return handleWebAppPost(e);
      
    } catch (error) {
      logError('Webhook処理エラー', error);
      logInfo(`エラー詳細: ${error.toString()}`);
      logInfo(`スタックトレース: ${error.stack}`);
      return createJsonResponse({ error: error.message }, 500);
    }
  }
  
  // POSTデータがない場合
  logWarning('POSTデータがありません');
  logInfo('Web App POSTとして処理');
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
    logInfo('========================================');
    logInfo('📨 メッセージイベント処理開始');
    logInfo('========================================');
    logInfo(`ペイロード全体: ${JSON.stringify(payload)}`);
    
    // LINE WORKS Webhookペイロード構造に対応
    const content = payload.content || {};
    const source = payload.source || {};
    
    logInfo(`content: ${JSON.stringify(content)}`);
    logInfo(`source: ${JSON.stringify(source)}`);
    
    // メッセージタイプを判定
    const messageType = content.type || 'unknown';
    let messageText = '';
    let attachmentInfo = '';
    
    logInfo(`メッセージタイプ: ${messageType}`);
    
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
    
    logInfo(`メッセージテキスト: ${messageText.substring(0, 100)}`);
    
    // 送信者情報を取得
    const senderName = source.userName || source.accountId || source.userId || 'Unknown';
    logInfo(`送信者: ${senderName}`);
    
    // 1:1チャットかグループチャットかを判定
    let chatType = '';
    let channelName = '';
    const channelId = source.channelId || '';
    
    if (channelId) {
      // グループチャット（トークルーム）
      chatType = 'group';
      channelName = source.channelName || channelId;
    } else {
      // 1:1チャット（個人メッセージ）
      chatType = 'direct';
      channelName = `[個人チャット] ${senderName}`;
    }
    
    logInfo(`チャンネルID: ${channelId || 'なし（1:1チャット）'}`);
    logInfo(`チャットタイプ: ${chatType}`);
    logInfo(`チャンネル名: ${channelName}`);
    
    // 在庫管理専用チャンネルかどうかを判定
    const isStockChannel = CONFIG.STOCK_MANAGEMENT && 
                          CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG && 
                          CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.ENABLED &&
                          channelId === CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.CHANNEL_ID;
    
    logInfo(`設定チャンネルID: ${CONFIG.STOCK_MANAGEMENT?.STOCK_CHAT_LOG?.CHANNEL_ID || '設定なし'}`);
    logInfo(`在庫管理専用チャンネル判定: ${isStockChannel}`);
    if (isStockChannel) {
      logInfo(`設定チャンネルID: ${CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.CHANNEL_ID}`);
    }
    
    if (isStockChannel) {
      // 在庫管理専用チャンネルの場合は専用スプレッドシートに保存
      logInfo('在庫管理専用チャンネルとして処理します');
      
      try {
        const stockSpreadsheet = getStockChatLogSpreadsheet();
        if (!stockSpreadsheet) {
          logError('在庫管理チャットログスプレッドシートの取得に失敗しました', null);
          // フォールバック: マスタースプレッドシートに保存
          logInfo('マスタースプレッドシートに保存します');
        } else {
          logInfo(`スプレッドシート取得成功: ${stockSpreadsheet.getName()}`);
          const stockSheet = stockSpreadsheet.getSheetByName(CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.SHEET_NAME);
          if (!stockSheet) {
            logError('在庫管理チャットログのメッセージ一覧シートが見つかりません', null);
            // フォールバック: マスタースプレッドシートに保存
            logInfo('マスタースプレッドシートに保存します');
          } else {
            const row = [
              new Date(),  // 日時
              senderName,  // 送信者
              channelName,  // ルーム名
              messageText,  // メッセージ
              attachmentInfo,  // 添付
              content.messageId || payload.messageId || '',  // メッセージID
              channelId,  // チャンネルID
              extractKeywords(messageText).join(', '),  // キーワード
              categorizeMessage(messageText),  // カテゴリ
              ''  // 処理済みフラグ（空=未処理）
            ];
            
            stockSheet.insertRowAfter(1);
            stockSheet.getRange(2, 1, 1, row.length).setValues([row]);
            
            // 日時列の数値形式を設定（日付+時刻を表示）
            const dateTimeFormat = 'yyyy/MM/dd HH:mm:ss';
            stockSheet.getRange(2, 1).setNumberFormat(dateTimeFormat);
            
            logInfo(`✅ 在庫管理専用チャットログに保存: ${senderName} - ${messageText.substring(0, 50)}`);
            return; // 成功したら終了
          }
        }
      } catch (error) {
        logError('在庫管理専用チャットログ保存エラー', error);
        // フォールバック: マスタースプレッドシートに保存
        logInfo('エラーが発生したため、マスタースプレッドシートに保存します');
      }
    }
    
    // 通常のチャットログはマスタースプレッドシートに保存（またはフォールバック）
    {
      // 通常のチャットログはマスタースプレッドシートに保存
      const spreadsheet = getMasterSpreadsheet();
      const sheet = spreadsheet.getSheetByName('メッセージ一覧');
      
      if (!sheet) {
        throw new Error('メッセージ一覧シートが見つかりません');
      }
      
      // メッセージデータを整形
      const row = [
        new Date(),  // 日時
        senderName,  // 送信者
        channelName,  // ルーム名（または「[個人チャット] ユーザー名」）
        messageText,  // メッセージ
        attachmentInfo,  // 添付
        content.messageId || payload.messageId || '',  // メッセージID
        channelId || source.userId || '',  // チャンネルID（または個人チャットのユーザーID）
        extractKeywords(messageText).join(', '),  // キーワード
        categorizeMessage(messageText),  // カテゴリ
        `LINE WORKS (Webhook - ${chatType})`  // データソース
      ];
      
      // データを追加（最新が上）
      sheet.insertRowAfter(1);
      sheet.getRange(2, 1, 1, row.length).setValues([row]);
      
      const chatTypeLabel = chatType === 'direct' ? '個人チャット' : 'グループチャット';
      logInfo(`✅ メッセージを保存 [${chatTypeLabel}]: ${senderName} - ${messageText.substring(0, 50)}`);
    }
    
    // 在庫管理システム連携: チャットから在庫補充・売上を検知
    // 注意: チャットログからの在庫更新は無効化されています
    // スタッフからの在庫情報は専用チャンネル（7d6b452d-2dce-09ac-7663-a2f47d622e91）に手動で入力してください
    // try {
    //   if (typeof updateStockFromChatMessage === 'function') {
    //     updateStockFromChatMessage(messageText, senderName, new Date());
    //   }
    // } catch (stockError) {
    //   logError('在庫連携処理エラー', stockError);
    // }
    
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
  let url;
  
  try {
    url = ScriptApp.getService().getUrl();
  } catch (error) {
    logError('Webhook URL取得エラー', error);
    url = null;
  }
  
  // URLがnullまたは空の場合はデプロイされていない
  if (!url) {
    logInfo('');
    logInfo('========================================');
    logInfo('⚠️ Web Appがデプロイされていません！');
    logInfo('========================================');
    logInfo('');
    logInfo('📋 Web Appデプロイ手順:');
    logInfo('');
    logInfo('1. Apps Scriptエディタの上部メニューから');
    logInfo('   「デプロイ」→「新しいデプロイ」をクリック');
    logInfo('');
    logInfo('2. 歯車アイコン（⚙️）をクリック');
    logInfo('   → 「種類の選択」が表示されます');
    logInfo('');
    logInfo('3. 「種類の選択」から「ウェブアプリ」を選択');
    logInfo('');
    logInfo('4. 設定項目を入力:');
    logInfo('   - 説明: LINE WORKS Webhook（任意）');
    logInfo('   - 次のユーザーとして実行: 自分');
    logInfo('   - アクセスできるユーザー: 全員（重要！）');
    logInfo('     ※「全員」を選択しないとWebhookが動作しません');
    logInfo('');
    logInfo('5. 「デプロイ」ボタンをクリック');
    logInfo('');
    logInfo('6. 初回デプロイの場合、承認が必要です:');
    logInfo('   - 「アクセスを承認」をクリック');
    logInfo('   - Googleアカウントでログイン');
    logInfo('   - 「詳細」→「（プロジェクト名）に移動」をクリック');
    logInfo('   - 「許可」をクリック');
    logInfo('');
    logInfo('7. デプロイが完了したら、表示されたURLをコピー');
    logInfo('   （または、この関数を再度実行してURLを取得）');
    logInfo('');
    logInfo('========================================');
    logInfo('');
    logInfo('💡 デプロイ後の確認:');
    logInfo('   checkWebhookStatus() を実行して設定状況を確認');
    logInfo('========================================');
    
    return null;
  }
  
  logInfo('========================================');
  logInfo('🔗 Webhook URL');
  logInfo('========================================');
  logInfo(url);
  logInfo('');
  logInfo('📋 次のステップ:');
  logInfo('1. LINE WORKS Developer Console を開く');
  logInfo('   https://developers.worksmobile.com/');
  logInfo('');
  logInfo('2. Bot「日向」(ID: 10746138)を選択');
  logInfo('');
  logInfo('3. 「Callback URL」に上記URLを設定');
  logInfo('   ' + url);
  logInfo('');
  logInfo('4. 「保存」をクリック');
  logInfo('   → 自動的に検証が実行されます');
  logInfo('');
  logInfo('5. Botをトークルームに追加');
  logInfo('   - 在庫管理専用チャンネル（7d6b452d-2dce-09ac-7663-a2f47d622e91）に追加');
  logInfo('   - または他のグループチャットに追加');
  logInfo('');
  logInfo('6. テストメッセージを送信');
  logInfo('   → 自動的にスプレッドシートに保存されます！');
  logInfo('');
  logInfo('========================================');
  logInfo('');
  logInfo('💡 動作確認:');
  logInfo('1. LINE WORKSでメッセージを送信');
  logInfo('2. Googleドライブを開く');
  logInfo('3. 「LINE WORKS統合ログ/チャットログ/マスターログ」');
  logInfo('4. 「メッセージ一覧」シートを確認');
  logInfo('');
  logInfo('在庫管理専用チャンネルのメッセージは:');
  logInfo('「LINE WORKS統合ログ/チャットログ/在庫管理チャットログ」');
  logInfo('に保存されます');
  logInfo('========================================');
  
  return url;
}

/**
 * Webhook設定状況を確認
 */
function checkWebhookStatus() {
  logInfo('========================================');
  logInfo('🔍 Webhook設定状況確認');
  logInfo('========================================');
  
  // 1. Web Appデプロイ状況
  let webhookUrl = null;
  try {
    webhookUrl = ScriptApp.getService().getUrl();
    logInfo('✅ Web Appデプロイ済み');
    logInfo(`   URL: ${webhookUrl}`);
  } catch (error) {
    logInfo('❌ Web Appがデプロイされていません');
    logInfo('   → デプロイが必要です（getWebhookUrl()を参照）');
  }
  
  logInfo('');
  
  // 2. Bot設定確認
  if (CONFIG.LINEWORKS && CONFIG.LINEWORKS.BOT_ID) {
    logInfo('✅ Bot ID設定済み');
    logInfo(`   Bot ID: ${CONFIG.LINEWORKS.BOT_ID}`);
  } else {
    logInfo('❌ Bot IDが設定されていません');
  }
  
  if (CONFIG.LINEWORKS && CONFIG.LINEWORKS.BOT_SECRET) {
    logInfo('✅ Bot Secret設定済み');
  } else {
    logInfo('⚠️ Bot Secretが設定されていません（署名検証がスキップされます）');
  }
  
  logInfo('');
  
  // 3. 在庫管理専用チャンネル設定確認
  if (CONFIG.STOCK_MANAGEMENT && 
      CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG && 
      CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.ENABLED) {
    logInfo('✅ 在庫管理専用チャットログ有効');
    logInfo(`   チャンネルID: ${CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.CHANNEL_ID}`);
    logInfo(`   スプレッドシート名: ${CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.SPREADSHEET_NAME}`);
  } else {
    logInfo('⚠️ 在庫管理専用チャットログが無効です');
  }
  
  logInfo('');
  logInfo('========================================');
  logInfo('📋 次のアクション:');
  logInfo('========================================');
  
  if (!webhookUrl) {
    logInfo('1. Web Appをデプロイしてください');
    logInfo('   → getWebhookUrl()を実行して手順を確認');
  } else {
    logInfo('1. LINE WORKS Developer ConsoleでCallback URLを設定');
    logInfo(`   → ${webhookUrl}`);
    logInfo('');
    logInfo('2. Botをトークルームに追加');
    logInfo('');
    logInfo('3. テストメッセージを送信して動作確認');
    logInfo('   → testWebhook()を実行してテスト');
  }
  
  logInfo('========================================');
  
  return {
    webhookUrl: webhookUrl,
    botId: CONFIG.LINEWORKS ? CONFIG.LINEWORKS.BOT_ID : null,
    botSecret: CONFIG.LINEWORKS ? (CONFIG.LINEWORKS.BOT_SECRET ? '設定済み' : '未設定') : null,
    stockChatLogEnabled: CONFIG.STOCK_MANAGEMENT && 
                        CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG && 
                        CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.ENABLED
  };
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
 * Webhookの実行ログを確認
 * 最近のWebhook実行履歴を確認します
 */
function checkWebhookExecutionLogs() {
  logInfo('========================================');
  logInfo('🔍 Webhook実行ログ確認');
  logInfo('========================================');
  logInfo('');
  logInfo('📋 確認方法:');
  logInfo('1. Apps Scriptエディタの「実行」タブを開く');
  logInfo('2. 最近の実行履歴を確認');
  logInfo('3. doPost または handleLineWorksWebhook が実行されているか確認');
  logInfo('');
  logInfo('💡 ログに表示されるべき内容:');
  logInfo('   - 📥 Webhook受信');
  logInfo('   - 📨 メッセージイベント処理開始');
  logInfo('   - ✅ 在庫管理専用チャットログに保存');
  logInfo('');
  logInfo('⚠️ ログが表示されない場合:');
  logInfo('   1. Botがトークルームに追加されているか確認');
  logInfo('   2. LINE WORKS Developer ConsoleでCallback URLが設定されているか確認');
  logInfo('   3. メッセージを送信してから数秒待ってからログを確認');
  logInfo('');
  logInfo('========================================');
  
  // 実行履歴を取得（可能な場合）
  try {
    const executions = ScriptApp.getProjectTriggers();
    logInfo(`設定されているトリガー数: ${executions.length}`);
  } catch (e) {
    logInfo('実行履歴の取得に失敗しました');
  }
}

/**
 * 在庫管理チャットログスプレッドシートを作成
 */
function createStockChatLogSpreadsheet() {
  logInfo('========================================');
  logInfo('📝 在庫管理チャットログスプレッドシート作成');
  logInfo('========================================');
  
  try {
    // 設定確認
    if (!CONFIG.STOCK_MANAGEMENT || !CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG || !CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.ENABLED) {
      logInfo('❌ 在庫管理専用チャットログ機能が無効です');
      return null;
    }
    
    const spreadsheet = getStockChatLogSpreadsheet();
    
    if (spreadsheet) {
      logInfo(`✅ スプレッドシートは既に存在します: ${spreadsheet.getName()}`);
      logInfo(`   URL: ${spreadsheet.getUrl()}`);
      return spreadsheet;
    }
    
    logInfo('❌ スプレッドシートの作成に失敗しました');
    return null;
    
  } catch (error) {
    logError('在庫管理チャットログスプレッドシート作成エラー', error);
    return null;
  }
}

/**
 * 在庫管理チャットログスプレッドシートの状態を確認
 */
function checkStockChatLogSpreadsheet() {
  logInfo('========================================');
  logInfo('🔍 在庫管理チャットログスプレッドシート確認');
  logInfo('========================================');
  
  try {
    // 設定確認
    if (!CONFIG.STOCK_MANAGEMENT || !CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG || !CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.ENABLED) {
      logInfo('❌ 在庫管理専用チャットログ機能が無効です');
      return;
    }
    
    logInfo(`設定チャンネルID: ${CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.CHANNEL_ID}`);
    logInfo(`設定スプレッドシート名: ${CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.SPREADSHEET_NAME}`);
    logInfo(`設定シート名: ${CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.SHEET_NAME}`);
    logInfo('');
    
    // スプレッドシートを取得
    const spreadsheet = getStockChatLogSpreadsheet();
    
    if (!spreadsheet) {
      logInfo('❌ スプレッドシートの取得に失敗しました');
      logInfo('');
      logInfo('📋 対処方法:');
      logInfo('1. createStockChatLogSpreadsheet() を実行してスプレッドシートを作成');
      logInfo('2. 設定を確認（CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG）');
      return;
    }
    
    logInfo(`✅ スプレッドシート取得成功: ${spreadsheet.getName()}`);
    logInfo(`   URL: ${spreadsheet.getUrl()}`);
    logInfo('');
    
    // シートを確認
    const sheet = spreadsheet.getSheetByName(CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.SHEET_NAME);
    
    if (!sheet) {
      logInfo('❌ メッセージ一覧シートが見つかりません');
      logInfo(`   期待されるシート名: ${CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.SHEET_NAME}`);
      logInfo('');
      logInfo('📋 対処方法:');
      logInfo('   initializeStockChatLogSpreadsheet() を実行してシートを初期化');
      return;
    }
    
    logInfo(`✅ シート取得成功: ${sheet.getName()}`);
    
    // データを確認
    const data = sheet.getDataRange().getValues();
    logInfo(`   総行数: ${data.length}行（ヘッダー含む）`);
    
    if (data.length > 1) {
      logInfo(`   データ行数: ${data.length - 1}行`);
      logInfo(`   最新メッセージ: ${data[1][3] ? data[1][3].substring(0, 50) : 'N/A'}...`);
      logInfo(`   最新送信者: ${data[1][1] || 'N/A'}`);
      logInfo(`   最新日時: ${data[1][0] || 'N/A'}`);
    } else {
      logInfo('   ⚠️ データがありません（ヘッダーのみ）');
      logInfo('');
      logInfo('💡 メッセージが保存されない場合:');
      logInfo('1. Botがトークルームに追加されているか確認');
      logInfo('2. LINE WORKS Developer ConsoleでCallback URLが正しく設定されているか確認');
      logInfo('3. testWebhookStockChannel() を実行してテスト');
      logInfo('4. Apps Scriptの実行ログを確認（エラーがないか）');
    }
    
    logInfo('');
    logInfo('========================================');
    
  } catch (error) {
    logError('在庫管理チャットログスプレッドシート確認エラー', error);
  }
}

/**
 * Webhookのテスト（在庫管理専用チャンネル）
 * 在庫管理専用チャンネルのメッセージが正しく保存されるかテスト
 */
function testWebhookStockChannel() {
  logInfo('========================================');
  logInfo('Webhook テスト（在庫管理専用チャンネル）');
  logInfo('========================================');
  
  // 設定確認
  if (!CONFIG.STOCK_MANAGEMENT || 
      !CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG || 
      !CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.ENABLED) {
    logWarning('在庫管理専用チャットログが無効です');
    return false;
  }
  
  const channelId = CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.CHANNEL_ID;
  
  // テストメッセージペイロード（在庫管理専用チャンネル）
  const testPayload = {
    type: 'message',
    source: {
      userId: 'staff@ohisamafarm',
      userName: 'テストユーザー',
      channelId: channelId,
      channelName: '在庫管理専用チャンネル'
    },
    content: {
      type: 'text',
      text: 'みどりの大地にじゃがいも10個入荷しました（テスト）',
      messageId: 'test-stock-msg-' + new Date().getTime()
    }
  };
  
  logInfo(`チャンネルID: ${channelId}`);
  logInfo(`メッセージ: ${testPayload.content.text}`);
  logInfo('');
  
  try {
    handleLineWorksWebhook(testPayload);
    logInfo('✅ 在庫管理専用チャンネルテスト成功！');
    logInfo('');
    logInfo('📝 確認場所:');
    logInfo('「LINE WORKS統合ログ/チャットログ/在庫管理チャットログ」');
    logInfo('「メッセージ一覧」シート');
    logInfo('');
    logInfo('次のステップ:');
    logInfo('2_Stock_Managerプロジェクトで testAnalyzeStockChatLog() を実行');
    logInfo('→ メッセージを解析して在庫管理システムに反映');
    
    return true;
  } catch (error) {
    logError('在庫管理専用チャンネルテスト失敗', error);
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


