/**
 * 名前マッピング機能
 * 判断できなかった名前をリスト化し、あだ名や間違いを含めてマッピングできる機能
 */

/**
 * 判断できなかった名前を検出してリスト化
 * 「不明」「Unknown」「レーラー」などの名前を検出
 */
function collectUnknownNames() {
  logInfo('========================================');
  logInfo('🔍 判断できなかった名前を収集中...');
  logInfo('========================================');
  
  try {
    const spreadsheet = getMasterSpreadsheet();
    const messageSheet = spreadsheet.getSheetByName('メッセージ一覧');
    
    if (!messageSheet) {
      throw new Error('メッセージ一覧シートが見つかりません');
    }
    
    // 名前マッピングシートを取得または作成
    const mappingSheet = getOrCreateNameMappingSheet(spreadsheet);
    
    // 判断できなかった名前のパターン
    const unknownPatterns = [
      '不明',
      'Unknown',
      'unknown',
      'レーラー',
      '不明な',
      '未設定',
      'N/A',
      'n/a',
      '---',
      '???',
      '？？？'
    ];
    
    const data = messageSheet.getDataRange().getValues();
    const nameColumnIndex = 1; // B列: 送信者
    
    // 名前の出現回数をカウント
    const nameCounts = {};
    const nameFirstSeen = {};
    const nameLastSeen = {};
    
    // ヘッダー行をスキップ
    for (let i = 1; i < data.length; i++) {
      const name = data[i][nameColumnIndex];
      
      if (!name || typeof name !== 'string') {
        continue;
      }
      
      // 判断できなかった名前かチェック
      const isUnknown = unknownPatterns.some(pattern => 
        name.includes(pattern) || 
        name.trim() === '' ||
        name.length < 2  // 短すぎる名前も疑わしい
      );
      
      // ユーザーIDのみのパターンも検出（例: user@example.com）
      const isUserIdOnly = name.includes('@') && !name.includes(' ');
      
      if (isUnknown || isUserIdOnly) {
        if (!nameCounts[name]) {
          nameCounts[name] = 0;
          nameFirstSeen[name] = data[i][0]; // 日時
        }
        nameCounts[name]++;
        nameLastSeen[name] = data[i][0]; // 日時
      }
    }
    
    // 既存のデータを取得
    const existingData = mappingSheet.getDataRange().getValues();
    const existingNames = new Set();
    
    // ヘッダー行をスキップ
    for (let i = 1; i < existingData.length; i++) {
      const existingName = existingData[i][0]; // A列: 判断できなかった名前
      if (existingName) {
        existingNames.add(existingName);
      }
    }
    
    // 新しい名前を追加
    const newNames = [];
    Object.keys(nameCounts).forEach(name => {
      if (!existingNames.has(name)) {
        newNames.push({
          name: name,
          count: nameCounts[name],
          firstSeen: nameFirstSeen[name],
          lastSeen: nameLastSeen[name]
        });
      } else {
        // 既存の名前の出現回数を更新
        updateNameCount(mappingSheet, name, nameCounts[name], nameLastSeen[name]);
      }
    });
    
    // 新しい名前を追加
    if (newNames.length > 0) {
      const rows = newNames.map(item => [
        item.name,                    // A列: 判断できなかった名前
        '',                           // B列: 正しい名前（マッピング）
        item.count,                   // C列: 出現回数
        formatDateTime(item.firstSeen), // D列: 初回出現日時
        formatDateTime(item.lastSeen), // E列: 最終出現日時
        '',                           // F列: メモ
        '未対応'                       // G列: ステータス
      ]);
      
      const lastRow = mappingSheet.getLastRow();
      mappingSheet.getRange(lastRow + 1, 1, rows.length, 7).setValues(rows);
      
      logInfo(`✅ ${newNames.length}件の新しい名前を追加しました`);
    } else {
      logInfo('新しい名前は見つかりませんでした');
    }
    
    logInfo(`\n合計: ${Object.keys(nameCounts).length}件の判断できなかった名前`);
    logInfo('========================================');
    
    return {
      total: Object.keys(nameCounts).length,
      new: newNames.length,
      updated: Object.keys(nameCounts).length - newNames.length
    };
    
  } catch (error) {
    logError('名前収集エラー', error);
    throw error;
  }
}

/**
 * 名前マッピングシートを取得または作成
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet スプレッドシート
 * @return {GoogleAppsScript.Spreadsheet.Sheet} 名前マッピングシート
 */
function getOrCreateNameMappingSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName('名前マッピング');
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet('名前マッピング');
    
    // ヘッダー行を設定
    sheet.getRange('A1:G1').setValues([[
      '判断できなかった名前',
      '正しい名前',
      '出現回数',
      '初回出現日時',
      '最終出現日時',
      'メモ',
      'ステータス'
    ]]);
    
    // ヘッダーの書式設定
    sheet.setFrozenRows(1);
    sheet.getRange('A1:G1').setFontWeight('bold');
    sheet.getRange('A1:G1').setBackground('#9c27b0');
    sheet.getRange('A1:G1').setFontColor('#ffffff');
    
    // 列幅設定
    sheet.setColumnWidth(1, 200); // 判断できなかった名前
    sheet.setColumnWidth(2, 200); // 正しい名前
    sheet.setColumnWidth(3, 100); // 出現回数
    sheet.setColumnWidth(4, 180); // 初回出現日時
    sheet.setColumnWidth(5, 180); // 最終出現日時
    sheet.setColumnWidth(6, 300); // メモ
    sheet.setColumnWidth(7, 100); // ステータス
    
    // データ検証（ステータス列）
    const statusRange = sheet.getRange('G2:G');
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['未対応', '対応中', '完了', '無視'], true)
      .build();
    statusRange.setDataValidation(rule);
    
    logInfo('名前マッピングシートを作成しました');
  }
  
  return sheet;
}

/**
 * 名前の出現回数を更新
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet シート
 * @param {string} name 名前
 * @param {number} count 出現回数
 * @param {Date} lastSeen 最終出現日時
 */
function updateNameCount(sheet, name, count, lastSeen) {
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === name) {
      // 出現回数を更新（既存の値と比較して大きい方を採用）
      const currentCount = data[i][2] || 0;
      if (count > currentCount) {
        sheet.getRange(i + 1, 3).setValue(count);
      }
      
      // 最終出現日時を更新
      sheet.getRange(i + 1, 5).setValue(formatDateTime(lastSeen));
      break;
    }
  }
}

/**
 * 名前マッピングを適用
 * マッピングシートの設定に基づいて、メッセージ一覧の名前を正規化
 */
function applyNameMappings() {
  logInfo('========================================');
  logInfo('🔄 名前マッピングを適用中...');
  logInfo('========================================');
  
  try {
    const spreadsheet = getMasterSpreadsheet();
    const messageSheet = spreadsheet.getSheetByName('メッセージ一覧');
    const mappingSheet = spreadsheet.getSheetByName('名前マッピング');
    
    if (!messageSheet) {
      throw new Error('メッセージ一覧シートが見つかりません');
    }
    
    if (!mappingSheet) {
      logWarning('名前マッピングシートが見つかりません。先にcollectUnknownNames()を実行してください。');
      return { updated: 0 };
    }
    
    // マッピングデータを読み込み
    const mappingData = mappingSheet.getDataRange().getValues();
    const mappings = {};
    
    // ヘッダー行をスキップ
    for (let i = 1; i < mappingData.length; i++) {
      const unknownName = mappingData[i][0]; // A列: 判断できなかった名前
      const correctName = mappingData[i][1]; // B列: 正しい名前
      const status = mappingData[i][6]; // G列: ステータス
      
      // 正しい名前が設定されていて、ステータスが「完了」または「対応中」の場合のみ適用
      if (correctName && correctName.trim() !== '' && 
          (status === '完了' || status === '対応中')) {
        mappings[unknownName] = correctName.trim();
      }
    }
    
    if (Object.keys(mappings).length === 0) {
      logInfo('適用できるマッピングがありません');
      return { updated: 0 };
    }
    
    logInfo(`適用するマッピング: ${Object.keys(mappings).length}件`);
    
    // メッセージ一覧のデータを取得
    const data = messageSheet.getDataRange().getValues();
    const nameColumnIndex = 1; // B列: 送信者
    let updateCount = 0;
    
    // ヘッダー行をスキップ
    for (let i = 1; i < data.length; i++) {
      const currentName = data[i][nameColumnIndex];
      
      if (currentName && mappings[currentName]) {
        // マッピングを適用
        messageSheet.getRange(i + 1, nameColumnIndex + 1).setValue(mappings[currentName]);
        updateCount++;
      }
    }
    
    logInfo(`✅ ${updateCount}件の名前を更新しました`);
    logInfo('========================================');
    
    return { updated: updateCount };
    
  } catch (error) {
    logError('名前マッピング適用エラー', error);
    throw error;
  }
}

/**
 * 名前マッピングの統計情報を取得
 * @return {Object} 統計情報
 */
function getNameMappingStats() {
  try {
    const spreadsheet = getMasterSpreadsheet();
    const mappingSheet = spreadsheet.getSheetByName('名前マッピング');
    
    if (!mappingSheet) {
      return {
        total: 0,
        mapped: 0,
        unmapped: 0,
        completed: 0,
        inProgress: 0,
        ignored: 0
      };
    }
    
    const data = mappingSheet.getDataRange().getValues();
    let total = 0;
    let mapped = 0;
    let unmapped = 0;
    let completed = 0;
    let inProgress = 0;
    let ignored = 0;
    
    // ヘッダー行をスキップ
    for (let i = 1; i < data.length; i++) {
      const correctName = data[i][1]; // B列: 正しい名前
      const status = data[i][6]; // G列: ステータス
      
      total++;
      
      if (correctName && correctName.trim() !== '') {
        mapped++;
      } else {
        unmapped++;
      }
      
      if (status === '完了') {
        completed++;
      } else if (status === '対応中') {
        inProgress++;
      } else if (status === '無視') {
        ignored++;
      }
    }
    
    return {
      total: total,
      mapped: mapped,
      unmapped: unmapped,
      completed: completed,
      inProgress: inProgress,
      ignored: ignored
    };
    
  } catch (error) {
    logError('名前マッピング統計取得エラー', error);
    return { error: error.message };
  }
}

/**
 * 名前マッピングの状態を表示
 */
function showNameMappingStatus() {
  logInfo('========================================');
  logInfo('📊 名前マッピング状態');
  logInfo('========================================');
  
  const stats = getNameMappingStats();
  
  logInfo(`総数: ${stats.total}件`);
  logInfo(`マッピング済み: ${stats.mapped}件`);
  logInfo(`未マッピング: ${stats.unmapped}件`);
  logInfo(`完了: ${stats.completed}件`);
  logInfo(`対応中: ${stats.inProgress}件`);
  logInfo(`無視: ${stats.ignored}件`);
  
  logInfo('========================================');
  
  return stats;
}

/**
 * 名前をマッピングに基づいて正規化
 * @param {string} name 元の名前
 * @return {string} 正規化された名前
 */
function normalizeName(name) {
  if (!name || typeof name !== 'string') {
    return name || '不明';
  }
  
  try {
    const spreadsheet = getMasterSpreadsheet();
    const mappingSheet = spreadsheet.getSheetByName('名前マッピング');
    
    if (!mappingSheet) {
      return name;
    }
    
    // マッピングデータを読み込み（キャッシュを活用）
    const cache = CacheService.getScriptCache();
    const cacheKey = 'name_mappings';
    let mappings = cache.get(cacheKey);
    
    if (!mappings) {
      // キャッシュがない場合は読み込み
      const mappingData = mappingSheet.getDataRange().getValues();
      mappings = {};
      
      // ヘッダー行をスキップ
      for (let i = 1; i < mappingData.length; i++) {
        const unknownName = mappingData[i][0]; // A列: 判断できなかった名前
        const correctName = mappingData[i][1]; // B列: 正しい名前
        const status = mappingData[i][6]; // G列: ステータス
        
        // 正しい名前が設定されていて、ステータスが「完了」または「対応中」の場合のみ適用
        if (correctName && correctName.trim() !== '' && 
            (status === '完了' || status === '対応中')) {
          mappings[unknownName] = correctName.trim();
        }
      }
      
      // 5分間キャッシュ
      cache.put(cacheKey, JSON.stringify(mappings), 300);
    } else {
      mappings = JSON.parse(mappings);
    }
    
    // マッピングを適用
    return mappings[name] || name;
    
  } catch (error) {
    logDebug(`名前正規化エラー: ${error.message}`);
    return name;
  }
}

/**
 * 名前マッピングのキャッシュをクリア
 */
function clearNameMappingCache() {
  const cache = CacheService.getScriptCache();
  cache.remove('name_mappings');
  logInfo('名前マッピングキャッシュをクリアしました');
}

/**
 * 名前マッピングを一括で設定（CSV形式のデータから）
 * @param {Array<Array>} mappingData CSV形式のデータ [[判断できなかった名前, 正しい名前, メモ], ...]
 */
function bulkSetNameMappings(mappingData) {
  logInfo('========================================');
  logInfo('📝 名前マッピングを一括設定中...');
  logInfo('========================================');
  
  try {
    const spreadsheet = getMasterSpreadsheet();
    const mappingSheet = getOrCreateNameMappingSheet(spreadsheet);
    
    const existingData = mappingSheet.getDataRange().getValues();
    const existingNames = new Map();
    
    // 既存のデータをマップに格納
    for (let i = 1; i < existingData.length; i++) {
      const name = existingData[i][0];
      if (name) {
        existingNames.set(name, i + 1); // 行番号を保存
      }
    }
    
    let updated = 0;
    let added = 0;
    
    mappingData.forEach((row, index) => {
      const unknownName = row[0];
      const correctName = row[1] || '';
      const memo = row[2] || '';
      
      if (!unknownName) {
        return;
      }
      
      const existingRow = existingNames.get(unknownName);
      
      if (existingRow) {
        // 既存の行を更新
        if (correctName) {
          mappingSheet.getRange(existingRow, 2).setValue(correctName); // B列: 正しい名前
        }
        if (memo) {
          mappingSheet.getRange(existingRow, 6).setValue(memo); // F列: メモ
        }
        mappingSheet.getRange(existingRow, 7).setValue('完了'); // G列: ステータス
        updated++;
      } else {
        // 新しい行を追加
        const newRow = [
          unknownName,           // A列: 判断できなかった名前
          correctName,           // B列: 正しい名前
          0,                     // C列: 出現回数（後で更新）
          '',                    // D列: 初回出現日時
          '',                    // E列: 最終出現日時
          memo,                  // F列: メモ
          correctName ? '完了' : '未対応' // G列: ステータス
        ];
        
        const lastRow = mappingSheet.getLastRow();
        mappingSheet.getRange(lastRow + 1, 1, 1, 7).setValues([newRow]);
        added++;
      }
    });
    
    logInfo(`✅ 更新: ${updated}件、追加: ${added}件`);
    logInfo('========================================');
    
    return { updated: updated, added: added };
    
  } catch (error) {
    logError('名前マッピング一括設定エラー', error);
    throw error;
  }
}

