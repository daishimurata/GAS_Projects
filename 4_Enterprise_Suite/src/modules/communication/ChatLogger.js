/**
 * ChatLogger.js
 * LINE WORKS Bot APIを利用してチャットログを収集し、BigQueryへ保存する。
 */
class ChatLoggerService {
    constructor() {
        this.lineAuth = new LineWorksAuth();
        this.bq = getBigQueryClient();
        this.gemini = getGeminiClient();
        this.enricher = new ChatDataEnricher();
        this.calendarExtractor = new CalendarExtractionService();
        this.syncEngine = new CalendarSyncEngine();

        this.botId = Config.LINEWORKS.BOT_ID;
        this.datasetId = Config.BIGQUERY.DATASET_ID;
        this.tableId = Config.BIGQUERY.TABLES.CHAT_LOGS;
    }

    /**
     * Webhook経由で受信したメッセージを処理する
     */
    handleWebhookMessage(payload) {
        const content = payload.content || {};
        const source = payload.source || {};
        const channelId = source.channelId || source.userId || 'direct';

        // 指定された監視対象チャンネル以外は無視する
        const targetChannelId = 'bf85cac7-337e-6b9e-c78b-83ca02e2dd23';
        const monitorIds = Config.LINEWORKS.MONITOR_CHANNEL_IDS;
        console.log(`[ChatLogger] Received message from channel: ${channelId} (Target: ${targetChannelId})`);
        if (monitorIds.length > 0 && !monitorIds.includes(channelId) && channelId !== targetChannelId) {
            console.log(`[ChatLogger] Channel ${channelId} is not monitored. Skipping.`);
            return;
        }

        let text = content.type === 'text' ? content.text : `[${content.type}]`;

        // 0. 「仕事を進める（クレンジングモード）」への対応
        if (text.match(/次|仕事|進める|始めます|開始/)) {
            this._handleWorkModeRequest(source.userId, targetChannelId);
            return;
        }

        // 0.5 売上速報リクエスト
        if (text.match(/売上|速報|sales/i) && text.match(/送|教|願|頼/)) {
            this._sendSimpleResponse(channelId, "🚀 売上速報を作成しています...少々お待ちください。");
            // 非同期的に実行できないため、ここで実行してしまう（タイムアウト注意だが数秒ならOK）
            try {
                // index.js のグローバル関数を呼び出す
                // ※ cyclic dependency気味だが GASはファイル結合されるので参照可能
                runSalesIngestion();
                scheduledDailyReport();
            } catch (e) {
                Logger.error('Failed to trigger sales report', e);
                this._sendSimpleResponse(channelId, "❌ 速報の作成に失敗しました。");
            }
            return;
        }

        // 0.1 スタッフからの回答・訂正の処理
        if (this._isResponseToBot(text, channelId)) {
            this._handleConfirmationResponse(text, source.userId, channelId);
            return;
        }

        // 1. 利用者同定（ターゲティング） - AIによる複数人抽出
        const enrichment = this.enricher.analyzeMention(text, channelId);

        // 2. AI解析（感情等）
        const analysis = this._analyzeContent(text);

        // 3. 行データ作成
        const row = {
            message_id: content.messageId || payload.messageId || `msg_${Date.now()}`,
            channel_id: channelId,
            user_id: source.userId || 'unknown',
            content: text,
            content_type: content.type || 'unknown',
            created_at: new Date(payload.createdTime || Date.now()).toISOString(),
            sentiment_score: analysis.sentiment,
            keywords: analysis.keywords,
            summary: '',
            ingested_at: new Date().toISOString(),
            mention_user_ids: enrichment.mention_user_ids,
            is_confirmed: enrichment.is_confirmed && !enrichment.needs_asking,
            confidence: enrichment.confidence
        };

        try {
            this.bq.insertRows(this.datasetId, this.tableId, [row]);

            // 4. カレンダー予定の抽出と登録
            this._processCalendarEventFromText(text, source.userId);

            // 5. 特定不能・要確認時の問いかけ
            if (enrichment.needs_asking) {
                this._askStaffForConfirmation(source.userId, row.message_id, text, enrichment.all_mentions);
            }
        } catch (e) {
            Logger.error('Failed to save chat log from Webhook', e);
        }
    }

    /**
     * ボットへの回答かどうかを判定する
     */
    _isResponseToBot(text, channelId) {
        // コンテキストがある（直前に質問した）または、特定のキーワードや「〜は〇〇さん」という形式
        const hasContext = !!PropertiesService.getScriptProperties().getProperty(`question_pending_${channelId}`);
        return hasContext || text.includes('は') && (text.includes('さん') || text.includes('くん'));
    }

    /**
     * スタッフに不足情報を問いかける
     */
    _askStaffForConfirmation(staffUserId, messageId, originalText, mentions) {
        const identified = mentions.filter(m => m.status === 'confirmed');
        const unknowns = mentions.filter(m => m.status !== 'confirmed');

        let msgText = '';
        if (identified.length > 0) {
            msgText += `✅ ${identified.map(m => m.identified_name).join(', ')} さんについては記録しました。\n`;
        }

        const unknownNames = unknowns.map(m => m.name_in_text).filter(n => n && n !== 'unknown');
        if (unknownNames.length > 0) {
            msgText += `❓ 「${unknownNames.join('、')}」さんは誰のことですか？ 名前を教えてください。`;
        } else {
            msgText += `❓ このメッセージ（「${originalText.substring(0, 20)}...」）は誰に関する記録ですか？`;
        }

        const message = {
            content: {
                type: 'text',
                text: msgText
            }
        };

        // 該当メッセージIDをコンテキストに保存
        PropertiesService.getScriptProperties().setProperty(`question_pending_${staffUserId}`, messageId);

        const token = this.lineAuth.getAccessToken();
        const url = `https://www.worksapis.com/v1.0/bots/${this.botId}/users/${staffUserId}/messages`;
        UrlFetchApp.fetch(url, {
            method: 'post',
            headers: { Authorization: `Bearer ${token}` },
            contentType: 'application/json',
            payload: JSON.stringify(message)
        });
    }

    /**
     * 指定されたチャンネルIDのログを同期する (Explicit Target Selection)
     */
    syncAllChannels() {
        const channelIds = Config.LINEWORKS.MONITOR_CHANNEL_IDS;
        if (channelIds.length === 0) {
            Logger.warn('No channels to sync: MONITOR_CHANNEL_IDS is empty.');
            return;
        }

        Logger.info(`Starting Chat Log Sync for ${channelIds.length} channels...`);
        let totalMessages = 0;

        channelIds.forEach(channelId => {
            const messages = this._fetchNewMessages(channelId);
            if (messages.length > 0) {
                this._processAndSaveMessages(channelId, messages);
                totalMessages += messages.length;
            }
        });

        Logger.info(`Chat Log Sync Completed. Processed ${totalMessages} messages.`);
    }

    // ... (以下 Helper Methods: _getBotChannels, _fetchNewMessages, _processAndSaveMessages, _analyzeContent)は変更なしだが
    // ファイル全体を上書きするため再記述が必要

    /**
     * Botが参加しているチャンネル一覧を取得
     */
    _getBotChannels() {
        const token = this.lineAuth.getAccessToken();
        const url = `https://www.worksapis.com/v1.0/bots/${this.botId}/channels`;

        try {
            const response = UrlFetchApp.fetch(url, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return JSON.parse(response.getContentText()).channels || [];
        } catch (e) {
            Logger.error('Failed to fetch bot channels', e);
            return [];
        }
    }

    _fetchNewMessages(channelId) {
        // Polling logic is deprecated, returning empty
        return [];
    }

    _processAndSaveMessages(channelId, messages) {
        // Re-using logic for polling if needed
        const rows = messages.map(msg => {
            const analysis = this._analyzeContent(msg.content);
            return {
                message_id: msg.messageId,
                channel_id: channelId,
                user_id: msg.userId,
                content: msg.content.text || '',
                content_type: msg.content.type,
                created_at: new Date(msg.createdTime).toISOString(),
                sentiment_score: analysis.sentiment,
                keywords: analysis.keywords,
                ingested_at: new Date().toISOString()
            };
        });
        if (rows.length > 0) {
            this.bq.insertRows(this.datasetId, this.tableId, rows);
        }
    }

    /**
     * スタッフの回答・訂正を解析し、BigQueryのデータを更新する
     */
    _handleConfirmationResponse(responseText, staffUserId, channelId) {
        const pendingKey = PropertiesService.getScriptProperties().getProperty(`question_pending_${staffUserId}`);
        if (!pendingKey) return;

        // A. 「仕事（クレンジング）」モードの回答処理
        if (pendingKey.startsWith('work_')) {
            this._handleWorkModeResponse(responseText, staffUserId, pendingKey);
            return;
        }

        // B. 利用者特定の訂正処理（既存ロジック）
        const people = this.enricher.registry.getAllPeople();
        const prompt = `
あなたは福祉施設の記録管理アシスタントです。
ボットの確認に対し、スタッフから以下の返答がありました。
これに基づき、「誰についての訂正・回答か」を特定してください。

【回答テキスト】
"${responseText}"

【候補者リスト】
${JSON.stringify(people.users.concat(people.staff).map(p => ({ id: p.id, name: p.name, type: p.type })))}

【判定ルール】
1. スタッフが誰を指しているかを特定してください。ニックネームや不完全な名前にも対応してください。
2. もしスタッフが「全員」や「みんな」と言っている場合は、リストにある該当者を可能な限り列挙してください。
3. 否定（〇〇じゃなくて××だよ）の場合は、否定された方を無視し、正解のみを抽出してください。

【出力形式 (JSONのみ)】
{
  "identified_ids": ["ID1", "ID2"],
  "identified_names": ["正式名1", "正式名2"],
  "is_correction": boolean // 訂正であれば true
}
`;
        try {
            const res = this.gemini.generateJson(prompt);
            if (!res || !res.identified_ids || res.identified_ids.length === 0) return;

            // BigQueryの更新
            // 直前の質問に対応するメッセージIDであればそれを使用、なければ直近1時間の未確定を対象
            let whereClause = `is_confirmed = false AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)`;
            // pendingKey がメッセージIDそのもののケース（旧仕様）と、work_ プレフィックスなしのケース
            if (pendingKey && !pendingKey.includes('_')) {
                whereClause = `message_id = '${pendingKey}'`;
            }

            const ids = res.identified_ids.map(id => `'${id}'`).join(',');
            const sql = `
                UPDATE \`${this.datasetId}.${this.tableId}\`
                SET 
                    mention_user_ids = [${ids}],
                    is_confirmed = true,
                    confidence = 1.0
                WHERE ${whereClause}
            `;

            this.bq.runDml(sql);
            Logger.info(`Updated Mention via AI response: ${res.identified_names.join(', ')}`);

            // 返答とクリーンアップ
            this._sendSimpleResponse(staffUserId, `✅ 承知しました。${res.identified_names.join('、')} さんの記録として修正しました。`);
            PropertiesService.getScriptProperties().deleteProperty(`question_pending_${staffUserId}`);

        } catch (e) {
            Logger.error('Failed to handle AI confirmation response', e);
        }
    }

    /**
     * 仕事モード（不備補完）の回答解析
     */
    _handleWorkModeResponse(responseText, staffUserId, pendingKey) {
        const sync = new DataSyncEngine();
        const storageKey = pendingKey.replace('work_', ''); // e.g. missing_101_address
        const pendingData = JSON.parse(PropertiesService.getScriptProperties().getProperty(storageKey) || '{}');

        if (!pendingData.userId) return;

        const prompt = `
あなたは事務アシスタントです。
スタッフの回答に基づき、以下の項目に対する処理を決定してください。

【質問対象者】: ${pendingData.userName}
【項目】: ${pendingData.key || '不整合の解消'}
【スタッフの回答】: "${responseText}"

【抽出ルール】
1. 回答が具体的な値（住所、電話番号、日付など）の場合、action="update", valueにその値を設定。
2. 回答が「不明」「なし」「わからない」「スキップ」「後で」などの場合、action="skip"。
3. 回答があいまいで判断できない場合、action="retry"。

【出力形式 (JSONのみ)】
{
  "action": "update" | "skip" | "retry",
  "value": "抽出された値 (updateの場合のみ)",
  "explanation": "理由"
}
`;

        try {
            const res = this.gemini.generateJson(prompt);

            if (res && res.action === 'update' && res.value) {
                sync.updateMasterData(pendingData.userId, pendingData.key || 'address', res.value);
                this._sendSimpleResponse(staffUserId, `✅ ありがとうございます。${pendingData.userName}さんの「${pendingData.key}」を ${res.value} として更新しました！\n続きの仕事がありますか？（「次」と送ってください）`);
                PropertiesService.getScriptProperties().deleteProperty(`question_pending_${staffUserId}`);

            } else if (res && res.action === 'skip') {
                // スキップの場合: 翌日まで再通知しないようにスヌーズ設定する
                // 1日後 (現在時刻 + 24時間)
                const tomorrow = new Date().getTime() + 24 * 60 * 60 * 1000;

                const props = PropertiesService.getScriptProperties();
                // 修正: pendingData.storageKey ではなく、スコープ内の storageKey 変数を使用する
                const currentData = JSON.parse(props.getProperty(storageKey) || '{}');
                currentData.skippedUntil = tomorrow;

                props.setProperty(storageKey, JSON.stringify(currentData));
                props.deleteProperty(`question_pending_${staffUserId}`); // 会話終了

                this._sendSimpleResponse(staffUserId, `👌 ${pendingData.userName}さんの「${pendingData.key}」をスキップしました。\n（※明日また確認します）\n\n続きの仕事がありますか？（「次」と送ってください）`);

            } else {
                this._sendSimpleResponse(staffUserId, "❓ うまく読み取れませんでした。もう一度詳しく教えていただけますか？（または「スキップ」と送ってください）");
            }
        } catch (e) {
            Logger.error('Work mode response analysis failed', e);
            this._sendSimpleResponse(staffUserId, "⚠️ エラーが発生しました。もう一度試すか、「スキップ」してください。");
        }
    }

    /**
     * メッセージを送信する（ユーザーまたはチャンネル）
     */
    _sendSimpleResponse(targetId, text) {
        const token = this.lineAuth.getAccessToken();
        const isChannel = targetId.includes('-') || targetId.startsWith('c_');
        const type = isChannel ? 'channels' : 'users';

        const url = `https://www.worksapis.com/v1.0/bots/${this.botId}/${type}/${targetId}/messages`;

        try {
            const response = UrlFetchApp.fetch(url, {
                method: 'post',
                headers: { Authorization: `Bearer ${token}` },
                contentType: 'application/json',
                payload: JSON.stringify({ content: { type: 'text', text: text } }),
                muteHttpExceptions: true
            });
            const code = response.getResponseCode();
            const resBody = response.getContentText();
            console.log(`[ChatLogger] Send info: ID=${targetId}, Code=${code}, Body=${resBody}`);

            if (code !== 200 && code !== 201) {
                PropertiesService.getScriptProperties().setProperty('LAST_SEND_ERROR', `Code ${code}: ${resBody}`);
            }
        } catch (err) {
            console.error(`[ChatLogger] Fetch Error: ${err}`);
            PropertiesService.getScriptProperties().setProperty('LAST_SEND_ERROR', err.toString());
        }
    }

    _analyzeContent(text) {
        if (!text || text.length < 10) {
            return { sentiment: 0, keywords: [] };
        }
        return { sentiment: 0.5, keywords: [] };
    }

    /**
     * テキストから予定を抽出して登録する内部処理
     */
    _processCalendarEventFromText(text, staffUserId) {
        const absenceData = this.calendarExtractor.extractAbsence(text);
        if (absenceData && absenceData.is_absence_notification) {
            Logger.info(`Absence detected in chat: ${absenceData.target_user_name} on ${absenceData.start}`);

            // カレンダー登録実行
            const gEventId = this.syncEngine.registerAbsenceEvent(absenceData);

            // スタッフへ完了報告
            if (staffUserId && gEventId) {
                this._sendSimpleResponse(staffUserId, `✅ カレンダーに登録しました：${absenceData.summary} (${absenceData.start})`);
            }
            return true;
        }
        return false;
    }

    /**
     * 過去のチャットログをスキャンしてカレンダー登録を遡って実行する
     * @param {number} days 遡る日数
     */
    backfillCalendarFromChat(days = 7) {
        Logger.info(`Starting Calendar Backfill from Chat Logs (Last ${days} days)...`);

        const sql = `
            SELECT content, user_id, created_at 
            FROM \`${this.datasetId}.${this.tableId}\`
            WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${days} DAY)
            AND (content LIKE '%休み%' OR content LIKE '%欠席%' OR content LIKE '%キャンセル%')
            ORDER BY created_at ASC
        `;

        const logs = this.bq.runQuery(sql);
        let processedCount = 0;

        logs.forEach(log => {
            // 重複登録防止のため、既にカレンダー登録済みのキーワード等があるか等の簡易チェックは registerAbsenceEvent 側の GCal 重複防止に任せる
            const success = this._processCalendarEventFromText(log.content, null);
            if (success) processedCount++;
        });

        processedCount;
    }

    /**
     * スタッフの「仕事をすすめる」リクエストを処理する
     */
    _handleWorkModeRequest(staffUserId, channelId) {
        const sync = new DataSyncEngine();
        const pending = sync.getPendingWorkForStaff(staffUserId);

        const props = PropertiesService.getScriptProperties();
        props.setProperty('DEBUG_WORK_MODE_PENDING', pending ? JSON.stringify(pending) : 'NULL');

        if (!pending) {
            this._sendSimpleResponse(channelId, "✅ 現在、確認が必要な不備や過去ログはありません。お疲れ様でした！");
            return;
        }

        let msg = "";
        if (pending.type === 'conflict') {
            msg = `❓ ${pending.userName}さんの情報に不一致があります。\n` +
                `[A] ${pending.diffs[0].key}: ${pending.diffs[0].db} (DB)\n` +
                `[B] ${pending.diffs[0].key}: ${pending.diffs[0].file} (ファイル)\n` +
                `どちらが正しいですか？ または最新情報を教えてください。`;
        } else if (pending.type === 'missing') {
            msg = `❓ ${pending.userName}さんの「${pending.key}」が不明です。教えていただけますか？`;
        }

        this._sendSimpleResponse(channelId, msg);
        // コンテキストの保存 - storageKey (conflict_xxx) をそのまま保持する
        props.setProperty(`question_pending_${staffUserId}`, `work_${pending.storageKey}`);
    }
}
