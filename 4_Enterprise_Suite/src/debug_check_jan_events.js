function checkCalendarEvents_Jan4_12() {
  const sync = new CalendarSyncEngine();
  const calId = sync.masterCalendarId; // Configから取得
  if (!calId) {
    console.log("Master Calendar ID not found in Config.");
    return;
  }
  const cal = CalendarApp.getCalendarById(calId);
  
  // ユーザーが気にしている 1/4 〜 1/12 の範囲 + 前後
  const start = new Date(2025, 0, 4); // Jan 4
  const end = new Date(2025, 0, 13);  // Jan 13 (inclusive check)
  
  console.log(`Checking events for Calendar: ${calId}`);
  console.log(`Period: ${start.toLocaleDateString()} - ${end.toLocaleDateString()}`);
  
  const events = cal.getEvents(start, end);
  
  if (events.length === 0) {
    console.log("No events found in this period.");
    return;
  }

  // 日付順にソート
  events.sort((a, b) => a.getStartTime() - b.getStartTime());

  events.forEach(e => {
    const title = e.getTitle();
    const startTime = e.getStartTime();
    const endTime = e.getEndTime();
    const isAllDay = e.isAllDayEvent();
    const desc = e.getDescription();
    
    // システム同期タグの有無
    const isLwSync = desc.includes('【LW Sync】');
    const isChatSource = desc.includes('【Chat Source】');
    
    // 期間(日数)計算
    const durationMs = endTime - startTime;
    const durationDays = Math.round(durationMs / (1000 * 60 * 60 * 24));
    
    console.log(`[${startTime.toLocaleDateString()}] ${title}`);
    console.log(`    Time: ${isAllDay ? 'All Day' : startTime.toLocaleTimeString() + ' - ' + endTime.toLocaleTimeString()}`);
    console.log(`    Duration: ${durationDays} day(s)`);
    console.log(`    Source: ${isLwSync ? 'LW Sync' : (isChatSource ? 'Chat Source' : 'Other')}`);
    console.log(`    ID: ${e.getId()}`);
    console.log('---');
  });
}
