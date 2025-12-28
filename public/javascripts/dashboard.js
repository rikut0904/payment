(function () {
  const bars = document.querySelectorAll('.bar-chart__bar');
  bars.forEach((bar) => {
    const value = Number(bar.dataset.height);
    if (Number.isFinite(value)) {
      bar.style.height = `${value}%`;
    }
  });
})();
