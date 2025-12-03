/**
 * Gmail同期機能
 * Gmailを監視して重要なメールを保存・通知
 */

/**
 * Gmail同期メイン処理
 * @return {Object} 同期結果の統計情報
 */
function syncGmail() {
  logInfo('========================================');
  logInfo('📧 Gmail同期開始');
  logInfo('========================================');
  
  const startTime = new Date();
  const stats = {
    totalChecked: 0,
    newEmails: 0,
    importantEmails: 0,
    attachmentsSaved: 0,
    errors: []
  };
  
  try {
    // マスタースプレッドシート準備
    const spreadsheet = getGmailMasterSpreadsheet();
    logInfo(`スプレッドシート: ${spreadsheet.getName()}`);
    
    // 最終同期時刻を取得
    const lastSyncTime = getGmailLastSyncTime();
    logInfo(`前回同期: ${lastSyncTime ? formatDateTime(lastSyncTime) : '初回実行'}`);
    
    // 検索クエリ作成
    const query = buildGmailSearchQuery(lastSyncTime);
    logInfo(`検索クエリ: ${query}`);
    
    // メール取得
    const threads = GmailApp.search(query, 0, 500);  // 最大500件
    stats.totalChecked = threads.length;
    logInfo(`取得スレッド: ${threads.length}件`);
    
    if (threads.length === 0) {
      logInfo('新しいメールはありません');
    } else {
      // 各スレッドを処理
      threads.forEach((thread, index) => {
        try {
          const messages = thread.getMessages();
          
          messages.forEach(message => {
            // 既に処理済みかチェック
            if (isMessageProcessed(message.getId())) {
              return;
            }
            
            // メッセージデータを抽出
            const emailData = extractEmailData(message);
            
            // 重要度判定
            const importance = calculateImportance(emailData);
            emailData.importance = importance;
            emailData.category = categorizeEmail(emailData);
            
            // スプレッドシートに保存
            saveEmailToSpreadsheet(spreadsheet, emailData);
            stats.newEmails++;
            
            // 重要メールの場合
            if (importance >= 8) {
              stats.importantEmails++;
              
              // LINE WORKSに通知
              if (CONFIG.GMAIL && CONFIG.GMAIL.NOTIFY_IMPORTANT) {
                sendImportantEmailNotification(emailData);
              }
            }
            
            // 添付ファイル保存
            if (emailData.attachments.length > 0) {
              const savedCount = saveEmailAttachments(message, emailData);
              stats.attachmentsSaved += savedCount;
            }
            
            // テキストログ保存
            saveEmailToTextLog(emailData);
            
            // 処理済みマーク
            markMessageAsProcessed(message.getId());
            
            // レート制限対策
            Utilities.sleep(100);
          });
          
        } catch (error) {
          logError(`スレッド処理エラー (${thread.getFirstMessageSubject()})`, error);
          stats.errors.push(`Thread ${index + 1}: ${error.message}`);
        }
      });
    }
    
    // 最終同期時刻を更新
    setGmailLastSyncTime(new Date());
    
  } catch (error) {
    logError('Gmail同期エラー', error);
    stats.errors.push(error.message);
    throw error;
  }
  
  // 結果サマリー
  const duration = ((new Date() - startTime) / 1000).toFixed(1);
  
  logInfo('\n========================================');
  logInfo('📊 Gmail同期完了');
  logInfo('========================================');
  logInfo(`チェック: ${stats.totalChecked}件`);
  logInfo(`新規メール: ${stats.newEmails}件`);
  logInfo(`重要メール: ${stats.importantEmails}件`);
  logInfo(`添付ファイル: ${stats.attachmentsSaved}件`);
  logInfo(`処理時間: ${duration}秒`);
  
  if (stats.errors.length > 0) {
    logInfo(`エラー: ${stats.errors.length}件`);
  }
  
  logInfo('========================================');
  
  return stats;
}

/**
 * Gmail検索クエリを構築
 * @param {Date} lastSyncTime 最終同期時刻
 * @return {string} 検索クエリ
 */
function buildGmailSearchQuery(lastSyncTime) {
  const queries = [];
  
  // 最終同期時刻以降（または過去7日間）
  if (lastSyncTime) {
    const afterDate = Utilities.formatDate(lastSyncTime, 'UTC', 'yyyy/MM/dd');
    queries.push(`after:${afterDate}`);
  } else {
    // 初回実行時は過去7日間
    const daysBack = (CONFIG.GMAIL && CONFIG.GMAIL.INITIAL_DAYS) || 7;
    queries.push(`newer_than:${daysBack}d`);
  }
  
  // 受信トレイのみ（送信済みは除外）
  queries.push('in:inbox');
  
  // カスタムフィルター（設定で指定可能）
  if (CONFIG.GMAIL && CONFIG.GMAIL.SEARCH_FILTERS) {
    queries.push(...CONFIG.GMAIL.SEARCH_FILTERS);
  }
  
  return queries.join(' ');
}

/**
 * メールデータを抽出
 * @param {GmailMessage} message Gmailメッセージ
 * @return {Object} メールデータ
 */
function extractEmailData(message) {
  const data = {
    messageId: message.getId(),
    threadId: message.getThread().getId(),
    date: message.getDate(),
    from: message.getFrom(),
    to: message.getTo(),
    cc: message.getCc() || '',
    subject: message.getSubject(),
    body: message.getPlainBody(),
    bodyHtml: message.getBody(),
    isStarred: message.isStarred(),
    isUnread: message.isUnread(),
    labels: message.getThread().getLabels().map(l => l.getName()),
    attachments: message.getAttachments().map(att => ({
      name: att.getName(),
      size: att.getSize(),
      type: att.getContentType()
    })),
    url: `https://mail.google.com/mail/u/0/#inbox/${message.getId()}`
  };
  
  return data;
}

/**
 * メールの重要度を計算
 * @param {Object} emailData メールデータ
 * @return {number} 重要度（1-10）
 */
function calculateImportance(emailData) {
  let score = 5;  // 基準値
  
  // スターが付いている
  if (emailData.isStarred) {
    score += 3;
  }
  
  // 未読
  if (emailData.isUnread) {
    score += 1;
  }
  
  // 添付ファイルあり
  if (emailData.attachments.length > 0) {
    score += 1;
  }
  
  // 重要キーワードを含む
  const importantKeywords = [
    '緊急', '重要', '至急', '確認', '承認',
    '請求', '契約', '納期', '締切', 'deadline',
    'urgent', 'important', 'ASAP'
  ];
  
  const text = (emailData.subject + ' ' + emailData.body).toLowerCase();
  const matchedKeywords = importantKeywords.filter(kw => 
    text.includes(kw.toLowerCase())
  );
  
  if (matchedKeywords.length > 0) {
    score += Math.min(matchedKeywords.length * 0.5, 2);
  }
  
  // 特定のラベルが付いている
  const importantLabels = ['重要', 'Important', 'VIP'];
  if (emailData.labels.some(label => importantLabels.includes(label))) {
    score += 2;
  }
  
  return Math.min(Math.round(score), 10);
}

/**
 * メールをカテゴリ分類
 * @param {Object} emailData メールデータ
 * @return {string} カテゴリ
 */
function categorizeEmail(emailData) {
  const text = (emailData.subject + ' ' + emailData.body).toLowerCase();
  
  // カテゴリキーワードマッチング
  const categories = {
    '請求・経理': ['請求', '支払', '振込', '領収', 'invoice', 'payment'],
    '契約・法務': ['契約', '合意', '署名', 'contract', 'agreement'],
    '問い合わせ': ['お問い合わせ', '質問', 'inquiry', 'question'],
    '報告': ['報告', 'report', 'update', '結果'],
    '会議・予定': ['会議', 'ミーティング', '打ち合わせ', 'meeting'],
    '通知': ['通知', 'notification', 'alert', 'お知らせ'],
    'システム': ['エラー', 'システム', 'サーバー', 'error', 'system']
  };
  
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => text.includes(kw))) {
      return category;
    }
  }
  
  return 'その他';
}

/**
 * メールをスプレッドシートに保存
 * @param {Spreadsheet} spreadsheet スプレッドシート
 * @param {Object} emailData メールデータ
 */
function saveEmailToSpreadsheet(spreadsheet, emailData) {
  let sheet = spreadsheet.getSheetByName('メール一覧');
  
  if (!sheet) {
    // シートが存在しない場合は作成
    sheet = spreadsheet.insertSheet('メール一覧', 0);
    
    // ヘッダー行を作成
    const headers = [
      '日時', '送信者', '宛先', '件名', 'カテゴリ', '重要度',
      '添付', 'ラベル', 'スター', '未読', 'メッセージID', 'URL'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  
  // データ行を作成
  const row = [
    emailData.date,
    emailData.from,
    emailData.to,
    emailData.subject,
    emailData.category,
    emailData.importance,
    emailData.attachments.length > 0 ? emailData.attachments.length + '件' : '',
    emailData.labels.join(', '),
    emailData.isStarred ? '★' : '',
    emailData.isUnread ? '●' : '',
    emailData.messageId,
    emailData.url
  ];
  
  // 2行目に挿入（最新が上）
  sheet.insertRowAfter(1);
  sheet.getRange(2, 1, 1, row.length).setValues([row]);
  
  // 重要度に応じて色付け
  if (emailData.importance >= 8) {
    sheet.getRange(2, 1, 1, row.length).setBackground('#ffebee');  // 薄い赤
  } else if (emailData.importance >= 6) {
    sheet.getRange(2, 1, 1, row.length).setBackground('#fff9c4');  // 薄い黄色
  }
}

/**
 * メールをテキストログに保存（月次フォルダ対応）
 * @param {Object} emailData メールデータ
 */
function saveEmailToTextLog(emailData) {
  try {
    const now = emailData.date;
    
    // 月次フォルダ
    let folder;
    if (CONFIG.GOOGLE_DRIVE.MONTHLY_ORGANIZATION) {
      const monthFolder = getMonthFolderName(now);
      folder = getOrCreateFolder(
        CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/Gmailログ/' + monthFolder
      );
    } else {
      folder = getOrCreateFolder(CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/Gmailログ');
    }
    
    const fileName = `${Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd')}_Gmail.txt`;
    
    // ログテキスト作成
    const logText = `
========================================
日時: ${formatDateTime(emailData.date)}
送信者: ${emailData.from}
宛先: ${emailData.to}
件名: ${emailData.subject}
カテゴリ: ${emailData.category}
重要度: ${emailData.importance}/10
添付: ${emailData.attachments.length}件
ラベル: ${emailData.labels.join(', ')}
URL: ${emailData.url}
========================================

${emailData.body}

`;
    
    // ファイル追記または作成
    const files = folder.getFilesByName(fileName);
    if (files.hasNext()) {
      const file = files.next();
      const existing = file.getBlob().getDataAsString();
      file.setContent(logText + '\n\n' + existing);
    } else {
      folder.createFile(fileName, logText, MimeType.PLAIN_TEXT);
    }
    
  } catch (error) {
    logError('メールテキストログ保存エラー', error);
  }
}

/**
 * 添付ファイルを保存
 * @param {GmailMessage} message Gmailメッセージ
 * @param {Object} emailData メールデータ
 * @return {number} 保存したファイル数
 */
function saveEmailAttachments(message, emailData) {
  let savedCount = 0;
  
  try {
    const now = emailData.date;
    
    // 月次フォルダ
    let folder;
    if (CONFIG.GOOGLE_DRIVE.MONTHLY_ORGANIZATION) {
      const monthFolder = getMonthFolderName(now);
      folder = getOrCreateFolder(
        CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/Gmail添付ファイル/' + monthFolder
      );
    } else {
      folder = getOrCreateFolder(CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/Gmail添付ファイル');
    }
    
    const attachments = message.getAttachments();
    
    attachments.forEach((attachment, index) => {
      try {
        // ファイル名をサニタイズ
        const originalName = attachment.getName();
        const safeName = sanitizeFileName(originalName);
        const prefix = emailData.messageId.substring(0, 8);
        const fileName = `${prefix}_${safeName}`;
        
        // 同名ファイルがあれば番号を付ける
        let finalFileName = fileName;
        let counter = 1;
        while (folder.getFilesByName(finalFileName).hasNext()) {
          const parts = fileName.split('.');
          if (parts.length > 1) {
            finalFileName = parts.slice(0, -1).join('.') + `_${counter}.` + parts[parts.length - 1];
          } else {
            finalFileName = fileName + `_${counter}`;
          }
          counter++;
        }
        
        // ファイル保存
        folder.createFile(attachment.copyBlob().setName(finalFileName));
        savedCount++;
        
        logDebug(`添付ファイル保存: ${finalFileName}`);
        
      } catch (error) {
        logError(`添付ファイル保存エラー (${attachment.getName()})`, error);
      }
    });
    
  } catch (error) {
    logError('添付ファイル処理エラー', error);
  }
  
  return savedCount;
}

/**
 * 重要メールをLINE WORKSに通知
 * @param {Object} emailData メールデータ
 */
function sendImportantEmailNotification(emailData) {
  try {
    const message = `📧 重要メール通知\n\n` +
                   `件名: ${emailData.subject}\n` +
                   `送信者: ${emailData.from}\n` +
                   `日時: ${formatDateTime(emailData.date)}\n` +
                   `重要度: ${emailData.importance}/10\n` +
                   `カテゴリ: ${emailData.category}\n\n` +
                   `${emailData.url}`;
    
    sendInfoNotification('重要メール', message);
  } catch (error) {
    logError('重要メール通知エラー', error);
  }
}

/**
 * Gmailマスタースプレッドシートを取得または作成
 * @return {Spreadsheet} スプレッドシート
 */
function getGmailMasterSpreadsheet() {
  const folderPath = CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/Gmailログ';
  const folder = getOrCreateFolder(folderPath);
  const fileName = 'Gmailマスターログ';
  
  // 既存ファイルを検索
  const files = folder.getFilesByName(fileName);
  if (files.hasNext()) {
    const file = files.next();
    return SpreadsheetApp.openById(file.getId());
  }
  
  // 新規作成
  const spreadsheet = SpreadsheetApp.create(fileName);
  const file = DriveApp.getFileById(spreadsheet.getId());
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);
  
  logInfo(`Gmailマスタースプレッドシート作成: ${fileName}`);
  
  return spreadsheet;
}

/**
 * 最終同期時刻を取得
 * @return {Date|null} 最終同期時刻
 */
function getGmailLastSyncTime() {
  const timeStr = getProperty('GMAIL_LAST_SYNC_TIME');
  return timeStr ? new Date(timeStr) : null;
}

/**
 * 最終同期時刻を設定
 * @param {Date} time 同期時刻
 */
function setGmailLastSyncTime(time) {
  setProperty('GMAIL_LAST_SYNC_TIME', time.toISOString());
}

/**
 * メッセージが処理済みかチェック
 * @param {string} messageId メッセージID
 * @return {boolean} 処理済みの場合true
 */
function isMessageProcessed(messageId) {
  const key = `GMAIL_PROCESSED_${messageId}`;
  return getProperty(key) !== null;
}

/**
 * メッセージを処理済みとしてマーク
 * @param {string} messageId メッセージID
 */
function markMessageAsProcessed(messageId) {
  const key = `GMAIL_PROCESSED_${messageId}`;
  setProperty(key, new Date().toISOString());
}

/**
 * Gmail同期実行（トリガー用）
 */
function executeGmailSync() {
  logInfo('===== Gmail同期トリガー実行 =====');
  
  try {
    const stats = syncGmail();
    
    // 同期履歴を保存
    saveGmailSyncHistory(stats);
    
    return stats;
  } catch (error) {
    logError('Gmail同期トリガーエラー', error);
    sendErrorNotification('Gmail同期失敗', error, 'executeGmailSync');
    throw error;
  }
}

/**
 * Gmail同期履歴を保存
 * @param {Object} stats 統計情報
 */
function saveGmailSyncHistory(stats) {
  try {
    setProperty('GMAIL_LAST_SYNC_RESULT', JSON.stringify({
      timestamp: new Date().toISOString(),
      stats: stats
    }));
  } catch (error) {
    logError('Gmail同期履歴保存エラー', error);
  }
}

