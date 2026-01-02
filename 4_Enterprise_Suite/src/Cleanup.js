/**
 * 2025年〜2026年1月の異常データ（重複・ズレ）を掃除し、再同期を可能にする
 */
function cleanupAbnormalEvents() {
    const sync = new CalendarSyncEngine();
    const gCal = CalendarApp.getCalendarById(sync.masterCalendarId);

    // 2025年から2026年1月末まで広範囲にスキャン
    const start = new Date(2025, 0, 1);
    const end = new Date(2026, 0, 31);

    Logger.info(`Cleaning up ALL synced events between ${start.toDateString()} and ${end.toDateString()}`);

    const events = gCal.getEvents(start, end);
    let count = 0;

    events.forEach(event => {
        const desc = event.getDescription();
        const title = event.getTitle();

        // システム同期由来(【LW Sync】)の予定を削除対象とする
        if (desc.includes('【LW Sync】')) {
            Logger.info(`Deleting synced event: ${title} (${event.getStartTime().toLocaleDateString()})`);

            // マッピング情報も削除して、再同期時に「新規」として扱われるようにする
            const match = desc.match(/ID: ([^\n]+)/);
            if (match) {
                const lwId = match[1].trim();
                PropertiesService.getScriptProperties().deleteProperty(`map_lw_${lwId}`);
            }

            event.deleteEvent();
            count++;
            Utilities.sleep(100); // 連続削除によるGASの制限回避
        }
    });

    Logger.info(`Cleanup completed. Deleted ${count} events.`);
}
