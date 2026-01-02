/**
 * BigQueryClient.js
 * BigQueryへのデータ操作をカプセル化するクラス。
 */
class BigQueryClient {
    constructor(projectId) {
        this.projectId = projectId || Config.BIGQUERY.PROJECT_ID;
        if (!this.projectId) {
            throw new Error('GCP Project ID is not configured.');
        }
    }

    /**
     * データをテーブルにストリーミング挿入する
     * @param {string} datasetId データセットID
     * @param {string} tableId テーブルID
     * @param {Array<Object>} rows 挿入するデータオブジェクトの配列
     * @return {Object} 挿入結果
     */
    insertRows(datasetId, tableId, rows) {
        if (!rows || rows.length === 0) return;

        // 行データをBigQueryAPI形式に変換
        const insertRows = rows.map(row => {
            const entry = {
                json: {}
            };
            // rowの内容をコピーし、_insertIdがあれば抽出する
            Object.keys(row).forEach(key => {
                if (key === '_insertId') {
                    entry.insertId = row[key];
                } else {
                    entry.json[key] = row[key];
                }
            });
            return entry;
        });

        const request = {
            rows: insertRows,
            skipInvalidRows: false,
            ignoreUnknownValues: true // スキーマ変更への強さを考慮
        };

        try {
            const response = BigQuery.Tabledata.insertAll(request, this.projectId, datasetId, tableId);

            if (response.insertErrors && response.insertErrors.length > 0) {
                console.error('BigQuery Insert Errors:', JSON.stringify(response.insertErrors));
                throw new Error(`Failed to insert ${response.insertErrors.length} rows.`);
            }

            console.log(`Successfully inserted ${rows.length} rows to ${tableId}`);
            return response;
        } catch (e) {
            console.error(`BigQuery API Error (${tableId}):`, e);
            throw e;
        }
    }

    /**
     * クエリを実行する (Read)
     * @param {string} query SQLクエリ
     * @return {Array<Object>} 結果の行配列
     */
    runQuery(query) {
        const request = {
            query: query,
            useLegacySql: false
        };

        try {
            const queryResults = BigQuery.Jobs.query(request, this.projectId);
            const rows = queryResults.rows;
            if (!rows) return [];

            const schema = queryResults.schema;
            return rows.map(row => {
                const obj = {};
                row.f.forEach((field, i) => {
                    obj[schema.fields[i].name] = field.v;
                });
                return obj;
            });

        } catch (e) {
            console.error('BigQuery Query Error:', e);
            throw e;
        }
    }

    /**
     * DML (UPDATE, DELETE, INSERT) を実行する
     * @param {string} sql SQL文
     * @return {Object} ジョブ結果
     */
    runDml(sql) {
        const request = {
            query: sql,
            useLegacySql: false
        };
        try {
            const queryResults = BigQuery.Jobs.query(request, this.projectId);
            console.log(`DML Executed: ${sql.substring(0, 50)}...`);
            return queryResults;
        } catch (e) {
            console.error('BigQuery DML Error:', e);
            throw e;
        }
    }
    /**
     * データセットを作成する（存在しない場合のみ）
     */
    createDataset(datasetId, location = 'asia-northeast1') {
        const dataset = {
            datasetReference: {
                projectId: this.projectId,
                datasetId: datasetId
            },
            location: location
        };
        try {
            BigQuery.Datasets.insert(dataset, this.projectId);
            console.log(`Dataset ${datasetId} created successfully in ${location}.`);
        } catch (e) {
            if (e.message.includes('Already Exists')) {
                console.log(`Dataset ${datasetId} already exists.`);
            } else {
                console.error(`BigQuery CreateDataset Error:`, e);
                throw e;
            }
        }
    }

    /**
     * テーブルを作成する
     */
    createTable(datasetId, tableId, schema) {
        const table = {
            tableReference: {
                projectId: this.projectId,
                datasetId: datasetId,
                tableId: tableId
            },
            schema: schema
        };
        try {
            BigQuery.Tables.insert(table, this.projectId, datasetId);
            console.log(`Table ${tableId} created successfully.`);
        } catch (e) {
            console.error(`BigQuery CreateTable Error (${tableId}):`, e);
            throw e;
        }
    }
}

/**
 * シングルトンインスタンスを提供する関数
 */
function getBigQueryClient() {
    return new BigQueryClient();
}
