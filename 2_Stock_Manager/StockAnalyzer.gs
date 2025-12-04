/**
 * 在庫分析システム
 * GmailマスターログスプレッドシートをGeminiで解析して在庫情報を抽出
 */

/**
 * Gmailマスターログから未処理のメールを取得して解析
 * @return {Object} 処理結果の統計情報
 */
function analyzeStockFromGmailLog() {
  logInfo('========================================');
  logInfo('🤖 Gemini在庫分析開始');
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
    
    // Gmailマスターログスプレッドシートを取得
    const gmailLogSpreadsheet = getGmailMasterSpreadsheet();
    const gmailLogSheet = gmailLogSpreadsheet.getSheetByName('メール一覧');
    
    if (!gmailLogSheet) {
      throw new Error('Gmailマスターログの「メール一覧」シートが見つかりません');
    }
    
    // 未処理のメールを取得（処理済みフラグがない、または空の行）
    const unprocessedEmails = getUnprocessedEmails(gmailLogSheet);
    stats.emailsChecked = unprocessedEmails.length;
    
    logInfo(`未処理メール: ${unprocessedEmails.length}件`);
    
    if (unprocessedEmails.length === 0) {
      logInfo('処理対象のメールはありません');
      return stats;
    }
    
    // 在庫管理スプレッドシートを取得
    const stockSpreadsheet = getStockManagementSpreadsheet();
    const stockSheet = stockSpreadsheet.getSheetByName(CONFIG.STOCK_MANAGEMENT.SHEET_STOCK);
    const logSheet = stockSpreadsheet.getSheetByName(CONFIG.STOCK_MANAGEMENT.SHEET_LOG);
    
    // シート構造を確認・更新
    initializeStockManagementSheets(stockSpreadsheet);
    
    if (!stockSheet || !logSheet) {
      throw new Error('必要なシートが見つかりません（在庫管理・売上履歴）');
    }
    
    // 在庫マスタデータを読み込み
    const stockMap = loadStockMaster(stockSheet);
    logInfo(`登録商品数: ${stockMap.size}件`);
    
    // Geminiクライアントを初期化
    const gemini = new GeminiClient();
    
    // バッチ処理（一度に複数のメールを解析）
    const batchSize = CONFIG.GEMINI?.BATCH_SIZE || 5; // 一度に処理するメール数
    const notifications = [];
    
    for (let i = 0; i < unprocessedEmails.length; i += batchSize) {
      const batch = unprocessedEmails.slice(i, i + batchSize);
      logInfo(`\nバッチ ${Math.floor(i / batchSize) + 1}: ${batch.length}件のメールを解析中...`);
      
      try {
        // Geminiで解析
        const analysisResults = analyzeEmailsWithGemini(gemini, batch, stockMap);
        
        // 解析結果を在庫管理スプレッドシートに反映
        for (const result of analysisResults) {
          if (result.items && result.items.length > 0) {
            const updateResult = updateStockFromAnalysis(result, stockSheet, logSheet, stockMap, stockSpreadsheet);
            
            if (updateResult.updated) {
              stats.itemsUpdated += updateResult.itemsUpdated;
              stats.emailsProcessed++;
              
              if (updateResult.lowStockWarnings.length > 0) {
                stats.lowStockWarnings.push(...updateResult.lowStockWarnings);
              }
              
              notifications.push({
                storeName: result.storeName,
                date: result.date,
                items: updateResult.salesData
              });
              
              // メールを処理済みとしてマーク
              markEmailAsProcessed(gmailLogSheet, result.emailRowIndex);
            }
          }
        }
        
      } catch (error) {
        logError(`バッチ処理エラー`, error);
        stats.errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      }
    }
    
    // LINE通知を送信
    if (notifications.length > 0) {
      sendStockUpdateNotification(notifications, stats);
      
      // LINE WORKSチャンネルに売上情報を通知
      notifications.forEach(notification => {
        if (typeof notifySalesToLine === 'function') {
          notifySalesToLine(notification.storeName, notification.items, notification.date);
        }
      });
    }
    
    // 在庫警告通知
    if (stats.lowStockWarnings.length > 0) {
      sendLowStockWarning(stats.lowStockWarnings);
    }
    
  } catch (error) {
    logError('在庫分析システムエラー', error);
    stats.errors.push(error.message);
    throw error;
  }
  
  // 結果サマリー
  const duration = ((new Date() - startTime) / 1000).toFixed(1);
  
  logInfo('\n========================================');
  logInfo('📊 Gemini在庫分析完了');
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
 * 未処理のメールを取得
 * @param {Sheet} gmailLogSheet Gmailマスターログシート
 * @return {Array} 未処理のメールデータ配列
 */
function getUnprocessedEmails(gmailLogSheet) {
  const data = gmailLogSheet.getDataRange().getValues();
  const headers = data[0];
  
  // ヘッダーから列インデックスを取得
  const dateIndex = headers.indexOf('日時');
  const subjectIndex = headers.indexOf('件名');
  const bodyIndex = headers.indexOf('本文');
  const fromIndex = headers.indexOf('送信者');
  const processedIndex = headers.indexOf('処理済み');
  
  if (dateIndex === -1 || subjectIndex === -1 || bodyIndex === -1) {
    logWarning('必要な列が見つかりません（日時、件名、本文）');
    return [];
  }
  
  const unprocessedEmails = [];
  
  // 2行目からデータを取得（1行目はヘッダー）
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const processed = processedIndex >= 0 ? row[processedIndex] : '';
    
    // 処理済みフラグがない、または空の場合のみ処理
    if (!processed || processed === '' || processed === false) {
      const emailData = {
        rowIndex: i + 1, // スプレッドシートの行番号（1ベース）
        date: row[dateIndex],
        subject: row[subjectIndex] || '',
        body: row[bodyIndex] || '',
        from: fromIndex >= 0 ? (row[fromIndex] || '') : '',
        messageId: headers.indexOf('メッセージID') >= 0 ? row[headers.indexOf('メッセージID')] : ''
      };
      
      // 本文が空の場合はスキップ
      if (emailData.body && emailData.body.trim() !== '') {
        unprocessedEmails.push(emailData);
      }
    }
  }
  
  return unprocessedEmails;
}

/**
 * Geminiでメールを解析して売上情報を抽出
 * @param {GeminiClient} gemini Geminiクライアント
 * @param {Array} emails メールデータ配列
 * @param {Map} stockMap 在庫マスタマップ
 * @return {Array} 解析結果配列
 */
function analyzeEmailsWithGemini(gemini, emails, stockMap) {
  // プロンプトを構築
  const prompt = buildAnalysisPrompt(emails, stockMap);
  
  try {
    // モデル名を設定から取得
    const model = CONFIG.GEMINI?.MODEL || 'gemini-pro';
    logInfo(`Gemini APIにリクエスト送信中... (モデル: ${model})`);
    const responseText = gemini.generateContent(prompt, model);
    logInfo('Gemini APIからの応答を受信しました');
    
    // レスポンスをパース
    const results = parseGeminiResponse(responseText, emails);
    
    // 店舗名を正規化（スプレッドシートの実際の店舗名に合わせる）
    const normalizedResults = results.map(result => {
      return {
        ...result,
        storeName: normalizeStoreName(result.storeName, stockMap)
      };
    });
    
    return normalizedResults;
    
  } catch (error) {
    logError('Gemini解析エラー', error);
    throw error;
  }
}

/**
 * 店舗名を正規化（スプレッドシートの実際の店舗名に合わせる）
 * @param {string} storeName Geminiが返した店舗名
 * @param {Map} stockMap 在庫マスタマップ
 * @return {string} 正規化された店舗名
 */
function normalizeStoreName(storeName, stockMap) {
  // 店舗名のマッピング（Geminiが返す可能性のある名前 → スプレッドシートの実際の名前）
  const storeNameMapping = {
    '四季菜 尾平': '四季彩 尾平店',
    '四季菜尾平': '四季彩 尾平店',
    '尾平': '四季彩 尾平店',
    '四季菜': '四季彩 尾平店',
    '四季彩': '四季彩 尾平店',
    'Aコープ': 'エーコープ',
    'エーコープ': 'エーコープ',
    'みどりの大地': 'みどりの大地',
    'みどりのだいち': 'みどりの大地'
  };
  
  // マッピングがある場合は変換
  if (storeNameMapping[storeName]) {
    return storeNameMapping[storeName];
  }
  
  // スプレッドシートに存在する店舗名か確認
  const existingStores = new Set();
  stockMap.forEach((stockInfo, key) => {
    const [store] = key.split('_');
    existingStores.add(store);
  });
  
  // 既に正しい店舗名の場合はそのまま返す
  if (existingStores.has(storeName)) {
    return storeName;
  }
  
  // 部分一致で探す
  for (const existingStore of existingStores) {
    if (storeName.includes(existingStore) || existingStore.includes(storeName)) {
      return existingStore;
    }
  }
  
  // 見つからない場合は元の名前を返す（警告は後で出す）
  return storeName;
}

/**
 * 解析用プロンプトを構築
 * @param {Array} emails メールデータ配列
 * @param {Map} stockMap 在庫マスタマップ
 * @return {string} プロンプト
 */
function buildAnalysisPrompt(emails, stockMap) {
  // 在庫マスタから商品リストを構築（実際のスプレッドシートの店舗名を使用）
  const itemsByStore = {};
  stockMap.forEach((stockInfo, key) => {
    const [storeName, itemName] = key.split('_');
    if (!itemsByStore[storeName]) {
      itemsByStore[storeName] = [];
    }
    itemsByStore[storeName].push({
      name: itemName,
      keywords: stockInfo.keywords || []
    });
  });
  
  const prompt = `あなたは在庫管理システムの専門家です。以下の売上メールから、店舗名、商品名、販売数を正確に抽出してください。

【在庫管理対象商品】
${JSON.stringify(itemsByStore, null, 2)}

【メールデータ】
${emails.map((email, index) => `
メール${index + 1}:
- 件名: ${email.subject}
- 送信者: ${email.from}
- 日時: ${email.date}
- 本文:
${email.body}
`).join('\n---\n')}

【出力フォーマット】
以下のJSON形式で出力してください。各メールから抽出した売上情報を配列で返してください。

[
  {
    "emailIndex": 0,  // メールのインデックス（0から開始）
    "storeName": "店舗名",  // スプレッドシートに存在する店舗名を使用してください（例: みどりの大地、四季彩 尾平店、四季彩 大谷知店、四季彩 西部店、エーコープ、一号館）
    "date": "2025-12-02",  // 日付（YYYY-MM-DD形式）
    "items": [
      {
        "itemName": "商品名",  // 在庫管理対象商品の正式名称
        "soldCount": 3,  // 販売数（正の整数）
        "unitPrice": 200  // 単価（円）。メールから抽出できない場合は0
      }
    ]
  }
]

【注意事項】
- 店舗名は必ず在庫管理対象商品リストに含まれる店舗名を使用してください
- 商品名も必ず在庫管理対象商品リストに含まれる商品名を使用してください
- 販売数が0の場合はitems配列に含めないでください
- 単価はメール本文から抽出してください（例: @200、200円、￥200など）。抽出できない場合は0を設定してください
- メールから情報が抽出できない場合は空のitems配列を返してください
- JSONのみを出力し、説明文は不要です
`;

  return prompt;
}

/**
 * Geminiのレスポンスをパース
 * @param {string} responseText Geminiのレスポンステキスト
 * @param {Array} emails 元のメールデータ配列
 * @return {Array} 解析結果配列
 */
function parseGeminiResponse(responseText, emails) {
  try {
    // コードブロック記号を除去
    let jsonStr = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    // JSONの前後の不要なテキストを除去
    const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
    
    const results = JSON.parse(jsonStr);
    
    // emailIndexを使って元のメール情報を追加
    return results.map(result => {
      const email = emails[result.emailIndex];
      return {
        ...result,
        emailRowIndex: email.rowIndex,
        emailSubject: email.subject,
        emailFrom: email.from
      };
    });
    
  } catch (error) {
    logError('Geminiレスポンスパースエラー', error);
    logInfo(`レスポンステキスト: ${responseText}`);
    throw new Error(`JSONパースエラー: ${error.message}`);
  }
}

/**
 * 解析結果を在庫管理スプレッドシートに反映
 * @param {Object} analysisResult 解析結果
 * @param {Sheet} stockSheet 在庫管理シート
 * @param {Sheet} logSheet 売上履歴シート
 * @param {Map} stockMap 在庫マスタマップ
 * @param {Spreadsheet} spreadsheet 在庫管理スプレッドシート
 * @return {Object} 更新結果
 */
function updateStockFromAnalysis(analysisResult, stockSheet, logSheet, stockMap, spreadsheet) {
  const result = {
    updated: false,
    itemsUpdated: 0,
    salesData: [],
    lowStockWarnings: []
  };
  
  const storeName = analysisResult.storeName;
  const date = analysisResult.date || new Date();
  
  for (const item of analysisResult.items) {
    const itemName = item.itemName;
    const soldCount = parseInt(item.soldCount, 10) || 0;
    const unitPrice = parseInt(item.unitPrice, 10) || 0;
    
    if (soldCount <= 0) continue;
    
    const key = `${storeName}_${itemName}`;
    const stockInfo = stockMap.get(key);
    
    if (!stockInfo) {
      logWarning(`在庫マスタに存在しない商品: ${storeName} / ${itemName}`);
      continue;
    }
    
    // 在庫を更新（売上＝在庫減）
    const currentStock = parseInt(stockInfo.currentStock, 10) || 0;
    let newStock = currentStock - soldCount;
    
    // 在庫がマイナスにならないようにする（0以下になったら0にする）
    if (newStock < 0) {
      logWarning(`在庫がマイナスになります: ${storeName} / ${itemName} (${currentStock} - ${soldCount} = ${newStock})。0に設定します。`);
      newStock = 0;
    }
    
    // 列インデックスを動的に取得
    const headers = stockSheet.getRange(1, 1, 1, stockSheet.getLastColumn()).getValues()[0];
    
    // 「現在庫」または「在庫数」の列を探す
    const stockColIndex = (headers.indexOf('現在庫') >= 0 ? headers.indexOf('現在庫') + 1 : 
                          (headers.indexOf('在庫数') >= 0 ? headers.indexOf('在庫数') + 1 : 4));
    const unitPriceColIndex = headers.indexOf('単価') >= 0 ? headers.indexOf('単価') + 1 : 0;
    const totalSalesColIndex = headers.indexOf('累計販売数') >= 0 ? headers.indexOf('累計販売数') + 1 : 0;
    const totalRevenueColIndex = headers.indexOf('累計売上金額') >= 0 ? headers.indexOf('累計売上金額') + 1 : 0;
    const lastUpdateColIndex = headers.indexOf('最終更新日時') >= 0 ? headers.indexOf('最終更新日時') + 1 : 0;
    
    // スプレッドシートから現在の値を直接読み込む（累計販売数・累計売上金額）
    let currentTotalSales = 0;
    let currentTotalRevenue = 0;
    
    if (totalSalesColIndex > 0) {
      const value = stockSheet.getRange(stockInfo.rowIndex, totalSalesColIndex).getValue();
      if (value instanceof Date) {
        currentTotalSales = 0;
        logWarning(`${storeName} / ${itemName}: 累計販売数が日付型です。0から開始します。`);
      } else {
        currentTotalSales = parseInt(value, 10) || 0;
      }
    } else {
      // 列が見つからない場合はstockInfoから取得
      currentTotalSales = parseInt(stockInfo.totalSales || 0, 10) || 0;
      logWarning(`${storeName} / ${itemName}: 累計販売数列が見つかりません。`);
    }
    
    if (totalRevenueColIndex > 0) {
      const value = stockSheet.getRange(stockInfo.rowIndex, totalRevenueColIndex).getValue();
      if (value instanceof Date) {
        currentTotalRevenue = 0;
        logWarning(`${storeName} / ${itemName}: 累計売上金額が日付型です。0から開始します。`);
      } else {
        currentTotalRevenue = parseInt(value, 10) || 0;
      }
    } else {
      // 列が見つからない場合はstockInfoから取得
      currentTotalRevenue = parseInt(stockInfo.totalRevenue || 0, 10) || 0;
      logWarning(`${storeName} / ${itemName}: 累計売上金額列が見つかりません。`);
    }
    
    // 累計販売数と累計売上金額を計算
    const newTotalSales = currentTotalSales + soldCount;
    const salesAmount = unitPrice > 0 ? soldCount * unitPrice : 0;
    const newTotalRevenue = currentTotalRevenue + salesAmount;
    
    // スプレッドシートを更新（数値型で確実に書き込む）
    if (stockColIndex > 0) {
      stockSheet.getRange(stockInfo.rowIndex, stockColIndex).setValue(newStock); // 現在庫
    }
    
    // E列（販売数）を更新（既存の値に加算）
    const salesColIndex = headers.indexOf('販売数') >= 0 ? headers.indexOf('販売数') + 1 : 0;
    if (salesColIndex > 0) {
      const currentSales = parseInt(stockSheet.getRange(stockInfo.rowIndex, salesColIndex).getValue(), 10) || 0;
      const newSales = currentSales + soldCount;
      const salesRange = stockSheet.getRange(stockInfo.rowIndex, salesColIndex);
      salesRange.setNumberFormat('0'); // 数値形式を明示的に設定
      salesRange.setValue(newSales);
      logInfo(`  📊 販売数: ${currentSales} → ${newSales} (+${soldCount})`);
    }
    
    if (unitPriceColIndex > 0 && unitPrice > 0) {
      // 単価が設定されていない場合のみ更新
      const currentUnitPrice = stockSheet.getRange(stockInfo.rowIndex, unitPriceColIndex).getValue();
      // 日付型の場合は無視して更新
      if (currentUnitPrice instanceof Date || !currentUnitPrice || currentUnitPrice === 0 || currentUnitPrice === '') {
        const priceRange = stockSheet.getRange(stockInfo.rowIndex, unitPriceColIndex);
        priceRange.setNumberFormat('0'); // 数値形式を明示的に設定
        priceRange.setValue(unitPrice);
        logInfo(`  💰 単価を${currentUnitPrice instanceof Date ? '更新' : '設定'}: ${unitPrice}円`);
      }
    }
    
    if (totalSalesColIndex > 0) {
      // 数値形式を設定してから書き込む（日付として解釈されないように）
      const salesRange = stockSheet.getRange(stockInfo.rowIndex, totalSalesColIndex);
      salesRange.setNumberFormat('0'); // 数値形式を明示的に設定
      salesRange.setValue(newTotalSales);
      
      logInfo(`  📊 累計販売数: ${currentTotalSales} → ${newTotalSales} (+${soldCount})`);
    } else {
      logError(`累計販売数列が見つかりません。ヘッダー: ${headers.join(', ')}`);
    }
    
    if (totalRevenueColIndex > 0) {
      // 数値形式を設定してから書き込む（日付として解釈されないように）
      const revenueRange = stockSheet.getRange(stockInfo.rowIndex, totalRevenueColIndex);
      revenueRange.setNumberFormat('#,##0'); // 数値形式を明示的に設定（カンマ区切り）
      revenueRange.setValue(newTotalRevenue);
      
      logInfo(`  💵 累計売上金額: ¥${currentTotalRevenue.toLocaleString()} → ¥${newTotalRevenue.toLocaleString()} (+¥${salesAmount.toLocaleString()})`);
    } else {
      logError(`累計売上金額列が見つかりません。ヘッダー: ${headers.join(', ')}`);
    }
    
    if (lastUpdateColIndex > 0) {
      stockSheet.getRange(stockInfo.rowIndex, lastUpdateColIndex).setValue(new Date()); // 最終更新日時
    }
    
    // 警告ラインチェック
    const warningLine = parseInt(stockInfo.warningLine, 10) || 0;
    const isLowStock = newStock <= warningLine;
    
    if (isLowStock) {
      result.lowStockWarnings.push({
        store: storeName,
        item: itemName,
        stock: newStock,
        warningLine: warningLine
      });
    }
    
    // ログシートに記録
    logSheet.appendRow([
      date,
      storeName,
      itemName,
      soldCount,
      unitPrice,
      salesAmount,
      newStock,
      isLowStock ? '⚠️要発注' : 'Gemini自動解析'
    ]);
    
    // 月次ログファイルにも記録
    saveStockLogToFile(date, storeName, itemName, soldCount, newStock);
    
    result.salesData.push({
      itemName: itemName,
      soldCount: soldCount,
      unitPrice: unitPrice,
      salesAmount: salesAmount,
      currentStock: currentStock,
      newStock: newStock,
      isLowStock: isLowStock,
      warningLine: warningLine
    });
    
    result.itemsUpdated++;
    result.updated = true;
    
    logInfo(`  ✅ ${itemName}: ${soldCount}個売却 (${currentStock} → ${newStock})`);
  }
  
  // 日次売上サマリーを更新
  if (result.updated && result.salesData.length > 0) {
    updateDailySalesSummary(spreadsheet, storeName, date, result.salesData);
  }
  
  return result;
}

/**
 * メールを処理済みとしてマーク
 * @param {Sheet} gmailLogSheet Gmailマスターログシート
 * @param {number} rowIndex 行番号（1ベース）
 */
function markEmailAsProcessed(gmailLogSheet, rowIndex) {
  try {
    const headers = gmailLogSheet.getRange(1, 1, 1, gmailLogSheet.getLastColumn()).getValues()[0];
    const processedIndex = headers.indexOf('処理済み');
    
    if (processedIndex === -1) {
      // 「処理済み」列がない場合は追加
      const lastColumn = gmailLogSheet.getLastColumn();
      gmailLogSheet.getRange(1, lastColumn + 1).setValue('処理済み');
      gmailLogSheet.getRange(1, lastColumn + 1).setFontWeight('bold');
      gmailLogSheet.getRange(rowIndex, lastColumn + 1).setValue('✓');
    } else {
      gmailLogSheet.getRange(rowIndex, processedIndex + 1).setValue('✓');
    }
  } catch (error) {
    logError('処理済みマークエラー', error);
  }
}

/**
 * Gemini APIキーを設定
 * @param {string} apiKey Gemini APIキー
 */
function setGeminiApiKey(apiKey) {
  if (!apiKey || apiKey.trim() === '') {
    logError('APIキーが空です');
    return false;
  }
  
  try {
    PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', apiKey.trim());
    logInfo('✅ Gemini APIキーを設定しました');
    return true;
  } catch (error) {
    logError('APIキー設定エラー', error);
    return false;
  }
}

/**
 * Gemini APIキーを初期設定（提供されたキーを使用）
 */
function initializeGeminiApiKey() {
  const apiKey = 'AIzaSyBi-t75ilRBezJyBBXAjEnxxnScyfBv5gw';
  return setGeminiApiKey(apiKey);
}

/**
 * Gemini APIキーの設定状態を確認
 */
function checkGeminiApiKey() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  
  if (apiKey) {
    logInfo('✅ Gemini APIキーが設定されています');
    logInfo(`キーの先頭: ${apiKey.substring(0, 10)}...`);
    return true;
  } else {
    logWarning('❌ Gemini APIキーが設定されていません');
    logInfo('設定方法: setGeminiApiKey("YOUR_API_KEY") を実行してください');
    return false;
  }
}

/**
 * 在庫管理シートの日付データをクリア（単価、累計販売数、累計売上金額列）
 */
function clearInvalidStockData() {
  try {
    const stockSpreadsheet = getStockManagementSpreadsheet();
    const stockSheet = stockSpreadsheet.getSheetByName('在庫管理');
    
    if (!stockSheet) {
      logError('在庫管理シートが見つかりません');
      return;
    }
    
    const headers = stockSheet.getRange(1, 1, 1, stockSheet.getLastColumn()).getValues()[0];
    const unitPriceColIndex = headers.indexOf('単価') + 1;
    const totalSalesColIndex = headers.indexOf('累計販売数') + 1;
    const totalRevenueColIndex = headers.indexOf('累計売上金額') + 1;
    
    if (unitPriceColIndex === 0 || totalSalesColIndex === 0 || totalRevenueColIndex === 0) {
      logError('必要な列が見つかりません');
      return;
    }
    
    const data = stockSheet.getDataRange().getValues();
    let clearedCount = 0;
    
    // 2行目からデータを処理
    for (let i = 1; i < data.length; i++) {
      let cleared = false;
      
      // 単価列のチェック
      const unitPriceValue = stockSheet.getRange(i + 1, unitPriceColIndex).getValue();
      if (unitPriceValue instanceof Date) {
        stockSheet.getRange(i + 1, unitPriceColIndex).setValue('');
        cleared = true;
      }
      
      // 累計販売数列のチェック
      const totalSalesValue = stockSheet.getRange(i + 1, totalSalesColIndex).getValue();
      if (totalSalesValue instanceof Date) {
        stockSheet.getRange(i + 1, totalSalesColIndex).setValue(0);
        cleared = true;
      }
      
      // 累計売上金額列のチェック
      const totalRevenueValue = stockSheet.getRange(i + 1, totalRevenueColIndex).getValue();
      if (totalRevenueValue instanceof Date) {
        stockSheet.getRange(i + 1, totalRevenueColIndex).setValue(0);
        cleared = true;
      }
      
      if (cleared) {
        clearedCount++;
      }
    }
    
    logInfo(`========================================`);
    logInfo(`✅ 日付データをクリアしました`);
    logInfo(`クリア件数: ${clearedCount}行`);
    logInfo(`========================================`);
    
    return clearedCount;
  } catch (error) {
    logError('日付データクリアエラー', error);
    throw error;
  }
}

/**
 * 利用可能なGeminiモデル一覧を取得（デバッグ用）
 */
function listAvailableGeminiModels() {
  try {
    const gemini = new GeminiClient();
    const models = gemini.listModels();
    
    logInfo('========================================');
    logInfo('📋 利用可能なGeminiモデル一覧');
    logInfo('========================================');
    
    if (models.length === 0) {
      logWarning('モデルが見つかりませんでした');
      return;
    }
    
    models.forEach(model => {
      logInfo(`モデル名: ${model.name}`);
      logInfo(`表示名: ${model.displayName || 'N/A'}`);
      logInfo(`説明: ${model.description || 'N/A'}`);
      logInfo(`サポートメソッド: ${model.supportedGenerationMethods?.join(', ') || 'N/A'}`);
      logInfo('---');
    });
    
    logInfo('========================================');
    
    return models;
  } catch (error) {
    logError('モデル一覧取得エラー', error);
    return [];
  }
}

/**
 * Gmailマスターログの処理済みマークをクリア（再処理用）
 * @param {number} daysBack 何日前まで遡ってクリアするか（デフォルト: 7日）
 */
function clearGmailLogProcessedMarks(daysBack = 7) {
  try {
    const gmailLogSpreadsheet = getGmailMasterSpreadsheet();
    const gmailLogSheet = gmailLogSpreadsheet.getSheetByName('メール一覧');
    
    if (!gmailLogSheet) {
      logError('Gmailマスターログの「メール一覧」シートが見つかりません');
      return;
    }
    
    const data = gmailLogSheet.getDataRange().getValues();
    const headers = data[0];
    const processedIndex = headers.indexOf('処理済み');
    
    if (processedIndex === -1) {
      logInfo('「処理済み」列が見つかりませんでした');
      return;
    }
    
    const dateIndex = headers.indexOf('日時');
    if (dateIndex === -1) {
      logError('「日時」列が見つかりません');
      return;
    }
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    
    let clearedCount = 0;
    
    // 2行目からデータを処理（1行目はヘッダー）
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const processed = row[processedIndex];
      const dateValue = row[dateIndex];
      
      // 処理済みマークがある場合
      if (processed && processed !== '') {
        // 日付が指定期間内の場合のみクリア
        if (dateValue instanceof Date) {
          if (dateValue >= cutoffDate) {
            gmailLogSheet.getRange(i + 1, processedIndex + 1).setValue('');
            clearedCount++;
          }
        } else if (typeof dateValue === 'string') {
          const dateObj = new Date(dateValue);
          if (!isNaN(dateObj.getTime()) && dateObj >= cutoffDate) {
            gmailLogSheet.getRange(i + 1, processedIndex + 1).setValue('');
            clearedCount++;
          }
        } else {
          // 日付が不明な場合はクリア
          gmailLogSheet.getRange(i + 1, processedIndex + 1).setValue('');
          clearedCount++;
        }
      }
    }
    
    logInfo(`========================================`);
    logInfo(`✅ 処理済みマークをクリアしました`);
    logInfo(`クリア件数: ${clearedCount}件`);
    logInfo(`対象期間: 過去${daysBack}日間`);
    logInfo(`========================================`);
    
    return clearedCount;
  } catch (error) {
    logError('処理済みマーククリアエラー', error);
    throw error;
  }
}

