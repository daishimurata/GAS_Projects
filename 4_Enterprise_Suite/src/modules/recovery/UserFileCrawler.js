/**
 * UserFileCrawler.js
 * 利用者フォルダ内のファイルを巡回し、情報を抽出・集約する。
 */
class UserFileCrawler {
  constructor() {
    this.gemini = getGeminiClient();
    this.registry = new UserRegistry();
  }

  crawlUserFolder(user) {
    const folder = DriveApp.getFolderById(user.folderId);
    const { text, blobs } = this._readFolderRecursive(folder);

    if (!text && blobs.length === 0) {
      console.log(`[Crawler] No content found for ${user.name}`);
      return null;
    }

    console.log(`[Crawler] Analyzing ${user.name}: ${text.length} chars text, ${blobs.length} media files.`);

    // Gemini に解析を依頼
    return this._extractDataWithAI(text, blobs, user.name);
  }

  /**
   * フォルダ内のファイルを再帰的に読み込む
   */
  _readFolderRecursive(folder, depth = 0) {
    if (depth > 3) return { text: '', blobs: [] };

    let content = '';
    const collectedBlobs = [];

    const files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      const name = file.getName();
      const ext = name.split('.').pop().toLowerCase();
      const mime = file.getMimeType();

      // テキスト系ソート (HTML含む)
      if (['md', 'html', 'txt'].includes(ext) || mime === 'text/html') {
        try {
          const str = file.getBlob().getDataAsString();
          content += `--- File: ${name} ---\n${str}\n\n`;
        } catch (e) {
          console.warn(`Could not read text file ${name}: ${e}`);
        }
      }
      // PDF対応
      else if (ext === 'pdf' || mime === 'application/pdf') {
        try {
          // Geminiの制限考慮: Max 3MB 程度のリミットがあるため、あまりに巨大なファイルは避ける論理を入れるならここ
          if (file.getSize() < 10 * 1024 * 1024) { // 10MB以下
            collectedBlobs.push(file.getBlob());
          }
        } catch (e) {
          console.warn(`Could not read PDF file ${name}: ${e}`);
        }
      }
    }

    const subfolders = folder.getFolders();
    while (subfolders.hasNext()) {
      const result = this._readFolderRecursive(subfolders.next(), depth + 1);
      content += result.text;
      collectedBlobs.push(...result.blobs);
    }

    return { text: content, blobs: collectedBlobs };
  }

  /**
   * AIを使用してテキストから属性情報を抽出する
   */
  _extractDataWithAI(text, blobs, userName) {
    // 画像は現状対象外とするが、将来的には blobs を Gemini Pro Vision に渡すことも可能
    // 現行の gemini.generateJson はテキストのみ想定のため、blobsがある場合はファイル名などをヒントとして追加する
    let fileInfo = '';
    if (blobs && blobs.length > 0) {
      fileInfo = '\n【添付ファイル情報】\n' + blobs.map(b => `Type: ${b.getContentType()}, Size: ${b.getBytes().length}`).join('\n');
    }

    const prompt = `
あなたは福祉施設の事務アシスタントです。
以下のテキスト資料から、「${userName}」さんの基本情報を抽出してください。

【資料テキスト】
${text}
${fileInfo}

【抽出・網羅ルール】
1. **全履歴の抽出**: 
   - 資料内に複数の「個別支援計画書」や「アセスメントシート」が存在する場合、**見つかったすべての版を漏れなく抽出**して、それぞれの配列（\`user_assessments\`、\`user_support_plans\`）に格納してください。
   - 「第1版」「第2版」「No.1」「No.2」などの識別番号や日付で区別してください。
2. **基本情報の最新化**:
   - \`user_master\` や \`user_profiles\` については、資料全体を統合し、現時点での「最新・確定」と思われる情報を抽出してください。
3. **ドキュメントの完全性**:
   - 各版の内容が消えても復元できるレベルで、目標や支援内容を具体的に要約してください。

【抽出要件】
BigQueryへインポートするためのJSONデータを作成してください。
日付不明の場合は null にしてください。

出力JSONフォーマット:
{
  "user_master": {
    "name": "氏名 (必須)",
    "kana": "フリガナ",
    "nickname": "あだ名・愛称",
    "gender": "男性/女性",
    "birth_date": "YYYY-MM-DD",
    "postal_code": "郵便番号",
    "address": "住所",
    "phone_number": "電話番号",
    "disability_type": "障害種別",
    "benefit_number": "受給者証番号",
    "benefit_end_date": "YYYY-MM-DD"
  },
  "user_profiles": {
    "medical_history": "既往歴・持病",
    "medication": "服薬状況",
    "allergies": "アレルギー",
    "doctor": "主治医・医療機関",
    "communication": "意思疎通方法",
    "likes_dislikes": "得意・苦手・こだわり",
    "growth_history": "成育歴・学歴",
    "family_environment": "家庭環境・キーパーソン",
    "welfare_history": "福祉サービス利用歴",
    "calm_methods": "落ち着く方法・配慮事項"
  },
  "user_families": [
    {
      "family_name": "氏名",
      "relationship": "続柄",
      "contact_number": "連絡先",
      "workplace": "勤務先",
      "priority": 1,
      "is_living_together": true
    }
  ],
  "user_assessments": [
    {
      "assessment_date": "YYYY-MM-DD",
      "work_motivation": "労意欲の要約",
      "work_persistence": "持続力・集中力の要約",
      "work_speed": "作業スピードの要約",
      "work_accuracy": "作業正確性の要約",
      "social_relations": "対人関係の要約",
      "comm_ability": "意思疎通力の要約",
      "strengths": "本人の強みの要約",
      "challenges": "改善課題の要約"
    }
  ],
  "user_support_plans": [
    {
      "plan_date": "YYYY-MM-DD",
      "plan_id": "No.1等",
      "basic_policy": "援助方針の要約",
      "long_term_goal": "長期目標の要約",
      "short_term_goal": "短期目標の要約",
      "period_start": "YYYY-MM-DD",
      "period_end": "YYYY-MM-DD",
      "monitoring_date": "YYYY-MM-DD",
      "source_file": "ファイル名",
      "goals": [
        {
          "index": 1,
          "issue": "解決すべき課題",
          "reachable_goal": "具体的到達目標",
          "support_content": "具体的な支援内容",
          "duration": "期間"
        }
      ],
      "evaluations": [
        {
          "index": 1,
          "evaluation_date": "YYYY-MM-DD",
          "progress": "進捗状況・達成度",
          "support_effect": "支援効果",
          "comment": "評価内容・方向性"
        }
      "process_records": [
        {
          "step": "手順名",
          "date": "YYYY-MM-DD",
          "participants": "参加者",
          "status": "完了/未"
        }
      ],
      "plan_changes": [
        {
          "item": "変更項目",
          "content": "変更内容",
          "reason": "理由",
          "proposer": "提案者"
        }
      ],
      "evaluation_details": [
        {
          "category": "カテゴリ(長期目標評価等)",
          "status": "順調/遅れ等",
          "content": "内容・コメント"
        }
      ]
    }
  ],
  "life_histories": [
    {
      "date": "時期(20XX年等)",
      "event": "出来事(学歴、職歴、発症等)",
      "description": "詳細内容",
      "category": "学歴/職歴/病歴/生活史"
    }
  ],
  "contradictions": [
    {
      "key": "項目名",
      "reason": "矛盾の理由（例: フェイスシートと最新の契約書で住所が異なります）",
      "values": ["古い値", "新しい値"]
    }
  ]
}
`;

    try {
      const res = this.gemini.generateJson(prompt);
      return res;
    } catch (e) {
      console.error(`[UserFileCrawler] AI extraction failed for ${userName}`, e);
      return null;
    }
  }

  /**
   * 全利用者を一括でクロールする（バッチ用）
   */
  crawlAll() {
    const users = this.registry.getUsers();
    const results = [];
    for (const user of users) {
      console.log(`Crawling: ${user.name}`);
      const data = this.crawlUserFolder(user);
      if (data) {
        results.push({ user, data });
      }
      Utilities.sleep(1000); // 連続リクエスト回避
    }
    return results;
  }
}
