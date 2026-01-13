var express = require('express');
var router = express.Router();
var {
  createSubscription,
  getCardById,
  getSubscriptionById,
  updateSubscription,
  updateSubscriptionCard,
  deleteSubscription,
} = require('../../lib/firestoreCards');
var { CARD_TYPE_LABELS } = require('./constants');
var {
  formatCurrency,
  formatDateForDisplay,
  formatIsoDate,
  normalizeCardType,
  parseDateInput,
  startOfDay,
} = require('./utils');
var { computeNextPaymentDate } = require('./payments');
var { setFlashMessage } = require('./message');
var { validateSubscriptionPayload } = require('./validators');
var {
  asyncHandler,
  fetchUserCardsWithMeta,
  renderSubscriptionFormPage,
  resolveRedirect,
} = require('./helpers');

// ============================================================
// サブスクリプション追加フォームのGETルート
// ============================================================
// 機能: サブスクリプション追加フォームを表示
// 前提条件: カードが1枚以上登録されていること
router.get(
  '/',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }

    // ユーザーのカード一覧を取得
    const cards = await fetchUserCardsWithMeta(sessionUid);

    // カードが1枚も登録されていない場合はエラー
    if (!cards.length) {
      setFlashMessage(res, 'error', 'サブスクリプションを追加するには先にカードを登録してください。');
      return res.redirect('/card');
    }

    // フォームのデフォルト値を設定
    const defaultValues = {
      cardId: req.query.cardId || (cards[0]?.id || ''),  // クエリパラメータまたは最初のカード
      currency: 'JPY',                                    // デフォルト通貨は日本円
      cycle: 'monthly',                                   // デフォルトは月額
      paymentStartDate: formatIsoDate(new Date()),        // デフォルトは今日
    };

    // サブスク追加フォームをレンダリング
    renderSubscriptionFormPage(req, res, {
      cards,                  // カード一覧（ドロップダウン用）
      formValues: defaultValues,
    });
  })
);

// ============================================================
// サブスクリプション追加のPOSTルート
// ============================================================
// 機能: フォームから送信されたデータを検証し、サブスクを作成
// 処理フロー:
// 1. カードの存在確認
// 2. バリデーション（validators.jsで定義）
// 3. Firestoreにサブスク追加（lib/firestoreCards.jsで定義）
// 4. フラッシュメッセージを設定
// 5. カード一覧ページにリダイレクト
router.post(
  '/',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }

    // ユーザーのカード一覧を取得
    const cards = await fetchUserCardsWithMeta(sessionUid);

    // カードが1枚も登録されていない場合はエラー
    if (!cards.length) {
      setFlashMessage(res, 'error', 'サブスクリプションを追加するには先にカードを登録してください。');
      return res.redirect('/card');
    }

    // フォームデータのバリデーション
    const { payload, formValues, errorMessage } = await validateSubscriptionPayload(req.body, {
      cards,      // カード一覧（cardIdの検証用）
      sessionUid, // ユーザーID（所有者確認用）
    });

    // バリデーションエラー時はフォームを再表示
    if (errorMessage) {
      return renderSubscriptionFormPage(req, res, {
        cards,
        errorMessage,      // エラーメッセージ
        formValues,        // ユーザーが入力した値
        statusCode: 400,   // Bad Request
      });
    }

    // Firestoreにサブスクリプションを作成
    await createSubscription({
      userId: sessionUid,
      ...payload, // サービス名、金額、通貨、サイクル、開始日など
    });

    // 成功メッセージを設定
    setFlashMessage(res, 'success', 'サブスクリプションを追加しました。');

    // カード一覧ページにリダイレクト
    res.redirect('/card');
  })
);

// ============================================================
// サブスクリプション詳細のGETルート
// ============================================================
// 機能: サブスクリプションの詳細情報を表示
// - サービス名、金額、サイクル、登録メールアドレス
// - 紐づくカード情報
// - 次回支払予定日
router.get(
  '/:id',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }

    const subscriptionId = req.params.id;

    // Firestoreからサブスク情報を取得
    const subscription = await getSubscriptionById(subscriptionId);

    // サブスクが存在しない、または所有者が異なる場合
    if (!subscription || subscription.userId !== sessionUid) {
      setFlashMessage(res, 'error', '指定されたサブスクリプションが存在しません。');
      return res.redirect('/card');
    }

    // 紐づくカード情報を取得
    const fetchedCard = subscription.cardId ? await getCardById(subscription.cardId) : null;
    const card = fetchedCard && fetchedCard.userId === sessionUid ? fetchedCard : null;

    // カード情報を表示用に整形
    const normalizedCard = card
      ? {
          id: card.id,
          cardName: card.cardName,
          cardTypeLabel: CARD_TYPE_LABELS[normalizeCardType(card.cardType)] || 'クレジットカード',
          last4Digits: card.last4Digits || '----',
        }
      : null;

    // 次回支払予定日を計算
    const startDate = parseDateInput(subscription.paymentStartDate);
    const nextPaymentDate = computeNextPaymentDate(subscription, card, startOfDay(new Date()));

    // サブスク情報を表示用に整形
    const detail = {
      id: subscription.id,
      serviceName: subscription.serviceName,
      amount: Number(subscription.amount) || 0,
      formattedAmount: formatCurrency(Number(subscription.amount) || 0, subscription.currency || 'JPY'),
      currency: (subscription.currency || 'JPY').toUpperCase(),
      cycleLabel: subscription.cycle === 'yearly' ? '年額' : '月額',
      registeredEmail: subscription.registeredEmail || '',
      paymentStartDateDisplay: startDate ? formatDateForDisplay(startDate) : '未設定',
      notes: subscription.notes || '',
      nextPaymentDisplay: nextPaymentDate ? formatDateForDisplay(nextPaymentDate) : '今後の予定なし',
    };

    // サブスク詳細ページをレンダリング
    res.render('card/detail', {
      title: 'サブスクリプション詳細',
      projectName: 'Payment',
      firebaseConfig: req.app.locals.firebaseConfig,
      subscription: detail,     // サブスク情報
      card: normalizedCard,     // カード情報（未紐づけの場合はnull）
    });
  })
);

// ============================================================
// サブスクリプション編集フォームのGETルート
// ============================================================
// 機能: 既存のサブスクリプション情報を取得し、編集フォームを表示
// 処理フロー:
// 1. サブスクの存在と所有者を確認
// 2. カードが1枚以上登録されているか確認
// 3. リダイレクト先URLを安全に解決（XSS対策）
// 4. 既存値をフォームに表示
router.get(
  '/:id/edit',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }

    const subscriptionId = req.params.id;

    // サブスクの存在と所有者を確認
    const subscription = await getSubscriptionById(subscriptionId);
    if (!subscription || subscription.userId !== sessionUid) {
      setFlashMessage(res, 'error', '指定されたサブスクリプションが存在しません。');
      return res.redirect('/card');
    }

    // カードが1枚以上登録されているか確認
    const cards = await fetchUserCardsWithMeta(sessionUid);
    if (!cards.length) {
      setFlashMessage(res, 'error', 'サブスクリプションを編集するにはカードが必要です。');
      return res.redirect('/card');
    }

    // リダイレクト先URLの解決（キャンセル時や更新成功時の遷移先）
    // resolveRedirectはXSS対策として、信頼できるパスのみを許可
    const redirectRaw = typeof req.query.redirect === 'string' ? req.query.redirect : '';
    const safeRedirect = resolveRedirect(redirectRaw, `/card/subscription/${subscription.id}`);

    // フォームのアクションURLとキャンセルボタンのURL
    const formAction = `/card/subscription/${subscription.id}/edit`;
    const cancelUrl = safeRedirect || `/card/subscription/${subscription.id}`;

    // 既存のサブスク情報をフォームの初期値として設定
    const formValues = {
      cardId: subscription.cardId,
      serviceName: subscription.serviceName,
      amount: subscription.amount,
      currency: (subscription.currency || 'JPY').toUpperCase(),
      cycle: subscription.cycle || 'monthly',
      registeredEmail: subscription.registeredEmail || '',
      paymentStartDate: formatIsoDate(subscription.paymentStartDate), // YYYY-MM-DD形式に変換
      notes: subscription.notes || '',
    };

    // サブスク編集フォームをレンダリング
    renderSubscriptionFormPage(req, res, {
      cards,                    // カード一覧（ドロップダウン用）
      formValues,               // 既存値
      isEdit: true,             // 編集モードフラグ
      formAction,               // フォーム送信先
      cancelUrl,                // キャンセルボタンの遷移先
      redirectPath: safeRedirect, // 成功時のリダイレクト先（hiddenフィールド用）
    });
  })
);

// ============================================================
// サブスクリプション編集のPOSTルート
// ============================================================
// 機能: フォームから送信されたデータを検証し、サブスクを更新
// 処理フロー:
// 1. サブスクの存在と所有者を確認
// 2. カードの存在を確認
// 3. バリデーション（validators.jsで定義）
// 4. Firestoreのサブスク情報を更新（lib/firestoreCards.jsで定義）
// 5. フラッシュメッセージを設定
// 6. 元のページまたはサブスク詳細にリダイレクト
router.post(
  '/:id/edit',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }

    const subscriptionId = req.params.id;

    // サブスクの存在と所有者を確認
    const existingSubscription = await getSubscriptionById(subscriptionId);
    if (!existingSubscription || existingSubscription.userId !== sessionUid) {
      setFlashMessage(res, 'error', '指定されたサブスクリプションが存在しません。');
      return res.redirect('/card');
    }

    // カードの存在を確認（紐づけカードの所有者確認のため）
    const cards = await fetchUserCardsWithMeta(sessionUid);
    if (!cards.length) {
      setFlashMessage(res, 'error', 'カードが登録されていません。');
      return res.redirect('/card');
    }

    // リダイレクト先URLの解決（クエリパラメータまたはボディから取得）
    const redirectRawQuery = typeof req.query.redirect === 'string' ? req.query.redirect : '';
    const redirectRawBody = typeof req.body.redirect === 'string' ? req.body.redirect : '';
    const safeRedirect = resolveRedirect(redirectRawBody || redirectRawQuery, `/card/subscription/${subscriptionId}`);

    // フォーム再表示用のURL
    const formAction = `/card/subscription/${subscriptionId}/edit`;
    const cancelUrl = safeRedirect || `/card/subscription/${subscriptionId}`;
    const successRedirect = safeRedirect || `/card/subscription/${subscriptionId}`;

    // バリデーションエラー時の再描画ヘルパー関数
    const renderError = (message, formValues) =>
      renderSubscriptionFormPage(req, res, {
        cards,
        errorMessage: message,
        formValues,               // ユーザーが入力した値（再入力の手間を省く）
        statusCode: 400,          // Bad Request
        isEdit: true,
        formAction,
        cancelUrl,
        redirectPath: safeRedirect,
      });

    // フォームデータのバリデーション
    const { payload, formValues, errorMessage } = await validateSubscriptionPayload(req.body, {
      cards,      // カード一覧（cardIdの検証用）
      sessionUid, // ユーザーID（所有者確認用）
    });

    // バリデーションエラー時はフォームを再表示
    if (errorMessage) {
      return renderError(errorMessage, formValues);
    }

    // Firestoreのサブスク情報を更新
    await updateSubscription({
      id: subscriptionId,
      userId: sessionUid,
      ...payload, // サービス名、金額、通貨、サイクル、開始日など
    });

    // 成功メッセージを設定
    setFlashMessage(res, 'success', 'サブスクリプションを更新しました。');

    // 元のページまたはサブスク詳細にリダイレクト
    res.redirect(successRedirect);
  })
);

// ============================================================
// サブスクリプション紐づけカード変更のPOSTルート
// ============================================================
// 機能: サブスクリプションに紐づくカードを別のカードに変更
// 使用場面: カードを削除した後、未紐づけサブスクを別のカードに再紐付け
// 処理フロー:
// 1. リダイレクト先URLを解決
// 2. 紐づけ先カードIDの入力チェック
// 3. サブスクの存在と所有者を確認
// 4. 紐づけ先カードの存在と所有者を確認
// 5. Firestoreのサブスク情報を更新（cardIdフィールドのみ）
// 6. フラッシュメッセージを設定
// 7. 元のページにリダイレクト
router.post(
  '/:id/relink',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }

    const subscriptionId = req.params.id;

    // リダイレクト先URLの解決（カード一覧ページなど）
    const redirectTarget = resolveRedirect(req.body.redirect, '/card');

    // 紐づけ先カードIDの入力チェック
    const cardId = (req.body.cardId || '').trim();
    if (!cardId) {
      setFlashMessage(res, 'error', '紐づけ先のカードを選択してください。');
      return res.redirect(redirectTarget);
    }

    // サブスクの存在と所有者を確認
    const subscription = await getSubscriptionById(subscriptionId);
    if (!subscription || subscription.userId !== sessionUid) {
      setFlashMessage(res, 'error', '指定されたサブスクリプションが存在しません。');
      return res.redirect('/card');
    }

    // 紐づけ先カードの存在と所有者を確認
    const card = await getCardById(cardId);
    if (!card || card.userId !== sessionUid) {
      setFlashMessage(res, 'error', '指定されたカードが存在しません。');
      return res.redirect(redirectTarget);
    }

    // Firestoreのサブスク情報を更新（cardIdフィールドのみ更新）
    try {
      await updateSubscriptionCard({
        id: subscriptionId,
        userId: sessionUid,
        cardId, // 新しい紐づけ先カードID
      });
      setFlashMessage(res, 'success', 'サブスクリプションを紐づけました。');
    } catch (err) {
      console.error('Failed to relink subscription', err);
      setFlashMessage(res, 'error', 'サブスクリプションの紐づけに失敗しました。');
    }

    // 元のページにリダイレクト
    res.redirect(redirectTarget);
  })
);

// ============================================================
// サブスクリプション削除のPOSTルート
// ============================================================
// 機能: サブスクリプションをFirestoreから削除
// 処理フロー:
// 1. 所有者確認（lib/firestoreCards.jsのdeleteSubscription内で実行）
// 2. Firestoreからサブスクを削除
// 3. フラッシュメッセージを設定
// 4. カード一覧ページにリダイレクト
//
// 注意: 紐づくカードは削除されません
// → サブスク削除後も、カードは残り続ける
router.post(
  '/:id/delete',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }

    const subscriptionId = req.params.id;

    try {
      // Firestoreからサブスクを削除（所有者確認を含む）
      await deleteSubscription(subscriptionId, sessionUid);
      setFlashMessage(res, 'success', 'サブスクリプションを削除しました。');
    } catch (err) {
      console.error('Failed to delete subscription', err);
      setFlashMessage(res, 'error', 'サブスクリプションの削除に失敗しました。');
    }

    // カード一覧ページにリダイレクト
    res.redirect('/card');
  })
);

module.exports = router;
