# LINE WORKS統合システム セットアップ手順書

このドキュメントでは、LINE WORKS統合システムの詳細なセットアップ手順を説明します。

## 📋 前提条件

### 必要なアカウント・権限

- ✅ LINE WORKS管理者アカウント
- ✅ Googleアカウント（Google Workspace推奨）
- ✅ LINE WORKS Developer Consoleへのアクセス権限

### 必要な事前準備

1. Googleカレンダーの作成（同期先）
2. LINE WORKS Botの作成（通知用）

---

## 🔧 Part 1: LINE WORKS Developer Consoleでの設定

### ステップ 1.1: Developer Consoleにアクセス

1. [LINE WORKS Developer Console](https://developers.worksmobile.com/) にアクセス
2. 管理者アカウントでログイン
3. 対象のテナント（組織）を選択

### ステップ 1.2: API Appを作成

1. 「API App」メニューを選択
2. 「新規作成」をクリック
3. アプリ名を入力（例：`LINE WORKS統合システム`）
4. 「作成」をクリック

### ステップ 1.3: 認証方式の設定

1. 作成したAPI Appを選択
2. 「認証」タブを開く
3. 認証方式で **「Service Account」** を選択
4. 「保存」をクリック

### ステップ 1.4: API権限の設定

1. 「API」タブを開く
2. 以下の権限にチェックを入れます：

**Calendar API**
- ✅ `calendar:read` - カレンダー読み取り
- ✅ `calendar.event:read` - イベント読み取り

**Message API**
- ✅ `message:read` - メッセージ読み取り
- ✅ `bot:read` - Bot情報読み取り

**Bot API**
- ✅ `bot:send` - メッセージ送信
- ✅ `bot.channel:read` - チャンネル情報読み取り

3. 「保存」をクリック

### ステップ 1.5: 認証情報の取得

以下の情報をメモ帳などに保存してください：

1. **Client ID**: API Appの基本情報ページに表示
2. **Service Account ID**: 認証タブに表示
3. **API ID**: 基本情報ページに表示（テナントID）

### ステップ 1.6: 秘密鍵のダウンロード

1. 「認証」タブの「秘密鍵」セクション
2. 「秘密鍵をダウンロード」をクリック
3. `.key` ファイルがダウンロードされます
4. **⚠️ 重要**: このファイルは厳重に保管してください

### ステップ 1.7: Botの設定

1. LINE WORKS管理画面で「Bot」を作成
2. Botの以下の情報をメモ：
   - Bot ID
   - Bot Secret
3. Botを各チャットルームに参加させる

---

## 🚀 Part 2: Google Apps Scriptプロジェクトの作成

### ステップ 2.1: GASプロジェクトの作成

1. [Googleドライブ](https://drive.google.com/)にアクセス
2. 「新規」→「その他」→「Google Apps Script」をクリック
3. プロジェクト名を「LINE WORKS統合システム」に変更

### ステップ 2.2: ファイルのアップロード

本リポジトリの全ファイルをGASエディタに追加します：

#### 方法A: 手動コピー

1. GASエディタで「+」→「スクリプト」をクリック
2. 以下のファイルを順番に作成し、内容をコピー：

```
Config.gs
Auth.gs
Utils.gs
LineWorksAPI.gs
CalendarSync.gs
EventManager.gs
ChatSync.gs
ChatLogger.gs
GeminiOptimizer.gs
LineNotification.gs
Main.gs
WebApp.gs (オプション)
```

3. `appsscript.json` も同様にコピー

#### 方法B: clasp（コマンドライン）

```bash
# claspをインストール（初回のみ）
npm install -g @google/clasp

# ログイン
clasp login

# 新規プロジェクト作成
clasp create --title "LINE WORKS統合システム"

# ファイルをプッシュ
clasp push
```

### ステップ 2.3: appsscript.jsonの設定

GASエディタで「プロジェクトの設定」→「マニフェストファイルをエディタで表示」にチェックを入れ、`appsscript.json`が表示されることを確認します。

---

## ⚙️ Part 3: 認証情報の設定

### ステップ 3.1: Config.gsを開く

GASエディタで `Config.gs` を開きます。

### ステップ 3.2: LINE WORKS認証情報を設定

```javascript
const CONFIG = {
  LINEWORKS: {
    CLIENT_ID: 'ここにClient IDを貼り付け',
    SERVICE_ACCOUNT: 'ここにService Account IDを貼り付け',
    API_ID: 'ここにAPI IDを貼り付け',
    PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----
ダウンロードした秘密鍵ファイルの内容をここに貼り付け
-----END PRIVATE KEY-----`,
    BOT_ID: 'ここにBot IDを貼り付け',
    BOT_SECRET: 'ここにBot Secretを貼り付け'
  },
  // ... 以下続く
```

**秘密鍵の貼り付け方**:
1. ダウンロードした`.key`ファイルをテキストエディタで開く
2. 全内容をコピー
3. `PRIVATE_KEY`の部分に貼り付け
4. 改行がそのまま保持されていることを確認

### ステップ 3.3: Googleカレンダー IDを設定

1. Googleカレンダーを開く
2. 同期先カレンダーの「設定と共有」を開く
3. 「カレンダーの統合」セクションの「カレンダーID」をコピー
4. Config.gsに貼り付け：

```javascript
GOOGLE_CALENDAR: {
  MASTER_CALENDAR_ID: 'ここにGoogleカレンダーIDを貼り付け@group.calendar.google.com'
}
```

### ステップ 3.4: 管理者User IDを設定

1. LINE WORKS管理画面でユーザー情報を確認
2. 管理者のUser IDをコピー
3. Config.gsに貼り付け：

```javascript
NOTIFICATION: {
  ADMIN_USER_ID: 'ここに管理者のUser IDを貼り付け'
}
```

### ステップ 3.5: 設定を保存

`Ctrl+S` (Windows) または `Cmd+S` (Mac) で保存します。

---

## 🧪 Part 4: 動作確認とテスト

### ステップ 4.1: 初期セットアップ実行

1. GASエディタで `Main.gs` を開く
2. 関数ドロップダウンから `initialSetup` を選択
3. 「実行」ボタン（▶️）をクリック
4. 初回実行時に権限の承認を求められます：
   - 「権限を確認」をクリック
   - Googleアカウントを選択
   - 「詳細」→「（プロジェクト名）に移動」をクリック
   - 「許可」をクリック

### ステップ 4.2: ログの確認

実行ログを確認：
1. 「実行数」タブをクリック
2. 最新の実行を選択
3. ログに以下が表示されれば成功：

```
✅ 設定検証完了
✅ 認証テスト完了
✅ API接続テスト完了
✅ フォルダ作成完了
✅ スプレッドシート作成完了
✅ テスト通知送信成功
🎉 初期セットアップ完了！
```

### ステップ 4.3: 認証テスト

個別に認証をテストすることもできます：

```javascript
// Auth.gsで実行
testAuthentication()

// LineWorksAPI.gsで実行
testAllAPIs()
```

### ステップ 4.4: テスト同期実行

手動で同期をテストします：

**カレンダー同期**:
```javascript
// Main.gsで実行
executeCalendarSync()
```

**チャット同期**:
```javascript
// Main.gsで実行
executeChatSync()
```

---

## ⏰ Part 5: 自動実行トリガーの設定

### ステップ 5.1: トリガーページを開く

1. GASエディタ左側の「トリガー」アイコン（時計マーク）をクリック
2. 「トリガーを追加」をクリック

### ステップ 5.2: カレンダー同期トリガー（1日4回）

**トリガー1: 朝5時**
- 実行する関数: `executeCalendarSync`
- イベントのソース: `時間主導型`
- 時間ベースのトリガーのタイプ: `日タイマー`
- 時刻: `午前5時〜6時`
- 「保存」をクリック

**トリガー2: 朝10時**
- 同様の設定で時刻を `午前10時〜11時` に

**トリガー3: 夕方4時**
- 同様の設定で時刻を `午後4時〜5時` に

**トリガー4: 夜9時**
- 同様の設定で時刻を `午後9時〜10時` に

### ステップ 5.3: チャット同期トリガー（1日4回）

カレンダー同期と同じ時刻で、`executeChatSync` 関数のトリガーを4つ作成します。

### ステップ 5.4: トリガーの確認

トリガー一覧に合計8個のトリガーが表示されることを確認：
- `executeCalendarSync` x 4
- `executeChatSync` x 4

---

## 🌐 Part 6: Web App設定（オプション）

Geminiからのリアルタイム同期リクエストに対応する場合に設定します。

### ステップ 6.1: Web Appのデプロイ

1. GASエディタ右上の「デプロイ」→「新しいデプロイ」
2. 「種類の選択」で「ウェブアプリ」を選択
3. 設定：
   - 説明: `LINE WORKS統合API v1`
   - 次のユーザーとして実行: `自分`
   - アクセスできるユーザー: `全員` または `組織内のユーザー`
4. 「デプロイ」をクリック
5. デプロイURLをコピーして保存

### ステップ 6.2: Web Appのテスト

```javascript
// WebApp.gsで実行
testWebApp()

// URLを確認
getWebAppUrl()
```

### ステップ 6.3: 使用方法の確認

```javascript
// WebApp.gsで実行
showWebAppUsage()
```

---

## ✅ Part 7: 最終確認チェックリスト

### 設定確認

- [ ] LINE WORKS認証情報が正しく設定されている
- [ ] GoogleカレンダーIDが設定されている
- [ ] 管理者User IDが設定されている
- [ ] 秘密鍵が正しく貼り付けられている

### 動作確認

- [ ] `initialSetup()` が成功した
- [ ] 認証テストが成功した
- [ ] API接続テストが成功した
- [ ] テスト通知がLINE WORKSに届いた
- [ ] カレンダー同期のテストが成功した
- [ ] チャット同期のテストが成功した

### トリガー確認

- [ ] カレンダー同期トリガーが4つ設定されている
- [ ] チャット同期トリガーが4つ設定されている
- [ ] 各トリガーの時刻が正しい（5:00, 10:00, 16:00, 21:00）

### データ確認

- [ ] GoogleドライブにLINE WORKS統合ログフォルダが作成された
- [ ] マスターログスプレッドシートが作成された
- [ ] Googleカレンダーにイベントが同期された

---

## 🎉 完了！

セットアップが完了しました。設定した時刻に自動的に同期が開始されます。

### 次のステップ

1. **Geminiとの連携**
   - GoogleカレンダーをGeminiと共有
   - マスターログスプレッドシートをGeminiと共有
   - Geminiに「明日の予定は？」などと質問してテスト

2. **動作確認**
   - 最初の自動同期実行後、ログを確認
   - エラーがないか確認

3. **カスタマイズ**
   - `Config.gs`で同期期間や通知設定を調整
   - 必要に応じてキーワード抽出ルールをカスタマイズ

---

## 🆘 トラブルシューティング

### Q1. 「アクセストークンの取得に失敗しました」エラー

**原因**: 認証情報が正しくない

**解決方法**:
1. `Config.gs`の認証情報を再確認
2. 秘密鍵が正しく貼り付けられているか確認（改行も含む）
3. `debugJWT()` 関数を実行してJWTを確認
4. LINE WORKS Developer Consoleで権限を再確認

### Q2. 「カレンダーが見つかりません」エラー

**原因**: GoogleカレンダーIDが正しくない

**解決方法**:
1. Googleカレンダーの設定からIDをコピー
2. `@group.calendar.google.com` が含まれているか確認
3. カレンダーが削除されていないか確認

### Q3. チャンネルが取得できない

**原因**: BotがチャンネルLに参加していない

**解決方法**:
1. LINE WORKS管理画面でBotを確認
2. 各チャットルームにBotを追加
3. Bot APIの権限を確認

### Q4. 通知が届かない

**原因**: Bot設定または管理者IDが正しくない

**解決方法**:
1. `sendTestNotification()` を実行
2. Bot IDとBot Secretを再確認
3. 管理者User IDが正しいか確認
4. Botがアクティブになっているか確認

### Q5. 実行時間制限エラー

**原因**: データ量が多すぎる

**解決方法**:
1. `Config.gs`で同期期間を短縮
2. `MAX_CALENDARS_PER_EXECUTION`を調整
3. バッチ処理に分割（複数のトリガーで分散）

---

## 📞 サポート

問題が解決しない場合は、以下の情報を含めて管理者に連絡してください：

1. エラーメッセージの全文
2. 実行ログのスクリーンショット
3. 設定内容（秘密情報は除く）
4. 発生した操作の詳細

---

**作成日**: 2025年10月16日  
**バージョン**: 1.0.0  
**対応環境**: Google Apps Script







