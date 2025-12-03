/**
 * イベントのデバッグ
 */

function debugMurataEvents() {
  Logger.log('===== 村田さんのイベントデバッグ =====');
  
  try {
    const userId = CONFIG.NOTIFICATION.ADMIN_USER_ID; // 村田さん
    const now = new Date();
    const syncStart = addDays(now, -CONFIG.SYNC.CALENDAR_PAST_DAYS);
    const syncEnd = addDays(now, CONFIG.SYNC.CALENDAR_FUTURE_DAYS);
    
    Logger.log(`ユーザーID: ${userId}`);
    Logger.log(`期間: ${syncStart.toISOString()} 〜 ${syncEnd.toISOString()}`);
    
    // 基本カレンダーのイベントを取得
    const calendarId = `primary_${userId}`;
    Logger.log(`\nカレンダーID: ${calendarId}`);
    
    const events = getLineWorksCalendarEvents(userId, calendarId, syncStart, syncEnd);
    Logger.log(`\nイベント数: ${events.length}`);
    
    events.forEach((event, index) => {
      Logger.log(`\n[${index + 1}] ${event.summary || '(タイトルなし)'}`);
      Logger.log(`  EventID: ${event.eventId}`);
      Logger.log(`  Start: ${JSON.stringify(event.start)}`);
      Logger.log(`  End: ${JSON.stringify(event.end)}`);
      Logger.log(`  全日: ${!event.start.dateTime ? 'はい' : 'いいえ'}`);
      
      if (event.start.dateTime) {
        const startDate = new Date(event.start.dateTime);
        Logger.log(`  開始日時: ${startDate.toLocaleString('ja-JP', {timeZone: 'Asia/Tokyo'})}`);
      } else if (event.start.date) {
        Logger.log(`  開始日: ${event.start.date}`);
      }
    });
    
    // Googleカレンダーの状態を確認
    Logger.log('\n===== Googleカレンダーの状態 =====');
    const googleCalendar = CalendarApp.getCalendarById(CONFIG.GOOGLE_CALENDAR.MASTER_CALENDAR_ID);
    const gEvents = googleCalendar.getEvents(syncStart, syncEnd);
    
    const murataEvents = gEvents.filter(e => e.getTitle().includes('[村田 太志]'));
    Logger.log(`Googleカレンダーの村田さんのイベント数: ${murataEvents.length}`);
    
    murataEvents.slice(0, 10).forEach((event, index) => {
      Logger.log(`\n[${index + 1}] ${event.getTitle()}`);
      if (event.isAllDayEvent()) {
        Logger.log(`  期間: ${event.getAllDayStartDate().toLocaleDateString('ja-JP')} 〜 ${event.getAllDayEndDate().toLocaleDateString('ja-JP')}`);
      } else {
        Logger.log(`  開始: ${event.getStartTime().toLocaleString('ja-JP')}`);
        Logger.log(`  終了: ${event.getEndTime().toLocaleString('ja-JP')}`);
      }
    });
    
  } catch (error) {
    Logger.log(`❌ エラー: ${error.message}`);
    Logger.log(`スタック: ${error.stack}`);
  }
  
  Logger.log('\n===== デバッグ終了 =====');
}






