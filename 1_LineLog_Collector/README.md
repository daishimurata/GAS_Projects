# LINE WORKS × Google Workspace 統合システム

LINE WORKSのカレンダーとチャット履歴をGoogleカレンダー・Googleドライブに同期し、Geminiで活用できるようにするGASプロジェクトです。

## 📋 概要

このシステムは以下の主要機能を提供します：

### 1. カレンダー同期機能
- LINE WORKSの**全メンバーのカレンダー**からイベントを取得
- 1つのGoogleカレンダーに統合して同期
- 過去7日間〜未来60日間の予定を対象
- 1日4回自動同期（5:00、10:00、16:00、21:00）
- 誰のカレンダーか識別可能（プレフィックス付与）

### 2. チャット履歴同期機能
- LINE WORKSの**全チャットルーム**からメッセージを取得
- Googleドライブにスプレッドシート＋テキストログとして保存
- 添付ファイルも自動ダウンロード
- Gemini検索最適化（キーワードインデックス、日次サマリー生成）
- 1日4回自動同期

### 3. 在庫管理機能 🆕
- **直売所からの売上速報メール**を自動監視
- **在庫を自動更新**（スプレッドシート連携）
- **LINE WORKSに自動通知**（売上速報・在庫不足警告）
- **Gemini分析用データ蓄積**（売上履歴・トレンド分析対応）
- 1分〜5分間隔で自動実行

## 🎯 活用例（Gemini連携）

### カレンダー・チャット
```
✅ 「明日の予定は？」→ 全メンバーの予定を一覧表示
✅ 「明日誰が休み？」→ 休暇申請を自動抽出
✅ 「今週の営業部のミーティング内容をまとめて」→ チャットログから要約
✅ 「田中さんが報告した件について」→ 特定人物の発言を検索
✅ 「プロジェクトAで決まったことは？」→ 決定事項を抽出
```

### 在庫管理 🆕
```
✅ 「今月のじゃがいもの販売数は？」→ 売上履歴から集計
✅ 「みどりの大地の売れ筋トップ3は？」→ 店舗別ランキング
✅ 「今週は何曜日が一番売れている？」→ 曜日別トレンド分析
✅ 「現在の在庫でじゃがいもは何日持つ？」→ 在庫予測
✅ 「来週の発注量を予測して」→ AI需要予測
```

## 📁 ファイル構成

### コードファイル

```
/GASlineworks/
├── Config.gs                  # 設定ファイル（認証情報・カレンダーID等）
├── Auth.gs                    # JWT署名とアクセストークン取得
├── Utils.gs                   # 共通ユーティリティ関数
├── LineWorksAPI.gs            # LINE WORKS API基本呼び出し
│
├── CalendarSync.gs            # カレンダー同期メイン処理
├── EventManager.gs            # イベント管理（重複・更新・削除）
│
├── ChatSync.gs                # チャット同期メイン処理
├── ChatLogger.gs              # チャットログ保存処理
├── GeminiOptimizer.gs         # Gemini検索最適化機能
│
├── GmailSync.gs               # 🆕 Gmail監視・保存機能
├── StockManagement.gs         # 🆕 在庫管理システム
│
├── MigrateToMonthly.gs        # 月次フォルダへの移行ツール
├── LineNotification.gs        # LINE通知機能
├── Main.gs                    # メイン実行・エントリーポイント
│
├── SystemDiagnostics.gs       # システム診断ツール
└── WebApp.gs                  # オンデマンド同期用Web App（オプション）
```

### ドキュメントファイル

```
├── README.md                       # このファイル（プロジェクト概要）
├── SETUP.md                        # セットアップ手順書
├── MONTHLY_LOGS_GUIDE.md           # 🆕 月次ログ機能ガイド
├── SYSTEM_SPECIFICATION.md         # 🆕 技術仕様書（詳細）
├── GEMINI_GUIDE.md                 # 🆕 Gemini向け利用ガイド
├── INTEGRATION_SETUP_GUIDE.md      # 統合セットアップガイド
├── WEBHOOK_SETUP.md                # Webhook設定ガイド
├── VERCEL_INTEGRATION_CODE.md      # Vercel連携コード
└── appsscript.json                 # GASマニフェストファイル
```

## 🚀 クイックスタート

### 前提条件

1. **LINE WORKS Developer Console**で以下を設定済み：
   - API Appの作成
   - Service Account認証の設定
   - 必要なAPI権限の付与
     - ✅ Calendar API（読み取り）
     - ✅ Message API（読み取り）
     - ✅ Bot API（ボット管理）
   - 秘密鍵（Private Key）のダウンロード

2. **Googleカレンダー**の作成
   - 同期先カレンダーを新規作成しておく

3. **LINE WORKS Bot**の作成
   - エラー通知用のBotを作成済み

### セットアップ手順

詳細は **[SETUP.md](./SETUP.md)** を参照してください。

#### 1. GASプロジェクトの作成

```
1. Googleドライブで「新規」→「その他」→「Google Apps Script」
2. プロジェクト名を「LINE WORKS統合システム」に変更
3. 本リポジトリの全ファイルをGASエディタにコピー
```

#### 2. 認証情報の設定

`Config.gs` を開き、以下を設定：

```javascript
const CONFIG = {
  LINEWORKS: {
    CLIENT_ID: 'ここにClient IDを貼り付け',
    SERVICE_ACCOUNT: 'ここにService Account IDを貼り付け',
    API_ID: 'ここにAPI IDを貼り付け',
    PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----
ここに秘密鍵を貼り付け
-----END PRIVATE KEY-----`,
    BOT_ID: 'ここにBot IDを貼り付け',
    BOT_SECRET: 'ここにBot Secretを貼り付け'
  },
  GOOGLE_CALENDAR: {
    MASTER_CALENDAR_ID: 'ここにGoogleカレンダーIDを貼り付け'
  },
  NOTIFICATION: {
    ADMIN_USER_ID: 'ここに管理者のLINE WORKS User IDを貼り付け'
  }
};
```

#### 3. トリガーの設定

GASエディタで「トリガー」アイコン（時計マーク）をクリック：

```
1. カレンダー同期トリガー:
   - 関数: executeCalendarSync
   - イベントソース: 時間主導型
   - 時刻ベース: 日タイマー、午前5-6時、午前10-11時、午後4-5時、午後9-10時

2. チャット同期トリガー:
   - 関数: executeChatSync
   - 同様に4回/日で設定
```

#### 4. 初回実行とテスト

```
1. Main.gs を開く
2. 関数「executeCalendarSync」を選択して実行
3. 初回実行時に権限の承認を求められるので許可
4. ログを確認して正常に動作していることを確認
```

## 🔧 主要機能の使い方

### カレンダー同期の手動実行

```javascript
executeCalendarSync();
```

### チャット同期の手動実行

```javascript
executeChatSync();
```

### 統合同期（両方同時実行）

```javascript
executeFullSync();
```

### 在庫管理システムの手動実行 🆕

```javascript
executeStockManagement();
```

### 在庫レポート送信 🆕

```javascript
sendStockReportNotification();
```

### 既存ログを月次フォルダに移行 🆕

月次フォルダ機能を有効化した後、既存のログファイルを整理：

```javascript
// 全ログファイルを一括移行
migrateAllLogsToMonthly();

// または個別に移行
migrateSystemLogsToMonthly();  // システムログのみ
migrateChatLogsToMonthly();    // チャットログのみ
```

### 古いログのアーカイブ

12ヶ月より古いログフォルダをアーカイブ：

```javascript
archiveOldMonthlyLogs(12);  // 12ヶ月より前のフォルダをアーカイブ
```

### オンデマンド同期（Web App経由）

Web AppをデプロイしてURLを取得後：

```bash
curl -X POST "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?action=syncAll"
```

## 📊 Googleドライブに作成されるデータ構造

```
/LINE WORKS統合ログ/
├── カレンダーデータ/
│   └── [Googleカレンダーと自動連携]
│
├── システムログ/          ← 月次フォルダで整理
│   ├── 2025-01/
│   │   └── 同期ログ.txt
│   ├── 2025-02/
│   │   └── 同期ログ.txt
│   └── ...
│
├── 在庫管理/              ← 🆕 在庫管理システム
│   └── 直売所管理システム.xlsx (スプレッドシート)
│       ├── シート: 在庫管理（マスタ）
│       ├── シート: 売上履歴（Gemini分析用）
│       └── シート: README
│
├── 在庫管理ログ/          ← 🆕 月次フォルダで整理
│   ├── 2025-01/
│   │   └── 2025-01-XX_在庫管理.txt
│   ├── 2025-11/
│   │   └── 2025-11-30_在庫管理.txt
│   └── ...
│
└── チャットログ/
    ├── マスターログ.xlsx
    │   ├── メッセージ一覧（全ルーム統合、検索・分析用）
    │   ├── ルーム一覧
    │   ├── 日次サマリー（Gemini用）
    │   └── 検索インデックス（キーワード最適化）
    │
    ├── 日次ログ/            ← 🆕 月次フォルダで整理
    │   ├── 2025-01/
    │   │   ├── 2025-01-15_全体ログ.txt
    │   │   ├── 2025-01-16_全体ログ.txt
    │   │   └── ...
    │   ├── 2025-02/
    │   │   └── ...
    │   └── ...
    │
    ├── ルーム別ログ/         ← 🆕 月次フォルダで整理
    │   ├── 2025-01/
    │   │   ├── ルーム名A_履歴.txt
    │   │   ├── ルーム名B_履歴.txt
    │   │   └── ...
    │   ├── 2025-02/
    │   │   └── ...
    │   └── ...
    │
    ├── 添付ファイル/         ← 月次フォルダで整理（既存機能）
    │   ├── 2025-01/
    │   │   └── ...
    │   ├── 2025-02/
    │   │   └── ...
    │   └── ...
    │
    └── バックアップ/
```

## 🤖 Gemini活用のための工夫

### 1. 構造化データ保存
スプレッドシートに以下の列を持たせることで、Geminiが理解しやすい形式に：
- 日時、送信者、ルーム名、メッセージ、添付ファイル、メッセージID、キーワード、カテゴリ

### 2. 日次サマリー自動生成
毎日のチャット内容を要約して保存：
- 主要トピック
- 重要決定事項
- 参加者別投稿数

### 3. キーワードインデックス
頻出キーワードを自動抽出・インデックス化：
- 会議、休暇、報告、決定、問題、完了など

### 4. メタデータ付与
各イベント・メッセージに以下を付与：
- カレンダー所有者名
- ルーム名
- カテゴリ（会議/休暇連絡/報告/質問/決定事項など）

## ⚙️ 設定のカスタマイズ

### 同期期間の変更

`Config.gs` で調整：

```javascript
SYNC: {
  CALENDAR_PAST_DAYS: 7,      // カレンダー過去日数
  CALENDAR_FUTURE_DAYS: 60,   // カレンダー未来日数
  CHAT_HISTORY_DAYS: 30,      // チャット履歴日数
}
```

### 月次フォルダ整理の設定 🆕

ログファイルを月ごとにフォルダ分けする機能（デフォルト: 有効）

```javascript
GOOGLE_DRIVE: {
  MONTHLY_ORGANIZATION: true  // 月次フォルダで整理する
}
```

**利点:**
- ✅ ログファイルが月ごとに整理されて見やすい
- ✅ 古い月のフォルダを簡単にアーカイブ・削除できる
- ✅ 特定月のログを検索しやすい
- ✅ ファイルサイズが大きくなりすぎるのを防ぐ

**無効にする場合:**
- すべてのログを1つのフォルダにまとめたい場合は `false` に設定

### 同期頻度の変更

トリガー設定で時刻を調整

### 通知設定

```javascript
NOTIFICATION: {
  ADMIN_USER_ID: '管理者ID',
  NOTIFY_ON_ERROR: true,      // エラー時に通知
  NOTIFY_ON_SUCCESS: false    // 成功時は通知しない
}
```

## 🐛 トラブルシューティング

### Q1. 「認証エラー」が出る

**A**: `Config.gs` の認証情報を再確認してください。特に秘密鍵の改行コードが正しいか確認。

### Q2. カレンダーが同期されない

**A**: 
1. LINE WORKS Developer Consoleで「Calendar API」権限が有効か確認
2. GoogleカレンダーIDが正しいか確認
3. ログを確認（`同期ログ.txt`）

### Q3. チャットが取得できない

**A**:
1. Botが各チャットルームに参加しているか確認
2. 「Message API」「Bot API」権限が有効か確認
3. Bot IDとBot Secretが正しいか確認

### Q4. 実行時間制限エラー

**A**: GASには6分の実行時間制限があります。大量データの場合、以下を検討：
- 同期期間を短縮
- バッチ処理に分割（複数のトリガーで分散実行）

### Q5. Geminiが正しく認識しない

**A**:
1. スプレッドシートの共有設定を確認（Geminiからアクセス可能か）
2. Googleカレンダーの共有設定を確認
3. メタデータ（説明文）が正しく付与されているか確認

## 📝 ログの確認方法

### GASログ

```
GASエディタ → 「実行数」タブ → 各実行のログを確認
```

### 同期ログファイル

```
Googleドライブ → 「LINE WORKS統合ログ」フォルダ → 「同期ログ.txt」
```

### LINE通知

エラー発生時、管理者のLINE WORKSに自動通知されます。

## 🔒 セキュリティとプライバシー

- **社内使用前提**: 外部公開しない設計
- **認証情報管理**: Config.gsは外部に公開しないこと
- **アクセス権限**: Googleドライブのフォルダは適切な権限設定を推奨
- **データ保持期間**: 必要に応じて古いログを削除する運用を検討

## 🆕 今後の拡張案

- [ ] 双方向同期（GoogleカレンダーからLINE WORKSへ）
- [ ] Slack連携
- [ ] より高度なGemini分析（感情分析、トレンド分析など）
- [ ] ダッシュボード作成（Data Studioなど）
- [ ] リアルタイム同期（Webhook対応）

## 📄 ライセンス

社内利用向けプロジェクトです。

## 📚 関連ドキュメント

- **[SETUP.md](./SETUP.md)** - 詳細なセットアップ手順
- **[MONTHLY_LOGS_GUIDE.md](./MONTHLY_LOGS_GUIDE.md)** - 月次ログ機能の使い方
- **[SYSTEM_SPECIFICATION.md](./SYSTEM_SPECIFICATION.md)** - 技術仕様書（開発者向け）
- **[GEMINI_GUIDE.md](./GEMINI_GUIDE.md)** - Gemini向け利用ガイド

## 🙋‍♂️ サポート

問題が発生した場合は、管理者にLINE WORKSでお問い合わせください。

---

**作成日**: 2025年10月16日  
**最終更新**: 2025年11月30日  
**バージョン**: 1.1.0  
**動作環境**: Google Apps Script





