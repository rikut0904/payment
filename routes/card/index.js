var express = require('express');
var router = express.Router();
var {
  createCard,
  listCardsByUser,
  getCardById,
  updateCard,
  deleteCard,
  listSubscriptionsByUser,
} = require('../../lib/firestoreCards');
var { getExchangeRates, convertToJpy } = require('../../lib/exchangeRates');
var {
  CARD_TYPE_LABELS,
  CARD_TYPE_OPTIONS,
  SUPPORTED_CARD_BRANDS,
  SUPPORTED_CURRENCIES,
} = require('./constants');
var {
  formatCurrency,
  formatDateForDisplay,
  formatDayDisplay,
  formatIsoDate,
  normalizeCardType,
  parseDateInput,
  startOfDay,
} = require('./utils');
var {
  buildUpcomingPaymentMonths,
  calculateUpcomingPayments,
  computeNextPaymentDate,
  groupSubscriptionsByCard,
  summarizeMonthlyTotals,
} = require('./payments');
var { consumeFlashMessage, setFlashMessage } = require('./message');
var { validateCardPayload } = require('./validators');
var { asyncHandler, renderAddCardPage, renderEditCardPage } = require('./helpers');

// カード一覧ページのGETルート
router.get(
  '/',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }

    // ステップ1: 必要なデータを並列取得
    const exchangeRatesPromise = getExchangeRates().catch((err) => {
      console.error('Failed to load exchange rates', err);
      return null; // 為替レート取得失敗時はnullを返す（換算しない）
    });
    const [cards, subscriptions, exchangeRates] = await Promise.all([
      listCardsByUser(sessionUid),
      listSubscriptionsByUser(sessionUid),
      exchangeRatesPromise,
    ]);

    // ステップ2: カードデータの正規化
    const referenceDate = startOfDay(new Date()); // 今日の日付（時刻は00:00:00）

    // カード種別を正規化し、表示ラベルを追加
    const normalizedCards = cards.map((card) => {
      const cardType = normalizeCardType(card.cardType); // 'credit' or 'debit'
      return Object.assign({}, card, {
        cardType,
        cardTypeLabel: CARD_TYPE_LABELS[cardType] || 'クレジットカード', // 表示用ラベル
      });
    });

    // カードIDをキーとしたMapを作成（高速検索用）
    const cardMap = new Map(normalizedCards.map((card) => [card.id, card]));

    // ステップ3: サブスクをカードごとにグループ化
    // 例: { 'card-id-1': [sub1, sub2], 'card-id-2': [sub3] }
    const groupedSubscriptions = groupSubscriptionsByCard(subscriptions);
    // ステップ4: 各カードにサブスク情報と合計金額を付与
    const cardsWithSubscriptions = normalizedCards.map((card) => {
      // このカードに紐づくサブスクリプションを取得
      const relatedSubscriptions = groupedSubscriptions.get(card.id) || [];

      // 為替換算の警告フラグ
      let conversionWarning = false;

      // このカードのサブスク合計金額を計算（JPYに換算）
      const totalAmount = relatedSubscriptions.reduce((sum, sub) => {
        const amount = Number(sub.amount) || 0;
        if (!Number.isFinite(amount) || amount <= 0) {
          return sum; // 無効な金額はスキップ
        }

        const normalizedCurrency = (sub.currency || 'JPY').toUpperCase();

        // JPYの場合はそのまま加算
        if (normalizedCurrency === 'JPY') {
          return sum + amount;
        }

        // 為替レート取得失敗時は換算せず警告フラグを立てる
        if (!exchangeRates) {
          conversionWarning = true;
          return sum + amount; // 元の金額のまま加算
        }

        // 外貨をJPYに換算
        const converted = convertToJpy(amount, normalizedCurrency, exchangeRates);
        if (converted === null) {
          conversionWarning = true; // 換算失敗
          return sum + amount; // 元の金額のまま加算
        }

        return sum + converted; // 換算後の金額を加算
      }, 0);

      // カードオブジェクトに表示用データを追加
      return Object.assign({}, card, {
        // カード情報の表示用フォーマット
        billingDayDisplay: formatDayDisplay(card.billingDay),   // 請求日
        closingDayDisplay: formatDayDisplay(card.closingDay),   // 締め日
        paymentDayDisplay: formatDayDisplay(card.paymentDay),   // 支払日
        limitAmountDisplay: card.limitAmount ? formatCurrency(card.limitAmount, 'JPY') : '未設定',

        // サブスクリプション情報（表示用にフォーマット）
        subscriptions: relatedSubscriptions.map((sub) => {
          const startDate = parseDateInput(sub.paymentStartDate);
          const nextPaymentDate = computeNextPaymentDate(sub, card, referenceDate); // 次回支払日を計算

          return Object.assign({}, sub, {
            paymentStartDateDisplay: startDate ? formatDateForDisplay(startDate) : '未設定',
            formattedAmount: formatCurrency(Number(sub.amount) || 0, sub.currency || 'JPY'),
            cycleLabel: sub.cycle === 'yearly' ? '年額' : '月額',
            registeredEmail: sub.registeredEmail || '',
            nextPaymentDisplay: nextPaymentDate ? formatDateForDisplay(nextPaymentDate) : '今後の予定なし',
          });
        }),

        // このカードのサブスク合計
        subscriptionTotal: totalAmount,                           // 数値
        formattedSubscriptionTotal: formatCurrency(totalAmount, 'JPY'), // フォーマット済み
        conversionWarning,                                        // 為替換算警告フラグ
      });
    });
    // ステップ5: 未紐づけサブスクリプションを抽出
    // カードが削除されたり、cardIdが無効なサブスクを表示
    const unlinkedSubscriptions = subscriptions
      .filter((sub) => !cardMap.has(sub.cardId)) // カードMapに存在しない
      .map((sub) => {
        const startDate = parseDateInput(sub.paymentStartDate);
        return Object.assign({}, sub, {
          formattedAmount: formatCurrency(Number(sub.amount) || 0, sub.currency || 'JPY'),
          paymentStartDateDisplay: startDate ? formatDateForDisplay(startDate) : '未設定',
        });
      });

    // ステップ6: 今月以降の支払予定カレンダーを作成
    const summaryStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1); // 今月1日

    // 今月以降の支払予定を計算
    const summaryPayments = calculateUpcomingPayments(subscriptions, cardMap, {
      startDateLimit: summaryStart // 今月1日から
    }).map((payment) =>
      Object.assign({}, payment, {
        formattedAmount: formatCurrency(payment.amount, payment.currency), // 金額フォーマット
      })
    );

    // 月別の合計を集計（外貨をJPYに換算）
    const monthlyTotalsRaw = summarizeMonthlyTotals(summaryPayments, exchangeRates);

    // 支払予定がある月のリストを構築
    const upcomingPaymentMonths = buildUpcomingPaymentMonths(summaryPayments);

    // 各月のデータを整形（支払いがない月は0円として扱う）
    const monthlyTotals = upcomingPaymentMonths.map((month) => {
      const matched = monthlyTotalsRaw.find((item) => item.monthKey === month.monthKey);
      if (matched) {
        return matched; // 支払いがある月
      }
      // 支払いがない月は0円
      return {
        monthKey: month.monthKey,
        monthLabel: month.monthLabel,
        totalAmount: 0,
        formattedTotal: formatCurrency(0, 'JPY'),
      };
    });
    // ステップ7: フラッシュメッセージを取得
    // カード追加・編集・削除後の成功/失敗メッセージを取得
    const message = consumeFlashMessage(req, res);
    const noticeMessage = message?.type === 'success' ? message.message : '';
    const errorMessage = message?.type === 'error' ? message.message : '';

    // ステップ8: テンプレートにデータを渡してレンダリング
    res.render('card/index', {
      title: '支払情報管理',
      projectName: 'Payment',
      firebaseConfig: req.app.locals.firebaseConfig,
      // カードデータ
      cards: cardsWithSubscriptions,         // カード一覧（サブスク情報付き）
      unlinkedSubscriptions,                 // 未紐づけサブスクリプション
      // 支払予定カレンダー
      upcomingPaymentMonths,                 // 支払予定がある月のリスト
      monthlyTotals,                         // 各月の合計額
      // マスターデータ
      cardBrands: SUPPORTED_CARD_BRANDS,     // サポート中のカードブランド
      currencies: SUPPORTED_CURRENCIES,      // サポート中の通貨
      // メッセージ
      notice: noticeMessage,                 // 成功メッセージ
      error: errorMessage,                   // エラーメッセージ
    });
  })
);

// カード追加フォームのGETルート
router.get(
  '/add',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }
    // カード追加フォームをレンダリング（helpers.jsで定義）
    renderAddCardPage(req, res);
  })
);

// カード追加のPOSTルート
router.post(
  '/add',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }

    // フォームデータのバリデーション
    const { payload, formValues, errorMessage } = validateCardPayload(req.body);

    // バリデーションエラー時はフォームを再表示
    if (errorMessage) {
      return renderAddCardPage(req, res, {
        errorMessage,      // エラーメッセージ
        formValues,        // ユーザーが入力した値（再入力の手間を省く）
        statusCode: 400,   // Bad Request
      });
    }

    // Firestoreにカードを作成
    await createCard({
      userId: sessionUid,
      ...payload, // カード名、ブランド、下4桁、締め日、支払日など
    });

    // 成功メッセージをフラッシュメッセージとして保存（次のページで表示）
    setFlashMessage(res, 'success', 'カードを登録しました。');

    // カード一覧ページにリダイレクト
    res.redirect('/card');
  })
);

// カード編集フォームのGETルート
router.get(
  '/edit/:id',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }

    const cardId = req.params.id;

    // Firestoreからカード情報を取得
    const card = await getCardById(cardId);

    // カードが存在しない、または所有者が異なる場合
    if (!card || card.userId !== sessionUid) {
      setFlashMessage(res, 'error', '指定されたカードが存在しません。');
      return res.redirect('/card');
    }

    // 編集フォームをレンダリング（既存値を入力欄に表示）
    renderEditCardPage(req, res, {
      formValues: Object.assign({}, card, {
        id: card.id,
        billingDay: card.billingDay || '',
        closingDay: card.closingDay || '',
        paymentDay: card.paymentDay || '',
        cardType: normalizeCardType(card.cardType),
      }),
    });
  })
);

// カード編集のPOSTルート
router.post(
  '/edit/:id',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }

    const cardId = req.params.id;

    // カードの存在と所有者を確認
    const existingCard = await getCardById(cardId);
    if (!existingCard || existingCard.userId !== sessionUid) {
      setFlashMessage(res, 'error', '指定されたカードが存在しません。');
      return res.redirect('/card');
    }

    // フォームデータのバリデーション
    const { payload, formValues, errorMessage } = validateCardPayload(req.body, {
      formValuesBase: { id: cardId }, // エラー時の再表示用にIDを保持
    });

    // バリデーションエラー時はフォームを再表示
    if (errorMessage) {
      return renderEditCardPage(req, res, {
        errorMessage,
        formValues,
        statusCode: 400,
      });
    }

    // Firestoreのカード情報を更新
    await updateCard({
      id: cardId,
      userId: sessionUid,
      ...payload,
    });

    // 成功メッセージを設定
    setFlashMessage(res, 'success', 'カードを更新しました。');

    // カード一覧ページにリダイレクト
    res.redirect('/card');
  })
);

// カード削除のPOSTルート
// 注意: 紐づくサブスクリプションは削除されません
// → カード削除後、サブスクは「未紐づけサブスクリプション」として表示される
router.post(
  '/delete/:id',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }

    const cardId = req.params.id;

    try {
      // Firestoreからカードを削除（所有者確認を含む）
      await deleteCard(cardId, sessionUid);
      setFlashMessage(res, 'success', 'カードを削除しました。');
    } catch (err) {
      console.error('Failed to delete card', err);
      setFlashMessage(res, 'error', 'カードの削除に失敗しました。');
    }

    // カード一覧ページにリダイレクト
    res.redirect('/card');
  })
);

module.exports = router;
