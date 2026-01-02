
/**
 * ユーザー指定のCSVファイルをBigQueryにインポートする実行用関数
 * 指定した日付（20251229）を含むファイルのみを厳格に対象とする
 */
function runChatLogImport() {
    const targetNamePart = 'message-contents';
    const specificDatePart = '20251229_1411';

    console.log(`[ManualImport] Start searching... Must contain: '${targetNamePart}' AND '${specificDatePart}'`);

    // 検索クエリ: 名前で部分一致
    const files = DriveApp.searchFiles(`title contains '${targetNamePart}' and trashed = false`);

    let targetFile = null;
    const allCandidates = [];

    while (files.hasNext()) {
        const file = files.next();
        const name = file.getName();
        const lastUpdated = file.getLastUpdated();

        allCandidates.push({ name: name, date: lastUpdated, id: file.getId() });

        // 厳密なチェック: 日付部分が含まれているか
        if (name.includes(specificDatePart)) {
            targetFile = file;
            // 見つかったらループ終了（同名があれば最初のもの）
            break;
        }
    }

    if (targetFile) {
        const importer = new ChatCsvImporter();
        console.log(`\n★★★ TARGET FOUND CORRECTLY ★★★`);
        console.log(`File: ${targetFile.getName()}`);
        console.log(`ID: ${targetFile.getId()}`);

        importer.importFromDrive(targetFile.getName());
        console.log(`[ManualImport] Import sequence completed.`);
        console.log(`[ManualImport] NOTE: AI Enrichment was skipped. Please run the batch enrichment process to tag users.`);

    } else {
        console.error(`\n[ManualImport] ERROR: Target file '${specificDatePart}' NOT FOUND.`);
        console.log(`We found ${allCandidates.length} potential candidates (but incorrect dates):`);

        // 見つかった他のファイルをリストアップ（デバッグ用）
        allCandidates.forEach(c => {
            console.log(` - ${c.name} (Updated: ${c.date})`);
        });

        console.log(`\nPossible reasons:\n1. File is still uploading?\n2. Filename typo?\n3. Google Drive indexing delay? (Wait 1-2 mins)`);
    }
}
