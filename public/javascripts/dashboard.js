// ============================================================
// ダッシュボードグラフの描画処理
// ============================================================
// 機能: 棒グラフの高さをdata属性から読み取り、CSSで設定する
//
// 処理フロー:
// 1. EJSテンプレート（views/dashboard/index.ejs）で各棒に data-height 属性を設定
//    例: <div class="bar-chart__bar" data-height="75"></div>
// 2. このスクリプトが data-height の値を読み取る
// 3. 読み取った値を CSS の height プロパティに設定
//    例: bar.style.height = "75%"
// 4. ブラウザがCSSアニメーションと合わせて棒グラフを表示
//
// なぜdata属性を使うのか:
// - サーバー側（EJS）で計算した高さの値をクライアント側（JavaScript）に渡すため
// - HTML属性として埋め込むことで、JavaScriptが簡単に値を取得できる
// - CSSアニメーションと組み合わせることで、滑らかな表示が可能
// ============================================================
(function () {
  // すべての棒グラフ要素を取得
  const bars = document.querySelectorAll('.bar-chart__bar');

  // 各棒グラフに対して高さを設定
  bars.forEach((bar) => {
    // data-height属性から高さの値を取得（例: "75"）
    const value = Number(bar.dataset.height);

    // 値が有効な数値の場合のみ設定
    if (Number.isFinite(value)) {
      // CSSのheightプロパティに設定（例: "75%"）
      bar.style.height = `${value}%`;
    }
  });
})();
