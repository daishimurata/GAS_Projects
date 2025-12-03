# 📖 GAS Webhook セットアップガイド

## 🎯 目的

LINE WORKSのBotを使って、トークルームのメッセージをリアルタイムでGoogle Sheetsに保存します。

---

## ⚙️ セットアップ手順

### ステップ1: Webhook URLを取得

Apps Scriptエディタで以下を実行：

```javascript
showWebhookSetupGuide()
```

または：

```javascript
ScriptApp.getService().getUrl()
```

実行ログに表示されたURLをコピーしてください。

例：
```
https://script.google.com/macros/s/XXXXXXXXXXXXXXXXXXXX/exec
```

---

### ステップ2: Web Appとしてデプロイ（初回のみ）

**重要**: Webhookを有効にするには、プロジェクトを「Web App」としてデプロイする必要があります。

1. Apps Scriptエディタで「デプロイ」→「新しいデプロイ」
2. タイプ選択：「ウェブアプリ」
3. 設定：
   - **説明**: LINE WORKS Webhook（任意）
   - **次のユーザーとして実行**: 自分
   - **アクセスできるユーザー**: **全員**（重要！）
4. 「デプロイ」をクリック
5. 表示されたURLをコピー

---

### ステップ3: LINE WORKS Developer Console設定

1. **LINE WORKS Developer Consoleにアクセス**
   ```
   https://developers.worksmobile.com/
   ```

2. **Bot「日向」(ID: 10746138)を選択**

3. **Callback URLを設定**
   - 「Callback URL」項目に、ステップ1で取得したURLを貼り付け
   ```
   https://script.google.com/macros/s/XXXXXXXXXXXXXXXXXXXX/exec
   ```

4. **保存**
   - 保存すると自動的に検証が実行されます
   - GASが「チャレンジレスポンス」を返すので検証成功します

5. **検証成功の確認**
   - ✅ マークまたは「検証成功」と表示されればOK

---

### ステップ4: Botをトークルームに追加

1. **LINE WORKSアプリを開く**

2. **「日报」トークルームを開く**
   - チャンネルID: `2ddfe141-b9d5-6c2a-8027-43e009a916bc`

3. **メニュー → メンバー追加**

4. **Bot「日向」を検索して追加**

---

### ステップ5: 動作確認

#### テスト1: Apps Scriptでテスト

```javascript
testWebhook()
```

実行して、スプレッドシートに「テストメッセージ」が追加されることを確認。

#### テスト2: 実際のメッセージで確認

1. LINE WORKSの「日报」トークルームでメッセージを送信：
   ```
   テスト: Webhook動作確認
   ```

2. **Google Sheetsを確認**
   - 場所: `マイドライブ/LINE WORKS統合ログ/チャットログ/マスターログ`
   - シート: 「メッセージ一覧」
   - 最新行にメッセージが追加されているはず

3. **Apps Scriptの実行ログを確認**
   ```
   ✅ メッセージを保存: XXX - テスト: Webhook動作確認
   ```

---

## 🎉 完了！

これで以下が実現します：

✅ **リアルタイム保存**
- 「日报」トークルームのメッセージが自動的にGoogle Sheetsに保存

✅ **全メッセージタイプに対応**
- テキスト、画像、ファイル、スタンプ、位置情報

✅ **Vercel不要**
- GAS単体で動作（Vercelはバックアップとして継続可能）

---

## 🔍 トラブルシューティング

### エラー: Callback URL検証失敗

**原因**: Web Appとしてデプロイされていない、またはアクセス権限が「全員」になっていない

**解決策**:
1. Apps Scriptで「デプロイ」→「デプロイを管理」
2. アクセス権限を「全員」に変更
3. 「デプロイを更新」

---

### エラー: メッセージが保存されない

**原因1**: Botがトークルームに追加されていない

**解決策**: 
- 「日报」トークルームのメンバー一覧で「日向」が表示されるか確認

**原因2**: Callback URLが間違っている

**解決策**:
```javascript
ScriptApp.getService().getUrl()
```
を実行して、正しいURLを再確認

---

### エラー: 署名検証失敗

**原因**: BOT_SECRETが間違っている

**解決策**:
1. `Config.gs` の `BOT_SECRET` を確認
2. Developer Consoleで正しい値を確認
3. 一致しない場合は更新

---

## 📊 運用確認

### 統計確認

```javascript
getVercelIntegrationStats()
```

### 手動同期（バックアップ用）

```javascript
syncChatLogs()
```

---

## 💡 次のステップ

### オプション: Vercel統合（デュアルシステム）

Vercelシステムも継続して、二重バックアップ体制にする場合：

1. `VERCEL_INTEGRATION_CODE.md` を参照
2. VercelからGASへの転送も設定
3. Redis + Google Sheets 両方に保存

これにより、万が一どちらかが障害でもデータ損失なし！

---

## 📞 サポート

問題が解決しない場合は、以下を確認してください：

1. Apps Scriptの実行ログ
2. LINE WORKS Developer Consoleのログ
3. Google Sheetsの「メッセージ一覧」シート

それでも解決しない場合は、エラーメッセージをお知らせください。

---

✅ セットアップ完了したら、「日报」でメッセージを送信してテストしてください！





