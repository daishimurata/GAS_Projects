# LINE WORKS × Google Workspace 統合システム 技術仕様書

**バージョン**: 1.2.0  
**最終更新**: 2025年11月30日  
**目的**: Geminiによる情報活用のためのシステム仕様記述

---

## 📋 目次

1. [システム概要](#システム概要)
2. [アーキテクチャ](#アーキテクチャ)
3. [主要機能](#主要機能)
4. [データフロー](#データフロー)
5. [保存データ構造](#保存データ構造)
6. [API連携](#api連携)
7. [モジュール詳細](#モジュール詳細)
8. [実行スケジュール](#実行スケジュール)
9. [データアクセス方法](#データアクセス方法)

---

## システム概要

### 目的

LINE WORKSのカレンダーとチャット履歴をGoogle Workspace（Googleカレンダー・Googleドライブ）に同期し、Geminiで検索・分析可能にするシステムです。

### 技術スタック

- **実行環境**: Google Apps Script (GAS)
- **プログラミング言語**: JavaScript (GAS環境)
- **連携サービス**:
  - LINE WORKS API (Calendar API, Message API, Bot API, Audit API)
  - Google Calendar API
  - Google Drive API
  - Google Sheets API

### 主要な価値提供

1. **情報の一元化**: LINE WORKSの予定とチャットをGoogleに集約
2. **Gemini検索対応**: 構造化データとメタデータによる高精度検索
3. **自動同期**: 1日4回の自動同期で常に最新状態を維持
4. **履歴保管**: 長期的なログ保管とアーカイブ機能

---

## アーキテクチャ

### システム構成図

```
┌─────────────────────────────────────────────────────────┐
│                    LINE WORKS                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Calendar   │  │     Bot      │  │  Audit API   │ │
│  │     API      │  │     API      │  │              │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
                           ↓
                    JWT認証 + OAuth2
                           ↓
┌─────────────────────────────────────────────────────────┐
│              Google Apps Script (GAS)                   │
│  ┌──────────────────────────────────────────────────┐  │
│  │           LINE WORKS統合システム                 │  │
│  │                                                   │  │
│  │  ┌─────────────┐      ┌─────────────┐          │  │
│  │  │  Calendar   │      │    Chat     │          │  │
│  │  │    Sync     │      │    Sync     │          │  │
│  │  │   Engine    │      │   Engine    │          │  │
│  │  └─────────────┘      └─────────────┘          │  │
│  │         │                     │                  │  │
│  │         ↓                     ↓                  │  │
│  │  ┌──────────────────────────────────┐          │  │
│  │  │    Data Processing Layer         │          │  │
│  │  │  - Event Mapping                 │          │  │
│  │  │  - Message Parsing               │          │  │
│  │  │  - Keyword Extraction            │          │  │
│  │  │  - Categorization                │          │  │
│  │  └──────────────────────────────────┘          │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│              Google Workspace                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Google     │  │   Google     │  │   Google     │ │
│  │   Calendar   │  │    Drive     │  │    Sheets    │ │
│  │              │  │              │  │              │ │
│  │  統合予定    │  │  ログファイル │  │  構造化データ │ │
│  │  表示        │  │  保存        │  │  保存        │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
                           ↓
                   Geminiからアクセス可能
```

### レイヤー構成

1. **認証レイヤー** (`Auth.gs`)
   - JWT署名生成
   - アクセストークン取得・キャッシュ

2. **API連携レイヤー** (`LineWorksAPI.gs`)
   - LINE WORKS API呼び出し
   - エラーハンドリング
   - レート制限対応

3. **ビジネスロジックレイヤー**
   - カレンダー同期 (`CalendarSync.gs`, `EventManager.gs`)
   - チャット同期 (`ChatSync.gs`, `ChatLogger.gs`)
   - Gemini最適化 (`GeminiOptimizer.gs`)

4. **データ永続化レイヤー** (`Utils.gs`)
   - Googleドライブ操作
   - スプレッドシート操作
   - ログファイル管理

5. **制御レイヤー** (`Main.gs`, `Triggers.gs`)
   - トリガー管理
   - 実行制御
   - エラーハンドリング

---

## 主要機能

### 1. カレンダー同期機能

#### 処理概要

LINE WORKSの全メンバーのカレンダーから予定を取得し、1つのGoogleカレンダーに統合します。

#### 処理フロー

```
1. LINE WORKS Calendar API認証
   ↓
2. 全メンバーのカレンダーリスト取得
   ↓
3. 各カレンダーから過去7日〜未来60日の予定を取得
   ↓
4. イベントデータの変換・加工
   - タイトルにカレンダー所有者名を付与
   - 説明文の整形
   - メタデータの追加
   ↓
5. Googleカレンダーへの登録
   - 新規イベント: 作成
   - 既存イベント: 更新
   - 削除されたイベント: 削除
   ↓
6. イベントマッピング情報の保存
   （LINE WORKS ID ⇔ Google Calendar ID）
```

#### 同期範囲

- **過去**: 7日間
- **未来**: 60日間
- **頻度**: 1日4回（5:00、10:00、16:00、21:00）

#### データ変換例

**LINE WORKS イベント:**
```json
{
  "summary": "営業会議",
  "start": {
    "dateTime": "2025-11-30T14:00:00+09:00"
  },
  "end": {
    "dateTime": "2025-11-30T15:00:00+09:00"
  },
  "attendees": [...],
  "calendarId": "user123@example.com"
}
```

**Googleカレンダー イベント（変換後）:**
```json
{
  "summary": "[田中太郎] 営業会議",
  "description": "元の説明文\n\n---\n📅 LINE WORKSから同期\n👤 カレンダー所有者: 田中太郎 (user123@example.com)",
  "start": {
    "dateTime": "2025-11-30T14:00:00+09:00"
  },
  "end": {
    "dateTime": "2025-11-30T15:00:00+09:00"
  },
  "colorId": "1"
}
```

### 2. チャット同期機能

#### 処理概要

LINE WORKSの全チャットルームからメッセージを取得し、Googleドライブにスプレッドシート＋テキストログとして保存します。

#### 処理フロー

```
1. Bot認証
   ↓
2. Botが参加している全チャンネル取得
   ↓
3. 各チャンネルの新着メッセージ取得
   - 前回同期時刻以降のメッセージ
   - または初回実行時は過去30日分
   ↓
4. メッセージデータの加工
   - キーワード抽出
   - カテゴリ自動分類
   - ユーザー情報の補完
   ↓
5. データ保存
   a. マスタースプレッドシート（統合データ）
   b. 日次ログ（テキストファイル/月次フォルダ）
   c. ルーム別ログ（テキストファイル/月次フォルダ）
   d. 添付ファイルのダウンロード（月次フォルダ）
   ↓
6. Gemini最適化処理
   - 検索インデックス更新
   - 日次サマリー生成
```

#### メッセージデータ構造

**スプレッドシート「メッセージ一覧」シート:**

| 列 | 内容 | 例 |
|---|---|---|
| A | 日時 | 2025-11-30 14:30:00 |
| B | 送信者 | 田中太郎 |
| C | ルーム名 | 営業部チーム |
| D | メッセージ | 今日の訪問先は... |
| E | 添付ファイル | 2件 |
| F | メッセージID | msg_abc123 |
| G | チャンネルID | ch_xyz789 |
| H | キーワード | 訪問, 顧客, 報告 |
| I | カテゴリ | 報告 |
| J | URL | https://... |

### 3. Gemini最適化機能

#### キーワード抽出

```javascript
extractKeywords(text) {
  // 重要キーワードの抽出ロジック
  const keywords = [
    '会議', '休暇', '報告', '決定', '承認',
    '問題', '完了', '予定', '変更', '確認'
  ];
  // テキストからマッチするキーワードを抽出
  return matchedKeywords;
}
```

#### カテゴリ自動分類

メッセージを以下のカテゴリに自動分類：

- **会議**: 会議、ミーティング、打ち合わせ
- **休暇連絡**: 休み、休暇、有給、欠勤
- **報告**: 報告、完了、結果、状況
- **質問**: 質問、教えて、どうすれば
- **決定事項**: 決定、決まり、承認、確定
- **問題**: 問題、エラー、トラブル、困っ
- **依頼**: お願い、依頼、してほしい
- **その他**: 上記以外

#### 日次サマリー生成

毎日のチャット内容を自動要約：

```
【2025-11-30 日次サマリー】

■ 主要トピック
- 営業部：新規顧客訪問の報告
- 開発部：システムリリースの準備
- 総務部：年末年始の休暇調整

■ 重要決定事項
- プロジェクトAの納期を12月15日に変更
- 新サーバーの発注を承認

■ 参加者別投稿数
- 田中太郎: 15件
- 山田花子: 12件
...
```

---

## データフロー

### カレンダー同期のデータフロー

```
┌─────────────────────┐
│ LINE WORKS Calendar │
│  (各メンバー)        │
└──────────┬──────────┘
           │ API取得
           ↓
    ┌──────────────┐
    │  イベント    │
    │  データ取得  │
    └──────┬───────┘
           │
           ↓
    ┌──────────────────────┐
    │ データ変換・加工      │
    │ - 所有者名付与        │
    │ - 説明文追加          │
    │ - 重複チェック        │
    └──────┬───────────────┘
           │
           ↓
    ┌──────────────────────┐
    │ イベントマッピング    │
    │ (LINE ID ⇔ Google ID)│
    └──────┬───────────────┘
           │
           ↓
┌──────────────────────────┐
│  Googleカレンダー         │
│  (統合カレンダー)         │
└──────────────────────────┘
           │
           ↓ Geminiからアクセス
    ┌──────────────┐
    │   Gemini     │
    │ 「明日の予定は？」│
    └──────────────┘
```

### チャット同期のデータフロー

```
┌─────────────────────┐
│ LINE WORKS Bot API  │
│  (全チャンネル)      │
└──────────┬──────────┘
           │ API取得
           ↓
    ┌──────────────┐
    │ メッセージ   │
    │ データ取得   │
    └──────┬───────┘
           │
           ↓
    ┌─────────────────────────┐
    │ データ処理               │
    │ - キーワード抽出         │
    │ - カテゴリ分類           │
    │ - ユーザー情報補完       │
    └──────┬──────────────────┘
           │
           ├─────────────────────────┐
           ↓                         ↓
  ┌────────────────┐     ┌────────────────────┐
  │ スプレッドシート │     │ テキストログ        │
  │ (構造化データ)   │     │ (月次フォルダ)      │
  │                  │     │                    │
  │ - メッセージ一覧 │     │ - 日次ログ/YYYY-MM │
  │ - ルーム一覧     │     │ - ルーム別/YYYY-MM │
  │ - 日次サマリー   │     │ - 添付ファイル     │
  │ - 検索インデックス│     └────────────────────┘
  └────────────────┘
           │
           ↓ Geminiからアクセス
    ┌──────────────────┐
    │      Gemini      │
    │「昨日の営業会議の │
    │ 内容をまとめて」  │
    └──────────────────┘
```

---

## 保存データ構造

### Googleドライブのフォルダ構造

```
📁 LINE WORKS統合ログ/
│
├── 📁 カレンダーデータ/
│   └── (Googleカレンダーと連携、実体はカレンダーAPI側)
│
├── 📁 システムログ/
│   ├── 📁 2025-01/
│   │   └── 📄 同期ログ.txt
│   ├── 📁 2025-02/
│   │   └── 📄 同期ログ.txt
│   └── 📁 2025-11/
│       └── 📄 同期ログ.txt
│
└── 📁 チャットログ/
    │
    ├── 📊 マスターログ.xlsx
    │   ├── シート: メッセージ一覧
    │   ├── シート: ルーム一覧
    │   ├── シート: 日次サマリー
    │   ├── シート: 検索インデックス
    │   └── シート: README
    │
    ├── 📁 日次ログ/
    │   ├── 📁 2025-01/
    │   │   ├── 📄 2025-01-15_全体ログ.txt
    │   │   ├── 📄 2025-01-16_全体ログ.txt
    │   │   └── ...
    │   ├── 📁 2025-02/
    │   └── 📁 2025-11/
    │
    ├── 📁 ルーム別ログ/
    │   ├── 📁 2025-01/
    │   │   ├── 📄 営業部チーム_履歴.txt
    │   │   ├── 📄 開発チーム_履歴.txt
    │   │   └── ...
    │   ├── 📁 2025-02/
    │   └── 📁 2025-11/
    │
    ├── 📁 添付ファイル/
    │   ├── 📁 2025-01/
    │   │   ├── 🖼️ msg123_報告書.pdf
    │   │   ├── 🖼️ msg124_画像.jpg
    │   │   └── ...
    │   ├── 📁 2025-02/
    │   └── 📁 2025-11/
    │
    └── 📁 バックアップ/
        └── (定期バックアップファイル)
```

### マスタースプレッドシートの詳細構造

#### シート1: メッセージ一覧

全チャットルームのメッセージを時系列で統合したシート（最新が上）

| 列 | フィールド名 | データ型 | 説明 | 例 |
|---|---|---|---|---|
| A | 日時 | DateTime | メッセージ送信日時 | 2025-11-30 14:30:00 |
| B | 送信者 | String | 送信者の表示名 | 田中太郎 |
| C | ルーム名 | String | チャットルーム名 | 営業部チーム |
| D | メッセージ | String | メッセージ本文 | 今日の訪問先は... |
| E | 添付ファイル | String | 添付ファイル数 | 2件 |
| F | メッセージID | String | LINE WORKS メッセージID | msg_abc123 |
| G | チャンネルID | String | LINE WORKS チャンネルID | ch_xyz789 |
| H | キーワード | String | 抽出されたキーワード | 訪問, 顧客, 報告 |
| I | カテゴリ | String | 自動分類されたカテゴリ | 報告 |
| J | URL | String | メッセージURL（あれば） | https://... |

**データ量**: 通常数千〜数万行

#### シート2: ルーム一覧

チャンネル情報と同期状況を管理

| 列 | フィールド名 | 説明 |
|---|---|---|
| A | ルーム名 | チャットルーム名 |
| B | チャンネルID | LINE WORKS チャンネルID |
| C | 最終同期日時 | 最後に同期した日時 |
| D | メッセージ数 | このルームの総メッセージ数 |
| E | メモ | 手動入力可能なメモ欄 |

#### シート3: 日次サマリー

各ルームの日次要約（Gemini検索用）

| 列 | フィールド名 | 説明 |
|---|---|---|
| A | 日付 | 対象日 |
| B | ルーム名 | チャットルーム名 |
| C | 投稿数 | その日の投稿数 |
| D | 主要トピック | 主な話題 |
| E | 重要決定事項 | 決定された事項 |
| F | 要約 | その日の要約 |
| G | 参加者 | 投稿したメンバー |

#### シート4: 検索インデックス

キーワードベースの検索インデックス

| 列 | フィールド名 | 説明 |
|---|---|---|
| A | キーワード | 抽出されたキーワード |
| B | 出現回数 | 出現頻度 |
| C | 関連メッセージID | 関連するメッセージID（カンマ区切り） |
| D | 関連日付 | 出現日付 |
| E | コンテキスト | キーワード前後の文脈 |
| F | 最終更新 | インデックス最終更新日時 |

---

## API連携

### LINE WORKS API

#### 1. Calendar API

**エンドポイント**: `https://www.worksapis.com/v1.0/calendars`

**主な機能**:
- カレンダーリスト取得
- イベント一覧取得
- イベント詳細取得

**リクエスト例**:
```javascript
GET /v1.0/users/{userId}/calendars
Headers:
  Authorization: Bearer {access_token}
  consumerKey: {client_id}
```

**レスポンス**:
```json
{
  "calendars": [
    {
      "calendarId": "user123@example.com",
      "summary": "田中太郎のカレンダー",
      "primary": true
    }
  ]
}
```

#### 2. Bot API (Message API)

**エンドポイント**: `https://www.worksapis.com/v1.0/bots/{botId}/channels`

**主な機能**:
- チャンネル一覧取得
- メッセージ取得
- メッセージ送信（通知用）

**リクエスト例**:
```javascript
GET /v1.0/bots/{botId}/channels/{channelId}/messages
Headers:
  Authorization: Bearer {access_token}
  consumerKey: {client_id}
```

#### 3. Audit API

**エンドポイント**: `https://www.worksapis.com/v1.0/domains/{domainId}/logs/message`

**主な機能**:
- 特定ユーザーとのメッセージ履歴取得（Botが参加していないルームも取得可能）

### 認証方式

#### JWT (JSON Web Token) 認証

```javascript
// 1. JWTペイロード作成
const payload = {
  iss: CLIENT_ID,
  sub: SERVICE_ACCOUNT,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600
};

// 2. 秘密鍵で署名
const jwt = signJWT(payload, PRIVATE_KEY);

// 3. アクセストークン取得
POST https://auth.worksmobile.com/oauth2/v2.0/token
Body:
  assertion={jwt}
  grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
  client_id={CLIENT_ID}
  client_secret={CLIENT_SECRET}
  scope=calendar,bot,user

// 4. レスポンス
{
  "access_token": "xxx",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

#### トークンキャッシュ

```javascript
// CacheServiceで1時間キャッシュ
const cache = CacheService.getScriptCache();
cache.put('lineworks_token', accessToken, 3600);
```

### Google Calendar API

**主な操作**:
- `CalendarApp.getCalendarById()` - カレンダー取得
- `calendar.createEvent()` - イベント作成
- `event.deleteEvent()` - イベント削除
- `event.setTitle()` - タイトル設定

### Google Drive API

**主な操作**:
- `DriveApp.createFolder()` - フォルダ作成
- `folder.createFile()` - ファイル作成
- `file.setContent()` - ファイル更新
- `file.moveTo()` - ファイル移動

### Google Sheets API

**主な操作**:
- `SpreadsheetApp.create()` - スプレッドシート作成
- `sheet.getRange().setValues()` - データ書き込み
- `sheet.insertRowsAfter()` - 行挿入

---

## モジュール詳細

### Config.gs - 設定管理

**役割**: システム全体の設定を一元管理

**主要設定項目**:

```javascript
const CONFIG = {
  // LINE WORKS認証情報
  LINEWORKS: {
    CLIENT_ID: '...',
    CLIENT_SECRET: '...',
    SERVICE_ACCOUNT: '...',
    API_ID: '...',
    PRIVATE_KEY: '...',
    BOT_ID: '...',
    BOT_SECRET: '...'
  },
  
  // Googleカレンダー設定
  GOOGLE_CALENDAR: {
    MASTER_CALENDAR_ID: 'd.murata@izaya.llc'
  },
  
  // Googleドライブ設定
  GOOGLE_DRIVE: {
    ROOT_FOLDER_NAME: 'LINE WORKS統合ログ',
    CHAT_LOG_FOLDER: 'チャットログ',
    SYSTEM_LOG_FOLDER: 'システムログ',
    MONTHLY_ORGANIZATION: true  // 月次フォルダ整理
  },
  
  // 同期設定
  SYNC: {
    CALENDAR_PAST_DAYS: 7,
    CALENDAR_FUTURE_DAYS: 60,
    CHAT_HISTORY_DAYS: 30
  },
  
  // 通知設定
  NOTIFICATION: {
    ADMIN_USER_ID: 'pr.12187@ohisamafarm',
    NOTIFY_ON_ERROR: true
  }
};
```

### Auth.gs - 認証処理

**主要関数**:

1. `getAccessToken()` - アクセストークン取得（キャッシュ対応）
2. `generateJWT()` - JWT生成
3. `signJWT()` - JWT署名
4. `getBotAccessToken()` - Bot用トークン取得

### CalendarSync.gs - カレンダー同期

**主要関数**:

1. `syncCalendars()` - メイン同期処理
2. `getLineWorksCalendarList()` - カレンダーリスト取得
3. `getLineWorksEvents()` - イベント取得
4. `processCalendarEvents()` - イベント処理

**処理フロー**:
```javascript
function syncCalendars() {
  // 1. 認証
  const token = getAccessToken();
  
  // 2. カレンダーリスト取得
  const calendars = getLineWorksCalendarList();
  
  // 3. 各カレンダーを処理
  calendars.forEach(calendar => {
    const events = getLineWorksEvents(calendar, dateRange);
    processCalendarEvents(calendar, events);
  });
  
  // 4. 統計情報返却
  return stats;
}
```

### EventManager.gs - イベント管理

**主要関数**:

1. `createOrUpdateGoogleEvent()` - イベント作成/更新
2. `findExistingGoogleEvent()` - 既存イベント検索
3. `saveEventMapping()` - マッピング保存
4. `getEventMapping()` - マッピング取得
5. `cleanupEventMappings()` - 古いマッピング削除

**イベントマッピング**:
```javascript
// PropertiesServiceに保存
{
  "lineworks_event_12345": "google_event_xyz789",
  "lineworks_event_67890": "google_event_abc123"
}
```

### ChatSync.gs - チャット同期

**主要関数**:

1. `syncChatLogs()` - メイン同期処理
2. `getLineWorksBotChannels()` - チャンネル一覧取得
3. `getChannelMessages()` - メッセージ取得
4. `processChannelMessages()` - メッセージ処理

**処理フロー**:
```javascript
function syncChatLogs() {
  // 1. Bot認証
  const token = getBotAccessToken();
  
  // 2. チャンネル一覧取得
  const channels = getLineWorksBotChannels();
  
  // 3. 各チャンネルを処理
  channels.forEach(channel => {
    const lastSync = getChannelLastSyncTime(channel.channelId);
    const messages = getChannelMessages(channel, lastSync);
    
    // 4. メッセージ保存
    saveMessagesToSpreadsheet(spreadsheet, channel, messages);
    saveMessagesToTextLog(channel, messages);
    downloadChannelAttachments(channel, messages);
    
    // 5. 同期時刻更新
    setChannelLastSyncTime(channel.channelId, new Date());
  });
  
  return stats;
}
```

### ChatLogger.gs - ログ保存

**主要関数**:

1. `getMasterSpreadsheet()` - マスタースプレッドシート取得/作成
2. `saveMessagesToSpreadsheet()` - スプレッドシート保存
3. `saveRoomLog()` - ルーム別ログ保存（月次フォルダ対応）
4. `saveDailyLog()` - 日次ログ保存（月次フォルダ対応）
5. `downloadChannelAttachments()` - 添付ファイルダウンロード

### GeminiOptimizer.gs - Gemini最適化

**主要関数**:

1. `extractKeywords(text)` - キーワード抽出
2. `categorizeMessage(text)` - カテゴリ分類
3. `generateDailySummary(date)` - 日次サマリー生成
4. `updateSearchIndex(keywords)` - 検索インデックス更新

**キーワード抽出ロジック**:
```javascript
function extractKeywords(text) {
  const importantKeywords = [
    '会議', 'ミーティング', '打ち合わせ',
    '休暇', '休み', '有給', '欠勤',
    '報告', '完了', '結果',
    '決定', '承認', '確定',
    '問題', 'エラー', 'トラブル',
    '依頼', 'お願い',
    '確認', '質問'
  ];
  
  return text.match(importantKeywords);
}
```

### Utils.gs - ユーティリティ

**主要関数**:

1. `logInfo()` / `logError()` - ログ出力
2. `appendToSyncLog()` - ログファイル書き込み（月次フォルダ対応）
3. `getOrCreateFolder()` - フォルダ取得/作成
4. `formatDate()` / `formatDateTime()` - 日付フォーマット
5. `getMonthFolderName()` - 月フォルダ名取得（YYYY-MM）

### Main.gs - メイン制御

**主要関数**:

1. `executeCalendarSync()` - カレンダー同期実行（トリガー用）
2. `executeChatSync()` - チャット同期実行（トリガー用）
3. `executeFullSync()` - 統合同期実行
4. `initialSetup()` - 初期セットアップ
5. `checkSystemHealth()` - システム状態確認

### MigrateToMonthly.gs - 月次移行

**主要関数**:

1. `migrateAllLogsToMonthly()` - 全ログを月次フォルダに移行
2. `migrateSystemLogsToMonthly()` - システムログ移行
3. `migrateChatLogsToMonthly()` - チャットログ移行
4. `archiveOldMonthlyLogs(months)` - 古いログをアーカイブ

---

## 実行スケジュール

### トリガー設定

**1. カレンダー同期**
```
関数: executeCalendarSync
イベントソース: 時間主導型
時刻ベース: 日タイマー
実行時刻: 5:00, 10:00, 16:00, 21:00 (1日4回)
```

**2. チャット同期**
```
関数: executeChatSync
イベントソース: 時間主導型
時刻ベース: 日タイマー
実行時刻: 5:00, 10:00, 16:00, 21:00 (1日4回)
```

**3. 月次メンテナンス（オプション）**
```
関数: archiveOldMonthlyLogs
イベントソース: 時間主導型
時刻ベース: 月タイマー
実行日: 毎月1日
引数: 12 (12ヶ月より古いログをアーカイブ)
```

### 実行時間制約

- **GAS実行時間制限**: 最大6分/実行
- **API制限対策**: 
  - レート制限を考慮した遅延処理
  - バッチ処理による分割実行
  - トークンキャッシュによる認証回数削減

---

## データアクセス方法

### Geminiからのデータアクセス

#### 1. Googleカレンダーへのアクセス

**方法**: Googleカレンダーを直接参照

**質問例**:
- 「明日の予定は？」
- 「今週の田中さんの予定を教えて」
- 「12月15日に会議は入っていますか？」

**Geminiが見るデータ**:
- イベントタイトル（所有者名付き）
- 開始/終了時刻
- 説明文（メタデータ含む）
- 参加者情報

#### 2. スプレッドシートへのアクセス

**方法**: マスターログスプレッドシートを共有設定

**質問例**:
- 「昨日の営業部のチャットをまとめて」
- 「田中さんが今週報告した内容は？」
- 「プロジェクトAに関する決定事項を教えて」
- 「先月の会議の内容をまとめて」

**Geminiが見るデータ**:
- 全メッセージ（日時、送信者、内容）
- キーワードとカテゴリ
- 日次サマリー
- 検索インデックス

#### 3. テキストログへのアクセス

**方法**: Googleドライブのフォルダを共有設定

**質問例**:
- 「2025年1月の営業部のログを確認して」
- 「先週の全体ログから重要な決定事項を抽出して」

**Geminiが見るデータ**:
- 日次ログ（全ルーム統合）
- ルーム別ログ（詳細な会話履歴）

### データ共有設定

#### 必要な共有設定

1. **Googleカレンダー**
   - カレンダーID: `d.murata@izaya.llc`
   - 共有設定: Geminiアカウントに「予定の表示」権限を付与

2. **マスタースプレッドシート**
   - 場所: `/LINE WORKS統合ログ/チャットログ/マスターログ.xlsx`
   - 共有設定: Geminiアカウントに「閲覧者」権限を付与

3. **ログフォルダ**
   - 場所: `/LINE WORKS統合ログ/`
   - 共有設定: フォルダ全体をGeminiアカウントに共有

### データ更新頻度

- **カレンダー**: 1日4回更新（最大6時間の遅延）
- **チャットログ**: 1日4回更新（最大6時間の遅延）
- **システムログ**: リアルタイム（処理実行時に即座に記録）

---

## エラーハンドリングと通知

### エラーハンドリング

**3層のエラーハンドリング**:

1. **関数レベル**
   ```javascript
   try {
     // 処理
   } catch (error) {
     logError('処理エラー', error);
     throw error;
   }
   ```

2. **モジュールレベル**
   ```javascript
   function syncCalendars() {
     try {
       // 同期処理
     } catch (error) {
       logError('カレンダー同期エラー', error);
       sendErrorNotification('カレンダー同期失敗', error);
       return { success: false, error: error.message };
     }
   }
   ```

3. **トリガーレベル**
   ```javascript
   function executeCalendarSync() {
     try {
       syncCalendars();
     } catch (error) {
       logError('トリガー実行エラー', error);
       sendErrorNotification('実行失敗', error);
     }
   }
   ```

### 通知システム

**LINE WORKS通知**:

管理者のLINE WORKSに自動通知を送信

**通知種類**:
1. **エラー通知**: API失敗、認証エラーなど
2. **警告通知**: システム状態異常、容量不足など
3. **情報通知**: セットアップ完了、移行完了など（オプション）

**通知例**:
```
🚨 エラー通知

カテゴリ: カレンダー同期失敗
エラー内容: API authentication failed
発生時刻: 2025-11-30 14:30:00
関数: executeCalendarSync

ログを確認してください。
```

---

## パフォーマンス最適化

### 1. トークンキャッシュ

```javascript
// 1時間キャッシュで認証回数を削減
const cache = CacheService.getScriptCache();
let token = cache.get('lineworks_token');

if (!token) {
  token = generateNewToken();
  cache.put('lineworks_token', token, 3600);
}
```

### 2. バッチ処理

```javascript
// 大量データは分割して処理
const chunks = chunkArray(events, 100);
chunks.forEach(chunk => {
  processEvents(chunk);
  Utilities.sleep(1000);  // レート制限対策
});
```

### 3. 増分同期

```javascript
// 前回同期時刻以降のデータのみ取得
const lastSync = getChannelLastSyncTime(channelId);
const messages = getChannelMessages(channel, {
  since: lastSync,
  until: new Date()
});
```

### 4. 並列処理の制限

```javascript
// GASの実行時間制限（6分）を考慮
const MAX_CALENDARS = 50;
const calendars = allCalendars.slice(0, MAX_CALENDARS);
```

---

## セキュリティとプライバシー

### 認証情報の保護

- **秘密鍵**: Config.gsに保存（外部公開厳禁）
- **トークン**: CacheServiceで一時保存（永続化しない）
- **アクセス制限**: 社内使用のみ、外部公開なし

### データ保護

- **Googleドライブ**: 適切な共有設定で保護
- **スプレッドシート**: 閲覧権限のみ付与
- **ログファイル**: 月次アーカイブで古いデータを分離

### コンプライアンス

- **データ保持期間**: 設定可能（デフォルト12ヶ月）
- **削除機能**: 古いログの自動アーカイブ/削除
- **監査ログ**: システムログで全処理を記録

---

## 4. 在庫管理システム（新機能）

### 処理概要

直売所から届く売上速報メールを自動監視し、在庫を自動更新・LINE通知を行うシステム。

### 処理フロー

```
1. Gmail監視（1分〜5分間隔）
   ↓
2. 売上速報メール検出
   - 検索条件: is:unread + label:直売所 + subject:売上
   ↓
3. メール本文を解析
   - 店舗名の判定
   - 商品名の抽出
   - 販売数の抽出
   ↓
4. 在庫データ更新
   - スプレッドシート「在庫管理」を更新
   - 現在庫から販売数を減算
   ↓
5. 履歴記録
   - スプレッドシート「売上履歴」に追記
   - テキストログ保存（月次フォルダ）
   ↓
6. 通知送信
   - LINE WORKSに売上速報を通知
   - 在庫不足時は警告通知
   ↓
7. メールを既読にする（重複処理防止）
```

### データ構造

#### スプレッドシート「直売所管理システム」

**シート1: 在庫管理（マスタ）**

| 列 | フィールド名 | データ型 | 説明 |
|---|---|---|---|
| A | 商品名 | String | 商品名（例: じゃがいも） |
| B | 現在庫 | Number | 現在の在庫数 |
| C | 発注点 | Number | 警告ライン（この値以下で警告） |
| D | 最終更新日時 | DateTime | 最後に在庫が更新された日時 |

**シート2: 売上履歴（ログ・Gemini分析用）**

| 列 | フィールド名 | データ型 | 説明 |
|---|---|---|---|
| A | 日時 | DateTime | 販売日時 |
| B | 店舗 | String | 店舗名（例: みどりの大地） |
| C | 商品 | String | 商品名 |
| D | 販売数 | Number | 売れた数量 |
| E | 残在庫 | Number | 販売後の在庫数 |
| F | 備考 | String | 警告等（⚠️要発注） |

### 店舗判定ロジック

メール本文・件名・送信者から店舗を自動判定：

```javascript
const storeKeywords = {
  'みどりの大地': ['みどりの大地', '鈴鹿'],
  '四季菜 尾平': ['尾平', '四季菜'],
  'Aコープ': ['Aコープ', 'エーコープ', 'JAストア']
};
```

### 販売数抽出ロジック

複数のパターンで数量を抽出：

1. **パターン1**: `商品名 ... 数字＋単位`
   - 例: "じゃがいも ... 3点"
   
2. **パターン2**: `商品名 数字`
   - 例: "じゃがいも 3"
   
3. **パターン3**: `商品名 | 数字`（表形式）
   - 例: "じゃがいも | 3"

### 通知フォーマット

```
📦 売上速報・在庫更新

【みどりの大地】
時刻: 14:05

• じゃがいも: 3個売却
  在庫 50 → 47

処理: 1件のメール
更新: 1商品
```

### 在庫不足警告

発注点を下回った場合の通知：

```
⚠️ 在庫不足警告

以下の商品が発注点を下回りました：

• じゃがいも
  現在庫: 8個
  発注点: 10個

発注をご検討ください。
```

### Gemini分析への対応

**売上履歴シート**に蓄積されたデータをGeminiで分析可能：

- 「今月のじゃがいもの販売数は？」
- 「みどりの大地の売れ筋トップ3は？」
- 「今週は何曜日が一番売れている？」
- 「来週の発注量を予測して」

---

## 拡張性

### 今後の拡張可能性

1. **双方向同期**
   - GoogleカレンダーからLINE WORKSへの同期
   - チャットメッセージの送信

2. **リアルタイム同期**
   - Webhook対応
   - イベント駆動の即時同期

3. **高度な分析**
   - 感情分析
   - トレンド分析
   - ダッシュボード生成

4. **他サービス連携**
   - Slack連携
   - Teams連携
   - Notion連携

5. **在庫管理の高度化** ✨NEW
   - 発注量の自動計算
   - 曜日・天気・イベントとの相関分析
   - 需要予測（Gemini連携）
   - 複数店舗の一元管理
   - 賞味期限管理

---

## まとめ

このシステムは、LINE WORKSのカレンダーとチャット履歴をGoogle Workspaceに自動同期し、Geminiで検索・分析可能にする統合システムです。

**主要な特徴**:
1. **自動化**: 1日4回の自動同期で常に最新状態を維持
2. **構造化**: スプレッドシートとテキストログの二重保存
3. **最適化**: Gemini検索用のキーワード・カテゴリ・サマリー生成
4. **整理**: 月次フォルダによる自動整理
5. **拡張性**: モジュール化された設計で機能追加が容易

**Geminiの活用方法**:
- Googleカレンダーで予定確認・検索
- スプレッドシートでチャット履歴の検索・分析
- テキストログで詳細な会話内容の確認

このシステムにより、LINE WORKSの情報をGeminiで自然言語検索・分析できるようになり、業務効率が大幅に向上します。

---

**作成日**: 2025年11月30日  
**バージョン**: 1.1.0  
**対象**: Gemini AI / 開発者 / システム管理者

