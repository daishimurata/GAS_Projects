/**
 * チャットログ保存処理
 * スプレッドシート、テキストファイル、添付ファイルの保存機能
 */

/**
 * マスタースプレッドシートを取得または作成
 * @return {GoogleAppsScript.Spreadsheet.Spreadsheet} スプレッドシート
 */
function getMasterSpreadsheet() {
  const folder = getOrCreateFolder(
    CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/' + 
    CONFIG.GOOGLE_DRIVE.CHAT_LOG_FOLDER
  );
  const fileName = CONFIG.GOOGLE_DRIVE.MASTER_SPREADSHEET_NAME;
  
  let spreadsheet;
  const file = findFileInFolder(folder, fileName);
  
  if (file) {
    spreadsheet = SpreadsheetApp.open(file);
  } else {
    spreadsheet = SpreadsheetApp.create(fileName);
    DriveApp.getFileById(spreadsheet.getId()).moveTo(folder);
    initializeMasterSpreadsheet(spreadsheet);
    logInfo('マスタースプレッドシートを新規作成しました');
  }
  
  return spreadsheet;
}

/**
 * 在庫管理専用チャットログスプレッドシートを取得または作成
 * @return {GoogleAppsScript.Spreadsheet.Spreadsheet} スプレッドシート
 */
function getStockChatLogSpreadsheet() {
  if (!CONFIG.STOCK_MANAGEMENT || !CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG || !CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.ENABLED) {
    return null;
  }
  
  const folder = getOrCreateFolder(
    CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/' + 
    CONFIG.GOOGLE_DRIVE.CHAT_LOG_FOLDER
  );
  const fileName = CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.SPREADSHEET_NAME;
  
  let spreadsheet;
  const file = findFileInFolder(folder, fileName);
  
  if (file) {
    spreadsheet = SpreadsheetApp.open(file);
  } else {
    spreadsheet = SpreadsheetApp.create(fileName);
    DriveApp.getFileById(spreadsheet.getId()).moveTo(folder);
    initializeStockChatLogSpreadsheet(spreadsheet);
    logInfo('在庫管理専用チャットログスプレッドシートを新規作成しました');
  }
  
  return spreadsheet;
}

/**
 * 在庫管理専用チャットログスプレッドシートを初期化
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet スプレッドシート
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
 * 在庫管理専用チャンネルのメッセージを専用スプレッドシートに保存
 * @param {Object} channel チャンネル情報
 * @param {Array} messages メッセージリスト
 * @return {number} 保存されたメッセージ数
 */
function saveStockChatMessagesToSpreadsheet(channel, messages) {
  if (!CONFIG.STOCK_MANAGEMENT || !CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG || !CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.ENABLED) {
    return 0;
  }
  
  const spreadsheet = getStockChatLogSpreadsheet();
  if (!spreadsheet) {
    return 0;
  }
  
  const sheet = spreadsheet.getSheetByName(CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.SHEET_NAME);
  if (!sheet) {
    throw new Error('在庫管理チャットログのメッセージ一覧シートが見つかりません');
  }
  
  const rows = [];
  
  messages.forEach(msg => {
    try {
      // キーワード抽出
      const keywords = CONFIG.GEMINI_OPTIMIZATION.ENABLE_KEYWORD_EXTRACTION ?
        extractKeywords(msg.text || '') : [];
      
      // カテゴリ分類
      const category = CONFIG.GEMINI_OPTIMIZATION.ENABLE_AUTO_CATEGORIZATION ?
        categorizeMessage(msg.text || '') : '';
      
      // 添付ファイル情報
      const attachmentInfo = msg.attachments && msg.attachments.length > 0 ?
        `${msg.attachments.length}件` : '';
      
      // 送信者名を取得して正規化
      let senderName = '不明';
      if (msg.user) {
        senderName = msg.user.displayName || msg.user.userId || '不明';
      } else if (msg.userName) {
        senderName = msg.userName;
      } else if (msg.senderName) {
        senderName = msg.senderName;
      }
      
      // 名前マッピングを適用
      if (typeof normalizeName === 'function') {
        senderName = normalizeName(senderName);
      }
      
      rows.push([
        new Date(msg.createdTime || msg.sendTime),
        senderName,
        channel.name || channel.channelId,
        msg.text || '[画像/ファイル]',
        attachmentInfo,
        msg.messageId,
        channel.channelId,
        keywords.join(', '),
        category,
        '' // 処理済みフラグ（空=未処理）
      ]);
    } catch (error) {
      logError(`在庫管理チャットメッセージ処理エラー: ${msg.messageId}`, error);
    }
  });
  
  if (rows.length > 0) {
    rows.reverse();
    
    // 既存データの上に挿入
    sheet.insertRowsAfter(1, rows.length);
    sheet.getRange(2, 1, rows.length, 10).setValues(rows);
    
    logInfo(`在庫管理専用チャットログに${rows.length}件のメッセージを保存`);
  }
  
  return rows.length;
}

/**
 * マスタースプレッドシートを初期化
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet スプレッドシート
 */
function initializeMasterSpreadsheet(spreadsheet) {
  // シート1: メッセージ一覧
  const messageSheet = spreadsheet.getActiveSheet();
  messageSheet.setName('メッセージ一覧');
  messageSheet.getRange('A1:J1').setValues([[
    '日時', '送信者', 'ルーム名', 'メッセージ', '添付ファイル',
    'メッセージID', 'チャンネルID', 'キーワード', 'カテゴリ', 'URL'
  ]]);
  messageSheet.setFrozenRows(1);
  messageSheet.getRange('A1:J1').setFontWeight('bold');
  messageSheet.getRange('A1:J1').setBackground('#4285f4');
  messageSheet.getRange('A1:J1').setFontColor('#ffffff');
  
  // シート2: ルーム一覧
  const roomSheet = spreadsheet.insertSheet('ルーム一覧');
  roomSheet.getRange('A1:E1').setValues([[
    'ルーム名', 'チャンネルID', '最終同期日時', 'メッセージ数', 'メモ'
  ]]);
  roomSheet.setFrozenRows(1);
  roomSheet.getRange('A1:E1').setFontWeight('bold');
  roomSheet.getRange('A1:E1').setBackground('#34a853');
  roomSheet.getRange('A1:E1').setFontColor('#ffffff');
  
  // シート3: 日次サマリー
  const summarySheet = spreadsheet.insertSheet('日次サマリー');
  summarySheet.getRange('A1:G1').setValues([[
    '日付', 'ルーム名', '投稿数', '主要トピック', '重要決定事項', '要約', '参加者'
  ]]);
  summarySheet.setFrozenRows(1);
  summarySheet.getRange('A1:G1').setFontWeight('bold');
  summarySheet.getRange('A1:G1').setBackground('#fbbc04');
  summarySheet.getRange('A1:G1').setFontColor('#000000');
  
  // シート4: 検索インデックス
  const indexSheet = spreadsheet.insertSheet('検索インデックス');
  indexSheet.getRange('A1:F1').setValues([[
    'キーワード', '出現回数', '関連メッセージID', '関連日付', 'コンテキスト', '最終更新'
  ]]);
  indexSheet.setFrozenRows(1);
  indexSheet.getRange('A1:F1').setFontWeight('bold');
  indexSheet.getRange('A1:F1').setBackground('#ea4335');
  indexSheet.getRange('A1:F1').setFontColor('#ffffff');
  
  // シート5: README
  const readmeSheet = spreadsheet.insertSheet('README');
  const readmeText = `
【LINE WORKSチャット履歴 マスターログ】

このスプレッドシートは、LINE WORKSのチャット履歴を自動同期したものです。

■ シート構成
- メッセージ一覧: 全チャットルームの統合ログ
- ルーム一覧: チャンネル情報と同期状況
- 日次サマリー: 日ごとの重要トピック・決定事項
- 検索インデックス: キーワード検索用インデックス
- README: このシート

■ Gemini活用例
「昨日の営業部の会議内容をまとめて」
「先週決まったことは？」
「田中さんが報告した件について」
「明日誰が休み？」

■ 自動生成情報
生成日時: ${formatDateTime(new Date())}
同期頻度: 1日4回（5:00、10:00、16:00、21:00）

■ 問い合わせ
問題が発生した場合は管理者にご連絡ください。
  `.trim();
  
  readmeSheet.getRange('A1').setValue(readmeText);
  readmeSheet.setColumnWidth(1, 800);
  
  // スプレッドシート全体の設定
  spreadsheet.setSpreadsheetTimeZone('Asia/Tokyo');
  spreadsheet.setActiveSheet(messageSheet);
}

/**
 * メッセージをスプレッドシートに保存
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet スプレッドシート
 * @param {Object} channel チャンネル情報
 * @param {Array} messages メッセージリスト
 * @return {number} 保存されたメッセージ数
 */
function saveMessagesToSpreadsheet(spreadsheet, channel, messages) {
  const sheet = spreadsheet.getSheetByName('メッセージ一覧');
  if (!sheet) {
    throw new Error('メッセージ一覧シートが見つかりません');
  }
  
  const rows = [];
  
  messages.forEach(msg => {
    try {
      // キーワード抽出
      const keywords = CONFIG.GEMINI_OPTIMIZATION.ENABLE_KEYWORD_EXTRACTION ?
        extractKeywords(msg.text || '') : [];
      
      // カテゴリ分類
      const category = CONFIG.GEMINI_OPTIMIZATION.ENABLE_AUTO_CATEGORIZATION ?
        categorizeMessage(msg.text || '') : '';
      
      // 添付ファイル情報
      const attachmentInfo = msg.attachments && msg.attachments.length > 0 ?
        `${msg.attachments.length}件` : '';
      
      // メッセージURL（存在する場合）
      const messageUrl = msg.url || '';
      
      // 送信者名を取得して正規化
      let senderName = '不明';
      if (msg.user) {
        senderName = msg.user.displayName || msg.user.userId || '不明';
      } else if (msg.userName) {
        senderName = msg.userName;
      } else if (msg.senderName) {
        senderName = msg.senderName;
      }
      
      // 名前マッピングを適用
      if (typeof normalizeName === 'function') {
        senderName = normalizeName(senderName);
      }
      
      rows.push([
        new Date(msg.createdTime || msg.sendTime),
        senderName,
        channel.name || channel.channelId,
        msg.text || '[画像/ファイル]',
        attachmentInfo,
        msg.messageId,
        channel.channelId,
        keywords.join(', '),
        category,
        messageUrl
      ]);
    } catch (error) {
      logError(`メッセージ処理エラー: ${msg.messageId}`, error);
    }
  });
  
  if (rows.length > 0) {
    // 最新のメッセージを上に追加（逆順にソート）
    rows.reverse();
    
    // 既存データの上に挿入
    sheet.insertRowsAfter(1, rows.length);
    sheet.getRange(2, 1, rows.length, 10).setValues(rows);
    
    logDebug(`スプレッドシートに${rows.length}件のメッセージを保存`);
  }
  
  return rows.length;
}

/**
 * メッセージをテキストログに保存
 * @param {Object} channel チャンネル情報
 * @param {Array} messages メッセージリスト
 */
function saveMessagesToTextLog(channel, messages) {
  // ルーム別ログ
  saveRoomLog(channel, messages);
  
  // 日次ログ
  saveDailyLog(channel, messages);
}

/**
 * ルーム別ログファイルに保存（月次フォルダ対応）
 * @param {Object} channel チャンネル情報
 * @param {Array} messages メッセージリスト
 */
function saveRoomLog(channel, messages) {
  const now = new Date();
  
  // 月次フォルダで整理する場合
  let folderPath = CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/' +
                   CONFIG.GOOGLE_DRIVE.CHAT_LOG_FOLDER + '/' +
                   CONFIG.GOOGLE_DRIVE.ROOM_LOG_FOLDER;
  
  if (CONFIG.GOOGLE_DRIVE.MONTHLY_ORGANIZATION) {
    const monthFolder = getMonthFolderName(now);
    folderPath += '/' + monthFolder;
  }
  
  const folder = getOrCreateFolder(folderPath);
  const fileName = `${sanitizeFileName(channel.name || channel.channelId)}_履歴.txt`;
  
  let logContent = `\n========== ${formatDateTime(now)} 同期 ==========\n\n`;
  
  messages.forEach(msg => {
    const timestamp = formatDateTime(new Date(msg.createdTime || msg.sendTime));
    const sender = msg.user ? (msg.user.displayName || msg.user.userId) : '不明';
    const text = msg.text || '[メディア]';
    
    logContent += `[${timestamp}] ${sender}\n`;
    logContent += `${text}\n`;
    
    if (msg.attachments && msg.attachments.length > 0) {
      msg.attachments.forEach(att => {
        logContent += `  📎 ${att.name || 'ファイル'}\n`;
      });
    }
    logContent += `\n`;
  });
  
  // ファイルに追記
  const file = findFileInFolder(folder, fileName);
  if (file) {
    try {
      const existingContent = file.getBlob().getDataAsString();
      file.setContent(existingContent + logContent);
    } catch (e) {
      // ファイルが大きすぎる場合は新しいファイルを作成
      const newFileName = `${sanitizeFileName(channel.name || channel.channelId)}_履歴_${formatDate(now)}.txt`;
      folder.createFile(newFileName, logContent);
      logInfo(`新しいログファイルを作成: ${newFileName}`);
    }
  } else {
    folder.createFile(fileName, logContent);
  }
}

/**
 * 日次ログファイルに保存（月次フォルダ対応）
 * @param {Object} channel チャンネル情報
 * @param {Array} messages メッセージリスト
 */
function saveDailyLog(channel, messages) {
  const now = new Date();
  const today = formatDate(now);
  
  // 月次フォルダで整理する場合
  let folderPath = CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/' +
                   CONFIG.GOOGLE_DRIVE.CHAT_LOG_FOLDER + '/' +
                   CONFIG.GOOGLE_DRIVE.DAILY_LOG_FOLDER;
  
  if (CONFIG.GOOGLE_DRIVE.MONTHLY_ORGANIZATION) {
    const monthFolder = getMonthFolderName(now);
    folderPath += '/' + monthFolder;
  }
  
  const folder = getOrCreateFolder(folderPath);
  const fileName = `${today}_全体ログ.txt`;
  
  let logContent = `\n--- ${channel.name || channel.channelId} ---\n`;
  
  messages.forEach(msg => {
    const timestamp = formatDateTime(new Date(msg.createdTime || msg.sendTime));
    const sender = msg.user ? (msg.user.displayName || msg.user.userId) : '不明';
    const text = msg.text || '[メディア]';
    
    logContent += `[${timestamp}] ${sender}: ${truncate(text, 200)}\n`;
  });
  
  // ファイルに追記
  const file = findFileInFolder(folder, fileName);
  if (file) {
    const existingContent = file.getBlob().getDataAsString();
    file.setContent(existingContent + logContent);
  } else {
    const header = `========== ${today} チャットログ ==========\n`;
    folder.createFile(fileName, header + logContent);
  }
}

/**
 * 添付ファイルをダウンロード
 * @param {Object} channel チャンネル情報
 * @param {Array} messages メッセージリスト
 * @return {Object} ダウンロード結果 {total, downloaded, errors}
 */
function downloadChannelAttachments(channel, messages) {
  const result = {
    total: 0,
    downloaded: 0,
    errors: 0
  };
  
  // 添付ファイルフォルダ
  const monthFolder = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM');
  const folder = getOrCreateFolder(
    CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/' +
    CONFIG.GOOGLE_DRIVE.CHAT_LOG_FOLDER + '/' +
    CONFIG.GOOGLE_DRIVE.ATTACHMENT_FOLDER + '/' +
    monthFolder
  );
  
  messages.forEach(msg => {
    if (msg.attachments && msg.attachments.length > 0) {
      msg.attachments.forEach(att => {
        result.total++;
        
        try {
          // ダウンロードURLが存在する場合
          if (att.downloadUrl || att.url) {
            const url = att.downloadUrl || att.url;
            const blob = downloadLineWorksAttachment(url);
            
            // ファイル名生成（重複防止のためメッセージIDを付与）
            const originalName = att.name || extractFileNameFromUrl(url);
            const fileName = `${msg.messageId}_${sanitizeFileName(originalName)}`;
            
            // 既に存在する場合はスキップ
            const existing = findFileInFolder(folder, fileName);
            if (!existing) {
              folder.createFile(blob.setName(fileName));
              logDebug(`添付ファイル保存: ${fileName}`);
            }
            
            result.downloaded++;
          }
        } catch (error) {
          result.errors++;
          logError(`添付ファイルダウンロードエラー: ${att.name}`, error);
        }
      });
    }
  });
  
  return result;
}

/**
 * ルーム一覧シートを更新
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet スプレッドシート
 * @param {Array} channels チャンネルリスト
 */
function updateRoomListSheet(spreadsheet, channels) {
  const sheet = spreadsheet.getSheetByName('ルーム一覧');
  if (!sheet) return;
  
  // 既存データをクリア（ヘッダー以外）
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).clearContent();
  }
  
  const rows = channels.map(ch => {
    const lastSync = getChannelLastSyncTime(ch.channelId);
    const messageCount = getChannelMessageCount(spreadsheet, ch.channelId);
    
    return [
      ch.name || ch.channelId,
      ch.channelId,
      lastSync ? formatDateTime(lastSync) : '未同期',
      messageCount,
      ''  // メモ欄
    ];
  });
  
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 5).setValues(rows);
  }
}

/**
 * チャンネルのメッセージ数を取得
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet スプレッドシート
 * @param {string} channelId チャンネルID
 * @return {number} メッセージ数
 */
function getChannelMessageCount(spreadsheet, channelId) {
  const sheet = spreadsheet.getSheetByName('メッセージ一覧');
  if (!sheet) return 0;
  
  const data = sheet.getDataRange().getValues();
  let count = 0;
  
  // ヘッダー行をスキップして検索
  for (let i = 1; i < data.length; i++) {
    if (data[i][6] === channelId) {  // チャンネルIDの列
      count++;
    }
  }
  
  return count;
}

/**
 * マスターログのURLを取得して表示
 * 便利リンク表示用
 */
function showMasterSpreadsheetUrl() {
  try {
    const spreadsheet = getMasterSpreadsheet();
    const url = spreadsheet.getUrl();
    const name = spreadsheet.getName();
    
    Logger.log('========================================');
    Logger.log('📊 マスターログ情報');
    Logger.log('========================================');
    Logger.log('名前: ' + name);
    Logger.log('保存場所: マイドライブ/LINE WORKS統合ログ/チャットログ/');
    Logger.log('');
    Logger.log('📱 直接アクセスURL:');
    Logger.log(url);
    Logger.log('');
    Logger.log('💡 このURLをブックマークすると便利です！');
    Logger.log('========================================');
    
    return url;
  } catch (error) {
    logError('スプレッドシートURL取得エラー', error);
    return null;
  }
}

/**
 * スプレッドシートのバックアップを作成
 */
function backupMasterSpreadsheet() {
  try {
    const spreadsheet = getMasterSpreadsheet();
    const backupFolder = getOrCreateFolder(
      CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/' +
      CONFIG.GOOGLE_DRIVE.CHAT_LOG_FOLDER + '/バックアップ'
    );
    
    const backupName = `${CONFIG.GOOGLE_DRIVE.MASTER_SPREADSHEET_NAME}_バックアップ_${formatDateTime(new Date()).replace(/[:\s]/g, '_')}`;
    const file = DriveApp.getFileById(spreadsheet.getId());
    file.makeCopy(backupName, backupFolder);
    
    logInfo(`スプレッドシートをバックアップしました: ${backupName}`);
  } catch (error) {
    logError('スプレッドシートバックアップエラー', error);
  }
}





