/**
 * DailyLogCleaning.js
 * 定期的に実行して、データの不備を検知・リカバリキューに入れるためのバッチ関数。
 */
function runDailyLogCleaningTasks() {
    console.log('--- Starting Daily Log Cleaning Tasks ---');

    // 1. カレンダー登録の遡及（過去3日分などを自動登録）
    try {
        const logger = new ChatLoggerService();
        logger.backfillCalendarFromChat(3);
        console.log('Calendar backfill completed.');
    } catch (e) {
        console.error('Calendar backfill failed:', e);
    }

    // 2. ドライブファイルの巡回とDB同期（不整合・欠落の検知）
    try {
        const sync = new DataSyncEngine();
        sync.syncAndDetectConflicts();
        sync.detectMissingInfo();
        console.log('Drive crawling and conflict detection completed.');
    } catch (e) {
        console.error('Data synchronization failed:', e);
    }

    console.log('--- Daily Log Cleaning Tasks Finished ---');
}

/**
 * 初回セットアップ用（テーブル作成など）
 */
function setupDataCleaningSystem() {
    createUserMasterTable();
    console.log('Setup finished.');
}
