/**
 * CalendarExtractionService.js
 * AI (Gemini) を使用して、チャットテキストからカレンダー予定（特に欠席連絡）を抽出する。
 */
class CalendarExtractionService {
    constructor() {
        this.gemini = getGeminiClient();
        this.registry = new UserRegistry();
        this.directory = new DirectoryService(); // Staff Directory
    }

    /**
     * テキストから予定情報を抽出する
     * @param {string} text 
     * @returns {Object|null} 抽出された予定データ。欠席連絡でない場合は null。
     */
    extractAbsence(text) {
        if (!text || text.length < 2) return null; // 短すぎるのも除外

        const now = new Date();
        const context = {
            today: now.toISOString().split('T')[0],
            dayOfWeek: ['日', '月', '火', '水', '木', '金', '土'][now.getDay()]
        };

        // ユーザー名簿の注入 (あだ名対応のため)
        if (!this._userCache) {
            this._userCache = this.registry.getUsers();
        }
        // コンテキストサイズ節約のため、ID/名前/あだ名のみのリスト作成
        const userListSimp = this._userCache.map(u => ({
            name: u.name,
            nicknames: u.nicknames || (u.nickname ? [u.nickname] : [])
        }));

        const prompt = `
あなたは福祉施設の送迎・欠席管理アシスタントです。
以下のチャットメッセージから「利用者の欠席・休み」または「スタッフの休暇」に関する情報を抽出してください。

【メッセージ】
"${text}"

【現在の状況】
今日は ${context.today} (${context.dayOfWeek}) です。

【利用者名簿 (名前 / あだ名)】
${JSON.stringify(userListSimp)}

【抽出ルール】
1. 欠席・休み・キャンセルに関する内容であるかを判定してください。
2. 対象となる人名を特定してください。
   - **名簿にあるあだ名（またはその一部）が使われている場合は、必ず名簿の「name（正式名称）」を target_user_name に出力してください。**
   - 例: "もえぴ休み" -> target_user_name: "川端萌"
3. 休みの日時（開始・終了）を特定してください。
   - 「明日」や「来週の月曜日」などの相対的な表現は今日の日付を基準に日付に変換してください。
   - **重要: 時間の指定が明確にない「休み」「欠席」の場合は、必ず is_all_day: true としてください。**
   - 「10時から」「午後から」などの時間指定がある場合のみ false にしてください。
4. カレンダーに登録する簡潔なタイトル（例: 「【欠席】〇〇様」または「[スタッフ名] 休み」）を作成してください。
   - タイトルには必ず正式名称を使用してください。

【出力形式 (JSONのみ)】
{
  "is_absence_notification": boolean, // 欠席・休み連絡なら true
  "target_user_name": string,         // 正式名称
  "summary": string,                 // カレンダータイトル (正式名称含む)
  "start": string,                   // ISO 8601形式 (dateTime or date)
  "end": string,                     // ISO 8601形式
  "is_all_day": boolean,             // 終日予定なら true. デフォルトは true 推奨
  "reason": string                   // 理由（あれば）
}

※欠席・休みに関係ないメッセージの場合は、is_absence_notification を false にしてください。
        `;

        try {
            const res = this.gemini.generateJson(prompt);
            if (res && res.is_absence_notification && res.target_user_name) {
                // 1. 利用者リスト(UserRegistry)からの検索
                if (!this._userCache) {
                    this._userCache = this.registry.getUsers();
                }
                const user = this.registry.findAllMentionedUsers(res.target_user_name, this._userCache)[0];

                // 2. スタッフリスト(DirectoryService)からの検索
                // スタッフの場合はLW UserIDを特定してカレンダー同期先を振り分ける
                let lwUserId = null;
                if (!user) {
                    if (!this._staffCache) {
                        // 全スタッフ取得は重いので、本来はキャッシュすべきだがここでは簡易実装
                        // かつ、これは頻繁には呼ばれないフローと仮定
                        this._staffCache = this.directory.getUsers();
                    }
                    const staff = this._findStaffByName(res.target_user_name, this._staffCache);
                    if (staff) {
                        lwUserId = staff.userId;
                        Logger.info(`identified staff: ${staff.userName} (${lwUserId})`);
                    }
                }

                return {
                    ...res,
                    target_user_id: lwUserId, // スタッフの場合のみIDが入る
                    is_beneficiary: !!user    // 利用者の場合は true
                };
            }
        } catch (e) {
            Logger.error('Failed to extract absence from chat', e);
        }
        return null;
    }

    _findStaffByName(name, staffList) {
        if (!name || !staffList) return null;
        // 名字での一致確認（単純版）
        return staffList.find(s => {
            const ln = s.userName.lastName;
            const fn = s.userName.firstName;
            return name.includes(ln) || name.includes(fn) || name.includes(`${ln}${fn}`);
        });
    }
}
