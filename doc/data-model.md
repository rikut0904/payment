# データモデル（Firestore）

## users
ユーザーのプロフィール情報を保持します。
- `name` / `email`
- `createdAt` / `updatedAt`

## cards
支払いカード情報を保持します。
- `userId`
- `cardName` / `cardBrand` / `last4Digits`
- `cardType`（credit/debit）
- `billingDay` / `closingDay` / `paymentDay`
- `limitAmount`
- `createdAt` / `updatedAt`

## subscriptions
カードに紐づくサブスクリプション情報を保持します。
- `userId` / `cardId`
- `serviceName`
- `amount` / `currency`
- `cycle`（monthly/yearly）
- `paymentStartDate`
- `registeredEmail` / `notes`
- `createdAt` / `updatedAt`

## likes
おすすめの投稿データを保持します。
- `userId` / `userName`
- `title` / `content`
- `date` / `url` / `image`
- `category`
- `createdAt` / `updatedAt`

