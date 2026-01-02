/**
 * RunUserImport.js
 * 利用者情報フォルダ（Googleドライブ）からデータを読み取り、
 * AIで解析してBigQueryへ格納するスクリプト。
 * 
 * 実行手順:
 * 1. `listTargetUsers()` で対象者を確認（任意）
 * 2. `runImportForUser(userId)` で特定の1名をテスト
 * 3. `runBatchImport(limit)` で一括実行
 */

function runUserImportScript() {
    console.log('RunUserImport loaded.');
    checkTableExistence();
}

/**
 * 【テスト用】1名分のデータ抽出をテストする (DB保存なし)
 * GASエディタでこの関数を選択して実行してください。
 */
function test_extractSingleUser() {
    const userId = "111"; // 山口恭平くんで詳細テスト
    console.log(`Starting AI extraction test for User ID: ${userId}...`);
    runImportForUser(userId, true);
}

/**
 * テーブルの存在確認
 */
function checkTableExistence() {
    const bq = getBigQueryClient();
    const datasetId = Config.BIGQUERY.DATASET_ID;
    const tables = ['user_master', 'user_profiles', 'user_families', 'user_assessments', 'user_support_plans'];

    console.log(`Checking tables in dataset: ${datasetId}`);
    tables.forEach(tableId => {
        try {
            // BigQuery API直接使用 (BigQueryClientにメソッドがないため)
            const table = BigQuery.Tables.get(Config.BIGQUERY.PROJECT_ID, datasetId, tableId);
            console.log(`✅ Table exists: ${tableId}`);
        } catch (e) {
            console.error(`❌ Table NOT found: ${tableId}. Error: ${e.message}`);
        }
    });
}

/**
 * テスト用：利用者一覧を表示
 */
function listTargetUsers() {
    const registry = new UserRegistry();
    const users = registry.getUsers();
    console.log(`Found ${users.length} users.`);
    users.slice(0, 10).forEach(u => console.log(`${u.id}: ${u.name}`));
    return users;
}

/**
 * 特定の利用者のデータを取り込む
 * @param {string} userId 利用者ID (例: '127')
 * @param {boolean} dryRun trueならDB保存せずにログ出力のみ
 */
function runImportForUser(userId, dryRun = false) {
    const registry = new UserRegistry();
    const crawler = new UserFileCrawler();
    const bq = getBigQueryClient();
    const datasetId = Config.BIGQUERY.DATASET_ID;

    // 対象ユーザー特定
    const users = registry.getUsers();
    const targetUser = users.find(u => u.id === userId);

    if (!targetUser) {
        console.error(`User ID ${userId} not found.`);
        return;
    }

    console.log(`Target User: ${targetUser.name} (FolderID: ${targetUser.folderId})`);

    // 1. クロール＆AI解析
    const result = crawler.crawlUserFolder(targetUser);
    if (!result) {
        console.warn('No data extracted.');
        return;
    }

    console.log('--- AI Extraction Result ---');
    console.log(JSON.stringify(result, null, 2));

    if (dryRun) {
        console.log('[Dry Run] Data extraction successful. Skipping DB Insert.');
        checkTableExistence(); // ついでにテーブル確認も出す
        return result;
    }

    // 2. BigQueryへ保存
    const timestamp = new Date().toISOString();

    // user_master
    if (result.user_master) {
        const m = result.user_master;
        const row = {
            user_id: targetUser.id,
            name: m.name || targetUser.name,
            kana: m.kana,
            nickname: m.nickname, // 既存とマージするか検討だが、最新を優先
            gender: m.gender,
            birth_date: m.birth_date, // YYYY-MM-DD
            postal_code: m.postal_code,
            address: m.address,
            phone_number: m.phone_number,
            disability_type: m.disability_type,
            benefit_number: m.benefit_number ? String(m.benefit_number) : null,
            benefit_end_date: m.benefit_end_date,
            last_updated: timestamp,
            source_file_id: targetUser.folderId // フォルダIDをソースとする
        };
        // upsert相当の処理が必要だが、BQはinsertのみなので最新で追加（クエリ側でlatestをとる運用）
        // ただし重複除外ロジックを入れるのがベスト。ここでは単純追加。
        bq.insertRows(datasetId, 'user_master', [row]);
        console.log('Inserted into user_master.');
    }

    // user_profiles
    if (result.user_profiles) {
        const p = result.user_profiles;
        const row = {
            user_id: targetUser.id,
            medical_history: p.medical_history,
            medication: p.medication,
            allergies: p.allergies,
            doctor: p.doctor,
            communication: p.communication,
            likes_dislikes: p.likes_dislikes,
            growth_history: p.growth_history,
            family_environment: p.family_environment,
            welfare_history: p.welfare_history,
            calm_methods: p.calm_methods,
            updated_at: timestamp
        };
        bq.insertRows(datasetId, 'user_profiles', [row]);
        console.log('Inserted into user_profiles.');
    }

    // user_families
    if (result.user_families && Array.isArray(result.user_families)) {
        const rows = result.user_families.map(f => ({
            user_id: targetUser.id,
            family_name: f.family_name || '名称不明',
            relationship: f.relationship,
            contact_number: f.contact_number,
            workplace: f.workplace,
            priority: f.priority,
            is_living_together: f.is_living_together,
            updated_at: timestamp
        }));
        if (rows.length > 0) {
            bq.insertRows(datasetId, 'user_families', rows);
            console.log(`Inserted ${rows.length} rows into user_families.`);
        }
    }

    // user_assessments (全履歴)
    if (result.user_assessments && Array.isArray(result.user_assessments)) {
        const rows = result.user_assessments.map(a => ({
            user_id: targetUser.id,
            assessment_date: a.assessment_date || timestamp.split('T')[0],
            work_motivation: a.work_motivation,
            work_persistence: a.work_persistence,
            work_speed: a.work_speed,
            work_accuracy: a.work_accuracy,
            social_relations: a.social_relations,
            comm_ability: a.comm_ability,
            strengths: a.strengths,
            challenges: a.challenges,
            updated_at: timestamp
        }));
        if (rows.length > 0 && !dryRun) {
            bq.insertRows(datasetId, 'user_assessments', rows);
            console.log(`Inserted ${rows.length} rows into user_assessments.`);
        }
    }

    // user_support_plans (全履歴 + 詳細)
    if (result.user_support_plans && Array.isArray(result.user_support_plans)) {
        result.user_support_plans.forEach(s => {
            const planRow = {
                user_id: targetUser.id,
                plan_date: s.plan_date || timestamp.split('T')[0],
                plan_id: s.plan_id,
                basic_policy: s.basic_policy,
                long_term_goal: s.long_term_goal,
                short_term_goal: s.short_term_goal,
                period_start: s.period_start,
                period_end: s.period_end,
                monitoring_date: s.monitoring_date,
                source_file_name: s.source_file,
                updated_at: timestamp
            };
            if (!dryRun) {
                bq.insertRows(datasetId, 'user_support_plans', [planRow]);
            }

            // 個別目標 (goals)
            if (s.goals && Array.isArray(s.goals)) {
                const goalRows = s.goals.map(g => ({
                    user_id: targetUser.id,
                    plan_id: s.plan_id,
                    goal_index: g.index,
                    issue: g.issue,
                    reachable_goal: g.reachable_goal,
                    support_content: g.support_content,
                    duration: g.duration,
                    updated_at: timestamp
                }));
                if (goalRows.length > 0 && !dryRun) bq.insertRows(datasetId, 'user_support_goals', goalRows);
            }

            // 評価記録 (evaluations)
            if (s.evaluations && Array.isArray(s.evaluations)) {
                const evalRows = s.evaluations.map(e => ({
                    user_id: targetUser.id,
                    evaluation_date: e.evaluation_date || s.plan_date,
                    plan_id: s.plan_id,
                    goal_index: e.index,
                    progress: e.progress,
                    support_effect: e.support_effect,
                    evaluation_comment: e.comment,
                    source_file_name: s.source_file,
                    updated_at: timestamp
                }));
                if (evalRows.length > 0 && !dryRun) bq.insertRows(datasetId, 'user_evaluation_records', evalRows);
            }

            // 作成プロセス記録 (process_records)
            if (s.process_records && Array.isArray(s.process_records)) {
                const procRows = s.process_records.map(p => ({
                    user_id: targetUser.id,
                    plan_id: s.plan_id,
                    step_name: p.step,
                    date: p.date,
                    participants: p.participants,
                    status: p.status,
                    updated_at: timestamp
                }));
                if (procRows.length > 0 && !dryRun) bq.insertRows(datasetId, 'user_support_process_records', procRows);
            }

            // 原案からの変更点 (plan_changes)
            if (s.plan_changes && Array.isArray(s.plan_changes)) {
                const changeRows = s.plan_changes.map(c => ({
                    user_id: targetUser.id,
                    plan_id: s.plan_id,
                    change_item: c.item,
                    change_content: c.content,
                    reason: c.reason,
                    proposer: c.proposer,
                    updated_at: timestamp
                }));
                if (changeRows.length > 0 && !dryRun) bq.insertRows(datasetId, 'user_support_plan_changes', changeRows);
            }

            // 評価詳細 (evaluation_details)
            if (s.evaluation_details && Array.isArray(s.evaluation_details)) {
                const detailRows = s.evaluation_details.map(d => ({
                    user_id: targetUser.id,
                    evaluation_date: s.monitoring_date || timestamp.split('T')[0],
                    plan_id: s.plan_id,
                    category: d.category,
                    status: d.status,
                    content: d.content,
                    updated_at: timestamp
                }));
                if (detailRows.length > 0 && !dryRun) bq.insertRows(datasetId, 'user_evaluation_details', detailRows);
            }
        });
        if (!dryRun) console.log(`Processed ${result.user_support_plans.length} plans with enhanced details.`);
    }

    // 本人の履歴 (life_histories)
    if (result.life_histories && Array.isArray(result.life_histories)) {
        const historyRows = result.life_histories.map(h => ({
            user_id: targetUser.id,
            event_date: h.date,
            event_name: h.event,
            description: h.description,
            category: h.category,
            updated_at: timestamp
        }));
        if (historyRows.length > 0 && !dryRun) {
            bq.insertRows(datasetId, 'user_life_histories', historyRows);
            console.log(`Inserted ${historyRows.length} rows into user_life_histories.`);
        }
    }

    // --- 矛盾点（contradictions）の処理 ---
    if (result.contradictions && Array.isArray(result.contradictions) && result.contradictions.length > 0) {
        console.log(`[Crawler] Found ${result.contradictions.length} contradictions. Queuing for staff help.`);

        if (!dryRun) {
            const props = PropertiesService.getScriptProperties();
            result.contradictions.forEach((c, idx) => {
                const storageKey = `conflict_${targetUser.id}_${c.key || idx}`;
                const conflictData = {
                    userId: targetUser.id,
                    userName: targetUser.name,
                    type: 'conflict',
                    key: c.key,
                    reason: c.reason,
                    values: c.values,
                    storageKey: storageKey
                };
                props.setProperty(storageKey, JSON.stringify(conflictData));
            });

            // LINE通知（質問コーナーのチャンネルへ問いかけ）
            try {
                const chatLogger = new ChatLoggerService();
                const reportChannelId = Config.LINEWORKS.REPORT_CHANNEL_ID;
                if (reportChannelId) {
                    const msg = `❓ 【データ不整合の確認】\n${targetUser.name}さんの情報に矛盾が見つかりました。\n` +
                        result.contradictions.map(c => `・${c.reason}`).join('\n') +
                        `\n\n「仕事を進める」と送っていただければ、順番に解決をお手伝いします。`;
                    chatLogger._sendSimpleResponse(reportChannelId, msg);
                }
            } catch (e) {
                console.error('Failed to notify staff about contradictions', e);
            }
        }
    }

    if (dryRun) {
        console.log('[Dry Run] Data extraction successful. Skipping BQ Insert & LINE notify.');
        checkTableExistence();
        return result;
    }

    console.log(`Import completed for ${targetUser.name}`);
}

/**
 * 複数人の一括インポート
 * @param {number} limit 実行人数上限
 * @param {number} offset 開始位置
 */
function runBatchImport(limit = 5, offset = 0) {
    const registry = new UserRegistry();
    const users = registry.getUsers();

    // ID順などでソートしたほうが安定的かも
    users.sort((a, b) => Number(a.id) - Number(b.id));

    const targets = users.slice(offset, offset + limit);
    console.log(`Starting Batch Import for ${targets.length} users (Offset: ${offset})...`);

    targets.forEach(user => {
        try {
            console.log(`--- Processing ID: ${user.id} ${user.name} ---`);
            runImportForUser(user.id, false);
        } catch (e) {
            console.error(`Error processing user ${user.id}:`, e);
        }
        // レート制限回避のため少し待機
        Utilities.sleep(2000);
    });

    console.log('Batch execution finished.');
}
