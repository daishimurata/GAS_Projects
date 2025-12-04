/**
 * 在庫管理システム テスト用スクリプト
 * メール取得機能をテストするための関数群
 */

/**
 * チャットログから補充個数を取得する機能のテスト
 */
function testChatStockUpdate() {
  Logger.log('========================================');
  Logger.log('📦 チャット在庫更新機能テスト開始');
  Logger.log('========================================');
  
  try {
    // 設定確認
    if (!CONFIG.STOCK_MANAGEMENT || !CONFIG.STOCK_MANAGEMENT.ENABLED) {
      Logger.log('⚠️ 在庫管理機能が無効です。Config.gsでENABLEDをtrueに設定してください。');
      return;
    }
    
    // テストケース
    const testCases = [
      {
        name: '基本パターン1: 入荷',
        message: 'みどりの大地にじゃがいも10個入荷しました',
        sender: 'テストユーザー1',
        expectedStore: 'みどりの大地',
        expectedItem: 'じゃがいも',
        expectedCount: 10
      },
      {
        name: '基本パターン2: 補充',
        message: '四季彩 尾平店に白ねぎ5個補充',
        sender: 'テストユーザー2',
        expectedStore: '四季彩 尾平店',
        expectedItem: '白ねぎ',
        expectedCount: 5
      },
      {
        name: '基本パターン3: 納品',
        message: 'エーコープにサツマイモ20個納品',
        sender: 'テストユーザー3',
        expectedStore: 'エーコープ',
        expectedItem: 'サツマイモ',
        expectedCount: 20
      },
      {
        name: '別名キーワードパターン1: ジャガイモ',
        message: 'みどりの大地にジャガイモ15個追加',
        sender: 'テストユーザー4',
        expectedStore: 'みどりの大地',
        expectedItem: 'じゃがいも',
        expectedCount: 15
      },
      {
        name: '別名キーワードパターン2: しらねぎ',
        message: '四季彩 尾平店にしらねぎ8個置きました',
        sender: 'テストユーザー5',
        expectedStore: '四季彩 尾平店',
        expectedItem: '白ねぎ',
        expectedCount: 8
      },
      {
        name: '複数商品パターン',
        message: 'みどりの大地にじゃがいも10個と白ねぎ5個入荷',
        sender: 'テストユーザー6',
        expectedStore: 'みどりの大地',
        expectedItem: 'じゃがいも',
        expectedCount: 10
      },
      {
        name: '店舗名なしパターン（キーワードあり）',
        message: 'じゃがいも10個補充しました',
        sender: 'テストユーザー7',
        expectedStore: null, // 店舗が特定できない場合はnull
        expectedItem: null,
        expectedCount: 0
      },
      {
        name: 'キーワードなしパターン',
        message: 'みどりの大地にじゃがいも10個',
        sender: 'テストユーザー8',
        expectedStore: 'みどりの大地',
        expectedItem: 'じゃがいも',
        expectedCount: 10
      }
    ];
    
    Logger.log(`テストケース数: ${testCases.length}件\n`);
    
    let successCount = 0;
    let failCount = 0;
    
    testCases.forEach((testCase, index) => {
      Logger.log(`\n[テストケース ${index + 1}] ${testCase.name}`);
      Logger.log(`メッセージ: "${testCase.message}"`);
      Logger.log(`送信者: ${testCase.sender}`);
      
      // テスト実行（実際の更新は行わない）
      const result = testChatStockUpdateSingle(testCase.message, testCase.sender, new Date(), false);
      
      if (result) {
        Logger.log(`✅ 結果: 店舗=${result.storeName}, メッセージ=${result.message}`);
        
        // 期待値と比較（店舗名を正規化して比較）
        const normalizedResultStore = result.storeName ? result.storeName.replace(/　/g, ' ').trim() : '';
        const normalizedExpectedStore = testCase.expectedStore ? testCase.expectedStore.replace(/　/g, ' ').trim() : '';
        
        if (testCase.expectedStore && normalizedResultStore === normalizedExpectedStore) {
          Logger.log(`✅ 店舗名: 期待値通り (${testCase.expectedStore})`);
          successCount++;
        } else if (!testCase.expectedStore && !result.storeName) {
          Logger.log(`✅ 店舗名: 期待値通り (店舗が特定できない)`);
          successCount++;
        } else {
          Logger.log(`❌ 店舗名: 期待値=${testCase.expectedStore}, 実際=${result.storeName}`);
          failCount++;
        }
      } else {
        Logger.log(`結果: null（更新なし）`);
        if (!testCase.expectedStore) {
          Logger.log(`✅ 期待値通り（更新なし）`);
          successCount++;
        } else {
          Logger.log(`❌ 期待値: 店舗=${testCase.expectedStore}, 商品=${testCase.expectedItem}, 数量=${testCase.expectedCount}`);
          failCount++;
        }
      }
    });
    
    Logger.log('\n========================================');
    Logger.log('📊 テスト結果サマリー');
    Logger.log('========================================');
    Logger.log(`成功: ${successCount}件`);
    Logger.log(`失敗: ${failCount}件`);
    Logger.log(`合計: ${testCases.length}件`);
    Logger.log('========================================');
    
    return {
      success: successCount,
      fail: failCount,
      total: testCases.length
    };
    
  } catch (error) {
    Logger.log(`❌ テスト実行エラー: ${error.toString()}`);
    Logger.log(`スタックトレース: ${error.stack}`);
    throw error;
  }
}

/**
 * 単一のチャットメッセージをテスト（実際の更新は行わない）
 * @param {string} messageText メッセージテキスト
 * @param {string} senderName 送信者名
 * @param {Date} date 日付
 * @param {boolean} doUpdate 実際に更新するか（falseの場合はテストのみ）
 * @return {Object|null} 更新結果
 */
function testChatStockUpdateSingle(messageText, senderName, date, doUpdate = false) {
  try {
    logInfo(`[TEST] チャット在庫更新テスト: "${messageText}"`);
    
    // キーワードチェック
    const keywords = ['入荷', '補充', '納品', '置きました', '追加', '出荷', '持っていった', '納入', '搬入'];
    const hasKeyword = keywords.some(kw => messageText.includes(kw));
    
    if (!CONFIG.STOCK_MANAGEMENT || !CONFIG.STOCK_MANAGEMENT.ENABLED) {
      logInfo('[TEST] 在庫管理機能が無効です');
      return null;
    }
    
    const spreadsheet = getStockManagementSpreadsheet();
    const stockSheet = spreadsheet.getSheetByName(CONFIG.STOCK_MANAGEMENT.SHEET_STOCK);
    
    if (!stockSheet) {
      logInfo('[TEST] 在庫管理シートが見つかりません');
      return null;
    }
    
    // 商品マスタ読み込み
    const stockMap = loadStockMaster(stockSheet);
    
    // 店舗判定
    let storeName = detectStoreName({ subject: '', body: messageText }, spreadsheet);
    logInfo(`[TEST] 店舗判定結果: ${storeName}`);
    
    // キーワードがなく、かつ店舗も特定できない場合はスキップ
    if (!hasKeyword && (!storeName || storeName === '不明な店舗')) {
      logInfo(`[TEST] キーワードも店舗名も見つからないためスキップ`);
      return null;
    }
    
    if (!storeName || storeName === '不明な店舗') {
      logInfo(`[TEST] 店舗名が検出できません`);
      return null;
    }
    
    // 店舗名を正規化（全角スペースを半角スペースに変換）
    const normalizedStoreName = storeName.replace(/　/g, ' ').trim();
    
    let updated = false;
    let resultMessage = '';
    const processedItems = new Set();
    const detectedItems = [];
    
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
          
          // 抽出 (マッチした単語を使用)
          const count = extractSoldCount(messageText, matchedName);
          logInfo(`[TEST] 商品検知: ${itemName} (KW:${matchedName}), 数量: ${count}`);
          
          if (count > 0) {
            const currentStock = parseInt(stockInfo.currentStock, 10) || 0;
            const newStock = currentStock + count;
            
            detectedItems.push({
              itemName: itemName,
              matchedName: matchedName,
              count: count,
              currentStock: currentStock,
              newStock: newStock
            });
            
            if (doUpdate) {
              // 実際に更新する場合
              stockSheet.getRange(stockInfo.rowIndex, 4).setValue(newStock);
              stockSheet.getRange(stockInfo.rowIndex, 6).setValue(new Date());
              
              const logSheet = spreadsheet.getSheetByName(CONFIG.STOCK_MANAGEMENT.SHEET_LOG);
              if (logSheet) {
                logSheet.appendRow([
                  date,
                  storeName,
                  itemName,
                  `+${count}`,
                  newStock,
                  `チャット報告: ${senderName}`
                ]);
              }
            }
            
            updated = true;
            resultMessage = `${itemName} +${count} (在庫: ${currentStock} → ${newStock})`;
            processedItems.add(itemName);
            logInfo(`[TEST] 📦 チャット在庫更新: ${storeName} ${itemName} +${count}`);
          }
        }
      }
    });
    
    if (updated) {
      Logger.log(`[TEST] 検出された商品:`);
      detectedItems.forEach(item => {
        Logger.log(`  - ${item.itemName} (${item.matchedName}): +${item.count}個 (在庫: ${item.currentStock} → ${item.newStock})`);
      });
      
      return {
        storeName: storeName,
        message: resultMessage,
        items: detectedItems
      };
    }
    
    return null;
    
  } catch (error) {
    logError('[TEST] チャット在庫更新テストエラー', error);
    return null;
  }
}

/**
 * メール取得機能のテスト
 * Gmail検索クエリを実行して、取得できるメールを確認
 */
function testEmailRetrieval() {
  Logger.log('========================================');
  Logger.log('📧 メール取得機能テスト開始');
  Logger.log('========================================');
  
  try {
    // 設定確認
    if (!CONFIG.STOCK_MANAGEMENT || !CONFIG.STOCK_MANAGEMENT.ENABLED) {
      Logger.log('⚠️ 在庫管理機能が無効です。Config.gsでENABLEDをtrueに設定してください。');
      return;
    }
    
    // Gmail検索クエリを取得
    const query = CONFIG.STOCK_MANAGEMENT.GMAIL_QUERY;
    Logger.log(`検索クエリ: ${query}`);
    Logger.log('');
    
    // メール検索実行
    Logger.log('Gmail検索を実行中...');
    const threads = GmailApp.search(query);
    Logger.log(`取得スレッド数: ${threads.length}件`);
    Logger.log('');
    
    if (threads.length === 0) {
      Logger.log('⚠️ 該当するメールが見つかりませんでした。');
      Logger.log('検索クエリを確認してください: ' + query);
      Logger.log('');
      Logger.log('💡 ヒント:');
      Logger.log('1. ラベル「直売所売上」が設定されているか確認');
      Logger.log('2. 件名に「売上」または「速報」が含まれているか確認');
      Logger.log('3. メールが未読（is:unread）か確認');
      Logger.log('');
      Logger.log('より柔軟な検索でテストする場合は testEmailRetrievalFlexible() を実行してください。');
      return;
    }
    
    // 各スレッドの情報を表示
    threads.forEach((thread, index) => {
      const messages = thread.getMessages();
      
      messages.forEach((message, msgIndex) => {
        Logger.log(`\n--- メール ${index + 1}-${msgIndex + 1} ---`);
        Logger.log(`件名: ${message.getSubject()}`);
        Logger.log(`送信者: ${message.getFrom()}`);
        Logger.log(`日時: ${message.getDate()}`);
        Logger.log(`未読: ${message.isUnread() ? 'はい' : 'いいえ'}`);
        
        // 本文の一部を表示（最初の200文字）
        const body = message.getPlainBody();
        const preview = body.length > 200 ? body.substring(0, 200) + '...' : body;
        Logger.log(`本文（抜粋）:\n${preview}`);
        Logger.log('');
      });
    });
    
    Logger.log('========================================');
    Logger.log('✅ メール取得テスト完了');
    Logger.log('========================================');
    
  } catch (error) {
    Logger.log('❌ エラーが発生しました:');
    Logger.log(error.toString());
    Logger.log(error.stack);
  }
}

/**
 * 店舗名判定のテスト
 * 実際のメールから店舗名を判定して結果を表示
 */
function testStoreNameDetection() {
  Logger.log('========================================');
  Logger.log('🏪 店舗名判定テスト開始');
  Logger.log('========================================');
  
  try {
    // 設定確認
    if (!CONFIG.STOCK_MANAGEMENT || !CONFIG.STOCK_MANAGEMENT.ENABLED) {
      Logger.log('⚠️ 在庫管理機能が無効です。');
      return;
    }
    
    // スプレッドシート取得
    const spreadsheet = getStockManagementSpreadsheet();
    
    // Gmail検索
    const query = CONFIG.STOCK_MANAGEMENT.GMAIL_QUERY;
    const threads = GmailApp.search(query);
    
    Logger.log(`対象メール数: ${threads.length}件`);
    Logger.log('');
    
    if (threads.length === 0) {
      Logger.log('⚠️ テスト対象のメールがありません。');
      return;
    }
    
    // 各メールで店舗名判定をテスト
    threads.forEach((thread, index) => {
      const messages = thread.getMessages();
      
      messages.forEach((message, msgIndex) => {
        if (!message.isUnread()) {
          return; // 未読のみ処理
        }
        
        const emailData = {
          subject: message.getSubject(),
          body: message.getPlainBody(),
          date: message.getDate(),
          from: message.getFrom()
        };
        
        Logger.log(`\n--- メール ${index + 1}-${msgIndex + 1} ---`);
        Logger.log(`件名: ${emailData.subject}`);
        Logger.log(`送信者: ${emailData.from}`);
        
        // 店舗名判定
        const storeName = detectStoreName(emailData, spreadsheet);
        Logger.log(`判定結果: ${storeName}`);
        
        if (storeName === '不明な店舗') {
          Logger.log('⚠️ 店舗が特定できませんでした。');
          Logger.log('店舗設定シートを確認してください。');
        }
        
        Logger.log('');
      });
    });
    
    Logger.log('========================================');
    Logger.log('✅ 店舗名判定テスト完了');
    Logger.log('========================================');
    
  } catch (error) {
    Logger.log('❌ エラーが発生しました:');
    Logger.log(error.toString());
    Logger.log(error.stack);
  }
}

/**
 * 商品名マッチングのテスト
 * メール本文から商品名を検出して表示
 */
function testItemNameMatching() {
  Logger.log('========================================');
  Logger.log('📦 商品名マッチングテスト開始');
  Logger.log('========================================');
  
  try {
    // 設定確認
    if (!CONFIG.STOCK_MANAGEMENT || !CONFIG.STOCK_MANAGEMENT.ENABLED) {
      Logger.log('⚠️ 在庫管理機能が無効です。');
      return;
    }
    
    // スプレッドシート取得
    const spreadsheet = getStockManagementSpreadsheet();
    const stockSheet = spreadsheet.getSheetByName(CONFIG.STOCK_MANAGEMENT.SHEET_STOCK);
    
    if (!stockSheet) {
      Logger.log('❌ 在庫管理シートが見つかりません。');
      return;
    }
    
    // 在庫マスタを読み込み
    const stockMap = loadStockMaster(stockSheet);
    Logger.log(`登録商品数: ${stockMap.size}件`);
    Logger.log('');
    
    // Gmail検索
    const query = CONFIG.STOCK_MANAGEMENT.GMAIL_QUERY;
    const threads = GmailApp.search(query);
    
    Logger.log(`対象メール数: ${threads.length}件`);
    Logger.log('');
    
    if (threads.length === 0) {
      Logger.log('⚠️ テスト対象のメールがありません。');
      return;
    }
    
    // 各メールで商品名マッチングをテスト
    threads.forEach((thread, index) => {
      const messages = thread.getMessages();
      
      messages.forEach((message, msgIndex) => {
        if (!message.isUnread()) {
          return; // 未読のみ処理
        }
        
        const emailData = {
          subject: message.getSubject(),
          body: message.getPlainBody(),
          date: message.getDate(),
          from: message.getFrom()
        };
        
        // 店舗名判定
        const storeName = detectStoreName(emailData, spreadsheet);
        
        if (storeName === '不明な店舗') {
          return; // 店舗が特定できない場合はスキップ
        }
        
        Logger.log(`\n--- メール ${index + 1}-${msgIndex + 1} ---`);
        Logger.log(`店舗: ${storeName}`);
        Logger.log(`件名: ${emailData.subject}`);
        
        // 該当店舗の商品をチェック
        const matchedItems = [];
        
        stockMap.forEach((stockInfo, key) => {
          const [itemStore, itemName] = key.split('_');
          
          if (itemStore === storeName) {
            // 商品名または別名キーワードでマッチング
            let matchedName = '';
            if (emailData.body.includes(itemName)) {
              matchedName = itemName;
            } else if (stockInfo.keywords && stockInfo.keywords.length > 0) {
              for (const kw of stockInfo.keywords) {
                if (emailData.body.includes(kw)) {
                  matchedName = kw;
                  break;
                }
              }
            }
            
            if (matchedName) {
              matchedItems.push({
                itemName: itemName,
                matchedName: matchedName,
                keywords: stockInfo.keywords || []
              });
            }
          }
        });
        
        if (matchedItems.length > 0) {
          Logger.log(`✅ マッチした商品: ${matchedItems.length}件`);
          matchedItems.forEach(item => {
            Logger.log(`  - ${item.itemName} (マッチ: ${item.matchedName})`);
            if (item.keywords.length > 0) {
              Logger.log(`    別名: ${item.keywords.join(', ')}`);
            }
          });
        } else {
          Logger.log('⚠️ マッチした商品がありません。');
        }
        
        Logger.log('');
      });
    });
    
    Logger.log('========================================');
    Logger.log('✅ 商品名マッチングテスト完了');
    Logger.log('========================================');
    
  } catch (error) {
    Logger.log('❌ エラーが発生しました:');
    Logger.log(error.toString());
    Logger.log(error.stack);
  }
}

/**
 * 販売数抽出のテスト
 * メール本文から販売数を抽出して表示
 */
function testSoldCountExtraction() {
  Logger.log('========================================');
  Logger.log('💰 販売数抽出テスト開始');
  Logger.log('========================================');
  
  try {
    // 設定確認
    if (!CONFIG.STOCK_MANAGEMENT || !CONFIG.STOCK_MANAGEMENT.ENABLED) {
      Logger.log('⚠️ 在庫管理機能が無効です。');
      return;
    }
    
    // スプレッドシート取得
    const spreadsheet = getStockManagementSpreadsheet();
    const stockSheet = spreadsheet.getSheetByName(CONFIG.STOCK_MANAGEMENT.SHEET_STOCK);
    
    if (!stockSheet) {
      Logger.log('❌ 在庫管理シートが見つかりません。');
      return;
    }
    
    // 在庫マスタを読み込み
    const stockMap = loadStockMaster(stockSheet);
    
    // Gmail検索
    const query = CONFIG.STOCK_MANAGEMENT.GMAIL_QUERY;
    const threads = GmailApp.search(query);
    
    Logger.log(`対象メール数: ${threads.length}件`);
    Logger.log('');
    
    if (threads.length === 0) {
      Logger.log('⚠️ テスト対象のメールがありません。');
      return;
    }
    
    // 各メールで販売数抽出をテスト
    threads.forEach((thread, index) => {
      const messages = thread.getMessages();
      
      messages.forEach((message, msgIndex) => {
        if (!message.isUnread()) {
          return; // 未読のみ処理
        }
        
        const emailData = {
          subject: message.getSubject(),
          body: message.getPlainBody(),
          date: message.getDate(),
          from: message.getFrom()
        };
        
        // 店舗名判定
        const storeName = detectStoreName(emailData, spreadsheet);
        
        if (storeName === '不明な店舗') {
          return; // 店舗が特定できない場合はスキップ
        }
        
        Logger.log(`\n--- メール ${index + 1}-${msgIndex + 1} ---`);
        Logger.log(`店舗: ${storeName}`);
        Logger.log(`件名: ${emailData.subject}`);
        
        // 該当店舗の商品をチェック
        const extractedData = [];
        
        stockMap.forEach((stockInfo, key) => {
          const [itemStore, itemName] = key.split('_');
          
          if (itemStore === storeName) {
            // 商品名または別名キーワードでマッチング
            let matchedName = '';
            if (emailData.body.includes(itemName)) {
              matchedName = itemName;
            } else if (stockInfo.keywords && stockInfo.keywords.length > 0) {
              for (const kw of stockInfo.keywords) {
                if (emailData.body.includes(kw)) {
                  matchedName = kw;
                  break;
                }
              }
            }
            
            if (matchedName) {
              // 販売数を抽出
              const soldCount = extractSoldCount(emailData.body, matchedName);
              
              if (soldCount > 0) {
                extractedData.push({
                  itemName: itemName,
                  matchedName: matchedName,
                  soldCount: soldCount,
                  currentStock: stockInfo.currentStock || 0,
                  warningLine: stockInfo.warningLine || 0
                });
              }
            }
          }
        });
        
        if (extractedData.length > 0) {
          Logger.log(`✅ 抽出結果: ${extractedData.length}件`);
          extractedData.forEach(data => {
            Logger.log(`  - ${data.itemName}: ${data.soldCount}個`);
            Logger.log(`    現在庫: ${data.currentStock}個`);
            Logger.log(`    発注点: ${data.warningLine}個`);
            
            const newStock = data.currentStock - data.soldCount;
            if (newStock <= data.warningLine) {
              Logger.log(`    ⚠️ 発注点を下回ります（更新後: ${newStock}個）`);
            }
          });
        } else {
          Logger.log('⚠️ 抽出できた販売数がありません。');
          Logger.log('メール本文を確認してください。');
        }
        
        Logger.log('');
      });
    });
    
    Logger.log('========================================');
    Logger.log('✅ 販売数抽出テスト完了');
    Logger.log('========================================');
    
  } catch (error) {
    Logger.log('❌ エラーが発生しました:');
    Logger.log(error.toString());
    Logger.log(error.stack);
  }
}

/**
 * 柔軟なメール取得テスト
 * 検索条件を緩和して、より多くのメールを検索
 */
function testEmailRetrievalFlexible() {
  Logger.log('========================================');
  Logger.log('📧 メール取得機能テスト（柔軟版）');
  Logger.log('========================================');
  
  try {
    // 複数の検索クエリを試す
    const queries = [
      {
        name: '設定されたクエリ',
        query: CONFIG.STOCK_MANAGEMENT.GMAIL_QUERY
      },
      {
        name: '件名のみ（売上 or 速報）',
        query: '(subject:売上 OR subject:速報) is:unread'
      },
      {
        name: '件名のみ（売上 or 速報、既読含む）',
        query: 'subject:売上 OR subject:速報'
      },
      {
        name: 'ラベルのみ',
        query: 'label:直売所売上 is:unread'
      },
      {
        name: '最近7日間の未読メール',
        query: 'newer_than:7d is:unread'
      }
    ];
    
    queries.forEach((testCase, index) => {
      Logger.log(`\n--- テスト ${index + 1}: ${testCase.name} ---`);
      Logger.log(`クエリ: ${testCase.query}`);
      
      try {
        const threads = GmailApp.search(testCase.query);
        Logger.log(`結果: ${threads.length}件`);
        
        if (threads.length > 0 && threads.length <= 5) {
          // 5件以下の場合は詳細を表示
          threads.forEach((thread, i) => {
            const messages = thread.getMessages();
            messages.forEach((message, j) => {
              Logger.log(`  ${i + 1}-${j + 1}. ${message.getSubject()} (${message.getFrom()})`);
            });
          });
        } else if (threads.length > 5) {
          // 5件を超える場合は最初の5件のみ表示
          Logger.log('  最初の5件:');
          for (let i = 0; i < Math.min(5, threads.length); i++) {
            const message = threads[i].getMessages()[0];
            Logger.log(`  ${i + 1}. ${message.getSubject()} (${message.getFrom()})`);
          }
          Logger.log(`  ... 他 ${threads.length - 5}件`);
        }
      } catch (error) {
        Logger.log(`  エラー: ${error.toString()}`);
      }
    });
    
    Logger.log('\n========================================');
    Logger.log('✅ 柔軟な検索テスト完了');
    Logger.log('========================================');
    
  } catch (error) {
    Logger.log('❌ エラーが発生しました:');
    Logger.log(error.toString());
    Logger.log(error.stack);
  }
}

/**
 * 統合テスト
 * メール取得から在庫更新までの全プロセスをテスト（実際には更新しない）
 */
function testStockManagementFull() {
  Logger.log('========================================');
  Logger.log('🧪 在庫管理システム 統合テスト開始');
  Logger.log('========================================');
  Logger.log('※ このテストでは実際の在庫は更新されません');
  Logger.log('');
  
  try {
    // 設定確認
    if (!CONFIG.STOCK_MANAGEMENT || !CONFIG.STOCK_MANAGEMENT.ENABLED) {
      Logger.log('⚠️ 在庫管理機能が無効です。');
      return;
    }
    
    // スプレッドシート取得
    const spreadsheet = getStockManagementSpreadsheet();
    const stockSheet = spreadsheet.getSheetByName(CONFIG.STOCK_MANAGEMENT.SHEET_STOCK);
    const logSheet = spreadsheet.getSheetByName(CONFIG.STOCK_MANAGEMENT.SHEET_LOG);
    
    if (!stockSheet || !logSheet) {
      Logger.log('❌ 必要なシートが見つかりません。');
      return;
    }
    
    // 在庫マスタを読み込み
    const stockMap = loadStockMaster(stockSheet);
    Logger.log(`登録商品数: ${stockMap.size}件`);
    
    // Gmail検索
    const query = CONFIG.STOCK_MANAGEMENT.GMAIL_QUERY;
    Logger.log(`検索クエリ: ${query}`);
    const threads = GmailApp.search(query);
    Logger.log(`対象メール数: ${threads.length}件`);
    Logger.log('');
    
    if (threads.length === 0) {
      Logger.log('⚠️ 処理対象のメールがありません。');
      return;
    }
    
    // 処理結果を蓄積
    const results = [];
    
    // 各スレッドを処理
    threads.forEach((thread, threadIndex) => {
      const messages = thread.getMessages();
      
      messages.forEach((message, msgIndex) => {
        if (!message.isUnread()) {
          return; // 未読のみ処理
        }
        
        const emailData = {
          subject: message.getSubject(),
          body: message.getPlainBody(),
          date: message.getDate(),
          from: message.getFrom()
        };
        
        // 店舗名判定
        const storeName = detectStoreName(emailData, spreadsheet);
        
        if (storeName === '不明な店舗') {
          Logger.log(`\n[${threadIndex + 1}-${msgIndex + 1}] 店舗が特定できません: ${emailData.subject}`);
          return;
        }
        
        Logger.log(`\n[${threadIndex + 1}-${msgIndex + 1}] ${storeName} - ${emailData.subject}`);
        
        // 商品をチェック
        stockMap.forEach((stockInfo, key) => {
          const [itemStore, itemName] = key.split('_');
          
          if (itemStore === storeName) {
            // 商品名または別名キーワードでマッチング
            let matchedName = '';
            if (emailData.body.includes(itemName)) {
              matchedName = itemName;
            } else if (stockInfo.keywords && stockInfo.keywords.length > 0) {
              for (const kw of stockInfo.keywords) {
                if (emailData.body.includes(kw)) {
                  matchedName = kw;
                  break;
                }
              }
            }
            
            if (matchedName) {
              // 販売数を抽出
              const soldCount = extractSoldCount(emailData.body, matchedName);
              
              if (soldCount > 0) {
                const currentStock = parseInt(stockInfo.currentStock, 10) || 0;
                const newStock = currentStock - soldCount;
                const warningLine = parseInt(stockInfo.warningLine, 10) || 0;
                const isLowStock = newStock <= warningLine;
                
                results.push({
                  store: storeName,
                  item: itemName,
                  soldCount: soldCount,
                  currentStock: currentStock,
                  newStock: newStock,
                  warningLine: warningLine,
                  isLowStock: isLowStock
                });
                
                Logger.log(`  ✅ ${itemName}: ${soldCount}個売却 → 在庫${currentStock}→${newStock}`);
                if (isLowStock) {
                  Logger.log(`    ⚠️ 発注点を下回ります！`);
                }
              }
            }
          }
        });
      });
    });
    
    // 結果サマリー
    Logger.log('\n========================================');
    Logger.log('📊 テスト結果サマリー');
    Logger.log('========================================');
    Logger.log(`処理対象メール: ${threads.length}件`);
    Logger.log(`更新予定商品: ${results.length}件`);
    
    const lowStockCount = results.filter(r => r.isLowStock).length;
    if (lowStockCount > 0) {
      Logger.log(`⚠️ 発注点以下: ${lowStockCount}件`);
    }
    
    Logger.log('\n更新予定の詳細:');
    results.forEach((r, index) => {
      Logger.log(`  ${index + 1}. ${r.store} / ${r.item}: ${r.soldCount}個`);
    });
    
    Logger.log('\n========================================');
    Logger.log('✅ 統合テスト完了');
    Logger.log('========================================');
    Logger.log('\n💡 実際に在庫を更新するには syncStockManagement() を実行してください。');
    
  } catch (error) {
    Logger.log('❌ エラーが発生しました:');
    Logger.log(error.toString());
    Logger.log(error.stack);
  }
}

