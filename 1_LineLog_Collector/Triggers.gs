/**
 * トリガー管理
 */

/**
 * 自動同期のトリガーを設定
 */
function setupTriggers() {
  Logger.log('===== トリガー設定開始 =====');
  
  try {
    // 既存のトリガーを削除
    removeTriggers();
    
    // カレンダー同期のトリガーを設定（1日4回）
    CONFIG.SYNC.SCHEDULE.TIMES.forEach(time => {
      const [hour, minute] = time.split(':').map(Number);
      
      ScriptApp.newTrigger('executeCalendarSync')
        .timeBased()
        .atHour(hour)
        .nearMinute(minute)
        .everyDays(1)
        .create();
      
      Logger.log(`✅ カレンダー同期トリガーを設定: ${time}`);
    });
    
    // チャット同期のトリガーを設定（実装済みの場合）
    if (typeof executeChatSync === 'function') {
      CONFIG.SYNC.SCHEDULE.TIMES.forEach(time => {
        const [hour, minute] = time.split(':').map(Number);
        
        ScriptApp.newTrigger('executeChatSync')
          .timeBased()
          .atHour(hour + 1) // カレンダー同期の1時間後
          .nearMinute(minute)
          .everyDays(1)
          .create();
        
        Logger.log(`✅ チャット同期トリガーを設定: ${hour + 1}:${minute < 10 ? '0' + minute : minute}`);
      });
    }
    
    Logger.log('===== トリガー設定完了 =====');
    Logger.log('');
    Logger.log('📅 カレンダー同期: 1日4回（5時、10時、16時、21時）');
    if (typeof executeChatSync === 'function') {
      Logger.log('💬 チャット同期: 1日4回（6時、11時、17時、22時）');
    }
    Logger.log('');
    Logger.log('トリガーの確認: checkTriggers() を実行してください');
    
  } catch (error) {
    Logger.log(`❌ エラー: ${error.message}`);
    throw error;
  }
}

/**
 * 全てのトリガーを削除
 */
function removeTriggers() {
  Logger.log('===== 既存トリガー削除開始 =====');
  
  const triggers = ScriptApp.getProjectTriggers();
  let count = 0;
  
  triggers.forEach(trigger => {
    ScriptApp.deleteTrigger(trigger);
    count++;
  });
  
  Logger.log(`✅ ${count}個のトリガーを削除しました`);
  Logger.log('===== 削除完了 =====');
}

/**
 * 現在のトリガー設定を確認
 */
function checkTriggers() {
  Logger.log('===== トリガー確認 =====');
  
  const triggers = ScriptApp.getProjectTriggers();
  
  if (triggers.length === 0) {
    Logger.log('⚠️ トリガーが設定されていません');
    Logger.log('');
    Logger.log('setupTriggers() を実行して自動同期を有効にしてください');
  } else {
    Logger.log(`トリガー数: ${triggers.length}個`);
    Logger.log('');
    
    triggers.forEach((trigger, index) => {
      const handlerFunction = trigger.getHandlerFunction();
      const eventType = trigger.getEventType();
      
      Logger.log(`[${index + 1}] ${handlerFunction}`);
      Logger.log(`  イベント: ${eventType}`);
      
      if (eventType === ScriptApp.EventType.CLOCK) {
        // 時刻ベースのトリガーの場合
        const triggerSource = trigger.getTriggerSource();
        Logger.log(`  トリガー元: ${triggerSource}`);
      }
    });
  }
  
  Logger.log('');
  Logger.log('===== 確認完了 =====');
}

/**
 * 特定の関数のトリガーのみを削除
 * @param {string} functionName 関数名
 */
function removeTriggersByFunction(functionName) {
  Logger.log(`===== ${functionName}のトリガー削除 =====`);
  
  const triggers = ScriptApp.getProjectTriggers();
  let count = 0;
  
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
      count++;
    }
  });
  
  Logger.log(`✅ ${count}個のトリガーを削除しました`);
  Logger.log('===== 削除完了 =====');
}

/**
 * 次回の実行時刻を表示
 */
function showNextExecution() {
  Logger.log('===== 次回実行時刻 =====');
  
  const now = new Date();
  const schedules = CONFIG.SYNC.SCHEDULE.TIMES.map(time => {
    const [hour, minute] = time.split(':').map(Number);
    const scheduled = new Date(now);
    scheduled.setHours(hour, minute, 0, 0);
    
    // 過去の時刻の場合は翌日に
    if (scheduled <= now) {
      scheduled.setDate(scheduled.getDate() + 1);
    }
    
    return {
      time: time,
      date: scheduled
    };
  });
  
  // 時刻順にソート
  schedules.sort((a, b) => a.date - b.date);
  
  Logger.log(`現在時刻: ${now.toLocaleString('ja-JP', {timeZone: 'Asia/Tokyo'})}`);
  Logger.log('');
  Logger.log('次回の実行予定:');
  schedules.forEach((schedule, index) => {
    const diff = Math.floor((schedule.date - now) / 1000 / 60);
    Logger.log(`  ${index + 1}. ${schedule.date.toLocaleString('ja-JP', {timeZone: 'Asia/Tokyo'})} (${diff}分後)`);
  });
  
  Logger.log('');
  Logger.log('===== 確認完了 =====');
}






