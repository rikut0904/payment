# Firestore 複合インデックス（likes コレクション）

おすすめ一覧 (`/like`, `/like/me`) を Firestore でページネーション・期間フィルタ付きで取得するために必要なインデックスです。昇順・降順の両対応や、ユーザー名／カテゴリ／userId などのフィルタの組み合わせごとに以下を作成してください。

| 用途 | フィールド構成（順番／ソート方向） |
| --- | --- |
| 一覧（フィルタ無し）降順 | `createdAt` DESC → `__name__` ASC |
| 一覧（フィルタ無し）昇順 | `createdAt` ASC → `__name__` ASC |
| カテゴリのみ降順 | `category` ASC → `createdAt` DESC → `__name__` ASC |
| カテゴリのみ昇順 | `category` ASC → `createdAt` ASC → `__name__` ASC |
| ユーザー名のみ降順 | `userName` ASC → `createdAt` DESC → `__name__` ASC |
| ユーザー名のみ昇順 | `userName` ASC → `createdAt` ASC → `__name__` ASC |
| カテゴリ＋ユーザー名降順 | `category` ASC → `userName` ASC → `createdAt` DESC → `__name__` ASC |
| カテゴリ＋ユーザー名昇順 | `category` ASC → `userName` ASC → `createdAt` ASC → `__name__` ASC |
| `/me`（userId のみ）降順 | `userId` ASC → `createdAt` DESC → `__name__` ASC |
| `/me`（userId のみ）昇順 | `userId` ASC → `createdAt` ASC → `__name__` ASC |
| `/me`（userId＋カテゴリ）降順 | `userId` ASC → `category` ASC → `createdAt` DESC → `__name__` ASC |
| `/me`（userId＋カテゴリ）昇順 | `userId` ASC → `category` ASC → `createdAt` ASC → `__name__` ASC |

## 設定手順

1. Firebase コンソールにログインし、対象プロジェクトを開く。
2. サイドバーで「Firestore Database」→「Indexes」タブを選択。
3. 「Create composite index」をクリックし、以下を設定:
   - **Collection ID**: `likes`
   - **Fields**: 上表の各行どおりにフィールド名とソート方向を追加
   - **Query scope**: Collection（デフォルト）
4. 「Create」を押してインデックスを作成。複数必要な場合は上表の行ごとに繰り返し追加する。
5. ステータスが “Building” から “Enabled” に変わるまで待機（通常数分）。完了後、該当クエリが正常に実行できる。

## CLI で自動作成する場合

`firestore.indexes.json` に上表と同じ定義を登録済み。Firebase CLI（`firebase-tools`）でプロジェクトにログイン済みであれば、以下のコマンドでまとめて作成できる。

```bash
npm run deploy:indexes
```

内部的に `npx firebase deploy --only firestore:indexes` を実行し、`firestore.indexes.json` の内容をそのままデプロイする。プロジェクトを切り替える場合は `.firebaserc` の `default` を更新するか、`FIREBASE_PROJECT` 環境変数を指定して実行すること。
