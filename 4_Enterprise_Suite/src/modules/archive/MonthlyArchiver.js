/**
 * MonthlyArchiver.js
 * BigQueryから月次データを抽出し、既存のフォルダ構造に合わせて
 * スプレッドシートを自動作成・アーカイブするクラス。
 * DriveAppの不具合回避のため、REST API (UrlFetchApp) を積極的に活用します。
 */
class MonthlyArchiver {
    constructor() {
        this.bqClient = getBigQueryClient();
    }

    /**
     * 指定年月のアーカイブを実行する
     */
    archiveMonth(year, month) {
        console.log(`--- Starting Monthly Archive for ${year}/${month} ---`);

        // 月初・月末の日付を厳密に生成 (YYYY-MM-DD形式)
        const startDate = `${year}-${('0' + month).slice(-2)}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${('0' + month).slice(-2)}-${('0' + lastDay).slice(-2)}`;

        Config.ARCHIVE.TARGETS.forEach(target => {
            try {
                this.processArchiveTarget(target, year, month, startDate, endDate);
            } catch (e) {
                console.error(`Archive failed for ${target.name}: ${e.message}`);
                notifyAdmin(`Archive Error (${target.name}): ${e.message}`);
            }
        });

        console.log(`--- Monthly Archive Finished for ${year}/${month} ---`);
    }

    /**
     * 個別のターゲット（売上、チャット等）を処理する
     */
    processArchiveTarget(target, year, month, startDate, endDate) {
        console.log(`[Step 1.0] Processing target: ${target.name} for ${year}/${month} (${startDate} to ${endDate})`);

        // 1. 格納先フォルダ（親フォルダ）のIDを取得
        let parentFolderId;
        try {
            console.log(`[Step 1.1] Getting parent folder for: ${target.parentFolderName}`);
            parentFolderId = this.findSubFolderIdREST(Config.ARCHIVE.ROOT_FOLDER_ID, target.parentFolderName);
        } catch (e) {
            console.error(`[Step 1.1 Error] Failed to find parent folder: ${e.message}`);
            throw e;
        }

        if (!parentFolderId) {
            console.error(`[Step 1.2 Error] Parent folder NOT FOUND: ${target.parentFolderName}`);
            throw new Error(`Parent folder not found: ${target.parentFolderName}`);
        }

        // 2. ファイル名の決定
        const fileName = `${year}_${('0' + month).slice(-2)}_${target.name}`;

        // 3. 既存ファイルのチェック（重複作成防止）
        let ss;
        let fileId = this.findFileInFolderIdREST(parentFolderId, fileName);

        if (fileId) {
            console.log(`[Step 3.2] Existing file found: ${fileId}. Updating data...`);
            ss = SpreadsheetApp.openById(fileId);
        } else {
            console.log(`[Step 3.3] Creating new spreadsheet: ${fileName}`);
            try {
                ss = SpreadsheetApp.create(fileName);
                console.log(`[Step 3.4] Created SS ID: ${ss.getId()}`);
            } catch (e) {
                console.error(`[Step 3.4 Error] SpreadsheetApp.create failed: ${e.message}`);
                throw e;
            }

            Utilities.sleep(2000);

            try {
                console.log(`[Step 3.5] Moving file ${ss.getId()} to folder ${parentFolderId} via REST...`);
                this.moveFileToFolderREST(ss.getId(), parentFolderId);
            } catch (e) {
                console.error(`[Step 3.5 Error] Move REST failed: ${e.message}`);
            }
        }

        // 4. クエリの作成と実行
        console.log(`[Step 4.1] Preparing query for ${target.name}...`);

        let finalStartDate = startDate;
        let finalEndDate = endDate;
        let query;

        if (target.id === 'chat') {
            finalStartDate = `${startDate} 00:00:00`;
            finalEndDate = `${endDate} 23:59:59`;

            const startTS = Math.floor(new Date(startDate + 'T00:00:00+09:00').getTime() / 1000);
            const endTS = Math.floor(new Date(endDate + 'T23:59:59+09:00').getTime() / 1000);

            // 数値（Unix秒）と文字列（ISO）の両方に対応し、かつ内容ベースで重複排除
            query = `
                SELECT * EXCEPT(_rn) FROM (
                    SELECT *, ROW_NUMBER() OVER(PARTITION BY channel_id, user_id, content, created_at ORDER BY ingested_at DESC) as _rn
                    FROM \`${Config.BIGQUERY.DATASET_ID}.${target.tableName}\`
                    WHERE 
                      (UNIX_SECONDS(created_at) BETWEEN ${startTS} AND ${endTS})
                      OR 
                      (created_at BETWEEN '${finalStartDate}' AND '${finalEndDate}')
                ) WHERE _rn = 1 ORDER BY created_at ASC
            `;
        } else {
            // 売上データのアーカイブクエリ: 最新報告優先ロジック (email_timeを使用)
            query = `
                WITH latest_sales AS (
                    SELECT 
                        *,
                        ROW_NUMBER() OVER(PARTITION BY transaction_date, store_name, item_name ORDER BY email_time DESC, created_at DESC) as _rank
                    FROM \`${Config.BIGQUERY.DATASET_ID}.${target.tableName}\`
                    WHERE transaction_date BETWEEN '${finalStartDate}' AND '${finalEndDate}'
                )
                SELECT 
                    transaction_date, 
                    store_name, 
                    item_name, 
                    quantity, 
                    amount, 
                    email_time,
                    email_subject, 
                    created_at 
                FROM latest_sales
                WHERE _rank = 1
                ORDER BY transaction_date ASC, store_name ASC
            `;
        }

        console.log(`[Step 4.2] Executing BQ query: ${query}`);
        const resultRows = this.bqClient.runQuery(query);
        console.log(`[Step 4.3] BQ Success: ${resultRows.length} rows fetched.`);

        // 5. シートへの書き込み
        console.log(`[Step 5.1] Writing to sheet...`);
        this.writeToSheet(ss, resultRows);
        console.log(`[Step 5.2] Write successful.`);
    }

    /**
     * 以前作成してしまった四半期フォルダ（YYYY_Qx形式）をすべて削除する
     */
    cleanupQuarterlyFolders() {
        console.log('--- Starting Cleanup of Quarterly Folders ---');
        Config.ARCHIVE.TARGETS.forEach(target => {
            const parentFolderId = this.findSubFolderIdREST(Config.ARCHIVE.ROOT_FOLDER_ID, target.parentFolderName);
            if (!parentFolderId) return;

            console.log(`Checking for subfolders in: ${target.parentFolderName}`);
            const query = `mimeType = 'application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed = false`;
            const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
            const response = UrlFetchApp.fetch(url, {
                headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
                muteHttpExceptions: true
            });

            if (response.getResponseCode() !== 200) return;
            const data = JSON.parse(response.getContentText());

            data.files.forEach(folder => {
                // YYYY_Q1 などのパターンに一致するか確認
                if (folder.name.match(/\d{4}_Q\d/)) {
                    console.log(`Deleting folder: ${folder.name} (ID: ${folder.id})`);
                    this.trashFileREST(folder.id);
                }
            });
        });
        console.log('--- Cleanup Completed ---');
    }

    /**
     * ファイルまたはフォルダをゴミ箱に移動する (REST API)
     */
    trashFileREST(fileId) {
        const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
        const options = {
            method: 'patch',
            payload: JSON.stringify({ trashed: true }),
            contentType: 'application/json',
            headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
            muteHttpExceptions: true
        };
        UrlFetchApp.fetch(url, options);
    }

    /**
     * 指定フォルダ内のサブフォルダIDを名前で検索する (REST API)
     */
    findSubFolderIdREST(parentFolderId, folderName) {
        const query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed = false`;

        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
        const response = UrlFetchApp.fetch(url, {
            headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
            muteHttpExceptions: true
        });

        if (response.getResponseCode() !== 200) {
            console.error(`REST findSubFolderId failed: ${response.getContentText()}`);
            return null;
        }

        const data = JSON.parse(response.getContentText());
        return data.files.length > 0 ? data.files[0].id : null;
    }

    /**
     * 指定フォルダ内のファイルIDを名前で検索する (REST API)
     */
    findFileInFolderIdREST(folderId, fileName) {
        const query = `name = '${fileName}' and '${folderId}' in parents and trashed = false`;
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
        const response = UrlFetchApp.fetch(url, {
            headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
            muteHttpExceptions: true
        });

        if (response.getResponseCode() !== 200) return null;
        const data = JSON.parse(response.getContentText());
        return data.files.length > 0 ? data.files[0].id : null;
    }

    /**
     * 結果配列をスプレッドシートに書き込む
     */
    writeToSheet(ss, rows) {
        const sheet = ss.getSheets()[0];
        sheet.clear();

        if (rows.length === 0) {
            sheet.getRange(1, 1).setValue("該当するデータはありませんでした。");
            return;
        }

        const headers = Object.keys(rows[0]);
        sheet.appendRow(headers);

        // 日時に関連する列のインデックスを取得（厳密な判定 + 日本語対応）
        const dateIndices = headers.map((h, i) => {
            const low = h.trim().toLowerCase();
            // sentiment_score は "time" を含むが日付ではないため除外
            if (low.includes('sentiment')) return -1;

            const isDateKeyword = low === 'date' || low === 'time' || low === 'datetime' ||
                low === '日時' || low === '日付' || low === '時間' || low === '作成日' ||
                low.endsWith('_at') || low.endsWith('_date') || low.endsWith('_time') ||
                low.includes('日時') || low.includes('日付');
            return isDateKeyword ? i : -1;
        }).filter(i => i !== -1);

        // データの変換（UnixタイムスタンプまたはISO文字列をDateオブジェクトに変換）
        const data = rows.map(row => headers.map((h, i) => {
            let val = row[h];
            if (dateIndices.includes(i) && val !== null && val !== undefined && val !== '') {
                // 文字列の日付（ISO等）を試行
                if (typeof val === 'string' && (val.includes('-') || val.includes('/') || val.includes('T'))) {
                    const dateVal = new Date(val);
                    if (!isNaN(dateVal.getTime())) return dateVal;
                }
                // 数値（Unix秒）を試行
                const numVal = Number(val);
                if (!isNaN(numVal) && numVal > 1000000) {
                    // 10桁なら秒、13桁ならミリ秒
                    const ts = numVal < 10000000000 ? numVal * 1000 : numVal;
                    return new Date(ts);
                }
            }
            return val;
        }));

        const range = sheet.getRange(2, 1, data.length, headers.length);
        range.setValues(data);

        // 列ごとに適切な表示形式を適用
        dateIndices.forEach(idx => {
            const colRange = sheet.getRange(2, idx + 1, data.length);
            const headerName = headers[idx].toLowerCase();
            // "date" や "日付" のみの場合は時刻なし、それ以外（_at や 日時）は時刻あり
            const isJustDate = (headerName === 'date' || headerName === '日付') ||
                (headerName.includes('date') && !headerName.includes('_at') && !headerName.includes('time'));

            if (isJustDate) {
                colRange.setNumberFormat('yyyy/MM/dd');
            } else {
                colRange.setNumberFormat('yyyy/MM/dd HH:mm:ss');
            }
        });

        sheet.autoResizeColumns(1, headers.length);
    }

    /**
     * 過去分を遡及作成するユーティリティ (2025年1月から現在まで)
     */
    backfill(startYear, startMonth) {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;

        for (let y = startYear; y <= currentYear; y++) {
            let mStart = (y === startYear) ? startMonth : 1;
            // 実行中の当月も対象に含める
            let mEnd = (y === currentYear) ? currentMonth : 12;

            for (let m = mStart; m <= mEnd; m++) {
                this.archiveMonth(y, m);
                Utilities.sleep(3000);
            }
        }
    }

    /**
     * ファイルを移動する (REST APIを使用)
     */
    moveFileToFolderREST(fileId, targetFolderId) {
        const url = `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${targetFolderId}&removeParents=root`;
        const options = {
            method: 'patch',
            headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
            muteHttpExceptions: true
        };

        const response = UrlFetchApp.fetch(url, options);
        if (response.getResponseCode() !== 200) {
            console.error(`Failed to move file via REST: ${response.getContentText()}`);
        } else {
            console.log('Successfully moved file via REST API.');
        }
    }
}
