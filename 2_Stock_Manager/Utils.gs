/**
 * 在庫管理システム 共通ユーティリティ関数
 */

// ==================== ログ関連 ====================

/**
 * DEBUGレベルログ
 */
function logDebug(message) {
  Logger.log(`[DEBUG] ${new Date().toISOString()}: ${message}`);
}

/**
 * INFOレベルログ
 */
function logInfo(message) {
  Logger.log(`[INFO] ${new Date().toISOString()}: ${message}`);
}

/**
 * WARNINGレベルログ
 */
function logWarning(message) {
  Logger.log(`[WARNING] ${new Date().toISOString()}: ${message}`);
}

/**
 * ERRORレベルログ
 */
function logError(message, error) {
  const errorMsg = error ? ` - ${error.toString()}` : '';
  const stackTrace = error && error.stack ? `\nStack: ${error.stack}` : '';
  Logger.log(`[ERROR] ${new Date().toISOString()}: ${message}${errorMsg}${stackTrace}`);
}

// ==================== フォルダ・ファイル操作 ====================

/**
 * フォルダを取得または作成
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

/**
 * ファイル名のサニタイズ
 * @param {string} fileName 元のファイル名
 * @return {string} サニタイズ済みファイル名
 */
function sanitizeFileName(fileName) {
  if (!fileName) return 'untitled';
  return fileName
    .replace(/[\/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}

/**
 * ファイルをフォルダから検索
 * @param {GoogleAppsScript.Drive.Folder} folder フォルダ
 * @param {string} fileName ファイル名
 * @return {GoogleAppsScript.Drive.File|null} ファイル（見つからない場合null）
 */
function findFileInFolder(folder, fileName) {
  const files = folder.getFilesByName(fileName);
  return files.hasNext() ? files.next() : null;
}

/**
 * 月フォルダ名を取得（YYYY-MM形式）
 * @param {Date|string} date 日付オブジェクトまたは日付文字列
 * @return {string} 月フォルダ名（例: 2025-01）
 */
function getMonthFolderName(date) {
  // 文字列の場合はDateオブジェクトに変換
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return Utilities.formatDate(dateObj, 'Asia/Tokyo', 'yyyy-MM');
}

// ==================== 日付・時刻処理 ====================

/**
 * 日付を YYYY-MM-DD 形式でフォーマット
 * @param {Date} date 日付オブジェクト
 * @return {string} フォーマット済み日付文字列
 */
function formatDate(date) {
  return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd');
}

/**
 * 日付を YYYY-MM-DD HH:mm:ss 形式でフォーマット
 * @param {Date} date 日付オブジェクト
 * @return {string} フォーマット済み日時文字列
 */
function formatDateTime(date) {
  return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
}

// ==================== プロパティストア ====================

/**
 * スクリプトプロパティに値を保存
 * @param {string} key キー
 * @param {string} value 値
 */
function setProperty(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
}

/**
 * スクリプトプロパティから値を取得
 * @param {string} key キー
 * @param {string} defaultValue デフォルト値
 * @return {string} 取得した値
 */
function getProperty(key, defaultValue = null) {
  return PropertiesService.getScriptProperties().getProperty(key) || defaultValue;
}

/**
 * スクリプトプロパティを削除
 * @param {string} key キー
 */
function deleteProperty(key) {
  PropertiesService.getScriptProperties().deleteProperty(key);
}

// ==================== 通知機能 ====================

/**
 * 情報通知（成功時など）
 * @param {string} title タイトル
 * @param {string} description 内容
 */
function sendInfoNotification(title, description) {
  // 通知機能は後で実装可能
  logInfo(`ℹ️ ${title}: ${description}`);
}

/**
 * 警告通知
 * @param {string} title タイトル
 * @param {string} description 内容
 */
function sendWarningNotification(title, description) {
  // 通知機能は後で実装可能
  logWarning(`⚠️ ${title}: ${description}`);
}

/**
 * エラー通知
 * @param {string} title タイトル
 * @param {Error} error エラーオブジェクト
 * @param {string} context コンテキスト
 */
function sendErrorNotification(title, error, context = '') {
  // 通知機能は後で実装可能
  logError(`${title}${context ? ` (${context})` : ''}`, error);
}

// ==================== 売上サマリー更新 ====================

/**
 * 日次売上サマリーを更新
 * @param {Spreadsheet} spreadsheet 在庫管理スプレッドシート
 * @param {string} storeName 店舗名
 * @param {Date} date 日付
 * @param {Array} salesData 売上データ配列（itemName, soldCount, unitPrice, salesAmount を含む）
 */
function updateDailySalesSummary(spreadsheet, storeName, date, salesData) {
  try {
    logInfo(`日次売上サマリー更新開始: 店舗=${storeName}, 日付=${date}, データ件数=${salesData.length}`);
    
    let dailySalesSheet = spreadsheet.getSheetByName('日次売上サマリー');
    
    if (!dailySalesSheet) {
      logWarning('日次売上サマリーシートが見つかりません');
      return;
    }
    
    // 変更履歴シートを取得または作成
    let historySheet = spreadsheet.getSheetByName('日次売上サマリー変更履歴');
    if (!historySheet) {
      historySheet = spreadsheet.insertSheet('日次売上サマリー変更履歴');
      const historyHeaders = ['変更日時', '日付', '店舗', '商品名', '単価', '販売数', '売上金額', '操作'];
      historySheet.getRange(1, 1, 1, historyHeaders.length).setValues([historyHeaders]);
      historySheet.getRange(1, 1, 1, historyHeaders.length).setFontWeight('bold');
      historySheet.setFrozenRows(1);
      historySheet.setColumnWidth(1, 180); // 変更日時
      historySheet.setColumnWidth(3, 150); // 店舗
      historySheet.setColumnWidth(4, 300); // 商品名
      historySheet.setColumnWidth(5, 80);  // 単価
      historySheet.setColumnWidth(6, 80);  // 販売数
      historySheet.setColumnWidth(7, 100); // 売上金額
    } else {
      // 既存のヘッダーを確認して、必要に応じて更新
      const existingHeaders = historySheet.getRange(1, 1, 1, historySheet.getLastColumn()).getValues()[0];
      const expectedHeaders = ['変更日時', '日付', '店舗', '商品名', '単価', '販売数', '売上金額', '操作'];
      
      // ヘッダーが異なる場合は更新
      if (existingHeaders.length !== expectedHeaders.length || 
          !existingHeaders.every((h, i) => h === expectedHeaders[i])) {
        // 古いヘッダー名を新しいヘッダー名に更新
        const oldHeaders = ['変更日時', '日付', '店舗', '商品名', '追加した販売数', '追加した売上金額', '操作'];
        const newHeaders = ['変更日時', '日付', '店舗', '商品名', '単価', '販売数', '売上金額', '操作'];
        
        // 列を追加または更新
        if (existingHeaders.length < expectedHeaders.length) {
          // 列を追加
          historySheet.insertColumnAfter(4); // 商品名の後に単価列を追加
          historySheet.getRange(1, 5).setValue('単価');
          historySheet.getRange(1, 5).setFontWeight('bold');
          historySheet.setColumnWidth(5, 80);
        }
        
        // ヘッダーを更新
        historySheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
        historySheet.getRange(1, 1, 1, expectedHeaders.length).setFontWeight('bold');
        logInfo('変更履歴シートのヘッダーを更新しました');
      }
    }
    
    // 日付を YYYY-MM-DD 形式に変換
    const dateObj = date instanceof Date ? date : new Date(date);
    const dateStr = Utilities.formatDate(dateObj, 'Asia/Tokyo', 'yyyy-MM-dd');
    
    // 既存データを取得
    const data = dailySalesSheet.getDataRange().getValues();
    const headers = data[0];
    
    logDebug(`日次売上サマリーのヘッダー: ${headers.join(', ')}`);
    
    // ヘッダーの列インデックスを取得
    const dateIndex = headers.indexOf('日付');
    const storeIndex = headers.indexOf('店舗');
    const itemNameIndex = headers.indexOf('商品名');
    
    // 「その日の販売数」列を探す（「総販売数」からの移行も対応）
    let totalSalesIndex = headers.indexOf('その日の販売数');
    if (totalSalesIndex === -1) {
      const oldTotalSalesIndex = headers.indexOf('総販売数');
      if (oldTotalSalesIndex !== -1) {
        dailySalesSheet.getRange(1, oldTotalSalesIndex + 1).setValue('その日の販売数');
        totalSalesIndex = oldTotalSalesIndex;
        logInfo('「総販売数」列を「その日の販売数」に変更しました');
      } else {
        logError('「その日の販売数」列も「総販売数」列も見つかりません');
      }
    }
    
    // 「その日の売上金額」列を探す（「総売上金額」からの移行も対応）
    let totalRevenueIndex = headers.indexOf('その日の売上金額');
    if (totalRevenueIndex === -1) {
      const oldTotalRevenueIndex = headers.indexOf('総売上金額');
      if (oldTotalRevenueIndex !== -1) {
        dailySalesSheet.getRange(1, oldTotalRevenueIndex + 1).setValue('その日の売上金額');
        totalRevenueIndex = oldTotalRevenueIndex;
        logInfo('「総売上金額」列を「その日の売上金額」に変更しました');
      } else {
        logError('「その日の売上金額」列も「総売上金額」列も見つかりません');
      }
    }
    
    // 「商品数」列がある場合は「商品名」に変更（後方互換性のため）
    let itemNameColIndex = itemNameIndex;
    if (itemNameIndex === -1) {
      const itemCountIndex = headers.indexOf('商品数');
      if (itemCountIndex !== -1) {
        dailySalesSheet.getRange(1, itemCountIndex + 1).setValue('商品名');
        dailySalesSheet.setColumnWidth(itemCountIndex + 1, 300);
        itemNameColIndex = itemCountIndex;
        logInfo('「商品数」列を「商品名」に変更しました');
      }
    }
    
    if (dateIndex === -1 || storeIndex === -1 || itemNameColIndex === -1 || 
        totalSalesIndex === -1 || totalRevenueIndex === -1) {
      logError(`日次売上サマリーシートのヘッダーが不正です。見つかった列: 日付=${dateIndex}, 店舗=${storeIndex}, 商品名=${itemNameColIndex}, その日の販売数=${totalSalesIndex}, その日の売上金額=${totalRevenueIndex}`);
      logError(`実際のヘッダー: ${headers.join(', ')}`);
      return;
    }
    
    // 既存の行を検索（日付と店舗で一致）
    let existingRowIndex = -1;
    logDebug(`既存行を検索中: 日付=${dateStr}, 店舗=${storeName}`);
    
    for (let i = 1; i < data.length; i++) {
      const rowDate = data[i][dateIndex];
      const rowStore = data[i][storeIndex];
      
      // 日付の比較（Dateオブジェクトまたは文字列）
      let rowDateStr = '';
      if (rowDate instanceof Date) {
        rowDateStr = Utilities.formatDate(rowDate, 'Asia/Tokyo', 'yyyy-MM-dd');
      } else if (typeof rowDate === 'string') {
        // 文字列の場合はそのまま使用（既にyyyy-MM-dd形式の可能性）
        rowDateStr = rowDate.trim();
        // スラッシュ区切りの場合は変換
        if (rowDateStr.includes('/')) {
          const dateObj = new Date(rowDateStr);
          if (!isNaN(dateObj.getTime())) {
            rowDateStr = Utilities.formatDate(dateObj, 'Asia/Tokyo', 'yyyy-MM-dd');
          }
        }
      }
      
      logDebug(`行${i + 1}: 日付=${rowDateStr} (元の値: ${rowDate}, 型: ${typeof rowDate}), 店舗=${rowStore}`);
      
      if (rowDateStr === dateStr && rowStore === storeName) {
        existingRowIndex = i + 1; // スプレッドシートの行番号（1ベース）
        logInfo(`既存行が見つかりました: 行${existingRowIndex}`);
        break;
      }
    }
    
    if (existingRowIndex === -1) {
      logInfo(`既存行が見つかりませんでした。新しい行を追加します。`);
    }
    
    // 売上データを集計
    logDebug(`売上データ件数: ${salesData.length}`);
    logDebug(`売上データ: ${JSON.stringify(salesData)}`);
    
    const totalSoldCount = salesData.reduce((sum, item) => {
      const count = parseInt(item.soldCount, 10) || 0;
      logDebug(`商品: ${item.itemName}, 販売数: ${count}`);
      return sum + count;
    }, 0);
    
    const totalRevenue = salesData.reduce((sum, item) => {
      const amount = parseInt(item.salesAmount || 0, 10) || 0;
      logDebug(`商品: ${item.itemName}, 売上金額: ${amount}`);
      return sum + amount;
    }, 0);
    
    logDebug(`集計結果 - その日の販売数: ${totalSoldCount}, その日の売上金額: ${totalRevenue}`);
    
    // 商品名のリストを作成（重複を避ける）
    const itemNames = [...new Set(salesData.map(item => item.itemName))];
    const itemNamesStr = itemNames.join('、');
    
    if (existingRowIndex > 0) {
      // 既存の行を更新（既存の値に加算）
      const currentItemNamesStr = dailySalesSheet.getRange(existingRowIndex, itemNameColIndex + 1).getValue() || '';
      
      // 既存の販売数を読み取る（日付型の可能性を考慮）
      const currentTotalSalesValue = dailySalesSheet.getRange(existingRowIndex, totalSalesIndex + 1).getValue();
      let currentTotalSales = 0;
      if (currentTotalSalesValue instanceof Date) {
        logWarning(`既存の販売数が日付型です。0から開始します。行: ${existingRowIndex}, 列: ${totalSalesIndex + 1}`);
        currentTotalSales = 0;
      } else {
        currentTotalSales = parseInt(currentTotalSalesValue, 10) || 0;
      }
      
      // 既存の売上金額を読み取る（日付型の可能性を考慮）
      const currentTotalRevenueValue = dailySalesSheet.getRange(existingRowIndex, totalRevenueIndex + 1).getValue();
      let currentTotalRevenue = 0;
      if (currentTotalRevenueValue instanceof Date) {
        logWarning(`既存の売上金額が日付型です。0から開始します。行: ${existingRowIndex}, 列: ${totalRevenueIndex + 1}`);
        currentTotalRevenue = 0;
      } else {
        currentTotalRevenue = parseInt(currentTotalRevenueValue, 10) || 0;
      }
      
      logDebug(`既存データ - 商品名: ${currentItemNamesStr}, その日の販売数: ${currentTotalSales}, その日の売上金額: ${currentTotalRevenue}`);
      
      // 既存の商品名を解析（「商品名、商品名」の形式）
      const existingItemNames = currentItemNamesStr ? currentItemNamesStr.split('、').map(name => name.trim()).filter(name => name) : [];
      
      // 既存の商品名と新しい商品名をマージ（重複を避ける）
      const allItemNames = [...new Set([...existingItemNames, ...itemNames])];
      const newItemNamesStr = allItemNames.join('、');
      
      const newTotalSales = currentTotalSales + totalSoldCount;
      const newTotalRevenue = currentTotalRevenue + totalRevenue;
      
      logDebug(`更新データ - 商品名: ${newItemNamesStr}, その日の販売数: ${currentTotalSales} + ${totalSoldCount} = ${newTotalSales}, その日の売上金額: ${currentTotalRevenue} + ${totalRevenue} = ${newTotalRevenue}`);
      
      // 商品名を更新
      dailySalesSheet.getRange(existingRowIndex, itemNameColIndex + 1).setValue(newItemNamesStr);
      
      // 数値形式を設定してから書き込む
      const salesRange = dailySalesSheet.getRange(existingRowIndex, totalSalesIndex + 1);
      salesRange.setNumberFormat('0'); // 数値形式を明示的に設定
      salesRange.setValue(newTotalSales);
      
      const revenueRange = dailySalesSheet.getRange(existingRowIndex, totalRevenueIndex + 1);
      revenueRange.setNumberFormat('#,##0'); // 数値形式を明示的に設定
      revenueRange.setValue(newTotalRevenue);
      
      // 書き込み後の値を確認（デバッグ用）
      const verifySales = salesRange.getValue();
      const verifyRevenue = revenueRange.getValue();
      logDebug(`書き込み確認 - その日の販売数: ${verifySales} (型: ${typeof verifySales}), その日の売上金額: ${verifyRevenue} (型: ${typeof verifyRevenue})`);
      
      logInfo(`  📊 日次売上サマリー更新: ${storeName} (${dateStr}) - 商品名: ${newItemNamesStr}, その日の販売数: ${currentTotalSales} → ${newTotalSales}, その日の売上金額: ¥${currentTotalRevenue.toLocaleString()} → ¥${newTotalRevenue.toLocaleString()}`);
      
      // 変更履歴に記録
      // 単価を計算（売上金額 / 販売数、0除算を避ける）
      const unitPrice = totalSoldCount > 0 ? Math.round(totalRevenue / totalSoldCount) : 0;
      
      const historyHeaders = historySheet.getRange(1, 1, 1, historySheet.getLastColumn()).getValues()[0];
      const unitPriceIndex = historyHeaders.indexOf('単価');
      const salesCountIndex = historyHeaders.indexOf('販売数');
      const salesAmountIndex = historyHeaders.indexOf('売上金額');
      
      if (unitPriceIndex !== -1 && salesCountIndex !== -1 && salesAmountIndex !== -1) {
        // 新しいヘッダー形式（単価、販売数、売上金額）
        historySheet.appendRow([
          new Date(),
          dateStr,
          storeName,
          itemNamesStr,
          unitPrice,
          totalSoldCount,
          totalRevenue,
          '追加'
        ]);
      } else {
        // 旧形式（後方互換性のため）
        historySheet.appendRow([
          new Date(),
          dateStr,
          storeName,
          itemNamesStr,
          totalSoldCount,
          totalRevenue,
          '追加'
        ]);
      }
    } else {
      // 新しい行を追加
      const newRow = [
        dateStr,
        storeName,
        itemNamesStr,
        totalSoldCount,
        totalRevenue
      ];
      
      dailySalesSheet.appendRow(newRow);
      
      // 数値形式を設定
      const lastRow = dailySalesSheet.getLastRow();
      dailySalesSheet.getRange(lastRow, totalSalesIndex + 1).setNumberFormat('0');
      dailySalesSheet.getRange(lastRow, totalRevenueIndex + 1).setNumberFormat('#,##0');
      
      logInfo(`  📊 日次売上サマリー追加: ${storeName} (${dateStr}) - 商品名: ${itemNamesStr}, その日の販売数: ${totalSoldCount}, その日の売上金額: ¥${totalRevenue.toLocaleString()}`);
      
      // 変更履歴に記録
      // 単価を計算（売上金額 / 販売数、0除算を避ける）
      const unitPrice = totalSoldCount > 0 ? Math.round(totalRevenue / totalSoldCount) : 0;
      
      const historyHeaders = historySheet.getRange(1, 1, 1, historySheet.getLastColumn()).getValues()[0];
      const unitPriceIndex = historyHeaders.indexOf('単価');
      const salesCountIndex = historyHeaders.indexOf('販売数');
      const salesAmountIndex = historyHeaders.indexOf('売上金額');
      
      if (unitPriceIndex !== -1 && salesCountIndex !== -1 && salesAmountIndex !== -1) {
        // 新しいヘッダー形式（単価、販売数、売上金額）
        historySheet.appendRow([
          new Date(),
          dateStr,
          storeName,
          itemNamesStr,
          unitPrice,
          totalSoldCount,
          totalRevenue,
          '新規追加'
        ]);
      } else {
        // 旧形式（後方互換性のため）
        historySheet.appendRow([
          new Date(),
          dateStr,
          storeName,
          itemNamesStr,
          totalSoldCount,
          totalRevenue,
          '新規追加'
        ]);
      }
    }
    
  } catch (error) {
    logError('日次売上サマリー更新エラー', error);
  }
}

/**
 * 日次売上サマリーをクリア（変更履歴を記録）
 * @param {Spreadsheet} spreadsheet 在庫管理スプレッドシート
 * @param {string} targetDate クリアする日付（YYYY-MM-DD形式、省略時は全て）
 * @param {string} targetStore クリアする店舗（省略時は全て）
 * @return {Object} クリア結果
 */
function clearDailySalesSummary(spreadsheet, targetDate = null, targetStore = null) {
  try {
    logInfo('========================================');
    logInfo('日次売上サマリークリア開始');
    logInfo('========================================');
    
    if (targetDate) {
      logInfo(`対象日付: ${targetDate}`);
    } else {
      logInfo('対象日付: 全て');
    }
    
    if (targetStore) {
      logInfo(`対象店舗: ${targetStore}`);
    } else {
      logInfo('対象店舗: 全て');
    }
    
    let dailySalesSheet = spreadsheet.getSheetByName('日次売上サマリー');
    
    if (!dailySalesSheet) {
      logError('日次売上サマリーシートが見つかりません');
      return { cleared: 0, errors: ['シートが見つかりません'] };
    }
    
    // 変更履歴シートを取得または作成
    let historySheet = spreadsheet.getSheetByName('日次売上サマリー変更履歴');
    if (!historySheet) {
      historySheet = spreadsheet.insertSheet('日次売上サマリー変更履歴');
      const historyHeaders = ['変更日時', '日付', '店舗', '商品名', '単価', '販売数', '売上金額', '操作'];
      historySheet.getRange(1, 1, 1, historyHeaders.length).setValues([historyHeaders]);
      historySheet.getRange(1, 1, 1, historyHeaders.length).setFontWeight('bold');
      historySheet.setFrozenRows(1);
      historySheet.setColumnWidth(1, 180); // 変更日時
      historySheet.setColumnWidth(3, 150); // 店舗
      historySheet.setColumnWidth(4, 300); // 商品名
      historySheet.setColumnWidth(5, 80);  // 単価
      historySheet.setColumnWidth(6, 80);  // 販売数
      historySheet.setColumnWidth(7, 100); // 売上金額
    } else {
      // 既存のヘッダーを確認して、必要に応じて更新
      const existingHeaders = historySheet.getRange(1, 1, 1, historySheet.getLastColumn()).getValues()[0];
      const expectedHeaders = ['変更日時', '日付', '店舗', '商品名', '単価', '販売数', '売上金額', '操作'];
      
      // ヘッダーが異なる場合は更新
      if (existingHeaders.length !== expectedHeaders.length || 
          !existingHeaders.every((h, i) => h === expectedHeaders[i])) {
        // 古いヘッダー名を新しいヘッダー名に更新
        if (existingHeaders.includes('追加した販売数')) {
          const salesIndex = existingHeaders.indexOf('追加した販売数');
          historySheet.getRange(1, salesIndex + 1).setValue('販売数');
        }
        if (existingHeaders.includes('追加した売上金額')) {
          const revenueIndex = existingHeaders.indexOf('追加した売上金額');
          historySheet.getRange(1, revenueIndex + 1).setValue('売上金額');
        }
        if (existingHeaders.includes('クリア前の販売数')) {
          const salesIndex = existingHeaders.indexOf('クリア前の販売数');
          historySheet.getRange(1, salesIndex + 1).setValue('販売数');
        }
        if (existingHeaders.includes('クリア前の売上金額')) {
          const revenueIndex = existingHeaders.indexOf('クリア前の売上金額');
          historySheet.getRange(1, revenueIndex + 1).setValue('売上金額');
        }
        
        // 単価列がない場合は追加
        if (!existingHeaders.includes('単価')) {
          historySheet.insertColumnAfter(4); // 商品名の後に単価列を追加
          historySheet.getRange(1, 5).setValue('単価');
          historySheet.getRange(1, 5).setFontWeight('bold');
          historySheet.setColumnWidth(5, 80);
        }
        
        logInfo('変更履歴シートのヘッダーを更新しました');
      }
    }
    
    // 既存データを取得
    const data = dailySalesSheet.getDataRange().getValues();
    if (data.length <= 1) {
      logInfo('クリア対象のデータがありません');
      return { cleared: 0, errors: [] };
    }
    
    const headers = data[0];
    const dateIndex = headers.indexOf('日付');
    const storeIndex = headers.indexOf('店舗');
    const itemNameIndex = headers.indexOf('商品名');
    const totalSalesIndex = headers.indexOf('その日の販売数') >= 0 ? headers.indexOf('その日の販売数') : headers.indexOf('総販売数');
    const totalRevenueIndex = headers.indexOf('その日の売上金額') >= 0 ? headers.indexOf('その日の売上金額') : headers.indexOf('総売上金額');
    
    if (dateIndex === -1 || storeIndex === -1 || itemNameIndex === -1 || 
        totalSalesIndex === -1 || totalRevenueIndex === -1) {
      logError('日次売上サマリーシートのヘッダーが不正です');
      return { cleared: 0, errors: ['ヘッダーが不正です'] };
    }
    
    let clearedCount = 0;
    const now = new Date();
    
    // 2行目からデータを処理（1行目はヘッダー）
    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      const rowDate = row[dateIndex];
      const rowStore = row[storeIndex];
      const rowItemNames = row[itemNameIndex] || '';
      const rowSales = row[totalSalesIndex] || 0;
      const rowRevenue = row[totalRevenueIndex] || 0;
      
      // 日付の比較
      let rowDateStr = '';
      if (rowDate instanceof Date) {
        rowDateStr = Utilities.formatDate(rowDate, 'Asia/Tokyo', 'yyyy-MM-dd');
      } else if (typeof rowDate === 'string') {
        rowDateStr = rowDate.trim();
        if (rowDateStr.includes('/')) {
          const dateObj = new Date(rowDateStr);
          if (!isNaN(dateObj.getTime())) {
            rowDateStr = Utilities.formatDate(dateObj, 'Asia/Tokyo', 'yyyy-MM-dd');
          }
        }
      }
      
      // フィルタ条件チェック
      if (targetDate && rowDateStr !== targetDate) {
        continue;
      }
      if (targetStore && rowStore !== targetStore) {
        continue;
      }
      
      // 変更履歴に記録
      // 単価を計算（売上金額 / 販売数、0除算を避ける）
      const unitPrice = rowSales > 0 ? Math.round(rowRevenue / rowSales) : 0;
      
      const historyHeaders = historySheet.getRange(1, 1, 1, historySheet.getLastColumn()).getValues()[0];
      const unitPriceIndex = historyHeaders.indexOf('単価');
      const salesCountIndex = historyHeaders.indexOf('販売数');
      const salesAmountIndex = historyHeaders.indexOf('売上金額');
      
      if (unitPriceIndex !== -1 && salesCountIndex !== -1 && salesAmountIndex !== -1) {
        // 新しいヘッダー形式（単価、販売数、売上金額）
        historySheet.appendRow([
          now,
          rowDateStr,
          rowStore,
          rowItemNames,
          unitPrice,
          rowSales,
          rowRevenue,
          'クリア'
        ]);
      } else {
        // 旧形式（後方互換性のため）
        historySheet.appendRow([
          now,
          rowDateStr,
          rowStore,
          rowItemNames,
          rowSales,
          rowRevenue,
          'クリア'
        ]);
      }
      
      // 行を削除
      dailySalesSheet.deleteRow(i + 1);
      clearedCount++;
      
      logInfo(`クリア: ${rowDateStr} ${rowStore} - 商品名: ${rowItemNames}, 販売数: ${rowSales}, 売上金額: ${rowRevenue}`);
    }
    
    logInfo('========================================');
    logInfo(`✅ 日次売上サマリーをクリアしました`);
    logInfo(`クリア件数: ${clearedCount}行`);
    logInfo(`変更履歴シートに記録しました`);
    logInfo('========================================');
    
    return { cleared: clearedCount, errors: [] };
    
  } catch (error) {
    logError('日次売上サマリークリアエラー', error);
    return { cleared: 0, errors: [error.message] };
  }
}

/**
 * 日次売上サマリーを全てクリア（手動実行用）
 */
function clearAllDailySalesSummary() {
  try {
    const spreadsheet = getStockManagementSpreadsheet();
    if (!spreadsheet) {
      logError('在庫管理スプレッドシートを取得できませんでした');
      return;
    }
    
    const result = clearDailySalesSummary(spreadsheet);
    logInfo(`クリア完了: ${result.cleared}行`);
    
    return result;
  } catch (error) {
    logError('日次売上サマリー全クリアエラー', error);
    throw error;
  }
}

