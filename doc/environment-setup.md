# 環境変数設定マニュアル

このドキュメントでは、アプリケーションの動作に必要な環境変数の設定方法を説明します。

## 初期設定

1. プロジェクトルートに `.env` ファイルを作成します

```bash
cp .env.example .env
```

2. `.env` ファイルを編集し、各環境変数に実際の値を設定します

```bash
# エディタで開く
vim .env
```

---

## 環境変数一覧

### Firebase 設定

Firebase プロジェクトの認証情報とプロジェクト設定を指定します。

#### クライアント側設定（Firebase SDK用）

| 環境変数 | 説明 | 取得方法 |
| --- | --- | --- |
| `FIREBASE_API_KEY` | Firebase プロジェクトのAPIキー | Firebase Console → プロジェクト設定 → 一般 → ウェブアプリの構成 |
| `FIREBASE_AUTH_DOMAIN` | 認証ドメイン | 同上 |
| `FIREBASE_PROJECT_ID` | プロジェクトID | 同上 |
| `FIREBASE_STORAGE_BUCKET` | ストレージバケット | 同上 |
| `FIREBASE_MESSAGING_SENDER_ID` | メッセージング送信者ID | 同上 |
| `FIREBASE_APP_ID` | アプリID | 同上 |
| `FIREBASE_MEASUREMENT_ID` | Google Analytics測定ID（オプション） | 同上 |

**Firebase Consoleでの取得手順**:
1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. 対象プロジェクトを選択又は作成
3. 左側メニューの歯車アイコン → 「プロジェクトの設定」
4. 「全般」タブの「マイアプリ」セクションで、ウェブアプリの構成を確認
5. 「構成」または「SDK の設定と構成」をクリックして値をコピー

#### サーバー側設定（Firebase Admin SDK用）

| 環境変数 | 説明 | 取得方法 |
| --- | --- | --- |
| `FIREBASE_CLIENT_EMAIL` | サービスアカウントのメールアドレス | Firebase Console → プロジェクト設定 → サービスアカウント → 新しい秘密鍵を生成 |
| `FIREBASE_PRIVATE_KEY` | サービスアカウントの秘密鍵 | 同上（JSONファイルから抽出） |

**サービスアカウントキーの取得手順**:
1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. 対象プロジェクトを選択
3. 左側メニューの歯車アイコン → 「プロジェクトの設定」
4. 「サービス アカウント」タブを選択
5. 「新しい秘密鍵の生成」ボタンをクリック
6. ダウンロードされたJSONファイルを開く
7. `client_email` の値を `FIREBASE_CLIENT_EMAIL` に設定
8. `private_key` の値を `FIREBASE_PRIVATE_KEY` に設定（**改行を含めてそのまま設定**）

**FIREBASE_PRIVATE_KEYの設定例**:
```bash
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0...\n...省略...\n...=\n-----END PRIVATE KEY-----\n"
```

**重要**:
- 秘密鍵は `\n` を含めてダブルクォートで囲む必要があります
- JSONファイルは厳重に管理し、Gitにはコミットしないでください

---

### セッション設定

ユーザーのログインセッション管理に関する設定です。

| 環境変数 | 説明 | デフォルト値 | 推奨設定 |
| --- | --- | --- | --- |
| `SESSION_SECRET` | セッションCookieの署名に使用する秘密鍵 | なし | 長いランダム文字列（32文字以上） |
| `SESSION_TIME_MS` | セッションの有効期間（ミリ秒） | 60000 (1分) | 600000 (10分) ～ 3600000 (1時間) |

**SESSION_SECRETの生成方法**:

```bash
openssl rand -hex 32
```

**設定例**:
```bash
SESSION_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
SESSION_TIME_MS=600000  # 10分
```

**セッションタイムアウトの動作**:
- ユーザーが指定時間操作しないと自動的にログアウト
- ログアウト後は `/login?timeout=1` にリダイレクトされ、タイムアウト通知が表示される

---

### おすすめ表示期間設定

「みんなのおすすめ一覧」（`/like`）で表示する投稿の期間を制御します。

| 環境変数 | 説明 | 優先度 | デフォルト値 |
| --- | --- | --- | --- |
| `LIKE_VISIBLE_DAYS` | 表示期間（日数） | 低 | 7 |
| `LIKE_VISIBLE_HOURS` | 表示期間（時間） | 中 | なし |
| `LIKE_VISIBLE_MINUTES` | 表示期間（分） | 高 | なし |

**優先順位**: `LIKE_VISIBLE_MINUTES` > `LIKE_VISIBLE_HOURS` > `LIKE_VISIBLE_DAYS`

**設定例**:

```bash
# パターン1: 7日間表示（デフォルト）
LIKE_VISIBLE_DAYS=7

# パターン2: 24時間表示
LIKE_VISIBLE_HOURS=24

# パターン3: 60分（1時間）表示
LIKE_VISIBLE_MINUTES=60

# パターン4: 複数設定した場合は優先度の高いものが適用される
LIKE_VISIBLE_DAYS=7
LIKE_VISIBLE_HOURS=168  # 7日 = 168時間
LIKE_VISIBLE_MINUTES=10080  # 7日 = 10080分
# → LIKE_VISIBLE_MINUTES が優先され、10080分（7日）表示
```

**動作**:
- 設定期間内に投稿されたおすすめのみ表示される
- 期間外の投稿は一覧に表示されないが、削除されるわけではない
- 「自分のおすすめ一覧」（`/like/me`）では期間制限は適用されない（全件表示）

**用途別の推奨設定**:
- **開発/テスト環境**: `LIKE_VISIBLE_MINUTES=60` (1時間) - 古いテストデータを非表示にする
- **本番環境**: `LIKE_VISIBLE_DAYS=7` (7日) - 新しい投稿を優先的に表示
- **長期保存**: `LIKE_VISIBLE_DAYS=365` (1年) - 過去の投稿も長期間表示

---

### 外部API設定

外部APIへのHTTPリクエストのタイムアウト時間を設定します。

| 環境変数 | 説明 | デフォルト値 | 推奨設定 |
| --- | --- | --- | --- |
| `EXTERNAL_API_TIMEOUT_MS` | 外部API呼び出しのタイムアウト（ミリ秒） | 8000 | 5000 ～ 10000 |

**設定例**:
```bash
EXTERNAL_API_TIMEOUT_MS=8000  # 8秒
```

**対象API**:
- 為替レートAPI（サブスクリプションの通貨換算に使用）
- Firebase Authentication API（パスワード変更時の現在のパスワード確認）

**動作**:
- 指定時間内にレスポンスがない場合、タイムアウトエラーとして処理
- タイムアウト時はユーザーにエラーメッセージを表示
- 為替レート取得失敗時は換算せず元の金額を表示（警告メッセージあり）

**推奨設定**:
- **高速ネットワーク環境**: 5000ms (5秒)
- **通常環境**: 8000ms (8秒) ← デフォルト
- **低速ネットワーク環境**: 10000ms (10秒)

---

## 完全な設定例

```bash
# Firebase クライアント側設定
FIREBASE_API_KEY=AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FIREBASE_AUTH_DOMAIN=my-payment-app.firebaseapp.com
FIREBASE_PROJECT_ID=my-payment-app
FIREBASE_STORAGE_BUCKET=my-payment-app.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789012
FIREBASE_APP_ID=1:123456789012:web:abcdef1234567890abcdef
FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX

# Firebase サーバー側設定（Admin SDK）
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@my-payment-app.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n...(省略)...\n-----END PRIVATE KEY-----\n"

# セッション設定
SESSION_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
SESSION_TIME_MS=600000

# おすすめ表示期間（7日間）
LIKE_VISIBLE_DAYS=7

# 外部APIタイムアウト（8秒）
EXTERNAL_API_TIMEOUT_MS=8000
```

---

## トラブルシューティング

### Firebase接続エラー

**エラー**: `Firebase Admin SDK is not initialized.`

**原因**: Firebase Admin SDK の認証情報が正しく設定されていない

**解決方法**:
1. `FIREBASE_CLIENT_EMAIL` と `FIREBASE_PRIVATE_KEY` が設定されているか確認
2. `FIREBASE_PRIVATE_KEY` の改行（`\n`）が正しく含まれているか確認
3. サービスアカウントキーのJSONファイルから再度コピー

---

### セッションタイムアウトが早すぎる

**症状**: ログイン後すぐにログアウトされる

**原因**: `SESSION_TIME_MS` の値が小さすぎる

**解決方法**:
```bash
# 10分に設定
SESSION_TIME_MS=600000

# 30分に設定
SESSION_TIME_MS=1800000

# 1時間に設定
SESSION_TIME_MS=3600000
```

---

### おすすめが表示されない

**症状**: 投稿したおすすめが「みんなのおすすめ一覧」に表示されない

**原因**:
1. 表示期間外の投稿（`LIKE_VISIBLE_DAYS/HOURS/MINUTES`の制限）
2. Firestoreインデックスが未作成

**解決方法**:
1. 表示期間を長く設定
```bash
LIKE_VISIBLE_DAYS=30  # 30日に延長
```

2. Firestoreインデックスを作成（詳細は `doc/firestore-indexes.md` 参照）
```bash
npm run deploy:indexes
```

---

### 為替レート換算が機能しない

**症状**: 外貨建てサブスクがJPYに換算されず、警告メッセージが表示される

**原因**:
1. 外部APIへの接続タイムアウト
2. インターネット接続の問題

**解決方法**:
1. タイムアウト時間を延長
```bash
EXTERNAL_API_TIMEOUT_MS=15000  # 15秒に延長
```

2. ネットワーク接続を確認

---

## セキュリティのベストプラクティス

### 1. 秘密鍵の管理

- **絶対にGitにコミットしない**: `.env` ファイルは `.gitignore` に含まれています
- **本番環境では環境変数を直接設定**: サーバー管理画面や環境変数設定機能を使用
- **定期的にローテーション**: `SESSION_SECRET` は定期的に変更（変更後は全ユーザーが再ログイン必要）

### 2. 最小権限の原則

- Firebaseサービスアカウントには必要最小限の権限のみ付与
- プロジェクトごとに異なるサービスアカウントを使用

---

## 参考資料

- [Firebase プロジェクト設定](https://firebase.google.com/docs/projects/learn-more?hl=ja)
- [Firebase Admin SDK セットアップ](https://firebase.google.com/docs/admin/setup?hl=ja)
- [Node.js 環境変数のベストプラクティス](https://nodejs.org/en/learn/command-line/how-to-read-environment-variables-from-nodejs)
- プロジェクト内ドキュメント: `doc/overview.md`, `doc/routes.md`, `doc/data-model.md`
