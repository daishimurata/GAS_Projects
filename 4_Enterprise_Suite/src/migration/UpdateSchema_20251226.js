/**
 * UpdateSchema_20251226.js
 * 利用者DBの包括的な整備 (Master, Profile, Family, Transport, DailyRecords)
 */
function createAllUserTables() {
    const bq = getBigQueryClient();
    const datasetId = Config.BIGQUERY.DATASET_ID;

    // 先にデータセットの存在を確認/作成
    bq.createDataset(datasetId);

    // 1. user_master (基本情報)
    createTableIfNotExists(bq, datasetId, 'user_master', [
        { name: 'user_id', type: 'STRING', mode: 'REQUIRED', description: '利用者ID' },
        { name: 'name', type: 'STRING', mode: 'REQUIRED', description: '氏名' },
        { name: 'kana', type: 'STRING', mode: 'NULLABLE', description: 'フリガナ' },
        { name: 'nickname', type: 'STRING', mode: 'NULLABLE', description: 'あだ名' },
        { name: 'gender', type: 'STRING', mode: 'NULLABLE' },
        { name: 'birth_date', type: 'DATE', mode: 'NULLABLE' },
        { name: 'postal_code', type: 'STRING', mode: 'NULLABLE' },
        { name: 'address', type: 'STRING', mode: 'NULLABLE' },
        { name: 'phone_number', type: 'STRING', mode: 'NULLABLE' },
        { name: 'disability_type', type: 'STRING', mode: 'NULLABLE' },
        { name: 'benefit_number', type: 'STRING', mode: 'NULLABLE', description: '受給者証番号' },
        { name: 'benefit_end_date', type: 'DATE', mode: 'NULLABLE' },
        { name: 'last_updated', type: 'TIMESTAMP', mode: 'REQUIRED' },
        { name: 'source_file_id', type: 'STRING', mode: 'NULLABLE' }
    ]);

    // 2. user_profiles (フェイスシート詳細: 医療、成育歴、特性)
    createTableIfNotExists(bq, datasetId, 'user_profiles', [
        { name: 'user_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'medical_history', type: 'STRING', mode: 'NULLABLE', description: '既往歴・持病' },
        { name: 'medication', type: 'STRING', mode: 'NULLABLE', description: '服薬状況' },
        { name: 'allergies', type: 'STRING', mode: 'NULLABLE' },
        { name: 'doctor', type: 'STRING', mode: 'NULLABLE', description: '主治医/医療機関' },
        { name: 'communication', type: 'STRING', mode: 'NULLABLE', description: '意思疎通方法' },
        { name: 'likes_dislikes', type: 'STRING', mode: 'NULLABLE', description: '得意・苦手' },
        { name: 'growth_history', type: 'STRING', mode: 'NULLABLE', description: '成育歴・学歴' },
        { name: 'family_environment', type: 'STRING', mode: 'NULLABLE', description: '家庭環境' },
        { name: 'welfare_history', type: 'STRING', mode: 'NULLABLE', description: '福祉サービス利用歴' },
        { name: 'calm_methods', type: 'STRING', mode: 'NULLABLE', description: '落ち着く方法・配慮' },
        { name: 'updated_at', type: 'TIMESTAMP', mode: 'REQUIRED' }
    ]);

    // 3. user_families (家族構成・緊急連絡先)
    createTableIfNotExists(bq, datasetId, 'user_families', [
        { name: 'user_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'family_name', type: 'STRING', mode: 'REQUIRED' },
        { name: 'relationship', type: 'STRING', mode: 'NULLABLE', description: '続柄' },
        { name: 'contact_number', type: 'STRING', mode: 'NULLABLE' },
        { name: 'workplace', type: 'STRING', mode: 'NULLABLE' },
        { name: 'priority', type: 'INTEGER', mode: 'NULLABLE', description: '緊急連絡順位' },
        { name: 'is_living_together', type: 'BOOLEAN', mode: 'NULLABLE' },
        { name: 'updated_at', type: 'TIMESTAMP', mode: 'REQUIRED' }
    ]);

    // 4. transport_records (送迎記録 - 日々のチャット分析から)
    createTableIfNotExists(bq, datasetId, 'transport_records', [
        { name: 'record_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'user_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'date', type: 'DATE', mode: 'REQUIRED' },
        { name: 'type', type: 'STRING', mode: 'NULLABLE', description: '迎え/送り/自力/その他' },
        { name: 'location', type: 'STRING', mode: 'NULLABLE', description: '自宅/学校/事業所' },
        { name: 'driver_name', type: 'STRING', mode: 'NULLABLE' },
        { name: 'vehicle', type: 'STRING', mode: 'NULLABLE' },
        { name: 'timestamp', type: 'TIMESTAMP', mode: 'REQUIRED' },
        { name: 'source_message_id', type: 'STRING', mode: 'NULLABLE' }
    ]);

    // 5. user_daily_records (日々のバイタル・生活記録 - チャット分析から)
    createTableIfNotExists(bq, datasetId, 'user_daily_records', [
        { name: 'record_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'user_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'date', type: 'DATE', mode: 'REQUIRED' },
        { name: 'time', type: 'TIME', mode: 'NULLABLE' },
        { name: 'category', type: 'STRING', mode: 'REQUIRED', description: 'バイタル/食事/排泄/様子/申し送り' },
        { name: 'content', type: 'STRING', mode: 'NULLABLE' },
        { name: 'value_num', type: 'FLOAT', mode: 'NULLABLE', description: '体温等の数値' },
        { name: 'mood_score', type: 'INTEGER', mode: 'NULLABLE', description: '機嫌(1-5)' },
        { name: 'timestamp', type: 'TIMESTAMP', mode: 'REQUIRED' },
        { name: 'source_message_id', type: 'STRING', mode: 'NULLABLE' }
    ]);

    // 6. user_assessments (就労アセスメント・職業準備性)
    createTableIfNotExists(bq, datasetId, 'user_assessments', [
        { name: 'user_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'assessment_date', type: 'DATE', mode: 'REQUIRED' },
        { name: 'work_motivation', type: 'STRING', mode: 'NULLABLE', description: '労意欲' },
        { name: 'work_persistence', type: 'STRING', mode: 'NULLABLE', description: '持続力・集中力' },
        { name: 'work_speed', type: 'STRING', mode: 'NULLABLE', description: '作業スピード' },
        { name: 'work_accuracy', type: 'STRING', mode: 'NULLABLE', description: '作業正確性' },
        { name: 'social_relations', type: 'STRING', mode: 'NULLABLE', description: '対人関係' },
        { name: 'comm_ability', type: 'STRING', mode: 'NULLABLE', description: '意思疎通' },
        { name: 'strengths', type: 'STRING', mode: 'NULLABLE', description: '本人の強み' },
        { name: 'challenges', type: 'STRING', mode: 'NULLABLE', description: '改善課題' },
        { name: 'updated_at', type: 'TIMESTAMP', mode: 'REQUIRED' }
    ]);

    // 7. user_support_plans (個別支援計画 - 基本方針)
    createTableIfNotExists(bq, datasetId, 'user_support_plans', [
        { name: 'user_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'plan_date', type: 'DATE', mode: 'REQUIRED' },
        { name: 'plan_id', type: 'STRING', mode: 'NULLABLE', description: 'No.1, No.2等' },
        { name: 'basic_policy', type: 'STRING', mode: 'NULLABLE', description: '総合的な援助方針' },
        { name: 'long_term_goal', type: 'STRING', mode: 'NULLABLE', description: '長期目標' },
        { name: 'short_term_goal', type: 'STRING', mode: 'NULLABLE', description: '短期目標' },
        { name: 'period_start', type: 'DATE', mode: 'NULLABLE' },
        { name: 'period_end', type: 'DATE', mode: 'NULLABLE' },
        { name: 'monitoring_date', type: 'DATE', mode: 'NULLABLE' },
        { name: 'source_file_name', type: 'STRING', mode: 'NULLABLE' },
        { name: 'updated_at', type: 'TIMESTAMP', mode: 'REQUIRED' }
    ]);

    // 8. user_support_goals [NEW] (個別支援計画の到達目標・支援内容)
    createTableIfNotExists(bq, datasetId, 'user_support_goals', [
        { name: 'user_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'plan_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'goal_index', type: 'INTEGER', mode: 'REQUIRED', description: '目標1, 2, 3等' },
        { name: 'issue', type: 'STRING', mode: 'NULLABLE', description: '解決すべき課題' },
        { name: 'reachable_goal', type: 'STRING', mode: 'NULLABLE', description: '具体的到達目標' },
        { name: 'support_content', type: 'STRING', mode: 'NULLABLE', description: '支援内容' },
        { name: 'duration', type: 'STRING', mode: 'NULLABLE', description: '支援期間' },
        { name: 'updated_at', type: 'TIMESTAMP', mode: 'REQUIRED' }
    ]);

    // 9. user_evaluation_records [NEW] (個別支援計画の評価・モニタリング)
    createTableIfNotExists(bq, datasetId, 'user_evaluation_records', [
        { name: 'user_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'evaluation_date', type: 'DATE', mode: 'REQUIRED' },
        { name: 'plan_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'goal_index', type: 'INTEGER', mode: 'NULLABLE' },
        { name: 'progress', type: 'STRING', mode: 'NULLABLE', description: '進捗状況/達成度' },
        { name: 'support_effect', type: 'STRING', mode: 'NULLABLE', description: '支援効果' },
        { name: 'evaluation_comment', type: 'STRING', mode: 'NULLABLE', description: '評価・今後の方向性' },
        { name: 'source_file_name', type: 'STRING', mode: 'NULLABLE' },
        { name: 'updated_at', type: 'TIMESTAMP', mode: 'REQUIRED' }
    ]);

    // 10. user_support_process_records [NEW] (作成プロセス記録・会議参加者)
    createTableIfNotExists(bq, datasetId, 'user_support_process_records', [
        { name: 'user_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'plan_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'step_name', type: 'STRING', mode: 'NULLABLE' },
        { name: 'date', type: 'DATE', mode: 'NULLABLE' },
        { name: 'participants', type: 'STRING', mode: 'NULLABLE' },
        { name: 'status', type: 'STRING', mode: 'NULLABLE' },
        { name: 'updated_at', type: 'TIMESTAMP', mode: 'REQUIRED' }
    ]);

    // 11. user_support_plan_changes [NEW] (原案からの変更点)
    createTableIfNotExists(bq, datasetId, 'user_support_plan_changes', [
        { name: 'user_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'plan_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'change_item', type: 'STRING', mode: 'NULLABLE' },
        { name: 'change_content', type: 'STRING', mode: 'NULLABLE' },
        { name: 'reason', type: 'STRING', mode: 'NULLABLE' },
        { name: 'proposer', type: 'STRING', mode: 'NULLABLE' },
        { name: 'updated_at', type: 'TIMESTAMP', mode: 'REQUIRED' }
    ]);

    // 12. user_evaluation_details [NEW] (評価詳細: 満足度・進捗ステータス等)
    createTableIfNotExists(bq, datasetId, 'user_evaluation_details', [
        { name: 'user_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'evaluation_date', type: 'DATE', mode: 'REQUIRED' },
        { name: 'plan_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'category', type: 'STRING', mode: 'NULLABLE', description: '長期目標評価/総合評価等' },
        { name: 'status', type: 'STRING', mode: 'NULLABLE', description: '順調/遅れ等' },
        { name: 'content', type: 'STRING', mode: 'NULLABLE' },
        { name: 'updated_at', type: 'TIMESTAMP', mode: 'REQUIRED' }
    ]);

    // 13. user_life_histories [NEW] (本人の全経歴・履歴)
    createTableIfNotExists(bq, datasetId, 'user_life_histories', [
        { name: 'user_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'event_date', type: 'STRING', mode: 'NULLABLE', description: '時期(2020年4月等)' },
        { name: 'event_name', type: 'STRING', mode: 'NULLABLE', description: '出来事・学歴・職歴' },
        { name: 'description', type: 'STRING', mode: 'NULLABLE' },
        { name: 'category', type: 'STRING', mode: 'NULLABLE', description: '学歴/職歴/病歴/生活史' },
        { name: 'updated_at', type: 'TIMESTAMP', mode: 'REQUIRED' }
    ]);
}

function createTableIfNotExists(bq, datasetId, tableId, fields) {
    const schema = { fields: fields };
    try {
        bq.createTable(datasetId, tableId, schema);
        console.log(`Table ${tableId} created successfully.`);
    } catch (e) {
        if (e.message.includes('Already Exists')) {
            console.log(`Table ${tableId} already exists. Skipping.`);
        } else {
            console.error(`Error creating ${tableId}:`, e);
        }
    }
}

/**
 * 既存の user_master テーブルにあだ名カラムを追加する
 */
function addNicknameColumnToUserMaster() {
    const bq = getBigQueryClient();
    const datasetId = Config.BIGQUERY.DATASET_ID;
    const tableId = 'user_master';

    const sql = `ALTER TABLE \`${datasetId}.${tableId}\` ADD COLUMN IF NOT EXISTS nickname STRING`;

    try {
        bq.runQuery(sql);
        console.log('Column "nickname" added successfully to user_master.');
    } catch (e) {
        console.error('Failed to add nickname column:', e);
    }
}
