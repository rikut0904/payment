# はじめに - セットアップガイド

このガイドでは、Gitリポジトリからクローンした後、アプリケーションが動作するまでの手順を詳しく説明します。

## 前提条件

以下がインストールされている必要があります：

- **Node.js** (v14以上推奨)
- **npm** (Node.jsに同梱)
- **Git**

### Node.jsのインストール確認

```bash
node --version
# v14.0.0 以上が表示されればOK

npm --version
# 6.0.0 以上が表示されればOK
```

インストールされていない場合は、[Node.js公式サイト](https://nodejs.org/)からダウンロードしてください。

---

## ステップ1: リポジトリのクローン

```bash
# リポジトリをクローン
git clone <リポジトリURL>

# プロジェクトディレクトリに移動
cd payment
```

---

## ステップ2: 依存関係のインストール

```bash
npm install
```

このコマンドで、`package.json`に記載されたすべての依存パッケージがインストールされます。

**インストールされる主なパッケージ**:
- Express (Webフレームワーク)
- EJS (テンプレートエンジン)
- Firebase / Firebase Admin SDK
- その他のユーティリティライブラリ

---

## ステップ3: Firebaseプロジェクトの作成

### 3-1. Firebaseコンソールにアクセス

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. Googleアカウントでログイン
3. 「プロジェクトを追加」ボタンをクリック

### 3-2. プロジェクトの作成

1. **プロジェクト名**を入力（例: `my-payment-app`）
2. 「続行」をクリック
3. Google Analyticsの設定（オプション、有効にすることを推奨）
4. 「プロジェクトを作成」をクリック
5. プロジェクトの準備が完了するまで待機

### 3-3. Authenticationの有効化

1. 左側メニューから「Authentication」を選択
2. 「始める」ボタンをクリック
3. 「Sign-in method」タブを選択
4. 「メール/パスワード」を選択
5. 「有効にする」トグルをONにする
6. 「保存」をクリック

### 3-4. Firestoreデータベースの作成

1. 左側メニューから「Firestore Database」を選択
2. 「データベースを作成」ボタンをクリック
3. **本番モード**を選択（セキュリティルールは後で設定）
4. ロケーションを選択（例: `asia-northeast1` - 東京）
5. 「有効にする」をクリック
6. データベースの準備が完了するまで待機

### 3-5. Firestoreセキュリティルールの設定

1. 「Firestore Database」画面の「ルール」タブを選択
2. 以下のルールを設定（開発環境用、本番環境では適切に制限してください）:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // ユーザープロフィール
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // カード情報
    match /cards/{cardId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }

    // サブスクリプション
    match /subscriptions/{subscriptionId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }

    // おすすめ投稿
    match /likes/{likeId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
  }
}
```

3. 「公開」をクリック

---

## ステップ4: Firebase認証情報の取得

### 4-1. クライアント側設定の取得

1. Firebase Consoleで、左上の歯車アイコン → 「プロジェクトの設定」を選択
2. 「全般」タブを選択
3. 下にスクロールして「マイアプリ」セクションを見つける
4. 「ウェブアプリにFirebaseを追加」をクリック（または既存のアプリを選択）
5. アプリのニックネームを入力（例: `Payment Web App`）
6. 「アプリを登録」をクリック
7. 表示される設定情報をメモしておく:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  authDomain: "my-payment-app.firebaseapp.com",
  projectId: "my-payment-app",
  storageBucket: "my-payment-app.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890abcdef",
  measurementId: "G-XXXXXXXXXX"
};
```

### 4-2. サーバー側設定（Admin SDK）の取得

1. Firebase Consoleで「プロジェクトの設定」を開く
2. 「サービス アカウント」タブを選択
3. 「新しい秘密鍵の生成」ボタンをクリック
4. 確認ダイアログで「キーを生成」をクリック
5. JSONファイルがダウンロードされます（**このファイルは厳重に管理してください**）
6. JSONファイルを開いて、以下の情報をメモ:
   - `client_email`: サービスアカウントのメールアドレス
   - `private_key`: 秘密鍵（`-----BEGIN PRIVATE KEY-----` から始まる長い文字列）

**注意**: このJSONファイルには機密情報が含まれています。絶対にGitにコミットしないでください。

---

## ステップ5: 環境変数ファイルの作成
[環境変数設定マニュアル](doc/environment-setup.md)

## ステップ6: Firestoreインデックスの作成

おすすめ機能を正しく動作させるには、Firestoreに複合インデックスを作成する必要があります。

### 6-1. Firebase CLIのインストール

```bash
npm install -g firebase-tools
```

### 6-2. Firebaseにログイン

```bash
firebase login
```

ブラウザが開いて、Googleアカウントでの認証が求められます。

### 6-3. Firebaseプロジェクトの選択

```bash
firebase use --add
```

作成したFirebaseプロジェクトを選択し、エイリアス（例: `default`）を設定します。

### 6-4. インデックスのデプロイ

```bash
npm run deploy:indexes
```

**注意**: インデックスの作成には数分かかる場合があります。Firebase Consoleの「Firestore Database」→「インデックス」タブで進捗を確認できます。

---

## ステップ7: アプリケーションの起動

### 7-1. 開発サーバーの起動

```bash
npm start
```

以下のような出力が表示されれば成功です：

```
> payment@0.0.0 start
> node ./bin/www
```

### 7-2. ブラウザでアクセス

ブラウザで以下のURLを開きます：

```
http://localhost:3000
```

トップページが表示されれば、セットアップは成功です！

---

## ステップ8: 初回ユーザー登録

### 8-1. アカウント作成

1. トップページの「アカウント作成」リンクをクリック
2. 以下の情報を入力:
   - ユーザー名（例: `テストユーザー`）
   - メールアドレス（例: `test@example.com`）
   - パスワード（6文字以上）
3. 「アカウント作成」ボタンをクリック
4. ログイン画面にリダイレクトされます

### 8-2. ログイン

1. 作成したメールアドレスとパスワードでログイン
2. ダッシュボードが表示されれば成功です

### 8-3. 動作確認

以下の機能を試してみてください：

1. **カード登録**:
   - 左メニューの「カード管理」をクリック
   - 「カードを追加」ボタンをクリック
   - カード情報を入力して登録

2. **サブスクリプション登録**:
   - カード一覧画面で「サブスク追加」ボタンをクリック
   - サービス名、金額、支払サイクルを入力して登録

3. **おすすめ投稿**:
   - 左メニューの「おすすめ」をクリック
   - 「おすすめを追加」ボタンをクリック
   - 商品名、カテゴリなどを入力して投稿

4. **ダッシュボード確認**:
   - 左メニューの「ダッシュボード」をクリック
   - 今月の支払合計と過去の推移グラフが表示される

---

## トラブルシューティング

### エラー: `Firebase Admin SDK is not initialized.`

**原因**: Firebase Admin SDKの認証情報が正しく設定されていない

**解決方法**:
1. `.env` ファイルの `FIREBASE_CLIENT_EMAIL` と `FIREBASE_PRIVATE_KEY` を確認
2. `FIREBASE_PRIVATE_KEY` がダブルクォートで囲まれているか確認
3. `FIREBASE_PRIVATE_KEY` に `\n` が含まれているか確認
4. サービスアカウントのJSONファイルから再度コピー

### エラー: `EADDRINUSE: address already in use :::3000`

**原因**: ポート3000が既に使用されている

**解決方法**:
```bash
# ポート3000を使用しているプロセスを確認
lsof -i :3000

# プロセスを停止
kill -9 <PID>
```

または、別のポートを使用：
```bash
PORT=3001 npm start
```

### エラー: Firestoreの権限エラー

**原因**: Firestoreセキュリティルールが正しく設定されていない

**解決方法**:
1. Firebase Consoleで「Firestore Database」→「ルール」タブを開く
2. ステップ3-5のセキュリティルールを設定
3. 「公開」をクリック

### おすすめが表示されない

**原因**: Firestoreインデックスが作成されていない

**解決方法**:
```bash
npm run deploy:indexes
```

Firebase Consoleの「Firestore Database」→「インデックス」タブで、すべてのインデックスが「有効」になるまで待機してください。

### ログインできない / セッションタイムアウトが早すぎる

**原因**: `SESSION_TIME_MS` の値が小さすぎる、または `SESSION_SECRET` が未設定

**解決方法**:
1. `.env` ファイルで `SESSION_TIME_MS=600000` (10分) に設定
2. `SESSION_SECRET` にランダムな文字列を設定
3. アプリケーションを再起動

---

## 次のステップ

セットアップが完了したら、以下のドキュメントを参照してください：

- **[`doc/overview.md`](overview.md)** - システム全体の仕組み
- **[`doc/routes.md`](routes.md)** - 全画面の説明
- **[`doc/data-model.md`](data-model.md)** - データベース設計
- **[`doc/environment-setup.md`](environment-setup.md)** - 環境変数の詳細設定
- **[`CONTRIBUTING.md`](../CONTRIBUTING.md)** - 開発に参加する場合

---

## サポート

問題が解決しない場合は、以下を確認してください：

1. Node.jsとnpmのバージョンが要件を満たしているか
2. `.env` ファイルがプロジェクトルートに存在するか
3. すべての環境変数が正しく設定されているか
4. Firebaseプロジェクトが正しく設定されているか

