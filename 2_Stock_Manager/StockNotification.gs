/**
 * 在庫管理・売上管理用LINE WORKS通知機能
 * 出荷情報・売上情報をLINE WORKSチャンネルに自動投稿
 */

/**
 * LINE WORKSチャンネルにメッセージを送信
 * @param {string} channelId チャンネルID
 * @param {string} message メッセージ本文
 * @return {boolean} 送信成功/失敗
 */
function sendLineWorksChannelMessage(channelId, message) {
  try {
    // 1_LineLog_Collectorの関数が存在する場合はそれを使用（グローバルスコープで確認）
    // 注意: この関数自体がsendLineWorksChannelMessageなので、別名で呼び出す必要がある
    // 実際には1_LineLog_Collectorと2_Stock_Managerが統合されていない場合は
    // この関数が呼び出されるので、ここで実装する
    
    // 2_Stock_Managerプロジェクト内で実装
    // LINE WORKS Bot APIのアクセストークンを取得
    const token = getStockBotAccessToken();
    if (!token) {
      logError('Botアクセストークンの取得に失敗しました');
      return false;
    }
    
    if (!channelId) {
      logWarning('チャンネルIDが設定されていません');
      return false;
    }
    
    // LINE WORKS設定を取得（1_LineLog_Collectorから、または2_Stock_Managerの設定から）
    let botId = '';
    if (typeof CONFIG !== 'undefined' && CONFIG.LINEWORKS && CONFIG.LINEWORKS.BOT_ID) {
      botId = CONFIG.LINEWORKS.BOT_ID;
    } else {
      // スクリプトプロパティから取得
      botId = PropertiesService.getScriptProperties().getProperty('LINEWORKS_BOT_ID') || '';
    }
    
    if (!botId) {
      logWarning('LINE WORKS BOT_IDが設定されていません。スクリプトプロパティにLINEWORKS_BOT_IDを設定してください。');
      return false;
    }
    
    const url = `https://www.worksapis.com/v1.0/bots/${botId}/channels/${encodeURIComponent(channelId)}/messages`;
    
    const payload = {
      content: {
        type: 'text',
        text: message
      }
    };
    
    const options = {
      method: 'post',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode !== 200 && responseCode !== 201) {
      const errorText = response.getContentText();
      logError(`チャンネルメッセージ送信エラー (${responseCode}): ${errorText}`);
      return false;
    }
    
    logInfo(`チャンネルメッセージ送信成功: ${channelId}`);
    return true;
    
  } catch (error) {
    logError('チャンネルメッセージ送信エラー', error);
    return false;
  }
}

/**
 * Botアクセストークンを取得（2_Stock_Manager用）
 * 1_LineLog_CollectorのgetBotAccessToken関数が存在する場合はそれを使用
 * @return {string|null} アクセストークン
 */
function getStockBotAccessToken() {
  try {
    // 1_LineLog_Collectorの関数が存在する場合はそれを使用
    // グローバルスコープで確認
    const globalGetBotAccessToken = typeof getBotAccessToken !== 'undefined' ? getBotAccessToken : null;
    if (globalGetBotAccessToken && typeof globalGetBotAccessToken === 'function') {
      try {
        return globalGetBotAccessToken();
      } catch (e) {
        logWarning('1_LineLog_CollectorのgetBotAccessToken呼び出しに失敗。独自実装を使用します。');
      }
    }
    
    // 2_Stock_Managerプロジェクト内で実装
    // CONFIGから認証情報を取得（優先）
    let botId = '';
    let botSecret = '';
    
    if (typeof CONFIG !== 'undefined' && CONFIG.LINEWORKS) {
      botId = CONFIG.LINEWORKS.BOT_ID || '';
      botSecret = CONFIG.LINEWORKS.BOT_SECRET || '';
    }
    
    // CONFIGにない場合はスクリプトプロパティから取得
    if (!botId || !botSecret) {
      botId = PropertiesService.getScriptProperties().getProperty('LINEWORKS_BOT_ID') || '';
      botSecret = PropertiesService.getScriptProperties().getProperty('LINEWORKS_BOT_SECRET') || '';
    }
    
    if (!botId || !botSecret) {
      logWarning('LINE WORKS Bot認証情報が設定されていません。Config.gsまたはスクリプトプロパティにLINEWORKS_BOT_IDとLINEWORKS_BOT_SECRETを設定してください。');
      return null;
    }
    
    // Bot API用のアクセストークンを取得
    const url = 'https://auth.worksmobile.com/oauth2/v2.0/token';
    const payload = {
      grant_type: 'client_credentials',
      client_id: botId,
      client_secret: botSecret,
      scope: 'bot'
    };
    
    const options = {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      payload: Object.keys(payload).map(key => `${key}=${encodeURIComponent(payload[key])}`).join('&'),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode !== 200) {
      logError(`Botアクセストークン取得エラー (${responseCode}): ${response.getContentText()}`);
      return null;
    }
    
    const data = JSON.parse(response.getContentText());
    return data.access_token || null;
    
  } catch (error) {
    logError('Botアクセストークン取得エラー', error);
    return null;
  }
}

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
    
    // 1_LineLog_Collectorの関数を使用
    if (typeof sendLineWorksChannelMessage === 'function') {
      sendLineWorksChannelMessage(channelId, message);
      logInfo(`出荷情報をLINEチャンネルに送信: ${storeName} - ${itemName} ${count}個`);
    } else {
      logWarning('sendLineWorksChannelMessage関数が見つかりません。1_LineLog_Collectorプロジェクトと統合してください。');
    }
    
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
    
    // 1_LineLog_Collectorの関数を使用
    if (typeof sendLineWorksChannelMessage === 'function') {
      sendLineWorksChannelMessage(channelId, message);
      logInfo(`売上情報をLINEチャンネルに送信: ${storeName} - ${totalSoldCount}個 / ¥${totalRevenue.toLocaleString()}`);
    } else {
      logWarning('sendLineWorksChannelMessage関数が見つかりません。1_LineLog_Collectorプロジェクトと統合してください。');
    }
    
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
    
    // 1_LineLog_Collectorの関数を使用
    if (typeof sendLineWorksChannelMessage === 'function') {
      sendLineWorksChannelMessage(channelId, message);
      logInfo(`在庫更新情報をLINEチャンネルに送信: ${storeName} - ${itemName} ${oldStock} → ${newStock}`);
    } else {
      logWarning('sendLineWorksChannelMessage関数が見つかりません。1_LineLog_Collectorプロジェクトと統合してください。');
    }
    
  } catch (error) {
    logError('在庫更新情報LINE通知エラー', error);
  }
}

