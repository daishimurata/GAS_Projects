/**
 * DataMigration.js
 * 古い在庫管理システム（Spreadsheet）からマスタデータをBigQueryへ移行するためのスクリプト。
 * 
 * 移行元:
 * 1. 在庫管理スプレッドシート (ID: 11xMsJN...) - Sheet: '在庫管理', '店舗設定'
 */

function migrateMasterData() {
    console.log('--- Starting Master Data Migration ---');
    const bq = getBigQueryClient();
    const spreadsheetId = '11xMsJN1LwNaPL7XWJJf8cNxV2Y815ASG6HauD1LpCB8'; // 2_Stock_ManagerのConfigより

    // 1. 商品マスタ (Product Master) の移行
    migrateProductMaster(bq, spreadsheetId);

    // 2. 店舗マスタ (Store Master) の移行
    // ※シートが存在しない場合もあるため、Configからのハードコード移行も検討
    migrateStoreMaster(bq, spreadsheetId);
}

/**
 * 商品マスタを移行
 */
function migrateProductMaster(bq, spreadsheetId) {
    const sheetName = '在庫管理';
    console.log(`Migrating Product Master from Sheet: ${sheetName}...`);

    try {
        const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);
        if (!sheet) {
            console.log(`Sheet '${sheetName}' not found. Skipping.`);
            return;
        }

        const data = sheet.getDataRange().getValues();
        // ヘッダー除外 (行1)
        if (data.length <= 1) {
            console.log('No data found in Product Master.');
            return;
        }

        // 想定ヘッダー: 店舗名 (0), 商品名 (1), 別名キーワード (2), 現在庫 (3), 単価 (4), 最終更新日時 (5)
        // ※ Config.gsには「stockCol」等の定義があるが、ここではカラム位置を固定またはヘッダー名で動的解決する
        const headers = data[0];
        const storeIdx = 0;
        const productIdx = 1;
        // 別名キーワードはスプレッドシート上にあるが、BigQueryテーブル定義では一旦除外されている(store_masterのkeywordsとは別)
        // 必要に応じてproduct_masterスキーマも修正すべきだが、まずは基本情報を移行する。
        const priceIdx = headers.indexOf('単価') > -1 ? headers.indexOf('単価') : -1; // -1なら0円
        const stockIdx = headers.indexOf('現在庫') > -1 ? headers.indexOf('現在庫') : 3;
        const updateIdx = headers.indexOf('最終更新日時') > -1 ? headers.indexOf('最終更新日時') : 5;

        // BigQuery Table ID
        const datasetId = Config.BIGQUERY.DATASET_ID;
        const tableId = 'product_master';

        let rows = [];
        const BATCH_SIZE = 500;

        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            const storeName = String(row[storeIdx]);
            const productName = String(row[productIdx]);

            if (!storeName || !productName) continue;

            const bqRow = {
                store_name: storeName,
                product_name: productName,
                price: priceIdx > -1 ? Number(row[priceIdx]) : 0,
                stock_quantity: Number(row[stockIdx]) || 0,
                category: 'Uncategorized', // スプレッドシートにはカテゴリがない
                last_updated: row[updateIdx] instanceof Date ? row[updateIdx].toISOString() : new Date().toISOString()
            };

            rows.push(bqRow);

            if (rows.length >= BATCH_SIZE) {
                bq.insertRows(datasetId, tableId, rows);
                console.log(`Inserted ${rows.length} products...`);
                rows = [];
            }
        }

        if (rows.length > 0) {
            bq.insertRows(datasetId, tableId, rows);
            console.log(`Inserted final ${rows.length} products.`);
        }

    } catch (e) {
        console.error('Error migrating Product Master:', e);
    }
}

/**
 * 店舗マスタを移行
 * スプレッドシートに「店舗設定」シートがあるか確認し、なければハードコードされたConfig情報を使う
 */
function migrateStoreMaster(bq, spreadsheetId) {
    const datasetId = Config.BIGQUERY.DATASET_ID;
    const tableId = 'store_master';

    console.log('Migrating Store Master...');

    // 旧Configに基づく店舗情報 (2_Stock_Manager/Config.gsより)
    const stores = [
        { name: 'みどりの大地', keywords: ['みどりの大地', '鈴鹿'] },
        { name: '四季菜 尾平', keywords: ['尾平', '四季菜 尾平', '四季彩 尾平'] },
        { name: '四季彩 常磐店', keywords: ['常磐', '四季菜 常磐', '四季菜　常磐', '常磐店', '四季彩 常磐', '四季彩　常磐'] },
        { name: '四季彩 大矢知店', keywords: ['大矢知', '四季菜 大矢知', '四季菜　大矢知', '大矢知店', '四季彩 大矢知', '四季彩　大矢知'] },
        { name: '四季彩 大矢知店', keywords: ['大矢知', '四季菜 大矢知', '四季菜　大矢知', '大矢知店', '四季彩 大矢知', '四季彩　大矢知'] },
        { name: '一号舘 ときわ店', keywords: ['一号舘', '一号館', '1号館', '桑名ひだまり', '桑名ひだまり店', '一号舘PLUS', '一号舘PLUS桑名ひだまり店', '㈱一号舘', '(株)一号舘', '（株）一号舘', '一号舘常盤店', '一号舘 ときわ', '一号館 ときわ', 'ときわ店', '一号舘PLUSときわ店', '㈱一号舘　ときわ店', '1号館ときわ', '1号館ときわ店'] },
        { name: '四季菜 西部', keywords: ['西部', '四季菜 西部', '四季彩 西部'] },
        { name: 'エーコープ', keywords: ['エーコープ', 'Aコープ', 'JAストア', '四日市店', 'Ａコープ', 'A-COOP', 'A コープ', 'エーコープ四日市'] }
    ];

    let rows = [];
    stores.forEach(store => {
        rows.push({
            store_name: store.name,
            store_id: `store_${Utilities.base64Encode(store.name).substring(0, 8)}`, // 仮ID生成
            keywords: store.keywords,
            manager_email: '' // 既存データにないため空
        });
    });

    try {
        bq.insertRows(datasetId, tableId, rows);
        console.log(`Inserted ${rows.length} stores to store_master.`);
    } catch (e) {
        console.error('Error migrating Store Master:', e);
    }
}
