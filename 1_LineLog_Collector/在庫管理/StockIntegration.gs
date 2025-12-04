/**
 * 在庫管理システム連携
 * チャットログから在庫補充情報を取得してストックマネージャーに記録
 */

/**
 * チャットメッセージから在庫を更新
 * @param {string} messageText メッセージテキスト
 * @param {string} senderName 送信者名
 * @param {Date} date 日付
 * @return {Object|null} 更新結果
 */
function updateStockFromChatMessage(messageText, senderName, date) {
  try {
    logInfo(`[DEBUG] 在庫連携処理開始: "${messageText}"`);
    
    // キーワードチェック（出荷・持っていった等を追加）
    const keywords = ['入荷', '補充', '納品', '置きました', '追加', '出荷', '持っていった', '納入', '搬入'];
    const hasKeyword = keywords.some(kw => messageText.includes(kw));
    
    if (!CONFIG.STOCK_MANAGEMENT || !CONFIG.STOCK_MANAGEMENT.ENABLED) {
      logInfo('[DEBUG] 在庫管理機能が無効です');
      return null;
    }
    
    const spreadsheet = getStockManagementSpreadsheet();
    const stockSheet = spreadsheet.getSheetByName(CONFIG.STOCK_MANAGEMENT.SHEET_STOCK);
    const logSheet = spreadsheet.getSheetByName(CONFIG.STOCK_MANAGEMENT.SHEET_LOG);
    
    if (!stockSheet || !logSheet) {
      logWarning('[DEBUG] 在庫管理シートまたは売上履歴シートが見つかりません');
      return null;
    }
    
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
            
            // ヘッダーから列インデックスを動的に取得
            const headers = stockSheet.getRange(1, 1, 1, stockSheet.getLastColumn()).getValues()[0];
            const stockColIndex = (headers.indexOf('現在庫') >= 0 ? headers.indexOf('現在庫') + 1 : 
                                  (headers.indexOf('在庫数') >= 0 ? headers.indexOf('在庫数') + 1 : 4));
            const salesColIndex = headers.indexOf('販売数') >= 0 ? headers.indexOf('販売数') + 1 : 0;
            const lastUpdateColIndex = headers.indexOf('最終更新日時') >= 0 ? headers.indexOf('最終更新日時') + 1 : 6;
            
            // シート更新
            stockSheet.getRange(stockInfo.rowIndex, stockColIndex).setValue(newStock);
            
            // E列（販売数）を更新（既存の値に加算）
            if (salesColIndex > 0) {
              const currentSales = parseInt(stockSheet.getRange(stockInfo.rowIndex, salesColIndex).getValue(), 10) || 0;
              const newSales = currentSales + count;
              const salesRange = stockSheet.getRange(stockInfo.rowIndex, salesColIndex);
              salesRange.setNumberFormat('0');
              salesRange.setValue(newSales);
              logInfo(`  📊 販売数: ${currentSales} → ${newSales} (+${count})`);
            }
            
            stockSheet.getRange(stockInfo.rowIndex, lastUpdateColIndex).setValue(new Date());
            
            // ログ記録
            const logHeaders = logSheet.getRange(1, 1, 1, logSheet.getLastColumn()).getValues()[0];
            const hasUnitPrice = logHeaders.includes('単価');
            const hasSalesAmount = logHeaders.includes('売上金額');
            
            if (hasUnitPrice && hasSalesAmount) {
              logSheet.appendRow([
                date,
                storeName,
                itemName,
                `+${count}`,
                0, // 単価（補充時は0）
                0, // 売上金額（補充時は0）
                newStock,
                `チャット報告: ${senderName}`
              ]);
            } else {
              logSheet.appendRow([
                date,
                storeName,
                itemName,
                `+${count}`,
                newStock,
                `チャット報告: ${senderName}`
              ]);
            }
            
            updated = true;
            resultMessage = `${itemName} +${count} (在庫: ${newStock})`;
            processedItems.add(itemName);
            logInfo(`📦 チャット在庫更新: ${storeName} ${itemName} +${count}`);
            
            // LINE WORKSチャンネルに出荷情報を通知
            // 注意: チャットログからの在庫更新は無効化されています
            // スタッフからの在庫情報は専用チャンネル（7d6b452d-2dce-09ac-7663-a2f47d622e91）に手動で入力してください
            // if (typeof notifyShipmentToLine === 'function') {
            //   notifyShipmentToLine(storeName, itemName, count, newStock, senderName, date);
            // }
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

/**
 * 在庫管理スプレッドシートを取得または作成
 * @return {Spreadsheet} スプレッドシート
 */
function getStockManagementSpreadsheet() {
  const sheetId = CONFIG.STOCK_MANAGEMENT.SPREADSHEET_ID;
  let spreadsheet;
  
  if (sheetId) {
    try {
      spreadsheet = SpreadsheetApp.openById(sheetId);
      return spreadsheet;
    } catch (error) {
      logWarning(`指定されたスプレッドシートが見つかりません (ID: ${sheetId}): ${error.message}`);
    }
  }
  
  // フォルダからスプレッドシートを検索
  try {
    const folderPath = CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/在庫管理';
    const folder = getOrCreateFolder(folderPath);
    const fileName = '直売所管理システム';
    
    const files = folder.getFilesByName(fileName);
    if (files.hasNext()) {
      const file = files.next();
      spreadsheet = SpreadsheetApp.openById(file.getId());
      return spreadsheet;
    }
  } catch (e) {
    logError('スプレッドシートの検索中にエラーが発生しました', e);
  }
  
  return null;
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
        const stockIndex = headers.indexOf('現在庫') >= 0 ? headers.indexOf('現在庫') : headers.indexOf('在庫数');
        const warningIndex = headers.indexOf('発注点');
        const unitPriceIndex = headers.indexOf('単価');
        const totalSalesIndex = headers.indexOf('累計販売数');
        const totalRevenueIndex = headers.indexOf('累計売上金額');
        const lastUpdateIndex = headers.indexOf('最終更新日時');
        
        const keywordsStr = data[i][2]; // C列: 別名キーワード
        if (keywordsStr) {
          keywords = keywordsStr.toString().split(/[,\s、]+/).map(k => k.trim()).filter(k => k);
        }
        
        currentStock = stockIndex >= 0 ? (data[i][stockIndex] || 0) : (data[i][3] || 0);
        warningLine = warningIndex >= 0 ? (data[i][warningIndex] || 0) : (data[i][4] || 0);
        unitPrice = unitPriceIndex >= 0 ? (parseInt(data[i][unitPriceIndex], 10) || 0) : 0;
        totalSales = totalSalesIndex >= 0 ? (parseInt(data[i][totalSalesIndex], 10) || 0) : 0;
        totalRevenue = totalRevenueIndex >= 0 ? (parseInt(data[i][totalRevenueIndex], 10) || 0) : 0;
        lastUpdate = lastUpdateIndex >= 0 ? data[i][lastUpdateIndex] : (data[i][8] || '');
      } else {
        // 旧レイアウト: A:店舗, B:商品, C:在庫, D:発注点, E:更新
        currentStock = data[i][2];
        warningLine = data[i][3];
        lastUpdate = data[i][4];
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
    storeKeywords = CONFIG.STOCK_MANAGEMENT.STORE_KEYWORDS || {
      'みどりの大地': ['みどりの大地', '鈴鹿', '緑の大地', 'みどり'],
      '四季彩 尾平店': ['尾平', '四季菜', '四季彩'],
      'エーコープ': ['Aコープ', 'エーコープ']
    };
  }
  
  for (const [storeName, keywords] of Object.entries(storeKeywords)) {
    if (keywords.some(kw => text.includes(kw))) {
      return storeName;
    }
  }
  
  return '不明な店舗';
}

/**
 * 販売数を抽出
 * @param {string} text メッセージテキスト
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

