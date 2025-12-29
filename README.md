# Payment

支払いカード・サブスクリプション・おすすめ（Like）を一元管理し、
ダッシュボードで今月の合計や過去推移を可視化するWebアプリです。

## 主な機能
- ダッシュボード: 今月の合計/支払予定、過去5か月の推移グラフ
- カード管理: クレジット/デビットの登録・編集・削除
- サブスクリプション管理: カード紐付け、支払開始日、通貨対応
- おすすめ(Like): 投稿/編集/削除、一覧/自分の投稿
- 設定: ユーザー情報更新、パスワード変更、アカウント削除

## 技術スタック
- Node.js / Express
- EJS
- Firebase Authentication
- Firestore (Firebase Admin SDK)

## セットアップ
```bash
npm install
cp .env.example .env
npm start
```

## 環境変数
`.env.example` を参照してください。主に以下を利用します。
- Firebaseプロジェクト情報（API Key / Auth Domain / Project ID など）
- Firebase Admin SDKのサービスアカウント（`FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`）
- セッション設定（`SESSION_SECRET`, `SESSION_TIME_MS`）
- 外部APIタイムアウト（`EXTERNAL_API_TIMEOUT_MS`）

## 画面/ルーティング概要
詳細は `doc/routes.md` を参照してください。

## データモデル概要
詳細は `doc/data-model.md` を参照してください。

## その他ドキュメント
- `doc/overview.md`: システム概要と主要な処理フロー
- `doc/firestore-indexes.md`: Firestoreのインデックス

