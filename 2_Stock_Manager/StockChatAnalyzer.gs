/**
 * 在庫管理専用チャットログ解析システム
 * 在庫管理専用チャンネルのメッセージを解析して在庫管理システムに反映
 */

/**
 * 在庫管理専用チャットログにテスト用メッセージを追加
 * テスト用のメッセージを在庫管理専用チャットログスプレッドシートに追加します
 */
function addTestMessagesToStockChatLog() {
  Logger.log('========================================');
  Logger.log('📝 テスト用メッセージ追加開始');
  Logger.log('========================================');
  
  try {
    // 設定確認
    if (!CONFIG.STOCK_MANAGEMENT || !CONFIG.STOCK_MANAGEMENT.ENABLED) {
      Logger.log('⚠️ 在庫管理機能が無効です。');
      return;
    }
    
    if (!CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG || !CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.ENABLED) {
      Logger.log('⚠️ 在庫管理専用チャットログ機能が無効です。');
      return;
    }
    
    // 在庫管理専用チャットログスプレッドシートを取得
    const stockChatLogSpreadsheet = getStockChatLogSpreadsheet();
    if (!stockChatLogSpreadsheet) {
      Logger.log('❌ 在庫管理専用チャットログスプレッドシートが見つかりません');
      Logger.log('   1_LineLog_Collectorプロジェクトでメッセージが保存されているか確認してください。');
      return;
    }
    
    const chatLogSheet = stockChatLogSpreadsheet.getSheetByName(CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.SHEET_NAME);
    if (!chatLogSheet) {
      Logger.log('❌ メッセージ一覧シートが見つかりません');
      return;
    }
    
    // テスト用メッセージ
    const testMessages = [
      {
        date: new Date(),
        sender: 'テストユーザー1',
        room: '在庫管理チャンネル',
        message: 'みどりの大地にじゃがいも10個入荷しました',
        attachment: '',
        messageId: 'test-msg-1',
        channelId: CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.CHANNEL_ID,
        keywords: 'じゃがいも,みどりの大地,入荷',
        category: '在庫補充',
        processed: '' // 未処理
      },
      {
        date: new Date(),
        sender: 'テストユーザー2',
        room: '在庫管理チャンネル',
        message: '四季彩 尾平店に白ねぎ5個補充',
        attachment: '',
        messageId: 'test-msg-2',
        channelId: CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.CHANNEL_ID,
        keywords: '白ねぎ,四季彩,補充',
        category: '在庫補充',
        processed: '' // 未処理
      },
      {
        date: new Date(),
        sender: 'テストユーザー3',
        room: '在庫管理チャンネル',
        message: 'エーコープにサツマイモ20個納品',
        attachment: '',
        messageId: 'test-msg-3',
        channelId: CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.CHANNEL_ID,
        keywords: 'サツマイモ,エーコープ,納品',
        category: '在庫補充',
        processed: '' // 未処理
      }
    ];
    
    // LINE WORKSチャンネルにメッセージを送信（オプション）
    // 注意: LINE WORKS Bot APIの認証にはJWT署名が必要です
    // 1_LineLog_CollectorプロジェクトのgetBotAccessToken関数を使用するか、
    // または手動でLINE WORKSチャンネルにメッセージを投稿してください
    const sendToLineWorks = false; // LINE WORKSに送信するかどうか（認証情報が設定されていない場合はfalse）
    
    // メッセージを追加（最新が上に来るように）
    testMessages.forEach((msg, index) => {
      const row = [
        msg.date,
        msg.sender,
        msg.room,
        msg.message,
        msg.attachment,
        msg.messageId,
        msg.channelId,
        msg.keywords,
        msg.category,
        msg.processed
      ];
      
      chatLogSheet.insertRowAfter(1);
      chatLogSheet.getRange(2, 1, 1, row.length).setValues([row]);
      
      Logger.log(`✅ テストメッセージ${index + 1}を追加: ${msg.message.substring(0, 30)}...`);
      
      // LINE WORKSチャンネルにメッセージを送信
      if (sendToLineWorks && typeof sendLineWorksChannelMessage === 'function') {
        try {
          const channelId = CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.CHANNEL_ID;
          if (channelId) {
            const success = sendLineWorksChannelMessage(channelId, msg.message);
            if (success) {
              Logger.log(`   📤 LINE WORKSチャンネルに送信成功`);
            } else {
              Logger.log(`   ⚠️ LINE WORKSチャンネルへの送信に失敗`);
            }
          }
        } catch (e) {
          Logger.log(`   ⚠️ LINE WORKS送信エラー: ${e.message}`);
        }
      }
    });
    
    Logger.log('');
    Logger.log('========================================');
    Logger.log('✅ テスト用メッセージ追加完了');
    Logger.log('========================================');
    Logger.log(`追加件数: ${testMessages.length}件`);
    Logger.log(`LINE WORKS送信: ${sendToLineWorks ? '有効' : '無効（認証情報が設定されていないため）'}`);
    Logger.log('');
    Logger.log('📝 注意: テストメッセージはスプレッドシートに追加されました。');
    Logger.log('   LINE WORKSチャンネルにメッセージを送信する場合は、');
    Logger.log('   1_LineLog_Collectorプロジェクトでチャット同期を実行するか、');
    Logger.log('   手動でLINE WORKSチャンネルにメッセージを投稿してください。');
    Logger.log('');
    Logger.log('次のステップ: testAnalyzeStockChatLog() を実行して解析をテストしてください。');
    
    return testMessages.length;
    
  } catch (error) {
    Logger.log(`❌ テストメッセージ追加エラー: ${error.toString()}`);
    Logger.log(`スタックトレース: ${error.stack}`);
    throw error;
  }
}

/**
 * 在庫管理専用チャットログスプレッドシートを手動で作成
 * スプレッドシートが存在しない場合に実行してください
 */
function createStockChatLogSpreadsheet() {
  Logger.log('========================================');
  Logger.log('📝 在庫管理専用チャットログスプレッドシート作成');
  Logger.log('========================================');
  
  try {
    // 設定確認
    if (!CONFIG.STOCK_MANAGEMENT || !CONFIG.STOCK_MANAGEMENT.ENABLED) {
      Logger.log('⚠️ 在庫管理機能が無効です。');
      return;
    }
    
    if (!CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG || !CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.ENABLED) {
      Logger.log('⚠️ 在庫管理専用チャットログ機能が無効です。');
      return;
    }
    
    Logger.log(`専用スプレッドシート名: ${CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.SPREADSHEET_NAME}`);
    Logger.log(`シート名: ${CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.SHEET_NAME}`);
    Logger.log('');
    
    // スプレッドシートを取得または作成
    const spreadsheet = getStockChatLogSpreadsheet();
    
    if (spreadsheet) {
      Logger.log(`✅ スプレッドシート取得成功: ${spreadsheet.getName()}`);
      Logger.log(`   URL: ${spreadsheet.getUrl()}`);
      Logger.log('');
      Logger.log('========================================');
      Logger.log('✅ スプレッドシート作成完了');
      Logger.log('========================================');
      return spreadsheet;
    } else {
      Logger.log('❌ スプレッドシートの作成に失敗しました');
      return null;
    }
    
  } catch (error) {
    Logger.log(`❌ スプレッドシート作成エラー: ${error.toString()}`);
    Logger.log(`スタックトレース: ${error.stack}`);
    throw error;
  }
}

/**
 * 在庫管理専用チャットログ解析機能のテスト
 */
function testAnalyzeStockChatLog() {
  Logger.log('========================================');
  Logger.log('🧪 在庫管理専用チャットログ解析テスト開始');
  Logger.log('========================================');
  
  try {
    // 設定確認
    if (!CONFIG.STOCK_MANAGEMENT || !CONFIG.STOCK_MANAGEMENT.ENABLED) {
      Logger.log('⚠️ 在庫管理機能が無効です。');
      return;
    }
    
    if (!CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG || !CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.ENABLED) {
      Logger.log('⚠️ 在庫管理専用チャットログ機能が無効です。');
      return;
    }
    
    Logger.log(`専用チャンネルID: ${CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.CHANNEL_ID}`);
    Logger.log(`専用スプレッドシート名: ${CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.SPREADSHEET_NAME}`);
    Logger.log(`シート名: ${CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.SHEET_NAME}`);
    Logger.log('');
    
    // 在庫管理専用チャットログスプレッドシートを取得
    const stockChatLogSpreadsheet = getStockChatLogSpreadsheet();
    if (!stockChatLogSpreadsheet) {
      Logger.log('❌ 在庫管理専用チャットログスプレッドシートが見つかりません');
      Logger.log('   1_LineLog_Collectorプロジェクトでメッセージが保存されているか確認してください。');
      return;
    }
    
    Logger.log(`✅ スプレッドシート取得成功: ${stockChatLogSpreadsheet.getName()}`);
    Logger.log(`   URL: ${stockChatLogSpreadsheet.getUrl()}`);
    Logger.log('');
    
    const chatLogSheet = stockChatLogSpreadsheet.getSheetByName(CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.SHEET_NAME);
    if (!chatLogSheet) {
      Logger.log('❌ メッセージ一覧シートが見つかりません');
      return;
    }
    
    Logger.log(`✅ シート取得成功: ${chatLogSheet.getName()}`);
    
    // データを確認
    const data = chatLogSheet.getDataRange().getValues();
    Logger.log(`   総行数: ${data.length}行（ヘッダー含む）`);
    
    if (data.length > 1) {
      Logger.log(`   データ行数: ${data.length - 1}行`);
      Logger.log(`   最新メッセージ: ${data[1][3] ? data[1][3].substring(0, 50) : 'N/A'}...`);
    } else {
      Logger.log('   ⚠️ データがありません');
    }
    
    Logger.log('');
    Logger.log('========================================');
    Logger.log('📦 解析処理を実行します...');
    Logger.log('========================================');
    Logger.log('');
    
    // 解析処理を実行
    const result = analyzeStockChatLog();
    
    Logger.log('');
    Logger.log('========================================');
    Logger.log('📊 テスト結果');
    Logger.log('========================================');
    Logger.log(`チェック: ${result.messagesChecked}件`);
    Logger.log(`処理: ${result.messagesProcessed}件`);
    Logger.log(`更新商品: ${result.itemsUpdated}件`);
    
    if (result.errors.length > 0) {
      Logger.log(`エラー: ${result.errors.length}件`);
      result.errors.forEach(err => Logger.log(`  - ${err}`));
    }
    
    Logger.log('========================================');
    
    return result;
    
  } catch (error) {
    Logger.log(`❌ テスト実行エラー: ${error.toString()}`);
    Logger.log(`スタックトレース: ${error.stack}`);
    throw error;
  }
}

/**
 * 在庫管理専用チャットログを解析して在庫管理システムに反映
 * @return {Object} 処理結果の統計情報
 */
function analyzeStockChatLog() {
  logInfo('========================================');
  logInfo('📦 在庫管理専用チャットログ解析開始');
  logInfo('========================================');
  
  const startTime = new Date();
  const stats = {
    messagesChecked: 0,
    messagesProcessed: 0,
    itemsUpdated: 0,
    errors: []
  };
  
  try {
    // 設定チェック
    if (!CONFIG.STOCK_MANAGEMENT || !CONFIG.STOCK_MANAGEMENT.ENABLED) {
      logInfo('在庫管理機能が無効です');
      return stats;
    }
    
    if (!CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG || !CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.ENABLED) {
      logInfo('在庫管理専用チャットログ機能が無効です');
      return stats;
    }
    
    // 在庫管理専用チャットログスプレッドシートを取得
    const stockChatLogSpreadsheet = getStockChatLogSpreadsheet();
    if (!stockChatLogSpreadsheet) {
      logWarning('在庫管理専用チャットログスプレッドシートが見つかりません');
      return stats;
    }
    
    const chatLogSheet = stockChatLogSpreadsheet.getSheetByName(CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.SHEET_NAME);
    if (!chatLogSheet) {
      logWarning('在庫管理専用チャットログのメッセージ一覧シートが見つかりません');
      return stats;
    }
    
    // 未処理のメッセージを取得
    const unprocessedMessages = getUnprocessedStockChatMessages(chatLogSheet);
    stats.messagesChecked = unprocessedMessages.length;
    
    logInfo(`未処理メッセージ: ${unprocessedMessages.length}件`);
    
    if (unprocessedMessages.length === 0) {
      logInfo('処理対象のメッセージはありません');
      return stats;
    }
    
    // 在庫管理スプレッドシートを取得
    const stockSpreadsheet = getStockManagementSpreadsheet();
    if (!stockSpreadsheet) {
      throw new Error('在庫管理スプレッドシートが見つかりません');
    }
    
    const stockSheet = stockSpreadsheet.getSheetByName(CONFIG.STOCK_MANAGEMENT.SHEET_STOCK);
    const logSheet = stockSpreadsheet.getSheetByName(CONFIG.STOCK_MANAGEMENT.SHEET_LOG);
    
    if (!stockSheet || !logSheet) {
      throw new Error('必要なシートが見つかりません（在庫管理・売上履歴）');
    }
    
    // 在庫マスタデータを読み込み
    const stockMap = loadStockMaster(stockSheet);
    logInfo(`登録商品数: ${stockMap.size}件`);
    
    // 各メッセージを処理
    unprocessedMessages.forEach((messageData, index) => {
      try {
        logInfo(`\n[${index + 1}/${unprocessedMessages.length}] メッセージ処理中`);
        logInfo(`  送信者: ${messageData.senderName}`);
        logInfo(`  メッセージ: ${messageData.messageText.substring(0, 50)}...`);
        
        // 在庫更新処理（在庫管理専用チャンネルからのメッセージを処理）
        const updateResult = processStockChatMessage(
          messageData.messageText,
          messageData.senderName,
          messageData.date,
          stockSpreadsheet,
          stockSheet,
          logSheet,
          stockMap
        );
        
        if (updateResult) {
          stats.itemsUpdated++;
          stats.messagesProcessed++;
          
          // メッセージを処理済みとしてマーク
          markStockChatMessageAsProcessed(chatLogSheet, messageData.rowIndex);
          
          logInfo(`  ✅ 在庫更新完了: ${updateResult.message}`);
        } else {
          logInfo(`  ⏭️  在庫更新対象外のメッセージ`);
        }
        
      } catch (error) {
        logError(`メッセージ処理エラー (行${messageData.rowIndex})`, error);
        stats.errors.push(`行${messageData.rowIndex}: ${error.message}`);
      }
    });
    
  } catch (error) {
    logError('在庫管理専用チャットログ解析エラー', error);
    stats.errors.push(error.message);
    throw error;
  }
  
  // 結果サマリー
  const duration = ((new Date() - startTime) / 1000).toFixed(1);
  
  logInfo('\n========================================');
  logInfo('📊 在庫管理専用チャットログ解析完了');
  logInfo('========================================');
  logInfo(`チェック: ${stats.messagesChecked}件`);
  logInfo(`処理: ${stats.messagesProcessed}件`);
  logInfo(`更新商品: ${stats.itemsUpdated}件`);
  logInfo(`処理時間: ${duration}秒`);
  
  if (stats.errors.length > 0) {
    logInfo(`エラー: ${stats.errors.length}件`);
  }
  
  logInfo('========================================');
  
  return stats;
}

/**
 * 未処理の在庫管理チャットメッセージを取得
 * @param {Sheet} chatLogSheet チャットログシート
 * @return {Array} 未処理のメッセージデータ配列
 */
function getUnprocessedStockChatMessages(chatLogSheet) {
  const data = chatLogSheet.getDataRange().getValues();
  const headers = data[0];
  
  // ヘッダーから列インデックスを取得
  const dateIndex = headers.indexOf('日時');
  const senderIndex = headers.indexOf('送信者');
  const messageIndex = headers.indexOf('メッセージ');
  const processedIndex = headers.indexOf('処理済み');
  
  if (dateIndex === -1 || senderIndex === -1 || messageIndex === -1) {
    logWarning('必要な列が見つかりません（日時、送信者、メッセージ）');
    return [];
  }
  
  const unprocessedMessages = [];
  
  // 2行目からデータを取得（1行目はヘッダー）
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const processed = processedIndex >= 0 ? row[processedIndex] : '';
    
    // 処理済みフラグがない、または空の場合のみ処理
    if (!processed || processed === '' || processed === false) {
      const messageText = row[messageIndex] || '';
      
      // メッセージが空の場合はスキップ
      if (messageText && messageText.trim() !== '' && messageText !== '[画像/ファイル]') {
        const messageData = {
          rowIndex: i + 1, // スプレッドシートの行番号（1ベース）
          date: row[dateIndex],
          senderName: row[senderIndex] || '不明',
          messageText: messageText
        };
        
        unprocessedMessages.push(messageData);
      }
    }
  }
  
  return unprocessedMessages;
}

/**
 * メッセージを処理済みとしてマーク
 * @param {Sheet} chatLogSheet チャットログシート
 * @param {number} rowIndex 行番号（1ベース）
 */
function markStockChatMessageAsProcessed(chatLogSheet, rowIndex) {
  try {
    const headers = chatLogSheet.getRange(1, 1, 1, chatLogSheet.getLastColumn()).getValues()[0];
    const processedIndex = headers.indexOf('処理済み');
    
    if (processedIndex === -1) {
      // 「処理済み」列がない場合は追加
      const lastColumn = chatLogSheet.getLastColumn();
      chatLogSheet.getRange(1, lastColumn + 1).setValue('処理済み');
      chatLogSheet.getRange(1, lastColumn + 1).setFontWeight('bold');
      chatLogSheet.getRange(rowIndex, lastColumn + 1).setValue('✓');
    } else {
      chatLogSheet.getRange(rowIndex, processedIndex + 1).setValue('✓');
    }
  } catch (error) {
    logError('処理済みマークエラー', error);
  }
}

/**
 * 在庫管理専用チャットログスプレッドシートを取得または作成
 * @return {Spreadsheet|null} スプレッドシート
 */
function getStockChatLogSpreadsheet() {
  try {
    // 2_Stock_Managerプロジェクト内で実装
    // 注意: 1_LineLog_Collectorの関数は別プロジェクトなので直接呼び出せない
    // スプレッドシート名で検索する
    const folderPath = CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/' + CONFIG.GOOGLE_DRIVE.CHAT_LOG_FOLDER;
    const folder = getOrCreateFolder(folderPath);
    const fileName = CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.SPREADSHEET_NAME;
    
    const files = folder.getFilesByName(fileName);
    if (files.hasNext()) {
      const file = files.next();
      return SpreadsheetApp.openById(file.getId());
    }
    
    // スプレッドシートが存在しない場合は作成
    logInfo(`在庫管理専用チャットログスプレッドシートが見つかりません。新規作成します: ${fileName}`);
    const spreadsheet = SpreadsheetApp.create(fileName);
    DriveApp.getFileById(spreadsheet.getId()).moveTo(folder);
    initializeStockChatLogSpreadsheet(spreadsheet);
    logInfo('在庫管理専用チャットログスプレッドシートを新規作成しました');
    
    return spreadsheet;
    
  } catch (error) {
    logError('在庫管理専用チャットログスプレッドシート取得エラー', error);
    return null;
  }
}

/**
 * 在庫管理専用チャットログスプレッドシートを初期化
 * @param {Spreadsheet} spreadsheet スプレッドシート
 */
function initializeStockChatLogSpreadsheet(spreadsheet) {
  // シート1: メッセージ一覧
  const messageSheet = spreadsheet.getActiveSheet();
  messageSheet.setName(CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.SHEET_NAME);
  messageSheet.getRange('A1:J1').setValues([[
    '日時', '送信者', 'ルーム名', 'メッセージ', '添付ファイル',
    'メッセージID', 'チャンネルID', 'キーワード', 'カテゴリ', '処理済み'
  ]]);
  messageSheet.setFrozenRows(1);
  messageSheet.getRange('A1:J1').setFontWeight('bold');
  messageSheet.getRange('A1:J1').setBackground('#4285f4');
  messageSheet.getRange('A1:J1').setFontColor('#ffffff');
  
  // スプレッドシート全体の設定
  spreadsheet.setSpreadsheetTimeZone('Asia/Tokyo');
  spreadsheet.setActiveSheet(messageSheet);
}

/**
 * 在庫管理専用チャットメッセージを処理
 * @param {string} messageText メッセージテキスト
 * @param {string} senderName 送信者名
 * @param {Date} date 日付
 * @param {Spreadsheet} spreadsheet 在庫管理スプレッドシート
 * @param {Sheet} stockSheet 在庫管理シート
 * @param {Sheet} logSheet 売上履歴シート
 * @param {Map} stockMap 在庫マスタマップ
 * @return {Object|null} 更新結果
 */
/**
 * 在庫状況と補充数量を抽出
 * @param {string} messageText メッセージテキスト
 * @param {string} itemName 商品名
 * @return {Object} {status: 'shortage'|'unknown'|'supplement'|'normal', quantity: number}
 */
function extractStockStatusAndQuantity(messageText, itemName) {
  const text = messageText.toLowerCase();
  const escapedName = itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // 在庫不足のキーワード
  const shortageKeywords = ['足りない', '足りなくなった', '不足', '切れた', 'なくなった', '無くなった'];
  
  // 在庫不明のキーワード
  const unknownKeywords = ['いくつあるかわからない', 'いくつかわからない', '不明', '確認したい', '確認して', '数がわからない', '数不明'];
  
  // 補充・追加のキーワード
  const supplementKeywords = ['追加', '入荷', '補充', '納品', '置きました', '納入', '搬入', '入れた', '入れたよ'];
  
  // 在庫不足の判定
  const hasShortage = shortageKeywords.some(kw => text.includes(kw));
  const hasUnknown = unknownKeywords.some(kw => text.includes(kw));
  
  // まず数量を抽出（「いくつあるかわからない」があっても数量が記載されている場合は抽出）
  let quantity = 0;
  
  // パターン1: 商品名の後に数字＋単位（追加・入荷・補充などのキーワード付き）
  const supplementPattern1 = new RegExp(
    escapedName + '[\\s\\S]{0,50}?(\\d+)\\s*(点|個|袋|束|本|パック|ヶ|箱|ケース)\\s*(追加|入荷|補充|納品|置きました|納入|搬入|入れた)',
    'i'
  );
  const match1 = messageText.match(supplementPattern1);
  if (match1) {
    quantity = parseInt(match1[1], 10);
    // 「いくつあるかわからない」があっても数量が記載されている場合は補充として扱う
    return { status: 'supplement', quantity: quantity };
  }
  
  // パターン2: 追加・入荷・補充などのキーワードの後に数字＋単位＋商品名
  const supplementPattern2 = new RegExp(
    '(追加|入荷|補充|納品|置きました|納入|搬入|入れた)[\\s\\S]{0,50}?(\\d+)\\s*(点|個|袋|束|本|パック|ヶ|箱|ケース)[\\s\\S]{0,50}?' + escapedName,
    'i'
  );
  const match2 = messageText.match(supplementPattern2);
  if (match2) {
    quantity = parseInt(match2[2], 10);
    // 「いくつあるかわからない」があっても数量が記載されている場合は補充として扱う
    return { status: 'supplement', quantity: quantity };
  }
  
  // パターン3: 「いくつあるかわからない」+ 数量のパターン
  // 「いくつあるかわからないが○個追加した」のような場合
  const unknownWithQuantityPattern = new RegExp(
    '(いくつあるかわからない|いくつかわからない|数がわからない)[\\s\\S]{0,50}?(\\d+)\\s*(点|個|袋|束|本|パック|ヶ|箱|ケース)[\\s\\S]{0,50}?' + escapedName,
    'i'
  );
  const match3 = messageText.match(unknownWithQuantityPattern);
  if (match3) {
    quantity = parseInt(match3[2], 10);
    // 「いくつあるかわからない」があっても数量が記載されている場合は補充として扱う
    return { status: 'supplement', quantity: quantity };
  }
  
  // パターン4: 商品名の後に数字＋単位（一般的なパターン）
  const generalPattern = new RegExp(
    escapedName + '[\\s\\S]{0,50}?(\\d+)\\s*(点|個|袋|束|本|パック|ヶ|箱|ケース)',
    'i'
  );
  const match4 = messageText.match(generalPattern);
  if (match4) {
    quantity = parseInt(match4[1], 10);
    // 補充キーワードがある場合は補充、そうでなければ通常の数量
    const hasSupplementKeyword = supplementKeywords.some(kw => messageText.includes(kw));
    // 「いくつあるかわからない」があっても数量が記載されている場合は補充として扱う
    if (hasUnknown && quantity > 0) {
      return { status: 'supplement', quantity: quantity };
    }
    return { 
      status: hasSupplementKeyword ? 'supplement' : 'normal', 
      quantity: quantity 
    };
  }
  
  // パターン5: 「いくつあるかわからない」+ 数量（逆順）
  // 「○個追加したけどいくつあるかわからない」のような場合
  const quantityWithUnknownPattern = new RegExp(
    '(\\d+)\\s*(点|個|袋|束|本|パック|ヶ|箱|ケース)[\\s\\S]{0,50}?(いくつあるかわからない|いくつかわからない|数がわからない)[\\s\\S]{0,50}?' + escapedName,
    'i'
  );
  const match5 = messageText.match(quantityWithUnknownPattern);
  if (match5) {
    quantity = parseInt(match5[1], 10);
    // 「いくつあるかわからない」があっても数量が記載されている場合は補充として扱う
    return { status: 'supplement', quantity: quantity };
  }
  
  // 在庫不足の判定（数量が抽出できなかった場合）
  if (hasShortage) {
    return { 
      status: 'shortage', 
      quantity: 0 
    };
  }
  
  // 在庫不明の判定（数量が抽出できなかった場合）
  if (hasUnknown) {
    return { 
      status: 'unknown', 
      quantity: 0 
    };
  }
  
  // デフォルト
  return { status: 'normal', quantity: 0 };
}

function processStockChatMessage(messageText, senderName, date, spreadsheet, stockSheet, logSheet, stockMap) {
  try {
    logInfo(`[DEBUG] 在庫管理チャットメッセージ処理開始: "${messageText}"`);
    
    // キーワードチェック（出荷・持っていった等を追加）
    const keywords = ['入荷', '補充', '納品', '置きました', '追加', '出荷', '持っていった', '納入', '搬入', '足りない', '足りなくなった', 'いくつあるかわからない', '不明'];
    const hasKeyword = keywords.some(kw => messageText.includes(kw));
    
    // 店舗判定
    let storeName = detectStoreName({ subject: '', body: messageText }, spreadsheet);
    logInfo(`[DEBUG] 店舗判定結果: ${storeName}`);
    
    // キーワードがなく、かつ店舗も特定できない場合はスキップ
    if (!hasKeyword && (!storeName || storeName === '不明な店舗')) {
      logInfo(`[DEBUG] キーワードも店舗名も見つからないためスキップ`);
      return null;
    }
    
    if (!storeName || storeName === '不明な店舗') {
      logInfo(`[DEBUG] 店舗名が検出できません`);
      return null;
    }
    
    let updated = false;
    let resultMessage = '';
    const processedItems = new Set();
    
    // 店舗名を正規化（全角スペースを半角スペースに変換）
    const normalizedStoreName = storeName.replace(/　/g, ' ').trim();
    
    // 商品解析
    stockMap.forEach((stockInfo, key) => {
      const [itemStore, itemName] = key.split('_');
      
      // 店舗名も正規化して比較
      const normalizedItemStore = itemStore.replace(/　/g, ' ').trim();
      
      // 店舗が一致
      if (normalizedItemStore === normalizedStoreName) {
        // 商品名または別名キーワードでマッチング
        let matchedName = '';
        if (messageText.includes(itemName)) {
          matchedName = itemName;
        } else if (stockInfo.keywords && stockInfo.keywords.length > 0) {
          for (const kw of stockInfo.keywords) {
            if (messageText.includes(kw)) {
              matchedName = kw;
              break;
            }
          }
        }
        
        if (matchedName) {
          if (processedItems.has(itemName)) return;
          
          // 在庫状況と数量を抽出
          const stockInfo_extracted = extractStockStatusAndQuantity(messageText, matchedName);
          logInfo(`[DEBUG] 商品検知: ${itemName} (KW:${matchedName}), 状況: ${stockInfo_extracted.status}, 数量: ${stockInfo_extracted.quantity}`);
          
          const currentStock = parseInt(stockInfo.currentStock, 10) || 0;
          let newStock = currentStock;
          let updateStock = false;
          let logMessage = '';
          
          // 状況に応じて処理
          if (stockInfo_extracted.status === 'supplement' && stockInfo_extracted.quantity > 0) {
            // 補充: 在庫を増やす
            newStock = currentStock + stockInfo_extracted.quantity;
            updateStock = true;
            logMessage = `補充: +${stockInfo_extracted.quantity}個`;
          } else if (stockInfo_extracted.status === 'shortage') {
            // 在庫不足: ログに記録するが在庫は変更しない
            updateStock = false;
            logMessage = `在庫不足の報告（在庫: ${currentStock}個）`;
          } else if (stockInfo_extracted.status === 'unknown') {
            // 在庫不明: ログに記録するが在庫は変更しない
            updateStock = false;
            logMessage = `在庫数不明の報告（現在庫: ${currentStock}個）`;
          } else if (stockInfo_extracted.quantity > 0) {
            // 通常の数量指定: 補充として扱う
            newStock = currentStock + stockInfo_extracted.quantity;
            updateStock = true;
            logMessage = `補充: +${stockInfo_extracted.quantity}個`;
          }
          
          if (updateStock || stockInfo_extracted.status === 'shortage' || stockInfo_extracted.status === 'unknown') {
            
            // ヘッダーから列インデックスを動的に取得
            const headers = stockSheet.getRange(1, 1, 1, stockSheet.getLastColumn()).getValues()[0];
            const stockColIndex = (headers.indexOf('現在庫') >= 0 ? headers.indexOf('現在庫') + 1 : 
                                  (headers.indexOf('在庫数') >= 0 ? headers.indexOf('在庫数') + 1 : 4));
            const lastUpdateColIndex = headers.indexOf('最終更新日時') >= 0 ? headers.indexOf('最終更新日時') + 1 : 6;
            
            // 在庫を更新する場合のみシート更新
            if (updateStock) {
              stockSheet.getRange(stockInfo.rowIndex, stockColIndex).setValue(newStock);
              stockSheet.getRange(stockInfo.rowIndex, lastUpdateColIndex).setValue(new Date());
            }
            
            // ログ記録
            const logHeaders = logSheet.getRange(1, 1, 1, logSheet.getLastColumn()).getValues()[0];
            const hasUnitPrice = logHeaders.includes('単価');
            const hasSalesAmount = logHeaders.includes('売上金額');
            
            // 販売数・単価・売上金額の設定
            let salesCount = '';
            let unitPrice = 0;
            let salesAmount = 0;
            
            if (stockInfo_extracted.status === 'supplement' && stockInfo_extracted.quantity > 0) {
              salesCount = `+${stockInfo_extracted.quantity}`;
            } else if (stockInfo_extracted.status === 'shortage') {
              salesCount = '在庫不足';
            } else if (stockInfo_extracted.status === 'unknown') {
              salesCount = '在庫不明';
            } else {
              salesCount = `+${stockInfo_extracted.quantity}`;
            }
            
            if (hasUnitPrice && hasSalesAmount) {
              logSheet.appendRow([
                date,
                storeName,
                itemName,
                salesCount,
                unitPrice, // 単価（補充・報告時は0）
                salesAmount, // 売上金額（補充・報告時は0）
                updateStock ? newStock : currentStock,
                `チャット報告: ${senderName} - ${logMessage}`
              ]);
            } else {
              logSheet.appendRow([
                date,
                storeName,
                itemName,
                salesCount,
                updateStock ? newStock : currentStock,
                `チャット報告: ${senderName} - ${logMessage}`
              ]);
            }
            
            updated = true;
            resultMessage = `${itemName} ${logMessage} (在庫: ${updateStock ? newStock : currentStock})`;
            processedItems.add(itemName);
            logInfo(`📦 在庫管理チャット更新: ${storeName} ${itemName} ${logMessage}`);
          }
        }
      }
    });
    
    if (updated) {
      return {
        storeName: storeName,
        message: resultMessage
      };
    }
    
    return null;
    
  } catch (error) {
    logError('在庫管理チャットメッセージ処理エラー', error);
    return null;
  }
}

/**
 * フォルダを取得または作成（2_Stock_Manager用）
 * @param {string} folderPath スラッシュ区切りのフォルダパス
 * @return {GoogleAppsScript.Drive.Folder} フォルダオブジェクト
 */
function getOrCreateFolder(folderPath) {
  const parts = folderPath.split('/').filter(p => p);
  let currentFolder = DriveApp.getRootFolder();
  
  parts.forEach(part => {
    const folders = currentFolder.getFoldersByName(part);
    if (folders.hasNext()) {
      currentFolder = folders.next();
    } else {
      currentFolder = currentFolder.createFolder(part);
      logInfo(`フォルダ作成: ${part}`);
    }
  });
  
  return currentFolder;
}

