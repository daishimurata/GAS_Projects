/**
 * ChatDataEnricher.js
 * チャットログに対して「誰に関するデータか（ターゲット）」を付与するクラス。
 */
class ChatDataEnricher {
    constructor() {
        this.registry = new UserRegistry();
        this._cachedUsers = null;
    }

    /**
     * メッセージの内容を解析し、言及されている全ての利用者を特定する
     * @param {string} content メッセージ本文
     * @return {Object} {mention_user_ids: Array, confidence, is_confirmed}
     */
    analyzeMention(content, channelId = 'direct') {
        const aiResult = this.analyzeMultiMentionWithAI(content, channelId);

        // 旧UI互換のため、一つでも確定があれば is_confirmed=true とする
        const confirmed = aiResult.mentions.filter(m => m.status === 'confirmed');

        return {
            mention_user_ids: confirmed.map(m => m.id),
            confidence: confirmed.length > 0 ? 1.0 : 0.0,
            is_confirmed: confirmed.length > 0,
            all_mentions: aiResult.mentions, // 詳細情報を保持
            needs_asking: aiResult.mentions.some(m => m.status === 'needs_asking' || m.status === 'unknown')
        };
    }

    /**
     * AIを使用して複数の言及を抽出・特定する
     */
    analyzeMultiMentionWithAI(content, channelId) {
        const gemini = getGeminiClient();
        const people = this.registry.getAllPeople();

        // 直近のコンテキストを取得
        const lastContext = PropertiesService.getScriptProperties().getProperty(`last_target_${channelId}`) || 'None';

        const prompt = `
あなたは福祉施設の記録管理アシスタントです。
以下のチャットメッセージから「誰に関する記録か」を全て抽出してください。

【メッセージ】
"${content}"

【利用者リスト】
${JSON.stringify(people.users.map(u => ({ id: u.id, name: u.name })))}

【スタッフリスト】
${JSON.stringify(people.staff.map(s => ({ id: s.id, name: s.name, display: s.displayName })))}

【前回の会話の文脈】
直前まで「${lastContext}」に関する話をしていました。

【抽出ルール】
1. メッセージ内に登場する人物を全て特定してください。
2. 「ちゃん」「くん」「さん」などの敬称や、名字のみ、名前のみの呼び方にも対応してください。
3. リストにない名前や、特定が曖昧な場合は status を "needs_asking" にしてください。
4. 名前が全く出てこないが代名詞（彼、彼女、その子）がある場合、前回の会話の文脈から推論してください。
5. 推論が確実な場合は "confirmed"、確認が必要な場合は "needs_asking"、全く不明な名前は "unknown" としてください。

【出力形式 (JSONのみ)】
{
  "mentions": [
    {
      "id": "ID (リスト上のもの)",
      "name_in_text": "テキスト中での表記",
      "identified_name": "特定された正式名",
      "type": "user" | "staff",
      "status": "confirmed" | "needs_asking" | "unknown",
      "explanation": "なぜそう判定したか"
    }
  ]
}
`;

        try {
            const res = gemini.generateJson(prompt);
            if (res && res.mentions) {
                // 確定した人をコンテキストとして保存
                const confirmedNames = res.mentions
                    .filter(m => m.status === 'confirmed')
                    .map(m => m.identified_name)
                    .join(', ');
                if (confirmedNames) {
                    PropertiesService.getScriptProperties().setProperty(`last_target_${channelId}`, confirmedNames);
                }
                return res;
            }
        } catch (e) {
            console.error('[ChatDataEnricher] AI Analysis failed', e);
        }

        return { mentions: [] };
    }

    /**
     * 既存のBigQueryレコードに対して一括でタグ付けを行う（バッチ用）
     * @param {string} datasetId
     * @param {string} tableId
     */
    enrichExistingLogs(datasetId, tableId) {
        const bq = getBigQueryClient();
        const startTime = Date.now();
        const TIMEOUT_LIMIT = 5.5 * 60 * 1000; // 5.5分 (GASの制限は約6分)

        let totalUpdated = 0;
        let hasMore = true;

        console.log('[ChatDataEnricher] Starting batch enrichment loop...');

        while (hasMore) {
            // 現在の実行時間を確認
            if (Date.now() - startTime > TIMEOUT_LIMIT) {
                console.warn('[ChatDataEnricher] Approaching GAS timeout limit. Stopping batch process.');
                break;
            }

            // まだタグ付けされていないログ（ARRAYが空またはNULL）を1000件取得
            const query = `SELECT * FROM \`${datasetId}.${tableId}\` WHERE ARRAY_LENGTH(mention_user_ids) = 0 OR mention_user_ids IS NULL LIMIT 1000`;
            const logs = bq.runQuery(query);

            if (!logs || logs.length === 0) {
                console.log('[ChatDataEnricher] All logs are enriched or no un-enriched logs found.');
                hasMore = false;
                break;
            }

            console.log(`[ChatDataEnricher] Processing batch of ${logs.length} logs...`);

            let successCount = 0;
            for (const log of logs) {
                // 個別のタイムアウト確認
                if (Date.now() - startTime > TIMEOUT_LIMIT) break;

                const enrichment = this.analyzeMention(log.content);
                // 名前が見つかったかどうかにかかわらず、一度解析したものは処理済みとしてマークする
                // (名前がない場合は空配列をセットして無限ループを防ぐ)
                const escapedIdList = enrichment.mention_user_ids.map(id => `'${id}'`).join(',');
                const updateSql = `
                    UPDATE \`${datasetId}.${tableId}\`
                    SET 
                        mention_user_ids = [${escapedIdList}],
                        is_confirmed = ${enrichment.is_confirmed},
                        confidence = ${enrichment.confidence}
                    WHERE 
                        message_id = '${log.message_id}'
                `;
                try {
                    bq.runDml(updateSql);
                    if (enrichment.mention_user_ids.length > 0) successCount++;
                } catch (e) {
                    console.error(`[ChatDataEnricher] Failed to update message ${log.message_id}:`, e);
                }
            }

            totalUpdated += successCount;
            console.log(`[ChatDataEnricher] Batch completed. Matched this batch: ${successCount}. Total matched so far: ${totalUpdated}`);

            // 取得件数が1000件未満なら、もう次はないと判断
            if (logs.length < 1000) {
                hasMore = false;
            }
        }

        console.log(`[ChatDataEnricher] Batch enrichment process ended. Total Users Tagged: ${totalUpdated}`);
    }
}
