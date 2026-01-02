/**
 * Logger.js
 * アプリケーションのロギングを管理するクラス。
 * 開発時はStackdriver Logging (console)、運用時はBigQueryまたはファイルへの永続化をサポート。
 */
const Logger = {

    info(message, context = {}) {
        console.log(`[INFO] ${message}`, context);
        this._persist('INFO', message, context);
    },

    warn(message, context = {}) {
        console.warn(`[WARN] ${message}`, context);
        this._persist('WARN', message, context);
    },

    error(message, error = null, context = {}) {
        const errorObj = error instanceof Error ?
            { message: error.message, stack: error.stack } : error;

        console.error(`[ERROR] ${message}`, errorObj);
        this._persist('ERROR', message, { ...context, error: errorObj });
    },

    /**
     * ログ永続化の内部メソッド
     * 現状はプレースホルダーだが、必要に応じてBigQuery等への送信を実装する
     */
    _persist(level, message, context) {
        // 将来的にBigQueryへシステムログを送るならここ
        // const row = { timestamp: new Date(), level, message, context: JSON.stringify(context) };
        // BigQuery.insert(Config.BIGQUERY.TABLES.SYSTEM_LOGS, [row]);
    }
};
