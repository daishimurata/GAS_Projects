function listGCalEvents() {
    const calendarId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CALENDAR_ID') || 'd.murata@izaya.llc';
    const cal = CalendarApp.getCalendarById(calendarId);

    // 1/1 - 1/20 くらいの範囲を確認
    const start = new Date(2025, 0, 1);
    const end = new Date(2025, 0, 20);
    const events = cal.getEvents(start, end);

    console.log(`Found ${events.length} events between ${start.toDateString()} and ${end.toDateString()}`);
    events.forEach(e => {
        console.log(`- Title: ${e.getTitle()}`);
        console.log(`  Date: ${e.getStartTime()} - ${e.getEndTime()}`);
        console.log(`  Description: ${e.getDescription().substring(0, 50)}...`);
    });
}
