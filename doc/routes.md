# 画面/ルーティング

## 公開ページ（認証不要）
- `/` : トップページ（ログイン誘導）
- `/login` : ログインフォーム（GET/POST）
- `/signin` : アカウント作成フォーム（GET/POST）
- `/session` : Firebase IDトークンをセッションCookieに変換（POST）
- `/logout` : ログアウト（POST）

## 認証が必要なページ

### ダッシュボード
- `/dashboard` : 今月の支払合計（デビット/クレジット別）、過去5ヶ月の推移グラフ

### カード管理
- `/card` : カード一覧/支払予定
- `/card/add` : カード追加フォーム（GET/POST）
- `/card/edit/:id` : カード編集フォーム（GET/POST）
- `/card/delete/:id` : カード削除（POST）

### サブスクリプション管理
- `/card/subscription` : サブスクリプション追加フォーム（GET/POST）
- `/card/subscription/:id` : サブスクリプション詳細
- `/card/subscription/:id/edit` : サブスクリプション編集フォーム（GET/POST）
- `/card/subscription/:id/relink` : サブスクリプションの紐づけカード変更（POST）
- `/card/subscription/:id/delete` : サブスクリプション削除（POST）

### おすすめ(Like)管理
- `/like` : みんなのおすすめ一覧（フィルタ/ソート/ページング対応）
- `/like/me` : 自分のおすすめ一覧（フィルタ/ソート/ページング対応）
- `/like/add` : おすすめ追加フォーム（GET/POST）
- `/like/update/:id` : おすすめ編集フォーム（GET/POST）
- `/like/delete/:id` : おすすめ削除（POST）
- `/like/detail/:id` : おすすめ詳細
- `/like/:id` : 旧URL（`/like/detail/:id`にリダイレクト、後方互換性のため）

### ユーザー設定
- `/setting` : ユーザー情報表示/更新（GET/POST）
- `/setting/password` : パスワード変更（POST）
- `/setting/delete` : アカウント削除（POST）

### ユーティリティ
- `/image-proxy` : 外部画像URLのプロキシ（CORS回避、タイムアウト制御）

## 補足

### セッション管理
- Firebase Authenticationで認証後、サーバー側でHMAC署名付きセッションCookieを発行
- セッションは`SESSION_TIME_MS`（環境変数）で指定した期間有効
- タイムアウト時は自動ログアウトし、`/login?timeout=1`にリダイレクト

### 認証必要なページへのアクセス
- セッションが無効な場合は`/`（トップページ）へリダイレクト
- `/login`と`/signin`は認証済みユーザーは`/dashboard`へ自動リダイレクト

### フラッシュメッセージ
- カード/サブスクリプションの操作後、成功/失敗メッセージをCookieで一時保存
- 次のページ表示時に自動的に表示され、表示後はCookieから削除
