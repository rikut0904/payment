# 画面/ルーティング

## 公開ページ
- `/` : トップ（ログイン誘導）
- `/login` : ログイン
- `/signin` : アカウント作成

## 認証が必要なページ
- `/dashboard` : サマリー（今月/過去推移）
- `/card` : カード一覧/登録/編集
- `/card/subscription` : サブスクリプション追加
- `/card/subscription/:id` : サブスク詳細/編集
- `/like` : みんなのおすすめ一覧
- `/like/me` : 自分のおすすめ一覧
- `/like/detail/:id` : おすすめ詳細
- `/setting` : ユーザー設定

## API/ユーティリティ
- `/session` : Firebase IDトークンをセッションへ変換
- `/logout` : セッション削除
- `/image-proxy` : 画像プロキシ（外部URLの表示用）

