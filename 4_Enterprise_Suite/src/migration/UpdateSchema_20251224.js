/**
 * UpdateSchema_20251224.js
 * chat_logs テーブルにターゲティング用（複数人言及対応）のフィールドを追加するスクリプト。
 */
function updateChatLogSchema() {
    console.log('--- Updating Chat Log Schema for Multi-Targeting ---');
    const projectId = Config.BIGQUERY.PROJECT_ID;
    const datasetId = Config.BIGQUERY.DATASET_ID;
    const tableId = Config.BIGQUERY.TABLES.CHAT_LOGS;

    try {
        const table = BigQuery.Tables.get(projectId, datasetId, tableId);
        const schema = table.schema;

        // 追加したいフィールドの定義
        const newFields = [
            { name: 'mention_user_ids', type: 'STRING', mode: 'REPEATED', description: '言及された利用者IDの一覧' },
            { name: 'is_confirmed', type: 'BOOLEAN', mode: 'NULLABLE', description: '紐付けがスタッフにより確認済みか' },
            { name: 'confidence', type: 'FLOAT', mode: 'NULLABLE', description: 'AIによる紐付けの信頼度' }
        ];

        // 既存フィールドに存在しないものだけ追加
        const currentFieldNames = schema.fields.map(f => f.name);
        newFields.forEach(nf => {
            if (!currentFieldNames.includes(nf.name)) {
                schema.fields.push(nf);
                console.log(`Adding field: ${nf.name}`);
            }
        });

        table.schema = schema;
        BigQuery.Tables.patch(table, projectId, datasetId, tableId);
        console.log('✅ Schema update completed successfully.');

    } catch (e) {
        console.error('❌ Failed to update schema:', e);
        throw e;
    }
}
