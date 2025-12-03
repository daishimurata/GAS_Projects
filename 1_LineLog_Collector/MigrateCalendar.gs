/**
 * カレンダー移行ツール
 * サブカレンダーからメインカレンダーへイベントを移行
 */

/**
 * サブカレンダーからメインカレンダーへイベントを移行
 * @param {string} oldCalendarId 移行元のカレンダーID（サブカレンダー）
 * @param {number} daysBack 何日前から移行するか（デフォルト: 30日）
 * @param {number} daysForward 何日先まで移行するか（デフォルト: 365日）
 */
function migrateCalendarEvents(
  oldCalendarId = 'c_6176056e61734d5b8d40e5831ffb15ac8ff1056fd2c59b06b79fa84f4683598e@group.calendar.google.com',
  daysBack = 30,
  daysForward = 365
) {
  logInfo('========================================');
  logInfo('📅 カレンダー移行開始');
  logInfo('========================================');
  
  const stats = {
    total: 0,
    migrated: 0,
    skipped: 0,
    errors: 0
  };
  
  try {
    // 移行元カレンダー（サブカレンダー）
    const oldCalendar = CalendarApp.getCalendarById(oldCalendarId);
    if (!oldCalendar) {
      throw new Error('移行元カレンダーが見つかりません: ' + oldCalendarId);
    }
    
    // 移行先カレンダー（メインカレンダー）
    const newCalendar = CalendarApp.getDefaultCalendar(); // メインカレンダー
    
    logInfo(`移行元: ${oldCalendar.getName()}`);
    logInfo(`移行先: ${newCalendar.getName()} (メインカレンダー)`);
    logInfo('');
    
    // 期間設定
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + daysForward);
    
    logInfo(`期間: ${formatDate(startDate)} 〜 ${formatDate(endDate)}`);
    logInfo('');
    
    // イベント取得
    const events = oldCalendar.getEvents(startDate, endDate);
    stats.total = events.length;
    
    logInfo(`取得イベント数: ${events.length}件`);
    logInfo('');
    logInfo('移行中...');
    
    // イベントを1つずつ移行
    events.forEach((event, index) => {
      try {
        // 進捗表示
        if ((index + 1) % 10 === 0) {
          logInfo(`  処理中: ${index + 1}/${events.length}件`);
        }
        
        // イベント情報を取得
        const title = event.getTitle();
        const startTime = event.getStartTime();
        const endTime = event.getEndTime();
        const description = event.getDescription();
        const location = event.getLocation();
        const isAllDayEvent = event.isAllDayEvent();
        
        // メインカレンダーに同じイベントが存在するかチェック
        const existingEvents = newCalendar.getEventsForDay(startTime, {
          search: title
        });
        
        const isDuplicate = existingEvents.some(e => 
          e.getTitle() === title && 
          e.getStartTime().getTime() === startTime.getTime()
        );
        
        if (isDuplicate) {
          stats.skipped++;
          return; // 既に存在する場合はスキップ
        }
        
        // 新しいイベントを作成
        let newEvent;
        if (isAllDayEvent) {
          newEvent = newCalendar.createAllDayEvent(title, startTime);
        } else {
          newEvent = newCalendar.createEvent(title, startTime, endTime);
        }
        
        // 詳細情報を設定
        if (description) {
          newEvent.setDescription(description);
        }
        if (location) {
          newEvent.setLocation(location);
        }
        
        // 元のイベントの色を取得して設定（可能な場合）
        try {
          const color = event.getColor();
          if (color) {
            newEvent.setColor(color);
          }
        } catch (e) {
          // カラー設定失敗は無視
        }
        
        stats.migrated++;
        
      } catch (error) {
        stats.errors++;
        logError(`イベント移行エラー: ${event.getTitle()}`, error);
      }
    });
    
  } catch (error) {
    logError('カレンダー移行エラー', error);
  }
  
  // 結果表示
  logInfo('');
  logInfo('========================================');
  logInfo('📊 移行結果');
  logInfo('========================================');
  logInfo(`総イベント数: ${stats.total}件`);
  logInfo(`移行完了: ${stats.migrated}件`);
  logInfo(`スキップ（重複）: ${stats.skipped}件`);
  logInfo(`エラー: ${stats.errors}件`);
  logInfo('========================================');
  
  return stats;
}

/**
 * サブカレンダーのイベント一覧を確認
 * @param {string} calendarId カレンダーID
 * @param {number} days 何日分確認するか
 */
function previewCalendarEvents(
  calendarId = 'c_6176056e61734d5b8d40e5831ffb15ac8ff1056fd2c59b06b79fa84f4683598e@group.calendar.google.com',
  days = 30
) {
  logInfo('========================================');
  logInfo('📅 カレンダーイベント確認');
  logInfo('========================================');
  
  try {
    const calendar = CalendarApp.getCalendarById(calendarId);
    if (!calendar) {
      throw new Error('カレンダーが見つかりません: ' + calendarId);
    }
    
    logInfo(`カレンダー名: ${calendar.getName()}`);
    logInfo('');
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);
    
    const events = calendar.getEvents(startDate, endDate);
    
    logInfo(`期間: ${formatDate(startDate)} 〜 ${formatDate(endDate)}`);
    logInfo(`イベント数: ${events.length}件`);
    logInfo('');
    
    if (events.length > 0) {
      logInfo('イベント一覧（最新10件）:');
      events.slice(0, 10).forEach((event, index) => {
        logInfo(`${index + 1}. ${formatDateTime(event.getStartTime())} - ${event.getTitle()}`);
      });
      
      if (events.length > 10) {
        logInfo(`... 他 ${events.length - 10}件`);
      }
    } else {
      logInfo('イベントがありません');
    }
    
    logInfo('========================================');
    
    return events.length;
    
  } catch (error) {
    logError('カレンダー確認エラー', error);
    return 0;
  }
}

/**
 * サブカレンダーを削除（移行完了後）
 * ⚠️ 注意: 削除したイベントは復元できません
 * @param {string} calendarId 削除するカレンダーID
 */
function deleteOldCalendar(
  calendarId = 'c_6176056e61734d5b8d40e5831ffb15ac8ff1056fd2c59b06b79fa84f4683598e@group.calendar.google.com'
) {
  logInfo('========================================');
  logInfo('⚠️ カレンダー削除');
  logInfo('========================================');
  logInfo('');
  logInfo('⚠️ 重要: この操作は取り消せません！');
  logInfo('');
  logInfo('削除前に以下を確認してください:');
  logInfo('1. メインカレンダーにイベントが移行済み');
  logInfo('2. Geminiから読み取れることを確認');
  logInfo('3. バックアップを取得済み');
  logInfo('');
  logInfo('続行する場合は、以下の関数を手動で実行してください:');
  logInfo('');
  logInfo('function confirmDeleteOldCalendar() {');
  logInfo('  const calendar = CalendarApp.getCalendarById("' + calendarId + '");');
  logInfo('  if (calendar) {');
  logInfo('    calendar.deleteCalendar();');
  logInfo('    Logger.log("✅ カレンダーを削除しました");');
  logInfo('  }');
  logInfo('}');
  logInfo('');
  logInfo('========================================');
}

/**
 * 移行プロセス全体を実行
 * ステップバイステップでガイド
 */
function runCalendarMigration() {
  logInfo('========================================');
  logInfo('📖 カレンダー移行ガイド');
  logInfo('========================================');
  logInfo('');
  logInfo('ステップ1: 現在のイベント確認');
  logInfo('  → previewCalendarEvents() を実行');
  logInfo('');
  logInfo('ステップ2: イベント移行');
  logInfo('  → migrateCalendarEvents() を実行');
  logInfo('');
  logInfo('ステップ3: 動作確認');
  logInfo('  → メインカレンダーにイベントが表示されるか確認');
  logInfo('  → Geminiから読み取れるか確認');
  logInfo('');
  logInfo('ステップ4: カレンダー同期を実行');
  logInfo('  → syncCalendar() を実行');
  logInfo('  → 今後はメインカレンダーに同期されます');
  logInfo('');
  logInfo('ステップ5: サブカレンダー削除（オプション）');
  logInfo('  → deleteOldCalendar() で手順確認');
  logInfo('');
  logInfo('========================================');
  logInfo('');
  logInfo('まず previewCalendarEvents() を実行してください！');
}





