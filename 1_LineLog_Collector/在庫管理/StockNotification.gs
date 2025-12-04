/**
 * 在庫管理・売上管理用LINE WORKS通知機能
 * 出荷情報・売上情報をLINE WORKSチャンネルに自動投稿
 */

/**
 * 出荷情報をLINE WORKSチャンネルに通知
 * @param {string} storeName 店舗名
 * @param {string} itemName 商品名
 * @param {number} count 出荷数
 * @param {number} currentStock 現在庫
 * @param {string} senderName 報告者名
 * @param {Date} date 日付
 */
function notifyShipmentToLine(storeName, itemName, count, currentStock, senderName, date) {
  try {
    if (!CONFIG.STOCK_MANAGEMENT || !CONFIG.STOCK_MANAGEMENT.ENABLED) {
      return;
    }
    
    if (!CONFIG.STOCK_MANAGEMENT.LINE_CHANNEL || !CONFIG.STOCK_MANAGEMENT.LINE_CHANNEL.ENABLED) {
      return;
    }
    
    if (!CONFIG.STOCK_MANAGEMENT.LINE_CHANNEL.NOTIFY_SHIPMENT) {
      return;
    }
    
    const channelId = CONFIG.STOCK_MANAGEMENT.LINE_CHANNEL.CHANNEL_ID;
    if (!channelId) {
      logWarning('在庫管理用LINEチャンネルIDが設定されていません');
      return;
    }
    
    const dateStr = Utilities.formatDate(date || new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
    
    const message = `📦 出荷情報\n\n` +
                   `店舗: ${storeName}\n` +
                   `商品: ${itemName}\n` +
                   `出荷数: ${count}個\n` +
                   `現在庫: ${currentStock}個\n` +
                   `報告者: ${senderName}\n` +
                   `日時: ${dateStr}`;
    
    sendLineWorksChannelMessage(channelId, message);
    logInfo(`出荷情報をLINEチャンネルに送信: ${storeName} - ${itemName} ${count}個`);
    
  } catch (error) {
    logError('出荷情報LINE通知エラー', error);
  }
}

/**
 * 売上情報をLINE WORKSチャンネルに通知
 * @param {string} storeName 店舗名
 * @param {Array} salesData 売上データ配列（itemName, soldCount, unitPrice, salesAmountを含む）
 * @param {Date} date 日付
 */
function notifySalesToLine(storeName, salesData, date) {
  try {
    if (!CONFIG.STOCK_MANAGEMENT || !CONFIG.STOCK_MANAGEMENT.ENABLED) {
      return;
    }
    
    if (!CONFIG.STOCK_MANAGEMENT.LINE_CHANNEL || !CONFIG.STOCK_MANAGEMENT.LINE_CHANNEL.ENABLED) {
      return;
    }
    
    if (!CONFIG.STOCK_MANAGEMENT.LINE_CHANNEL.NOTIFY_SALES) {
      return;
    }
    
    const channelId = CONFIG.STOCK_MANAGEMENT.LINE_CHANNEL.CHANNEL_ID;
    if (!channelId) {
      logWarning('在庫管理用LINEチャンネルIDが設定されていません');
      return;
    }
    
    if (!salesData || salesData.length === 0) {
      return;
    }
    
    const dateStr = Utilities.formatDate(date || new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
    
    // 売上データを集計
    const totalSoldCount = salesData.reduce((sum, item) => sum + (parseInt(item.soldCount, 10) || 0), 0);
    const totalRevenue = salesData.reduce((sum, item) => sum + (parseInt(item.salesAmount || 0, 10) || 0), 0);
    
    let message = `💰 売上情報\n\n` +
                  `店舗: ${storeName}\n` +
                  `日時: ${dateStr}\n\n`;
    
    // 商品ごとの詳細（残り在庫数を追加）
    salesData.forEach(item => {
      const itemName = item.itemName;
      const soldCount = parseInt(item.soldCount, 10) || 0;
      const unitPrice = parseInt(item.unitPrice, 10) || 0;
      const salesAmount = parseInt(item.salesAmount || 0, 10) || 0;
      const remainingStock = parseInt(item.newStock, 10) || 0; // 残り在庫数
      
      message += `• ${itemName}: ${soldCount}個`;
      if (unitPrice > 0) {
        message += ` × ¥${unitPrice.toLocaleString()} = ¥${salesAmount.toLocaleString()}`;
      }
      message += ` (残り在庫: ${remainingStock}個)`;
      message += '\n';
    });
    
    message += `\n合計: ${totalSoldCount}個`;
    if (totalRevenue > 0) {
      message += ` / ¥${totalRevenue.toLocaleString()}`;
    }
    
    sendLineWorksChannelMessage(channelId, message);
    logInfo(`売上情報をLINEチャンネルに送信: ${storeName} - ${totalSoldCount}個 / ¥${totalRevenue.toLocaleString()}`);
    
  } catch (error) {
    logError('売上情報LINE通知エラー', error);
  }
}

/**
 * 在庫更新情報をLINE WORKSチャンネルに通知
 * @param {string} storeName 店舗名
 * @param {string} itemName 商品名
 * @param {number} oldStock 更新前在庫
 * @param {number} newStock 更新後在庫
 * @param {string} reason 更新理由
 */
function notifyStockUpdateToLine(storeName, itemName, oldStock, newStock, reason) {
  try {
    if (!CONFIG.STOCK_MANAGEMENT || !CONFIG.STOCK_MANAGEMENT.ENABLED) {
      return;
    }
    
    if (!CONFIG.STOCK_MANAGEMENT.LINE_CHANNEL || !CONFIG.STOCK_MANAGEMENT.LINE_CHANNEL.ENABLED) {
      return;
    }
    
    if (!CONFIG.STOCK_MANAGEMENT.LINE_CHANNEL.NOTIFY_STOCK_UPDATE) {
      return;
    }
    
    const channelId = CONFIG.STOCK_MANAGEMENT.LINE_CHANNEL.CHANNEL_ID;
    if (!channelId) {
      logWarning('在庫管理用LINEチャンネルIDが設定されていません');
      return;
    }
    
    const dateStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
    const diff = newStock - oldStock;
    const diffStr = diff > 0 ? `+${diff}` : `${diff}`;
    
    const message = `📊 在庫更新\n\n` +
                   `店舗: ${storeName}\n` +
                   `商品: ${itemName}\n` +
                   `在庫: ${oldStock}個 → ${newStock}個 (${diffStr})\n` +
                   `理由: ${reason}\n` +
                   `日時: ${dateStr}`;
    
    sendLineWorksChannelMessage(channelId, message);
    logInfo(`在庫更新情報をLINEチャンネルに送信: ${storeName} - ${itemName} ${oldStock} → ${newStock}`);
    
  } catch (error) {
    logError('在庫更新情報LINE通知エラー', error);
  }
}

/**
 * 在庫管理専用チャンネルにテストメッセージを送信
 * テスト用のメッセージをLINE WORKSチャンネルに送信します
 */
function sendTestMessagesToStockChannel() {
  logInfo('========================================');
  logInfo('📤 在庫管理専用チャンネルにテストメッセージ送信開始');
  logInfo('========================================');
  
  try {
    // 設定確認
    if (!CONFIG.STOCK_MANAGEMENT || !CONFIG.STOCK_MANAGEMENT.ENABLED) {
      logInfo('⚠️ 在庫管理機能が無効です。');
      return;
    }
    
    if (!CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG || !CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.ENABLED) {
      logInfo('⚠️ 在庫管理専用チャットログ機能が無効です。');
      return;
    }
    
    const channelId = CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.CHANNEL_ID;
    if (!channelId) {
      logWarning('在庫管理専用チャンネルIDが設定されていません');
      return;
    }
    
    logInfo(`専用チャンネルID: ${channelId}`);
    logInfo('');
    
    // テスト用メッセージ
    const testMessages = [
      'みどりの大地にじゃがいも10個入荷しました',
      '四季彩 尾平店に白ねぎ5個補充',
      'エーコープにサツマイモ20個納品'
    ];
    
    let successCount = 0;
    let failCount = 0;
    
    // 各メッセージを送信してスプレッドシートに保存
    const spreadsheet = getStockChatLogSpreadsheet();
    const sheet = spreadsheet ? spreadsheet.getSheetByName(CONFIG.STOCK_MANAGEMENT.STOCK_CHAT_LOG.SHEET_NAME) : null;
    
    if (!sheet) {
      logWarning('在庫管理チャットログスプレッドシートが見つかりません。メッセージは送信されますが、スプレッドシートには保存されません。');
    }
    
    testMessages.forEach((message, index) => {
      logInfo(`[${index + 1}/${testMessages.length}] メッセージ送信中: ${message.substring(0, 30)}...`);
      
      const success = sendLineWorksChannelMessage(channelId, message);
      
      if (success) {
        logInfo(`  ✅ 送信成功`);
        successCount++;
        
        // スプレッドシートに直接保存（Botが送信したメッセージはWebhookで受信されないため）
        if (sheet) {
          try {
            const now = new Date();
            const row = [
              now,  // 日時
              'Bot (テスト)',  // 送信者
              '在庫管理専用チャンネル',  // ルーム名
              message,  // メッセージ
              '',  // 添付
              `test-${now.getTime()}-${index}`,  // メッセージID
              channelId,  // チャンネルID
              '',  // キーワード
              'テスト',  // カテゴリ
              ''  // 処理済みフラグ（空=未処理）
            ];
            
            sheet.insertRowAfter(1);
            sheet.getRange(2, 1, 1, row.length).setValues([row]);
            logInfo(`  📝 スプレッドシートに保存完了`);
          } catch (error) {
            logError('スプレッドシート保存エラー', error);
          }
        }
      } else {
        logInfo(`  ❌ 送信失敗`);
        failCount++;
      }
      
      // レート制限対策（1秒待機）
      if (index < testMessages.length - 1) {
        Utilities.sleep(1000);
      }
    });
    
    logInfo('');
    logInfo('========================================');
    logInfo('📊 送信結果');
    logInfo('========================================');
    logInfo(`成功: ${successCount}件`);
    logInfo(`失敗: ${failCount}件`);
    logInfo(`合計: ${testMessages.length}件`);
    logInfo('');
    logInfo('次のステップ:');
    logInfo('1. LINE WORKSチャンネルでメッセージが表示されているか確認');
    logInfo('2. 2_Stock_Managerプロジェクトで testAnalyzeStockChatLog() を実行して解析をテスト');
    logInfo('========================================');
    
    return {
      success: successCount,
      fail: failCount,
      total: testMessages.length
    };
    
  } catch (error) {
    logError('テストメッセージ送信エラー', error);
    throw error;
  }
}

