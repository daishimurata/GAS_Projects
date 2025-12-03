/**
 * チャット履歴同期メイン処理
 * LINE WORKSの全チャットルームからメッセージを取得し、Googleドライブに保存
 */

/**
 * チャット同期実行（メイン関数）
 * Bot APIとAudit APIを組み合わせて全メッセージを取得
 */
function syncChatLogs() {
  const startTime = new Date();
  logInfo('========================================');
  logInfo('💬 チャット同期開始（Bot + Audit）');
  logInfo('========================================');
  
  const stats = {
    channelsTotal: 0,
    channelsSuccess: 0,
    channelsError: 0,
    auditUsersTotal: 0,
    auditUsersSuccess: 0,
    messagesTotal: 0,
    messagesSaved: 0,
    attachmentsTotal: 0,
    attachmentsDownloaded: 0,
    errors: []
  };
  
  try {
    // 設定検証
    const validation = validateConfig();
    if (!validation.valid) {
      throw new Error(`設定エラー: ${validation.errors.join(', ')}`);
    }
    
    // マスタースプレッドシート準備
    logInfo('マスタースプレッドシートを準備中...');
    const masterSheet = getMasterSpreadsheet();
    logInfo('✅ スプレッドシート準備完了');
    
    // === Part 1: Bot APIでチャンネルメッセージを取得 ===
    logInfo('\n--- Part 1: Botが参加しているチャンネル ---');
    let channels = [];
    try {
      channels = getLineWorksBotChannels();
      stats.channelsTotal = channels.length;
      logInfo(`対象チャンネル数: ${stats.channelsTotal}`);
      
      if (channels.length === 0) {
        logWarning('Botが参加しているチャンネルがありません');
      }
    } catch (error) {
      logWarning('Bot API利用不可: ' + error.message);
      stats.errors.push(`Bot API: ${error.message}`);
      stats.channelsTotal = 0;
      channels = [];
    }
    
    // === Part 2: Audit APIで全ユーザーのメッセージを取得 ===
    logInfo('\n--- Part 2: Audit APIで全メッセージ取得 ---');
    try {
      // おひさま農園アカウントのメッセージを優先取得
      logInfo('\nおひさま農園アカウント (staff@ohisamafarm)');
      const ohisamaMessages = getUserMessages('staff@ohisamafarm', CONFIG.SYNC.CHAT_HISTORY_DAYS);
      
      if (ohisamaMessages.length > 0) {
        const savedCount = saveAuditMessagesToSpreadsheet(masterSheet, 'staff@ohisamafarm', ohisamaMessages);
        stats.messagesTotal += ohisamaMessages.length;
        stats.messagesSaved += savedCount;
        stats.auditUsersSuccess++;
        logInfo(`  ✅ 保存: ${savedCount}件`);
      }
      
      stats.auditUsersTotal = 1;
      
    } catch (error) {
      logWarning('Audit API取得エラー（スキップします）: ' + error.message);
      stats.errors.push(`Audit API: ${error.message}`);
    }
    
    // 各チャンネルを同期（Bot API）
    if (channels.length > 0) {
      channels.forEach((channel, index) => {
        try {
          logInfo(`\n[${index + 1}/${channels.length}] ${channel.name || channel.channelId}`);
          
          // 最終同期時刻を取得
          const lastSyncTime = getChannelLastSyncTime(channel.channelId);
          logInfo(`  最終同期: ${lastSyncTime ? formatDateTime(lastSyncTime) : '初回同期'}`);
          
          // メッセージ取得
          const messages = getLineWorksChannelMessages(channel.channelId, lastSyncTime);
          logInfo(`  新規メッセージ: ${messages.length}件`);
          
          stats.messagesTotal += messages.length;
          
          if (messages.length > 0) {
            // スプレッドシートに保存
            const savedCount = saveMessagesToSpreadsheet(masterSheet, channel, messages);
            stats.messagesSaved += savedCount;
            
            // 在庫管理連携: チャットから在庫補充を検知
            messages.forEach(msg => {
              try {
                const content = msg.content || msg.text || '';
                // ユーザー名取得
                let sender = '不明';
                if (msg.user && msg.user.name) sender = msg.user.name;
                else if (msg.userName) sender = msg.userName;
                else if (msg.senderName) sender = msg.senderName;
                
                const date = new Date(msg.createdTime || msg.sendTime || new Date());
                
                if (content && typeof updateStockFromChatMessage === 'function') {
                  updateStockFromChatMessage(content, sender, date);
                }
              } catch (e) {
                logError('在庫連携エラー', e);
              }
            });
            
            // テキストログに保存
            saveMessagesToTextLog(channel, messages);
            
            // 添付ファイルをダウンロード
            const attachmentResult = downloadChannelAttachments(channel, messages);
            stats.attachmentsTotal += attachmentResult.total;
            stats.attachmentsDownloaded += attachmentResult.downloaded;
            
            // 最終同期時刻を更新
            setChannelLastSyncTime(channel.channelId, new Date());
            
            logInfo(`  ✅ 保存完了: メッセージ${savedCount}件, 添付${attachmentResult.downloaded}/${attachmentResult.total}件`);
          }
          
          stats.channelsSuccess++;
          
          // レート制限対策
          handleRateLimit(index);
          
        } catch (error) {
          stats.channelsError++;
          const errorMsg = `${channel.name || channel.channelId}: ${error.message}`;
          stats.errors.push(errorMsg);
          logError(`チャンネル同期エラー`, error);
        }
      });
    } else {
      logInfo('\nBot APIによるチャンネル同期は対象なしのためスキップします');
    }
    
    // Gemini最適化処理
    if (stats.messagesSaved > 0 && CONFIG.GEMINI_OPTIMIZATION.ENABLE_SEARCH_INDEX) {
      logInfo('\nGemini検索最適化処理を実行中...');
      try {
        optimizeForGemini(masterSheet);
        logInfo('✅ Gemini最適化完了');
      } catch (error) {
        logError('Gemini最適化エラー', error);
        stats.errors.push(`Gemini最適化エラー: ${error.message}`);
      }
    }
    
  } catch (error) {
    logError('チャット同期処理エラー', error);
    stats.errors.push(`システムエラー: ${error.message}`);
  }
  
  // 結果サマリー
  const duration = ((new Date() - startTime) / 1000).toFixed(1);
  
  logInfo('\n========================================');
  logInfo('📊 同期結果サマリー');
  logInfo('========================================');
  logInfo(`【Bot API】`);
  logInfo(`  チャンネル: ${stats.channelsSuccess}/${stats.channelsTotal}件成功 (エラー:${stats.channelsError}件)`);
  logInfo(`【Audit API】`);
  logInfo(`  ユーザー: ${stats.auditUsersSuccess}/${stats.auditUsersTotal}人`);
  logInfo(`【合計】`);
  logInfo(`  メッセージ: ${stats.messagesSaved}/${stats.messagesTotal}件保存`);
  logInfo(`  添付ファイル: ${stats.attachmentsDownloaded}/${stats.attachmentsTotal}件ダウンロード`);
  logInfo(`  処理時間: ${duration}秒`);
  
  if (stats.errors.length > 0) {
    logInfo(`\n⚠️ エラー詳細 (${stats.errors.length}件):`);
    stats.errors.forEach(err => logInfo(`  - ${err}`));
  }
  
  logInfo('========================================');
  
  // 通知送信
  sendSyncNotification('chat', stats, duration);
  
  // 同期履歴を保存
  saveChatSyncHistory(stats);
  
  return stats;
}

/**
 * チャンネルの最終同期時刻を取得
 * @param {string} channelId チャンネルID
 * @return {Date|null} 最終同期時刻
 */
function getChannelLastSyncTime(channelId) {
  const key = `chatSync_${channelId}`;
  const timeStr = getProperty(key);
  
  if (timeStr) {
    return new Date(timeStr);
  }
  
  // 初回同期の場合は設定値の日数分遡る
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() - CONFIG.SYNC.CHAT_HISTORY_DAYS);
  return defaultDate;
}

/**
 * チャンネルの最終同期時刻を保存
 * @param {string} channelId チャンネルID
 * @param {Date} time 同期時刻
 */
function setChannelLastSyncTime(channelId, time) {
  const key = `chatSync_${channelId}`;
  setProperty(key, time.toISOString());
}

/**
 * 特定のチャンネルのみ同期
 * @param {string} channelId 同期するチャンネルID
 * @return {Object} 同期結果
 */
function syncSingleChannel(channelId) {
  logInfo(`単一チャンネル同期: ${channelId}`);
  
  try {
    const masterSheet = getMasterSpreadsheet();
    
    // チャンネル情報取得（簡易版）
    const channel = { channelId: channelId, name: channelId };
    
    const lastSyncTime = getChannelLastSyncTime(channelId);
    const messages = getLineWorksChannelMessages(channelId, lastSyncTime);
    
    logInfo(`メッセージ数: ${messages.length}件`);
    
    if (messages.length > 0) {
      const savedCount = saveMessagesToSpreadsheet(masterSheet, channel, messages);
      saveMessagesToTextLog(channel, messages);
      const attachmentResult = downloadChannelAttachments(channel, messages);
      
      setChannelLastSyncTime(channelId, new Date());
      
      logInfo(`✅ 同期完了: メッセージ${savedCount}件, 添付${attachmentResult.downloaded}件`);
      
      return {
        messages: savedCount,
        attachments: attachmentResult.downloaded
      };
    }
    
    return { messages: 0, attachments: 0 };
  } catch (error) {
    logError('単一チャンネル同期エラー', error);
    throw error;
  }
}

/**
 * チャット同期状態を取得
 * @return {Object} 同期状態情報
 */
function getChatSyncStatus() {
  const lastSyncTime = getProperty('lastChatSync');
  const lastSyncResult = getProperty('lastChatSyncResult');
  
  return {
    lastSyncTime: lastSyncTime ? new Date(lastSyncTime) : null,
    lastSyncResult: lastSyncResult ? JSON.parse(lastSyncResult) : null,
    nextScheduledSync: getNextScheduledSyncTime()
  };
}

/**
 * チャット同期履歴を保存
 * @param {Object} stats 統計情報
 */
function saveChatSyncHistory(stats) {
  setProperty('lastChatSync', new Date().toISOString());
  setProperty('lastChatSyncResult', JSON.stringify(stats));
  
  // スプレッドシートにも記録（オプション）
  try {
    const folder = getOrCreateFolder(CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME);
    const fileName = 'チャット同期履歴.txt';
    const logEntry = `${formatDateTime(new Date())} - ` +
                    `チャンネル:${stats.channelsSuccess}/${stats.channelsTotal} ` +
                    `メッセージ:${stats.messagesSaved} 添付:${stats.attachmentsDownloaded}\n`;
    
    const file = findFileInFolder(folder, fileName);
    if (file) {
      const existingContent = file.getBlob().getDataAsString();
      file.setContent(existingContent + logEntry);
    } else {
      folder.createFile(fileName, logEntry);
    }
  } catch (e) {
    logDebug('同期履歴保存エラー: ' + e.message);
  }
}

/**
 * チャンネル一覧をエクスポート
 * （オプション：管理・分析用）
 */
function exportChannelInfo() {
  logInfo('チャンネル情報をエクスポート中...');
  
  try {
    const folder = getOrCreateFolder(CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/' + CONFIG.GOOGLE_DRIVE.CHAT_LOG_FOLDER);
    const fileName = 'チャンネル一覧.csv';
    
    const channels = getLineWorksBotChannels();
    
    let csv = 'チャンネルID,チャンネル名,タイプ,メンバー数,最終同期\n';
    channels.forEach(ch => {
      const lastSync = getChannelLastSyncTime(ch.channelId);
      csv += `"${ch.channelId}","${ch.name || ''}","${ch.type || ''}","${ch.memberCount || ''}","${lastSync ? formatDateTime(lastSync) : '未同期'}"\n`;
    });
    
    const file = findFileInFolder(folder, fileName);
    if (file) {
      file.setContent(csv);
    } else {
      folder.createFile(fileName, csv, MimeType.CSV);
    }
    
    logInfo(`✅ チャンネル情報をエクスポートしました: ${channels.length}件`);
  } catch (error) {
    logError('チャンネル情報エクスポートエラー', error);
  }
}

/**
 * 古いチャットログを削除
 * @param {number} daysToKeep 保持する日数
 * @param {boolean} keepFiles ファイル自体を残すか
 */
function cleanupOldChatLogs(daysToKeep = 180, keepFiles = false) {
  logInfo(`古いチャットログを削除中（${daysToKeep}日以前）...`);
  
  try {
    const folder = getOrCreateFolder(
      CONFIG.GOOGLE_DRIVE.ROOT_FOLDER_NAME + '/' + 
      CONFIG.GOOGLE_DRIVE.CHAT_LOG_FOLDER + '/' +
      CONFIG.GOOGLE_DRIVE.DAILY_LOG_FOLDER
    );
    
    deleteOldFiles(folder, daysToKeep);
    
    logInfo('✅ 古いログ削除完了');
  } catch (error) {
    logError('ログ削除エラー', error);
  }
}

/**
 * チャット統計情報を取得
 * @return {Object} 統計情報
 */
function getChatStatistics() {
  try {
    const masterSheet = getMasterSpreadsheet();
    const messageSheet = masterSheet.getSheetByName('メッセージ一覧');
    
    if (!messageSheet) {
      return { error: 'メッセージシートが見つかりません' };
    }
    
    const data = messageSheet.getDataRange().getValues();
    const headers = data.shift();  // ヘッダー行を除く
    
    const stats = {
      totalMessages: data.length,
      channelCount: uniqueArray(data.map(row => row[2])).length,  // ルーム名の列
      senderCount: uniqueArray(data.map(row => row[1])).length,   // 送信者の列
      dateRange: {
        oldest: data.length > 0 ? formatDate(new Date(data[data.length - 1][0])) : null,
        newest: data.length > 0 ? formatDate(new Date(data[0][0])) : null
      }
    };
    
    return stats;
  } catch (error) {
    logError('統計情報取得エラー', error);
    return { error: error.message };
  }
}
