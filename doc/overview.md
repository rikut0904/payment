# システム概要

## 目的
支払いカード・サブスクリプション・おすすめ(Like)を一元管理し、月次の支払状況や推移をダッシュボードで可視化するWebアプリケーションです。

## 主要機能

### 1. ダッシュボード
- 今月の支払合計を表示（デビット/クレジット別）
- 過去5ヶ月の支払推移を棒グラフで可視化
- 外貨建てサブスクは為替レートAPIで自動的にJPY換算

### 2. カード管理
- クレジット/デビットカードの登録・編集・削除
- カード情報（カード名、ブランド、下4桁、締め日、支払日、利用限度額）
- 各カードに紐づくサブスクリプションの一覧表示と合計金額算出

### 3. サブスクリプション管理
- サブスクの登録・編集・削除
- カードへの紐づけ/紐づけ変更
- 支払サイクル（月額/年額）と開始日から次回支払日を自動計算
- 外貨対応（USD, EUR, GBP等）と為替レート換算

### 4. おすすめ(Like)機能
- おすすめ商品の投稿・編集・削除
- みんなの投稿一覧と自分の投稿一覧
- カテゴリフィルタ、ユーザー名フィルタ、商品名検索
- 複数フィールドでのソート（投稿日、ユーザー名、商品名、購入日）
- ページネーション対応（Firestore側 or メモリ内）
- 投稿日からの経過日数による表示期間制御

### 5. ユーザー設定
- ユーザー名・メールアドレスの変更
- パスワード変更（現在のパスワード確認必須）
- アカウント削除（likes/profile/authを順に削除）

### 6. セキュリティ
- Firebase Authenticationによる認証
- サーバー側でHMAC署名付きセッションCookie発行
- セッションタイムアウト自動検出と再ログイン促進
- 所有者確認による不正アクセス防止

---

## 技術スタック

### バックエンド
- **Node.js / Express**: サーバーサイドフレームワーク
- **EJS**: テンプレートエンジン
- **Firebase Admin SDK**: Firestore操作とAuth管理
- **dotenv**: 環境変数管理

### フロントエンド
- **Firebase SDK (Client)**: クライアント側認証
- **Vanilla JavaScript**: DOM操作とフォーム処理

### データベース
- **Firestore**: NoSQLデータベース（users/cards/subscriptions/likesコレクション）

### 外部API
- **為替レートAPI**: 外貨建てサブスクのJPY換算

---

## アーキテクチャ

### ディレクトリ構成
```
/home/rikut0904/MyWebSite/payment/
├── app.js                    # メインアプリケーション（ルーティング、セッション管理）
├── bin/www                   # サーバー起動スクリプト
├── routes/                   # ルートハンドラ
│   ├── index.js              # トップページ
│   ├── login.js              # ログイン
│   ├── signin.js             # アカウント作成
│   ├── dashboard.js          # ダッシュボード
│   ├── setting.js            # ユーザー設定
│   ├── like.js               # おすすめ管理
│   ├── imageProxy.js         # 画像プロキシ
│   ├── card.js               # カードルーティングのエントリポイント
│   ├── card/                 # カード機能のモジュール群
│   │   ├── index.js          # カード一覧・追加・編集・削除
│   │   ├── subscription.js   # サブスク追加・編集・削除・詳細
│   │   ├── payments.js       # 支払日計算・集計ロジック
│   │   ├── validators.js     # バリデーション
│   │   ├── helpers.js        # 共通ヘルパー
│   │   ├── utils.js          # 日付・通貨フォーマット
│   │   ├── constants.js      # 定数定義
│   │   └── message.js        # フラッシュメッセージ
│   └── middleware/           # ミドルウェア
│       └── redirectIfAuthenticated.js
├── lib/                      # ビジネスロジック
│   ├── firestoreUsers.js     # ユーザープロフィール操作
│   ├── firestoreCards.js     # カード・サブスク操作
│   ├── firestoreLikes.js     # Like操作
│   ├── exchangeRates.js      # 為替レート取得
│   ├── httpClient.js         # HTTP通信（タイムアウト制御）
│   └── numberUtils.js        # 数値処理
├── views/                    # EJSテンプレート
│   ├── index.ejs             # トップページ
│   ├── login.ejs             # ログイン画面
│   ├── signin.ejs            # サインアップ画面
│   ├── error.ejs             # エラー画面
│   ├── dashboard/            # ダッシュボード
│   ├── card/                 # カード関連画面
│   ├── like/                 # おすすめ関連画面
│   └── setting/              # 設定画面
├── public/                   # 静的ファイル
│   ├── stylesheets/          # CSS
│   └── javascripts/          # クライアントサイドJS
│       ├── firebase-auth.js  # Firebase認証処理
│       ├── header.js         # ヘッダー処理
│       ├── dashboard.js      # ダッシュボードUI
│       ├── card-actions.js   # カード操作UI
│       ├── card-menu.js      # カードメニューUI
│       └── like-actions.js   # Like操作UI
├── doc/                      # ドキュメント
├── script/                   # 運用スクリプト
├── .env                      # 環境変数（gitignore対象）
├── .env.example              # 環境変数テンプレート
├── package.json              # 依存関係
└── firestore.indexes.json    # Firestoreインデックス定義
```

---

## 主要な処理フロー

### 認証フロー
1. ユーザーがログインフォームに入力
2. クライアント側でFirebase Auth APIを呼び出し（`/routes/login.js`）
3. サーバー側でIDトークンを検証
4. HMAC署名付きセッションCookieを発行し、クライアントに送信
5. 以降のリクエストはセッションCookieで認証

### ダッシュボード集計フロー
1. ユーザーのカード一覧とサブスク一覧を並列取得
2. 為替レートAPIを呼び出し（タイムアウト制御あり）
3. 各サブスクの次回支払日を計算（`routes/card/payments.js`）
4. 今月分と過去5ヶ月分の支払を集計
5. 外貨建てサブスクをJPYに換算し合計を算出
6. EJSテンプレートに渡してグラフ表示

### おすすめ投稿フロー
1. ユーザーが投稿フォームに入力（商品名、コメント、カテゴリ、URL等）
2. サーバー側でバリデーション（必須項目、URL形式チェック）
3. Firestoreに保存（`userId`, `userName`, `createdAt`を自動付与）
4. 投稿完了後、一覧画面にリダイレクト

### おすすめ一覧表示フロー
1. クエリパラメータからフィルタ/ソート条件とページ番号を取得
2. `visibleSince`（表示期間）を環境変数から計算
3. Firestoreクエリを構築：
   - `createdAt >= visibleSince` でフィルタ（みんなのおすすめのみ）
   - category, userName, userId でフィルタ
   - sortField と sortOrder でソート
4. ページング方式を判定：
   - Firestore側ページング: `sortField=createdAt` かつ商品名フィルタなしの場合
   - メモリ内ページング: その他の場合（全件取得後にソート・フィルタ・ページング）
5. 複合インデックスを使ってFirestoreから取得
6. EJSテンプレートに渡して一覧表示

---

## セキュリティ・エラー処理

### セッション管理
- セッションCookieに `httpOnly`, `secure` (本番のみ), `sameSite: lax` を設定
- HMAC-SHA256でペイロードに署名し、改ざん検出
- タイムアウト検出時は自動ログアウトし `/login?timeout=1` へリダイレクト

### 所有者確認
- カード/サブスク/Likeの編集・削除時は `userId` を照合
- 不正アクセス時は403エラーまたはリダイレクト

### 外部API呼び出し
- `lib/httpClient.js` でタイムアウト制御（デフォルト: `EXTERNAL_API_TIMEOUT_MS`）
- タイムアウト時はエラーとして扱い、ユーザーに通知
- 為替レート取得失敗時は換算せず元の金額を表示（警告メッセージあり）

### エラーハンドリング
- 非同期エラーは `asyncHandler` でキャッチし、Expressエラーハンドラに渡す
- バリデーションエラーはフォーム画面に戻してエラーメッセージ表示
- Firestore操作失敗時はログ出力し、ユーザーにエラー通知

---

## 環境変数

詳細は `.env.example` と `README.md` を参照してください。

### Firebase関連
- `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID` 等
- `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (Admin SDK用)

### セッション設定
- `SESSION_SECRET`: HMAC署名鍵
- `SESSION_TIME_MS`: セッション有効期間（ミリ秒）

### おすすめ表示期間
- `LIKE_VISIBLE_DAYS`, `LIKE_VISIBLE_HOURS`, `LIKE_VISIBLE_MINUTES`
- 優先順位: MINUTES > HOURS > DAYS（デフォルト: 7日）

### 外部API
- `EXTERNAL_API_TIMEOUT_MS`: 為替レートAPI等のタイムアウト（デフォルト: 8000ms）

---

## 今後の拡張性

### スケーラビリティ
- Firestoreのページネーションにより大量データにも対応
- 為替レートのキャッシュ機能（現在は毎回API呼び出し）

### 機能追加の余地
- 通知機能（支払日前にリマインダー）
- サブスクの一時停止機能
- 家計簿機能（カード決済履歴のインポート）
- おすすめへのコメント・いいね機能

### セキュリティ強化
- CSRFトークン
- レート制限（ログイン試行回数制限）
- 2要素認証
