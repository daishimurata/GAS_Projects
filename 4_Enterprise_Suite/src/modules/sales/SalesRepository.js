/**
 * SalesRepository.js
 * 売上データおよび在庫データの永続化を管理するリポジトリクラス。
 * BigQueryへのトランザクション保存と、Spreadsheetの在庫マスタ更新を行う。
 */
class SalesRepository {
    constructor() {
        this.bq = getBigQueryClient();
        this.datasetId = Config.BIGQUERY.DATASET_ID;
        this.tableId = Config.BIGQUERY.TABLES.SALES;
        this.storeMasterTableId = 'store_master';
        this._storeMasterCache = null;
    }

    /**
     * 売上データを保存する
     * @param {Object} salesData EmailIngestionによって解析されたデータ
     */
    saveSalesData(salesData) {
        if (!salesData || !salesData.item_name) return;

        // BigQuery保存用の行データを作成
        // スキーマ: date, store_name, item_name, quantity, amount, timestamp, source_email_id
        const row = {
            transaction_date: salesData.date,
            store_name: salesData.store_name,
            item_name: salesData.item_name,
            quantity: salesData.quantity || 0,
            amount: salesData.amount || 0,
            created_at: new Date().toISOString(),
            note: salesData.note || ''
        };

        try {
            // BigQueryへ挿入
            this.bq.insertRows(this.datasetId, this.tableId, [row]);
            Logger.info(`Saved sales data to BigQuery: ${salesData.item_name} (${salesData.quantity})`);
        } catch (e) {
            Logger.error('Failed to save sales data to BigQuery', e);
            // フォールバック: 必要ならここでSpreadsheet等への退避を行う
            throw e;
        }
    }

    /**
     * 指定されたメールIDのリストから、既にBigQueryに存在するものを取得する
     * @param {Array<string>} emailIds 
     * @return {Array<string>} 存在するメールID
     */
    getExistingEmailIds(emailIds) {
        if (!emailIds || emailIds.length === 0) return [];

        const escapedIds = emailIds.map(id => `'${id}'`).join(',');
        const query = `SELECT DISTINCT email_id FROM \`${this.datasetId}.${this.tableId}\` WHERE email_id IN (${escapedIds})`;

        try {
            const results = this.bq.runQuery(query);
            return results.map(r => r.email_id);
        } catch (e) {
            console.error('Failed to check existing email IDs', e);
            return []; // エラー時は空（すべて新規として扱う）でフォールバック
        }
    }

    /**
     * 複数の売上レポートを一括保存 (複数店舗対応)
     * @param {Object} analyzedResult EmailIngestionの解析結果全体
     */
    processTransaction(analyzedResult) {
        const { source, data } = analyzedResult;
        const reports = data.reports || [];
        const rows = [];

        reports.forEach((report, reportIndex) => {
            const baseInsertId = `sales_${source.id}_r${reportIndex}`;
            // 店舗名の名寄せと正規化を実行
            const normalizedStoreName = this._normalizeStoreName(report.store_name);

            if (report.items && report.items.length > 0) {
                report.items.forEach((item, itemIndex) => {
                    rows.push({
                        transaction_date: report.date,
                        store_name: normalizedStoreName,
                        item_name: item.item_name,
                        quantity: item.quantity,
                        amount: item.amount,
                        created_at: new Date().toISOString(),
                        email_time: source.email_time, // メール受信時刻を記録
                        email_subject: source.subject,
                        email_id: source.id,
                        _insertId: `${baseInsertId}_i${itemIndex}`
                    });
                });
            } else {
                // 明細がない場合（合計のみなど）
                rows.push({
                    transaction_date: report.date,
                    store_name: normalizedStoreName,
                    item_name: 'Total/Summary',
                    quantity: 0,
                    amount: report.total_sales_amount,
                    created_at: new Date().toISOString(),
                    email_time: source.email_time, // メール受信時刻を記録
                    email_subject: source.subject,
                    email_id: source.id,
                    _insertId: `${baseInsertId}_total`
                });
            }
        });

        if (rows.length > 0) {
            this.bq.insertRows(this.datasetId, this.tableId, rows);
            Logger.info(`Saved ${rows.length} transactions from ${reports.length} store reports.`);
        }
    }

    /**
     * 店舗名の名寄せと正規化
     * @param {string} rawStoreName 
     * @return {string} 正規化された店舗名
     */
    _normalizeStoreName(rawStoreName) {
        if (!rawStoreName) return '不明な店舗';

        // 1. 基本的なクリーンアップ
        // 全角スペースを半角に、連続するスペースを1つに
        let name = rawStoreName.replace(/　/g, ' ').replace(/\s+/g, ' ').trim();
        // 法人格（記号含む）の除去
        name = name.replace(/[\(（][株有][\）\)]|株式会社|有限会社|㈱|㈲/g, '');
        // 全角英数字を半角に
        name = name.replace(/[！-～]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
        // 数字の正規化（一, 二, 三 -> 1, 2, 3）は高度すぎるため、キーワード側で吸収する運用とする
        name = name.trim();

        const normalizedInput = name.replace(/\s/g, ''); // 比較用にスペースを完全に抜いた版も用意

        // 2. 店舗マスタとのキーワードマッチング
        const masters = this._getStoreMaster();
        for (const master of masters) {
            const canonicalName = master.store_name;
            const normalizedMaster = canonicalName.replace(/\s/g, '');

            // A. 完全一致（スペース抜き比較含む）
            if (name === canonicalName || normalizedInput === normalizedMaster) {
                return canonicalName;
            }

            // B. キーワードマッチング
            let keywords = master.keywords || [];
            if (typeof keywords === 'string') {
                keywords = keywords.split(',').map(k => k.trim());
            }

            for (let k of keywords) {
                if (typeof k !== 'string') continue;
                const normalizedK = k.replace(/\s/g, '');

                // スペース抜きでの一致確認、または部分一致
                if (normalizedInput === normalizedK || name.includes(k) || normalizedInput.includes(normalizedK)) {
                    return canonicalName;
                }
            }
        }

        return name;
    }

    /**
     * BigQueryから店舗マスタを取得してキャッシュする
     */
    _getStoreMaster() {
        if (this._storeMasterCache) return this._storeMasterCache;

        try {
            const query = `SELECT store_name, keywords FROM \`${this.datasetId}.${this.storeMasterTableId}\``;
            this._storeMasterCache = this.bq.runQuery(query);
            return this._storeMasterCache;
        } catch (e) {
            Logger.error('Failed to fetch store master from BigQuery', e);
            return [];
        }
    }
}
