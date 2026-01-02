
function fixSpreadsheetNameAndRunImport() {
    const ssId = '1y8ziiAAHD70izwNNitv2nuDjHuv6sZfH3jcLqYoEdOg';
    const ss = SpreadsheetApp.openById(ssId);
    const currentName = ss.getName();

    console.log(`Current Spreadsheet Name: ${currentName}`);

    if (currentName !== 'おひさまデータマスター') {
        ss.setName('おひさまデータマスター');
        console.log('Renamed spreadsheet to: おひさまデータマスター');
    } else {
        console.log('Spreadsheet name is already correct.');
    }

    // 続けてインポート処理も呼ぶ（動作確認用）
    // runChatLogImport(); 
    // ※ ここではリネームだけ確認したいのでコメントアウト
}

/**
 * ユーザー実行用：チャットログ取込
 * リストの一番上に来るように記号を付与
 */
function _01_実行_チャットログ取込() {
    runChatLogImport();
}

/**
 * ユーザー実行用：全データ同期
 */
function _02_実行_全データ同期() {
    syncAllBigQueryTablesToSheets();
}

/**
 * ユーザー実行用：チャットログ重複削除
 * (インポートを何度もやり直した場合などに実行)
 */
function _03_実行_チャットログ重複削除() {
    removeDuplicateChatLogs();
}

/**
 * ユーザー実行用：チャットログAIタグ付け（バッチ）
 * (未タグ付けのログに対してAI解析を実行)
 */
function _04_実行_チャットログAIタグ付け() {
    const enricher = new ChatDataEnricher();
    enricher.enrichExistingLogs(Config.BIGQUERY.DATASET_ID, Config.BIGQUERY.TABLES.CHAT_LOGS);
}
