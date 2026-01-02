/**
 * DataSyncEngine.js
 * データの不整合検知と同期、チャットボットへの問いかけ予約を担当。
 */
class DataSyncEngine {
    constructor() {
        this.bq = getBigQueryClient();
        this.datasetId = Config.BIGQUERY.DATASET_ID;
        this.tableId = 'user_master';
        this.crawler = new UserFileCrawler();
    }

    /**
     * 全データを同期し、不整合があればキューに入れる（逐次実行版）
     */
    syncAndDetectConflicts() {
        const users = this.crawler.registry.getUsers();
        console.log(`Starting Incremental Sync for ${users.length} users...`);

        for (const user of users) {
            try {
                console.log(`Processing: ${user.name} (${user.id})`);
                const data = this.crawler.crawlUserFolder(user);

                if (!data) {
                    console.log(`Skipped (No content): ${user.name}`);
                    continue;
                }

                const dbData = this._getDbData(user.id);

                if (!dbData || !dbData.has_profile) {
                    // 新規登録、またはプロフィール未作成の場合は強制更新
                    // ★要望対応: あだ名は自動登録せず、必ず確認キューに入れる
                    let pendingNickname = null;
                    const masterName = (data.master && data.master.nickname) ? data.master.nickname : data.nickname;

                    // DBにあだ名がなく、ファイルにあだ名があり、かつDBにまだ保存されていない場合
                    if (masterName && (!dbData || !dbData.nickname)) {
                        // DBには空で登録
                        if (data.master) data.master.nickname = '';
                        else data.nickname = '';
                        pendingNickname = masterName;
                    }

                    // 強制上書きInsert (BigQueryは追記型なのでOK)
                    this._updateDb(user.id, data, user.name);

                    // あだ名確認キュー
                    if (pendingNickname) {
                        const conflict = {
                            userId: user.id,
                            userName: user.name,
                            diffs: [{ key: 'nickname', db: '', file: pendingNickname }],
                            dbValue: {},
                            fileValue: { nickname: pendingNickname }
                        };
                        this._queueConflictsForChat([conflict]);
                    }

                } else {
                    // 不整合チェック（住所、期限など重要な項目のみ）
                    const diffs = this._findDiffs(dbData, data);
                    if (diffs.length > 0) {
                        const conflict = {
                            userId: user.id,
                            userName: user.name,
                            diffs: diffs,
                            dbValue: dbData,
                            fileValue: data
                        };
                        this._queueConflictsForChat([conflict]);
                    }
                }
                // GASの実行制限を考慮し、微小なウェイトを入れる
                Utilities.sleep(500);
            } catch (err) {
                console.error(`Error syncing user ${user.name}:`, err);
            }
        }
    }

    /**
     * 不整合を簡易的に比較
     */
    _findDiffs(db, file) {
        // fileがネスト構造(master)かフラットかを考慮
        const fileMaster = file.master || file;
        const keys = ['address', 'phone_number', 'benefit_end_date', 'nickname'];
        const diffs = [];
        keys.forEach(key => {
            if (fileMaster[key] && db[key] !== fileMaster[key]) {
                diffs.push({ key: key, db: db[key], file: fileMaster[key] });
            }
        });
        return diffs;
    }

    /**
     * DBから情報を取得
     */
    _getDbData(userId) {
        const sql = `SELECT * FROM \`${this.datasetId}.${this.tableId}\` WHERE user_id = '${userId}'`;
        const res = this.bq.runQuery(sql);
        return res.length > 0 ? res[0] : null;
    }

    /**
     * DBを更新
     */
    /**
     * DBを更新
     */
    /**
     * DBを更新 (Master, Profile, Family)
     */
    _updateDb(userId, data, fallbackName = '') {
        // AIの返却形式に合わせてデータを正規化
        // 旧形式(フラット)の場合の互換性維持
        const master = data.master || data;
        const profile = data.profile || {};
        const families = data.families || [];

        console.log(`[Sync] Saving ${userId} (${master.name || fallbackName}):
 - Nickname: ${master.nickname || '(none)'}
 - Profile: ${Object.keys(profile).length > 0 ? 'Yes' : 'No'}
 - Families: ${families.length} records`);

        // 日付の簡易バリデーション
        const isValidDate = (d) => {
            return d && typeof d === 'string' && d.match(/^\d{4}-\d{2}-\d{2}$/);
        };

        // 1. user_master
        const masterRow = {
            user_id: userId,
            name: master.name || fallbackName,
            kana: master.kana || '',
            nickname: master.nickname || '',
            postal_code: master.postal_code || '',
            address: master.address || '',
            phone_number: master.phone_number || '',
            birth_date: isValidDate(master.birth_date) ? master.birth_date : null,
            gender: master.gender || '',
            disability_type: master.disability_type || '',
            benefit_number: master.benefit_number || '',
            benefit_end_date: isValidDate(master.benefit_end_date) ? master.benefit_end_date : null,
            last_updated: new Date().toISOString()
        };

        // 2. user_profiles
        const profileRow = {
            user_id: userId,
            medical_history: profile.medical_history || '',
            medication: profile.medication || '',
            allergies: profile.allergies || '',
            doctor: profile.doctor || '',
            communication: profile.communication || '',
            likes_dislikes: profile.likes_dislikes || '',
            growth_history: profile.growth_history || '',
            family_environment: profile.family_environment || '',
            welfare_history: profile.welfare_history || '',
            calm_methods: profile.calm_methods || '',
            updated_at: new Date().toISOString()
        };

        try {
            // undefined 対策 (JSON経由)
            const cleanMaster = JSON.parse(JSON.stringify(masterRow));
            const cleanProfile = JSON.parse(JSON.stringify(profileRow));

            // Master & Profile は Insert (既存があれば重複の可能性あるが、BigQuery推奨は追記)
            // ※ 真面目にするならMERGEだが、シンプルにInsertし、Viewで最新を取る運用とする
            this.bq.insertRows(this.datasetId, 'user_master', [cleanMaster]);
            this.bq.insertRows(this.datasetId, 'user_profiles', [cleanProfile]);

            // 3. user_families (洗い替え的に記録)
            if (families.length > 0) {
                const familyRows = families.map(f => ({
                    user_id: userId,
                    family_name: f.family_name || '不明',
                    relationship: f.relationship || '',
                    contact_number: f.contact_number || '',
                    workplace: f.workplace || '',
                    priority: f.priority ? parseInt(f.priority) : 99,
                    is_living_together: f.is_living_together === true,
                    updated_at: new Date().toISOString()
                }));
                const cleanFamilies = JSON.parse(JSON.stringify(familyRows));
                this.bq.insertRows(this.datasetId, 'user_families', cleanFamilies);
            }

        } catch (e) {
            console.error(`DB Sync Failed for ${userId}:`, e);
        }
    }

    /**
     * 欠落情報（空欄）の検知を行う
     */
    detectMissingInfo() {
        const users = this.crawler.registry.getUsers();
        const missing = [];
        const requiredKeys = ['postal_code', 'address', 'phone_number', 'benefit_end_date'];

        for (const user of users) {
            const dbData = this._getDbData(user.id);
            if (!dbData) continue;

            requiredKeys.forEach(key => {
                if (!dbData[key] || dbData[key] === '') {
                    missing.push({
                        userId: user.id,
                        userName: user.name,
                        key: key,
                        type: 'missing'
                    });
                }
            });
        }

        // キューに保存
        const props = PropertiesService.getScriptProperties();
        missing.forEach(m => {
            props.setProperty(`missing_${m.userId}_${m.key}`, JSON.stringify(m));
        });
    }

    /**
     * スタッフの回答に基づきマスターデータを更新する
     */
    updateMasterData(userId, key, value) {
        console.log(`Updating Master: User=${userId}, ${key}=${value}`);

        // 1. BigQuery の更新
        const sql = `
      UPDATE \`${this.datasetId}.${this.tableId}\`
      SET ${key} = @value, last_updated = CURRENT_TIMESTAMP()
      WHERE user_id = @userId
    `;
        this.bq.runDml(sql, { value: value, userId: userId });

        // 2. 将来的にドライブ上の Markdown/HTML も更新する
        // this._updateFileContent(userId, key, value);

        // 3. 解決したキューの削除
        const props = PropertiesService.getScriptProperties();
        props.deleteProperty(`conflict_${userId}`);
        props.deleteProperty(`missing_${userId}_${key}`);
    }

    /**
     * チャットボット用の問いかけキューに保存
     */
    _queueConflictsForChat(conflicts) {
        const props = PropertiesService.getScriptProperties();
        conflicts.forEach(c => {
            props.setProperty(`conflict_${c.userId}`, JSON.stringify(c));
        });
    }

    /**
     * スタッフ向けの保留中タスクを取得
     */
    getPendingWorkForStaff(staffUserId) {
        const props = PropertiesService.getScriptProperties().getProperties();
        const now = new Date().getTime();

        for (const key in props) {
            if (key.startsWith('conflict_') || key.startsWith('missing_')) {
                try {
                    const data = JSON.parse(props[key]);

                    // スヌーズ中（翌日までスキップ）のタスクは無視する
                    if (data.skippedUntil && data.skippedUntil > now) {
                        continue;
                    }

                    return {
                        id: key.replace('conflict_', '').replace('missing_', ''),
                        storageKey: key, // 削除・更新用
                        type: key.startsWith('conflict_') ? 'conflict' : 'missing',
                        ...data
                    };
                } catch (e) {
                    console.warn(`Failed to parse task ${key}`, e);
                }
            }
        }
        return null;
    }
}
