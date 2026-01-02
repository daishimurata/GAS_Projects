# 新プロジェクト移行・実装計画書 (Artifact)

## 1. プロジェクト概要

**プロジェクト名**: Enterprise Productivity Suite (仮: `4_Enterprise_Suite`)
**目的**: 既存の3つのプロジェクト（LineLog, Stock, Analyzer）を統合し、データベース（BigQuery）中心のアーキテクチャへ刷新する。
**参照仕様書**: `移行指示書/02_Project_Specs.md`
**修正事項**: Slack連携は廃止し、全てLINE WORKS通知に統一する。

---

## 2. モジュール構成と移行マッピング

### Module 1: Intelligent Calendar (旧: CalendarSync)
- **機能**: LINE WORKSカレンダーとGoogleカレンダーの同期。
- **変更点**:
    - クラス設計の刷新（`CalendarService`, `SyncEngine`）。
    - 競合通知等の通知先は**LINE WORKS**を使用。
    - `02_Project_Specs.md`の「Meeting Prep Doc」機能の実装枠を用意。

### Module 2: Nippo & Communication (旧: LineLog_Collector, LineLog_Analyzer)
- **機能**: 全チャットログの収集、日報分析。
- **変更点**:
    - 全てのレポート・アラート通知は**LINE WORKS**へ行う。
    - **DB移行**: 
        - チャットログのメタデータ、解析結果（要約、センチメントスコア等）を**BigQuery**に保存する設計とする。
        - ※テキストログ（非構造化データ）のバックアップとしてGoogleドライブも併用可能。

### Module 3: Sales Dashboard (旧: Stock_Manager)
- **機能**: メール解析による売上・在庫管理。
- **変更点**:
    - **通知**: 売上速報や在庫アラートは**LINE WORKS**へ通知（Slack廃止）。
    - **DB移行 (BigQuery)**: 
        - 「スプレッドシートではなくデータベース」の方針に従い、売上トランザクションデータの実体は**BigQuery**へ保存する。
        - 既存のスプレッドシートはViewer（表示用）として残すか、完全にBigQuery + データポータル(Looker Studio)等の構成に移行するかは実装時に調整。まずはデータのBigQueryへの書き込みを実装する。

---

## 3. ディレクトリ構造 (Src Layout)

```
src/
├── config/             # 環境設定 (LINE WORKS Keys, GCP Project ID, etc.)
├── core/               # 共通基盤
│   ├── Auth.ts         # LINE WORKS JWT認証
│   ├── BigQuery.ts     # BigQuery操作ラッパー
│   └── Logger.ts       # 共通ロギング
├── modules/
│   ├── calendar/       # Module 1
│   ├── communication/  # Module 2
│   └── sales/          # Module 3
│       ├── EmailIngestion.ts
│       └── SalesRepository.ts (BigQuery)
└── index.ts            # エントリーポイント
```

## 4. 実装プロセス (Workflow)

1. **基盤構築**:
    - 新規ディレクトリ `4_Enterprise_Suite` 作成。
    - `clasp` 設定。
    - 共通ライブラリ（Auth, Logging, **BigQueryWrapper**）の実装。
2. **Module 3 (Sales) の移行 & DB化**:
    - [x] 最優先で実装。 (Implementation Drafted)
    - [x] メール解析ロジックの移植。 (EmailIngestion.js)
    - [x] **BigQuery連携**: `SalesRepository` クラスにてBigQueryへのINSERT処理を実装。 (SalesRepository.js)
3. **Module 1 & 2 の移行**:
    - [x] 各同期ロジックの移植。 (ChatLogger.js, SyncEngine.js)
    - [x] 通知のLINE WORKS統一。 (index.js notifyLineWorks)

## 5. 前提条件と準備

- **BigQuery API有効化**: GASの「サービス」およびGCPコンソールでのAPI有効化が必要です。

## 6. 検証ステータス
- [x] **BigQuery Connection**: 疎通確認完了 (Chat Simulation OK).
- [x] **Module 2 (Chat)**: ログ保存ロジックの動作確認 (Simulated).
- [x] **Migration (Chat)**: 過去ログのBigQuery移行完了 (`migrateChatLogs`).
- [x] **Module 3 (Sales)**: 売上メール解析・保存の動作確認 (`debug_verifySalesIngestion`).
- [x] **Migration (Master)**: 商品マスタおよび店舗マスタのBigQuery移行完了 (`migrateMasterData`).
- [x] **Module 1 (Calendar)**: 同期ロジック・BigQuery保存の動作確認 (`debug_syncCalendarTest`).
- [ ] **Release**: 定期実行トリガーのセットアップ (`initProjectSync`).

---
**Agent用メモ**:
ユーザー承認後、上記プランに従って `4_Enterprise_Suite` フォルダを作成し、コーディングを開始します。
