function checkCalendarState() {
    const sync = new CalendarSyncEngine();
    const cal = CalendarApp.getCalendarById(sync.masterCalendarId);
    const now = new Date();
    const start = new Date(2025, 0, 10); // 1/10
    const end = new Date(2025, 0, 20);   // 1/20
    const events = cal.getEvents(start, end);

    const report = [];
    report.push(`Report for Calendar: ${sync.masterCalendarId}`);
    report.push(`Range: ${start.toDateString()} - ${end.toDateString()}`);
    report.push(`Found ${events.length} events\n`);

    events.forEach(e => {
        report.push(`Title: ${e.getTitle()}`);
        report.push(`  Start: ${e.getStartTime().toLocaleString('ja-JP')}`);
        report.push(`  End:   ${e.getEndTime().toLocaleString('ja-JP')}`);
        report.push(`  AllDay: ${e.isAllDayEvent()}`);
        const match = e.getDescription().match(/ID: ([^\n]+)/);
        report.push(`  LW_ID: ${match ? match[1] : 'N/A'}`);
        report.push('-------------------');
    });

    // スプレッドシートに書き出し（権限エラー回避のためファイルとして出力したいが、GASでは難しいのでログを出す）
    // 代わりに、特定のプロパティに保存して、後で取得する
    PropertiesService.getScriptProperties().setProperty('DEBUG_CAL_REPORT', report.join('\n'));
    Logger.log('Report saved to ScriptProperties: DEBUG_CAL_REPORT');
}

/**
 * プロパティからレポートを読み出してログに流す
 */
function printDebugReport() {
    const report = PropertiesService.getScriptProperties().getProperty('DEBUG_CAL_REPORT');
    console.log(report || 'No report found.');
}
