// public/js/cart.js
(function () {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const fmt = n => Number(n||0).toFixed(2);

  const form = $("#cartForm");
  if (!form) return;

  // Debounced submit after qty changes
  let t;
  const submitSoon = () => {
    clearTimeout(t);
    t = setTimeout(() => form.requestSubmit(), 300);
  };

  // Update the visible line total immediately (cosmetic; server still recomputes on submit)
  const recalcLine = (row) => {
    const priceCell = row.querySelector("td:nth-child(2)");
    const unit = priceCell ? Number((priceCell.textContent || "").replace(/[^\d.]/g,'')) : 0;
    const qty = Number($(".qty-input", row)?.value || 0);
    const lineEl = $("[data-line-total]", row);
    if (lineEl) lineEl.textContent = fmt(unit * qty);
  };

  // Wire every row
  $$(".cart-row").forEach((row) => {
    const dec = $(".qty-dec", row);
    const inc = $(".qty-inc", row);
    const input = $(".qty-input", row);

    inc && inc.addEventListener("click", () => {
      const next = Math.max(0, Number(input.value || 0) + 1);
      input.value = next;
      recalcLine(row);
      submitSoon();
    });

    dec && dec.addEventListener("click", () => {
      const next = Math.max(0, Number(input.value || 0) - 1);
      input.value = next;
      recalcLine(row);
      submitSoon();
    });

    input && input.addEventListener("input", () => {
      recalcLine(row);
      submitSoon();
    });

    // Optional confirm on remove; uses your existing button name/value
    const removeBtn = row.querySelector('button[name="removeId"]');
    removeBtn && removeBtn.addEventListener("click", (e) => {
      if (!confirm("Remove this item?")) e.preventDefault();
    });
  });
})();
