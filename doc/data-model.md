# データモデル（Firestore）

## users
ユーザーのプロフィール情報を保持します。

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `name` | string | ユーザー名 |
| `email` | string | メールアドレス |
| `createdAt` | Timestamp | 作成日時 |
| `updatedAt` | Timestamp | 更新日時 |

**ドキュメントID**: Firebase Authentication の UID

**アクセスパターン**:
- ユーザー情報取得: `getUserProfile(uid)`
- ユーザー情報更新: `updateUserProfile(uid, data)`
- アカウント削除: `deleteUserProfile(uid)`

---

## cards
支払いカード情報を保持します。

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `userId` | string | カード所有者のUID |
| `cardName` | string | カード名（例: メインカード） |
| `cardBrand` | string | カードブランド（VISA/MasterCard/JCB/AMEX/その他） |
| `last4Digits` | string | カード番号下4桁 |
| `cardType` | string | カード種別（`credit` or `debit`） |
| `billingDay` | number/null | 請求日（1-31、月末: 99） |
| `closingDay` | number/null | 締め日（1-31、月末: 99） |
| `paymentDay` | number/null | 支払日（1-31、月末: 99） |
| `limitAmount` | number/null | 利用限度額（円） |
| `createdAt` | Timestamp | 作成日時 |
| `updatedAt` | Timestamp | 更新日時（存在する場合のみ） |

**インデックス**: `userId` フィールドにインデックスが必要（自動生成）

**アクセスパターン**:
- ユーザーのカード一覧: `listCardsByUser(userId)` （作成日時の降順でソート）
- カード詳細取得: `getCardById(cardId)`
- カード作成: `createCard(data)`
- カード更新: `updateCard(data)` （所有者確認あり）
- カード削除: `deleteCard(cardId, userId)` （所有者確認あり）

---

## subscriptions
カードに紐づくサブスクリプション情報を保持します。

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `userId` | string | サブスク登録者のUID |
| `cardId` | string | 紐づくカードのID |
| `serviceName` | string | サービス名（例: Netflix） |
| `amount` | number | 支払金額 |
| `currency` | string | 通貨コード（JPY/USD/EUR等） |
| `cycle` | string | 支払サイクル（`monthly` or `yearly`） |
| `paymentStartDate` | Timestamp | 支払開始日 |
| `registeredEmail` | string | サービスに登録したメールアドレス |
| `notes` | string | メモ |
| `createdAt` | Timestamp | 作成日時 |
| `updatedAt` | Timestamp | 更新日時（存在する場合のみ） |

**インデックス**: `userId` フィールドにインデックスが必要（自動生成）

**アクセスパターン**:
- ユーザーのサブスク一覧: `listSubscriptionsByUser(userId)` （作成日時の降順でソート）
- サブスク詳細取得: `getSubscriptionById(subscriptionId)`
- サブスク作成: `createSubscription(data)`
- サブスク更新: `updateSubscription(data)` （所有者確認あり）
- サブスクの紐づけカード変更: `updateSubscriptionCard(id, userId, cardId)` （所有者確認あり）
- サブスク削除: `deleteSubscription(subscriptionId, userId)` （所有者確認あり）

**次回支払日の計算**:
- `paymentStartDate` と `cycle` から次回支払予定日を算出
- カードの `paymentDay` が設定されている場合はそれを考慮

---

## likes
おすすめの投稿データを保持します。

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `userId` | string | 投稿者のUID |
| `userName` | string | 投稿者のユーザー名（表示用） |
| `title` | string | 商品名 |
| `content` | string | コメント/説明 |
| `date` | string | 購入日（YYYY-MM-DD形式） |
| `url` | string | 購入先URL |
| `image` | string | 商品画像URL |
| `category` | string | カテゴリ（衣類/日用品/家具/家電/PC周辺機器/ホビー/本/食品/ギフト/その他） |
| `createdAt` | Timestamp | 投稿日時 |
| `updatedAt` | Timestamp | 更新日時（存在する場合のみ） |

**複合インデックス**:
- `createdAt` の範囲検索とソートを伴うクエリに必要（詳細は `doc/firestore-indexes.md` 参照）
- フィルタ条件（category, userName, userId）とソート（createdAt, userName, title, date）の組み合わせごとに複合インデックスが必要

**アクセスパターン**:
- 一覧取得: `listLikes({ category, userName, userId, sortField, sortOrder, visibleSince, page, pageSize, paginate })`
  - `visibleSince`: 表示期間フィルタ（環境変数 `LIKE_VISIBLE_DAYS/HOURS/MINUTES` で指定）
  - `paginate`: true の場合はFirestore側でページング、false の場合は全件取得
- Like詳細取得: `getLikeById(id)`
- Like投稿: `addLikeEntry(data)`
- Like更新: `updateLikeEntry(id, data)`
- Like削除: `deleteLikeEntry(id)`
- ユーザー名一括更新: `updateUserNameForUser(userId, userName)` （ユーザー情報更新時に使用）
- ユーザーのLike一括削除: `deleteLikesByUser(userId)` （アカウント削除時に使用）

**表示期間制御**:
- みんなのおすすめ一覧（`/like`）では、環境変数で設定した期間内に投稿されたものだけ表示
- 自分のおすすめ一覧（`/like/me`）では期間制限なし

---

## データ整合性

### カード削除時
- 紐づくサブスクリプションは削除されない（orphan状態）
- orphan状態のサブスクは `/card` 画面で「未紐づけサブスクリプション」として表示される

### アカウント削除時
1. `likes` コレクションから該当ユーザーの投稿を一括削除
2. `users` コレクションからプロフィールを削除
3. Firebase Authentication からユーザーを削除
- 途中で失敗した場合でもAuthenticationの削除は試行される（部分的な削除を許容）

### ユーザー名変更時
- `users` コレクションと `likes` コレクションの `userName` を同時に更新
- 失敗時はロールバックを試行
