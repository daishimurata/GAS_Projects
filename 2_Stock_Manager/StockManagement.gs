/**
 * 直売所・在庫管理自動化システム
 * Gmailから売上速報を読み取り、在庫を自動更新してLINE通知
 */

/**
 * 在庫管理メイン処理
 * @return {Object} 処理結果の統計情報
 */
function syncStockManagement() {
  logInfo('========================================');
  logInfo('📦 在庫管理システム実行開始');
  logInfo('========================================');
  
  const startTime = new Date();
  const stats = {
    emailsChecked: 0,
    emailsProcessed: 0,
    itemsUpdated: 0,
    lowStockWarnings: [],
    errors: []
  };
  
  try {
    // 設定チェック
    if (!CONFIG.STOCK_MANAGEMENT || !CONFIG.STOCK_MANAGEMENT.ENABLED) {
      logInfo('在庫管理機能が無効です');
      return stats;
    }
    
    // Gmail検索
    const query = CONFIG.STOCK_MANAGEMENT.GMAIL_QUERY;
    logInfo(`検索クエリ: ${query}`);
    
    const threads = GmailApp.search(query);
    stats.emailsChecked = threads.length;
    
    if (threads.length === 0) {
      logInfo('処理対象のメールはありません');
      return stats;
    }
    
    logInfo(`処理対象: ${threads.length}件のスレッド`);
    
    // スプレッドシート取得
    const spreadsheet = getStockManagementSpreadsheet();
    const stockSheet = spreadsheet.getSheetByName(CONFIG.STOCK_MANAGEMENT.SHEET_STOCK);
    const logSheet = spreadsheet.getSheetByName(CONFIG.STOCK_MANAGEMENT.SHEET_LOG);
    
    if (!stockSheet || !logSheet) {
      throw new Error('必要なシートが見つかりません（在庫管理・売上履歴）');
    }
    
    // 在庫マスタデータを読み込み（店舗名 + 商品名 + 別名キーワード）
    const stockMap = loadStockMaster(stockSheet);
    logInfo(`登録商品数: ${stockMap.size}件`);
    
    // 処理結果を蓄積
    const notifications = [];
    
    // 各スレッドを処理
    threads.forEach((thread, threadIndex) => {
      try {
        const messages = thread.getMessages();
        
        messages.forEach((message, msgIndex) => {
          // 未読のみ処理
          if (!message.isUnread()) {
            return;
          }
          
          logInfo(`\n[${threadIndex + 1}/${threads.length}] メール処理中`);
          
          const emailData = {
            subject: message.getSubject(),
            body: message.getPlainBody(),
            date: message.getDate(),
            from: message.getFrom()
          };
          
          // 店舗名を判定
          const storeName = detectStoreName(emailData, spreadsheet);
          logInfo(`店舗: ${storeName}`);
          
          if (storeName === '不明な店舗') {
            logInfo('店舗が特定できないためスキップします');
            return;
          }
          
          // 各商品をチェック
          const salesData = [];
          const processedItems = new Set(); // 重複処理防止
          
          // 在庫マップから対象店舗の商品を探す
          stockMap.forEach((stockInfo, key) => {
            const [itemStore, itemName] = key.split('_');
            
            // 店舗が一致し、かつメール本文に商品名(または別名)が含まれているか
            if (itemStore === storeName) {
              
              // 商品名または別名キーワードでマッチング
              let matchedName = '';
              if (emailData.body.includes(itemName)) {
                matchedName = itemName;
              } else if (stockInfo.keywords && stockInfo.keywords.length > 0) {
                // 別名キーワードチェック
                for (const kw of stockInfo.keywords) {
                  if (emailData.body.includes(kw)) {
                    matchedName = kw; // マッチしたキーワード
                    break;
                  }
                }
              }
              
              if (matchedName) {
                if (processedItems.has(itemName)) return;
                
                // 販売数を抽出 (マッチした名称を使って抽出)
                const soldCount = extractSoldCount(emailData.body, matchedName);
                
                if (soldCount > 0) {
                  // 在庫を更新（売上＝在庫減）
                  const currentStock = parseInt(stockInfo.currentStock, 10) || 0;
                  const newStock = currentStock - soldCount;
                  
                  // スプレッドシートを更新
                  stockSheet.getRange(stockInfo.rowIndex, 4).setValue(newStock);
                  stockSheet.getRange(stockInfo.rowIndex, 6).setValue(new Date());
                  
                  // 警告ラインチェック
                  const warningLine = parseInt(stockInfo.warningLine, 10) || 0;
                  const isLowStock = newStock <= warningLine;
                  
                  if (isLowStock) {
                    stats.lowStockWarnings.push({
                      store: storeName,
                      item: itemName,
                      stock: newStock,
                      warningLine: warningLine
                    });
                  }
                  
                  // 単価と売上金額を取得
                  const unitPrice = parseInt(stockInfo.unitPrice, 10) || 0;
                  const salesAmount = unitPrice > 0 ? soldCount * unitPrice : 0;
                  
                  // ログシートに記録
                  const logHeaders = logSheet.getRange(1, 1, 1, logSheet.getLastColumn()).getValues()[0];
                  const hasUnitPrice = logHeaders.includes('単価');
                  const hasSalesAmount = logHeaders.includes('売上金額');
                  
                  if (hasUnitPrice && hasSalesAmount) {
                    logSheet.appendRow([
                      emailData.date,
                      storeName,
                      itemName,
                      soldCount,
                      unitPrice,
                      salesAmount,
                      newStock,
                      isLowStock ? '⚠️要発注' : 'メール自動取込'
                    ]);
                  } else {
                    // 旧形式のログシートの場合
                    logSheet.appendRow([
                      emailData.date,
                      storeName,
                      itemName,
                      soldCount, // 売上数（正の値）
                      newStock,
                      isLowStock ? '⚠️要発注' : 'メール自動取込'
                    ]);
                  }
                  
                  // 月次ログファイルにも記録
                  saveStockLogToFile(emailData.date, storeName, itemName, soldCount, newStock);
                  
                  salesData.push({
                    itemName: itemName,
                    soldCount: soldCount,
                    unitPrice: unitPrice,
                    salesAmount: salesAmount,
                    currentStock: currentStock,
                    newStock: newStock,
                    isLowStock: isLowStock,
                    warningLine: warningLine
                  });
                  
                  stats.itemsUpdated++;
                  processedItems.add(itemName);
                  
                  logInfo(`  ✅ ${itemName} (検知: ${matchedName}): ${soldCount}個売却 (${currentStock} → ${newStock})`);
                }
              }
            }
          });
          
          // 処理結果を通知用に保存
          if (salesData.length > 0) {
            notifications.push({
              storeName: storeName,
              date: emailData.date,
              items: salesData
            });
            
            stats.emailsProcessed++;
          }
          
          // メールを既読にする
          message.markRead();
          logInfo('  メールを既読にしました');
        });
        
      } catch (error) {
        logError(`スレッド処理エラー (${thread.getFirstMessageSubject()})`, error);
        stats.errors.push(`Thread ${threadIndex + 1}: ${error.message}`);
      }
    });
    
    // 日次売上サマリーを更新
    if (notifications.length > 0) {
      notifications.forEach(notification => {
        updateDailySalesSummary(spreadsheet, notification.storeName, notification.date, notification.items);
      });
    }
    
    // LINE通知を送信
    if (notifications.length > 0) {
      sendStockUpdateNotification(notifications, stats);
    }
    
    // 在庫警告通知
    if (stats.lowStockWarnings.length > 0) {
      sendLowStockWarning(stats.lowStockWarnings);
    }
    
  } catch (error) {
    logError('在庫管理システムエラー', error);
    stats.errors.push(error.message);
    throw error;
  }
  
  // 結果サマリー
  const duration = ((new Date() - startTime) / 1000).toFixed(1);
  
  logInfo('\n========================================');
  logInfo('📊 在庫管理システム実行完了');
  logInfo('========================================');
  logInfo(`チェック: ${stats.emailsChecked}件`);
  logInfo(`処理: ${stats.emailsProcessed}件`);
  logInfo(`更新商品: ${stats.itemsUpdated}件`);
  logInfo(`在庫警告: ${stats.lowStockWarnings.length}件`);
  logInfo(`処理時間: ${duration}秒`);
  
  if (stats.errors.length > 0) {
    logInfo(`エラー: ${stats.errors.length}件`);
  }
  
  logInfo('========================================');
  
  return stats;
}

/**
 * 在庫マスタデータを読み込み
 * @param {Sheet} stockSheet 在庫管理シート
 * @return {Map} "店舗名_商品名" → 在庫情報のマップ
 */
function loadStockMaster(stockSheet) {
  const data = stockSheet.getDataRange().getValues();
  const stockMap = new Map();
  
  // ヘッダーチェック (C列が「別名キーワード」かどうか)
  const hasAliasColumn = (data[0][2] === '別名キーワード');
  
  // 2行目からデータ（1行目はヘッダー）
  for (let i = 1; i < data.length; i++) {
    const storeName = data[i][0]; // A列: 店舗名
    const itemName = data[i][1];  // B列: 商品名
    
    if (storeName && itemName) {
      const key = `${storeName}_${itemName}`;
      
      let keywords = [];
      let currentStock = 0;
      let warningLine = 0;
      let lastUpdate = '';
      
      let unitPrice = 0;
      let totalSales = 0;
      let totalRevenue = 0;
      
      if (hasAliasColumn) {
        // ヘッダーから列インデックスを動的に取得
        const headers = data[0];
        const stockIndex = headers.indexOf('現在庫');
        const warningIndex = headers.indexOf('発注点');
        const unitPriceIndex = headers.indexOf('単価');
        const totalSalesIndex = headers.indexOf('累計販売数');
        const totalRevenueIndex = headers.indexOf('累計売上金額');
        const lastUpdateIndex = headers.indexOf('最終更新日時');
        
        const keywordsStr = data[i][2]; // C列: 別名キーワード
        if (keywordsStr) {
          keywords = keywordsStr.toString().split(/[,\s、]+/).map(k => k.trim()).filter(k => k);
        }
        
        currentStock = stockIndex >= 0 ? (data[i][stockIndex] || 0) : (data[i][3] || 0); // D列: 現在庫
        warningLine = warningIndex >= 0 ? (data[i][warningIndex] || 0) : (data[i][4] || 0);  // E列: 発注点
        unitPrice = unitPriceIndex >= 0 ? (parseInt(data[i][unitPriceIndex], 10) || 0) : 0;  // F列: 単価
        totalSales = totalSalesIndex >= 0 ? (parseInt(data[i][totalSalesIndex], 10) || 0) : 0;  // G列: 累計販売数
        totalRevenue = totalRevenueIndex >= 0 ? (parseInt(data[i][totalRevenueIndex], 10) || 0) : 0;  // H列: 累計売上金額
        lastUpdate = lastUpdateIndex >= 0 ? data[i][lastUpdateIndex] : (data[i][8] || '');   // I列: 最終更新日時
      } else {
        // 旧レイアウト: A:店舗, B:商品, C:在庫, D:発注点, E:更新
        currentStock = data[i][2]; // C列
        warningLine = data[i][3];  // D列
        lastUpdate = data[i][4];   // E列
      }
      
      stockMap.set(key, {
        rowIndex: i + 1,
        storeName: storeName,
        itemName: itemName,
        keywords: keywords,
        currentStock: currentStock,
        warningLine: warningLine,
        unitPrice: unitPrice,
        totalSales: totalSales,
        totalRevenue: totalRevenue,
        lastUpdate: lastUpdate
      });
    }
  }
  
  return stockMap;
}

/**
 * 店舗名を判定（シートから読み込み）
 * @param {Object} emailData メールデータ
 * @param {Spreadsheet} spreadsheet 在庫管理スプレッドシート
 * @return {string} 店舗名
 */
function detectStoreName(emailData, spreadsheet) {
  const text = emailData.subject + ' ' + emailData.body;
  let storeKeywords = {};
  
  // シートから店舗マスタを読み込み
  try {
    if (!spreadsheet) {
      spreadsheet = getStockManagementSpreadsheet();
    }
    
    const storeSheet = spreadsheet.getSheetByName('店舗設定');
    
    if (storeSheet) {
      const data = storeSheet.getDataRange().getValues();
      // 2行目からデータ（1行目はヘッダー）
      for (let i = 1; i < data.length; i++) {
        const name = data[i][0];
        const keywordsStr = data[i][1];
        
        if (name && keywordsStr) {
          const keywords = keywordsStr.toString().split(/[,\s、]+/).map(k => k.trim());
          storeKeywords[name] = keywords;
        }
      }
    }
  } catch (e) {
    logWarning('店舗設定シートの読み込みに失敗しました。デフォルト設定を使用します。');
  }
  
  // デフォルト設定
  if (Object.keys(storeKeywords).length === 0) {
    storeKeywords = {
      'みどりの大地': ['みどりの大地', '鈴鹿', '緑の大地', 'みどり'],
      '四季菜 尾平': ['尾平', '四季菜'],
      'Aコープ': ['Aコープ', 'エーコープ']
    };
  }
  
  for (const [storeName, keywords] of Object.entries(storeKeywords)) {
    if (keywords.some(kw => text.includes(kw))) {
      return storeName;
    }
  }
  
  // 送信者から判定
  if (emailData.from) {
    for (const [storeName, keywords] of Object.entries(storeKeywords)) {
      if (keywords.some(kw => emailData.from.includes(kw))) {
        return storeName;
      }
    }
  }
  
  return '不明な店舗';
}

/**
 * 販売数を抽出
 * @param {string} text メール本文
 * @param {string} itemName 商品名
 * @return {number} 販売数
 */
function extractSoldCount(text, itemName) {
  // 正規表現のエスケープ（商品名に記号が含まれる場合用）
  const escapedName = itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // パターン1: 商品名の後に数字＋単位
  const pattern1 = new RegExp(
    escapedName + '[\\s\\S]{0,50}?(\\d+)\\s*(点|個|袋|束|本|パック|ヶ|箱|ケース)',
    'i'
  );
  const match1 = text.match(pattern1);
  if (match1) return parseInt(match1[1], 10);
  
  // パターン2: 商品名の後に単純な数字
  const pattern2 = new RegExp(escapedName + '\\s+(\\d+)', 'i');
  const match2 = text.match(pattern2);
  if (match2) return parseInt(match2[1], 10);
  
  // パターン3: 表形式
  const pattern3 = new RegExp(escapedName + '\\s*[|│]\\s*(\\d+)', 'i');
  const match3 = text.match(pattern3);
  if (match3) return parseInt(match3[1], 10);
  
  return 0;
}

/**
 * 在庫ログをファイルに保存
 */
function saveStockLogToFile(date, storeName, itemName, soldCount, newStock) {
  try {
    // 日付をDateオブジェクトに変換
    const dateObj = date instanceof Date ? date : new Date(date);
    
    // 無効な日付の場合は現在日時を使用
    if (isNaN(dateObj.getTime())) {
      logWarning(`無効な日付が渡されました: ${date}。現在日時を使用します。`);
      dateObj = new Date();
    }
    
    let folder;
    if (CONFIG.GOOGLE_DRIVE.MONTHLY_ORGANIZATION) {
      const monthFolder = getMonthFolderName(dateObj);
      folder = getOrCreateFolder(
        CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/在庫管理ログ/' + monthFolder
      );
    } else {
      folder = getOrCreateFolder(CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/在庫管理ログ');
    }
    
    const fileName = `${Utilities.formatDate(dateObj, 'Asia/Tokyo', 'yyyy-MM-dd')}_在庫管理.txt`;
    const logText = `[${formatDateTime(dateObj)}] ${storeName} - ${itemName}: ${soldCount}個売却 → 在庫${newStock}個\n`;
    
    const files = folder.getFilesByName(fileName);
    if (files.hasNext()) {
      const file = files.next();
      file.setContent(file.getBlob().getDataAsString() + logText);
    } else {
      folder.createFile(fileName, logText, MimeType.PLAIN_TEXT);
    }
  } catch (error) {
    logError('在庫ログファイル保存エラー', error);
  }
}

/**
 * 在庫更新通知を送信
 */
function sendStockUpdateNotification(notifications, stats) {
  try {
    let message = '📦 売上速報・在庫更新\n\n';
    
    notifications.forEach(notification => {
      message += `【${notification.storeName}】\n`;
      // 日付が文字列の場合はDateオブジェクトに変換
      const dateObj = notification.date instanceof Date ? notification.date : new Date(notification.date);
      message += `時刻: ${Utilities.formatDate(dateObj, 'Asia/Tokyo', 'HH:mm')}\n\n`;
      
      notification.items.forEach(item => {
        message += `• ${item.itemName}: ${item.soldCount}個売却\n`;
        message += `  在庫 ${item.currentStock} → ${item.newStock}`;
        
        if (item.isLowStock) {
          message += ` ⚠️要発注（警告: ${item.warningLine}）`;
        }
        
        message += '\n';
      });
      message += '\n';
    });
    
    message += `処理: ${stats.emailsProcessed}件のメール\n`;
    message += `更新: ${stats.itemsUpdated}商品`;
    
    sendInfoNotification('在庫更新', message);
  } catch (error) {
    logError('在庫更新通知エラー', error);
  }
}

/**
 * 在庫不足警告を送信
 */
function sendLowStockWarning(lowStockItems) {
  try {
    let message = '⚠️ 在庫不足警告\n\n';
    message += '以下の商品が発注点を下回りました：\n\n';
    
    lowStockItems.forEach(item => {
      message += `• ${item.store} / ${item.item}\n`;
      message += `  現在庫: ${item.stock}個\n`;
      message += `  発注点: ${item.warningLine}個\n\n`;
    });
    
    message += '発注をご検討ください。';
    // sendWarningNotificationが未定義の場合はsendInfoNotificationを使用
    if (typeof sendWarningNotification === 'function') {
      sendWarningNotification('在庫不足', message);
    } else {
      sendInfoNotification('在庫不足警告', message);
    }
  } catch (error) {
    logError('在庫不足警告エラー', error);
  }
}

/**
 * 在庫管理スプレッドシートを取得または作成
 */
function getStockManagementSpreadsheet() {
  const sheetId = CONFIG.STOCK_MANAGEMENT.SPREADSHEET_ID;
  let spreadsheet;
  
  logInfo(`スプレッドシート取得処理開始 (Config ID: ${sheetId})`);
  
  if (sheetId) {
    try {
      spreadsheet = SpreadsheetApp.openById(sheetId);
      logInfo('ID指定でスプレッドシートを開きました');
    } catch (error) {
      logWarning(`指定されたスプレッドシートが見つかりません (ID: ${sheetId}): ${error.message}`);
    }
  }
  
  if (!spreadsheet) {
    logInfo('フォルダからスプレッドシートを検索、または新規作成を試みます');
    try {
      const folderPath = CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/在庫管理';
      const folder = getOrCreateFolder(folderPath);
      const fileName = '直売所管理システム';
      
      const files = folder.getFilesByName(fileName);
      if (files.hasNext()) {
        const file = files.next();
        spreadsheet = SpreadsheetApp.openById(file.getId());
        logInfo(`既存のファイルを開きました: ${fileName}`);
      } else {
        spreadsheet = SpreadsheetApp.create(fileName);
        const file = DriveApp.getFileById(spreadsheet.getId());
        folder.addFile(file);
        DriveApp.getRootFolder().removeFile(file);
        logInfo(`新規ファイルを作成しました: ${fileName}`);
      }
    } catch (e) {
      logError('スプレッドシートの検索・作成中にエラーが発生しました', e);
    }
  }
  
  if (!spreadsheet) {
    logError('致命的エラー: スプレッドシートオブジェクトの取得に失敗しました');
    return null;
  }
  
  // シート初期化
  initializeStockManagementSheets(spreadsheet);
  
  return spreadsheet;
}

/**
 * シート構造を強制的に初期化・更新するための関数
 * 手動実行用
 */
function forceInitializeSheets() {
  logInfo('シート構造の更新を開始します...');
  
  try {
    const spreadsheet = getStockManagementSpreadsheet();
    
    if (!spreadsheet) {
      throw new Error('スプレッドシートを取得できませんでした。ログを確認してください。');
    }
    
    // getStockManagementSpreadsheet内で既に呼ばれているため、ここではログ出力のみ
    // initializeStockManagementSheets(spreadsheet); 
    
    logInfo('シート構造の更新が完了しました。');
    logInfo(`URL: ${spreadsheet.getUrl()}`);
    
    return '更新完了';
  } catch (error) {
    logError('シート構造更新エラー', error);
    return `エラー: ${error.message}`;
  }
}

/**
 * 在庫管理シートを初期化
 * 既存の旧形式シートがある場合はリネームして退避
 */
function initializeStockManagementSheets(spreadsheet) {
  if (!spreadsheet) {
    logError('initializeStockManagementSheets: スプレッドシートが指定されていません');
    return;
  }

  // 旧形式のチェック
  let oldStockSheet = spreadsheet.getSheetByName('在庫管理');
  if (oldStockSheet) {
    // ヘッダーの列数で判定
    // 旧1: 4列 (商品名...)
    // 旧2: 5列 (店舗名, 商品名, 現在庫, 発注点, 更新)
    // 新: 6列 (店舗名, 商品名, 別名キーワード, 現在庫, 発注点, 更新)
    const header = oldStockSheet.getRange(1, 1, 1, 6).getValues()[0];
    
    // C列が「別名キーワード」でない場合は旧形式
    if (header[2] !== '別名キーワード') {
      logInfo('旧形式の在庫管理シートを検知。リネームして退避します。');
      const timestamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
      oldStockSheet.setName(`在庫管理_old_${timestamp}`);
      oldStockSheet = null; // 新規作成対象にする
    }
  }
  
  // 在庫管理シート作成（新形式）
  let stockSheet = spreadsheet.getSheetByName('在庫管理');
  if (!stockSheet) {
    stockSheet = spreadsheet.insertSheet('在庫管理', 0);
    // ヘッダー: 店舗名, 商品名, 別名キーワード, 現在庫, 発注点, 単価, 累計販売数, 累計売上金額, 最終更新日時
    const stockHeaders = ['店舗名', '商品名', '別名キーワード', '現在庫', '発注点', '単価', '累計販売数', '累計売上金額', '最終更新日時'];
    stockSheet.getRange(1, 1, 1, stockHeaders.length).setValues([stockHeaders]);
    stockSheet.getRange(1, 1, 1, stockHeaders.length).setFontWeight('bold');
    stockSheet.setFrozenRows(1);
    stockSheet.setColumnWidth(3, 200); // キーワード列を広めに
  } else {
    // 既存シートに列が不足している場合は追加
    const headers = stockSheet.getRange(1, 1, 1, stockSheet.getLastColumn()).getValues()[0];
    const requiredHeaders = ['店舗名', '商品名', '別名キーワード', '現在庫', '発注点', '単価', '累計販売数', '累計売上金額', '最終更新日時'];
    let lastCol = stockSheet.getLastColumn();
    
    // 不足している列を追加
    if (!headers.includes('単価')) {
      stockSheet.insertColumnAfter(lastCol);
      stockSheet.getRange(1, lastCol + 1).setValue('単価');
      stockSheet.getRange(1, lastCol + 1).setFontWeight('bold');
      lastCol++;
    }
    if (!headers.includes('累計販売数')) {
      stockSheet.insertColumnAfter(lastCol);
      stockSheet.getRange(1, lastCol + 1).setValue('累計販売数');
      stockSheet.getRange(1, lastCol + 1).setFontWeight('bold');
      lastCol++;
    }
    if (!headers.includes('累計売上金額')) {
      stockSheet.insertColumnAfter(lastCol);
      stockSheet.getRange(1, lastCol + 1).setValue('累計売上金額');
      stockSheet.getRange(1, lastCol + 1).setFontWeight('bold');
      lastCol++;
    }
    // 最終更新日時の列名を確認・更新
    const lastUpdateIndex = headers.indexOf('最終更新日時');
    if (lastUpdateIndex === -1 && headers.indexOf('更新') !== -1) {
      stockSheet.getRange(1, headers.indexOf('更新') + 1).setValue('最終更新日時');
    }
  }
  
  // 売上履歴シート作成
  let logSheet = spreadsheet.getSheetByName('売上履歴');
  if (!logSheet) {
    logSheet = spreadsheet.insertSheet('売上履歴');
    const logHeaders = ['日時', '店舗', '商品', '販売数', '単価', '売上金額', '残在庫', '備考'];
    logSheet.getRange(1, 1, 1, logHeaders.length).setValues([logHeaders]);
    logSheet.getRange(1, 1, 1, logHeaders.length).setFontWeight('bold');
    logSheet.setFrozenRows(1);
  } else {
    // 既存シートに列が不足している場合は追加
    const headers = logSheet.getRange(1, 1, 1, logSheet.getLastColumn()).getValues()[0];
    let lastCol = logSheet.getLastColumn();
    
    if (!headers.includes('単価')) {
      const salesCountIndex = headers.indexOf('販売数');
      if (salesCountIndex !== -1) {
        logSheet.insertColumnAfter(salesCountIndex + 1);
        logSheet.getRange(1, salesCountIndex + 2).setValue('単価');
        logSheet.getRange(1, salesCountIndex + 2).setFontWeight('bold');
        lastCol++;
      }
    }
    if (!headers.includes('売上金額')) {
      const unitPriceIndex = headers.indexOf('単価');
      if (unitPriceIndex !== -1) {
        logSheet.insertColumnAfter(unitPriceIndex + 1);
        logSheet.getRange(1, unitPriceIndex + 2).setValue('売上金額');
        logSheet.getRange(1, unitPriceIndex + 2).setFontWeight('bold');
        lastCol++;
      }
    }
  }
  
  // 日次売上サマリーシート作成
  let dailySalesSheet = spreadsheet.getSheetByName('日次売上サマリー');
  if (!dailySalesSheet) {
    dailySalesSheet = spreadsheet.insertSheet('日次売上サマリー');
    const dailyHeaders = ['日付', '店舗', '商品数', '総販売数', '総売上金額'];
    dailySalesSheet.getRange(1, 1, 1, dailyHeaders.length).setValues([dailyHeaders]);
    dailySalesSheet.getRange(1, 1, 1, dailyHeaders.length).setFontWeight('bold');
    dailySalesSheet.setFrozenRows(1);
  }
  
  // 店舗設定シート作成
  let storeSheet = spreadsheet.getSheetByName('店舗設定');
  if (!storeSheet) {
    storeSheet = spreadsheet.insertSheet('店舗設定');
    const storeHeaders = ['正式店舗名', '判定キーワード（カンマ区切り）'];
    storeSheet.getRange(1, 1, 1, storeHeaders.length).setValues([storeHeaders]);
    storeSheet.getRange(1, 1, 1, storeHeaders.length).setFontWeight('bold');
    storeSheet.setColumnWidth(1, 150);
    storeSheet.setColumnWidth(2, 300);
    
    const storeData = [
      ['みどりの大地', 'みどりの大地, 鈴鹿, 緑の大地, みどり'],
      ['四季菜 尾平', '尾平, 四季菜'],
      ['Aコープ', 'Aコープ, エーコープ']
    ];
    storeSheet.getRange(2, 1, storeData.length, 2).setValues(storeData);
  }
}

/**
 * 在庫管理システム実行（トリガー用）
 */
function executeStockManagement() {
  logInfo('===== 在庫管理システムトリガー実行 =====');
  try {
    const stats = syncStockManagement();
    saveStockManagementHistory(stats);
    return stats;
  } catch (error) {
    logError('在庫管理システムトリガーエラー', error);
    sendErrorNotification('在庫管理システム失敗', error, 'executeStockManagement');
    throw error;
  }
}

/**
 * 在庫管理実行履歴を保存
 */
function saveStockManagementHistory(stats) {
  try {
    setProperty('STOCK_LAST_SYNC_TIME', new Date().toISOString());
    setProperty('STOCK_LAST_SYNC_RESULT', JSON.stringify({
      timestamp: new Date().toISOString(),
      stats: stats
    }));
  } catch (error) {
    logError('在庫管理履歴保存エラー', error);
  }
}

/**
 * チャットメッセージから在庫を更新（新形式対応）
 */
function updateStockFromChatMessage(messageText, senderName, date) {
  try {
    logInfo(`[DEBUG] 在庫連携処理開始: "${messageText}"`);
    
    // キーワードチェック（出荷・持っていった等を追加）
    const keywords = ['入荷', '補充', '納品', '置きました', '追加', '出荷', '持っていった', '納入', '搬入'];
    const hasKeyword = keywords.some(kw => messageText.includes(kw));
    
    if (!CONFIG.STOCK_MANAGEMENT || !CONFIG.STOCK_MANAGEMENT.ENABLED) {
      return null;
    }
    
    const spreadsheet = getStockManagementSpreadsheet();
    const stockSheet = spreadsheet.getSheetByName(CONFIG.STOCK_MANAGEMENT.SHEET_STOCK);
    const logSheet = spreadsheet.getSheetByName(CONFIG.STOCK_MANAGEMENT.SHEET_LOG);
    
    if (!stockSheet || !logSheet) return null;
    
    // 商品マスタ読み込み
    const stockMap = loadStockMaster(stockSheet);
    
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
    
    // 商品解析
    stockMap.forEach((stockInfo, key) => {
      const [itemStore, itemName] = key.split('_');
      
      // 店舗が一致
      if (itemStore === storeName) {
        
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
          
          // 抽出 (マッチした単語を使用)
          const count = extractSoldCount(messageText, matchedName);
          logInfo(`[DEBUG] 商品検知: ${itemName} (KW:${matchedName}), 数量: ${count}`);
          
          if (count > 0) {
            const currentStock = parseInt(stockInfo.currentStock, 10) || 0;
            
            // 出荷 = 在庫増
            const newStock = currentStock + count;
            
            // シート更新 (D列:在庫, F列:更新日時) - マスタ読込ロジックと連動
            // 注意: loadStockMasterのrowIndexは行番号
            // 新レイアウト: A:店舗, B:商品, C:別名, D:在庫, E:発注点, F:更新
            stockSheet.getRange(stockInfo.rowIndex, 4).setValue(newStock);
            stockSheet.getRange(stockInfo.rowIndex, 6).setValue(new Date());
            
            // ログ記録
            logSheet.appendRow([
              date,
              storeName,
              itemName,
              `+${count}`,
              newStock,
              `チャット報告: ${senderName}`
            ]);
            
            updated = true;
            resultMessage = `${itemName} +${count} (在庫: ${newStock})`;
            processedItems.add(itemName);
            logInfo(`📦 チャット在庫更新: ${storeName} ${itemName} +${count}`);
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
    logError('チャット在庫更新エラー', error);
    return null;
  }
}

