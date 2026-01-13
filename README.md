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

## クイックスタート

```bash
# 1. 依存関係のインストール
npm install

# 2. 環境変数ファイルの作成
cp .env.example .env

# 3. .envファイルを編集（Firebase認証情報などを設定）
[環境変数設定マニュアル](doc/environment-setup.md)

# 4. アプリケーションの起動
npm start
```

アプリケーションは `http://localhost:3000` で起動します。


**Gitクローンから動作するまでの完全な手順は [`doc/getting-started.md`](doc/getting-started.md) を参照してください。**

以下の内容が含まれています：
- Node.js環境の確認
- Firebaseプロジェクトの作成手順
- Firebase認証情報の取得方法
- 環境変数の詳細な設定手順
- Firestoreインデックスの作成
- トラブルシューティング

## 環境変数

`.env.example` を参照してください。主に以下を利用します。

- **Firebase設定**: プロジェクト情報、Admin SDK認証情報
- **セッション設定**: セッション署名鍵、有効期間
- **おすすめ表示期間**: 投稿の表示期間制御
- **外部API**: タイムアウト設定

**詳細な設定方法、取得手順、トラブルシューティングは [`doc/environment-setup.md`](doc/environment-setup.md) を参照してください。**

## ドキュメント

プロジェクトの詳細な情報は以下のドキュメントを参照してください。

### 🚀 はじめに
- **[`doc/getting-started.md`](doc/getting-started.md)** - Gitクローンから起動までの完全ガイド
  - リポジトリのクローン手順
  - Firebaseプロジェクトの作成（画面付き説明）
  - Firebase認証情報の取得方法
  - 環境変数の設定手順
  - Firestoreインデックスの作成
  - 初回ユーザー登録と動作確認
  - トラブルシューティング

### 📖 設定ドキュメント
- **[`doc/environment-setup.md`](doc/environment-setup.md)** - 環境変数の詳細リファレンス
  - 全環境変数の説明と推奨値
  - Firebase認証情報の詳細
  - セッション設定の最適化
  - おすすめ表示期間の制御
  - セキュリティのベストプラクティス

### 📋 システムドキュメント
- **[`doc/overview.md`](doc/overview.md)** - システム全体の概要
  - 主要機能の詳細
  - 技術スタック
  - アーキテクチャとディレクトリ構成
  - 主要な処理フロー
  - セキュリティとエラー処理

- **[`doc/routes.md`](doc/routes.md)** - 画面とルーティングの一覧
  - 全画面のURL一覧
  - 認証が必要なページ
  - セッション管理の仕組み

- **[`doc/data-model.md`](doc/data-model.md)** - データベース設計
  - Firestoreコレクション構造
  - 各フィールドの詳細
  - アクセスパターン
  - データ整合性の仕組み

- **[`doc/firestore-indexes.md`](doc/firestore-indexes.md)** - Firestoreインデックス設定
  - 必要な複合インデックス
  - インデックス作成手順
  - CLIでの自動デプロイ方法

### 🤝 開発ガイド
- **[`CONTRIBUTING.md`](CONTRIBUTING.md)** - コントリビューションガイド
  - 開発フロー
  - ブランチ命名規則
  - コミットメッセージ規約

