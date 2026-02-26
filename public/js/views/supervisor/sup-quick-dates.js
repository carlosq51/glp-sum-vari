// =========================
// public/js/views/supervisor/sup-quick-dates.js
// FECHAS RÁPIDAS: AYER / HOY / ESTE MES
// =========================

function pad2_(n) { return String(n).padStart(2, "0"); }

function toDateInput_(d) {
  const y = d.getFullYear();
  const m = pad2_(d.getMonth() + 1);
  const day = pad2_(d.getDate());
  return `${y}-${m}-${day}`;
}

function toMonthInput_(d) {
  const y = d.getFullYear();
  const m = pad2_(d.getMonth() + 1);
  return `${y}-${m}`;
}

export function bindSupQuickDates_({ onApply }) {
  document.getElementById("btnSupHoy")?.addEventListener("click", () => {
    const now = new Date();
    const s = toDateInput_(now);

    const fromEl = document.getElementById("supFrom");
    const toEl   = document.getElementById("supTo");
    if (fromEl) fromEl.value = s;
    if (toEl)   toEl.value = s;

    const mEl = document.getElementById("supMonth");
    if (mEl) mEl.value = "";

    onApply?.();
  });

  document.getElementById("btnSupAyer")?.addEventListener("click", () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const s = toDateInput_(d);

    const fromEl = document.getElementById("supFrom");
    const toEl   = document.getElementById("supTo");
    if (fromEl) fromEl.value = s;
    if (toEl)   toEl.value = s;

    const mEl = document.getElementById("supMonth");
    if (mEl) mEl.value = "";

    onApply?.();
  });

  document.getElementById("btnSupEsteMes")?.addEventListener("click", () => {
    const now = new Date();
    const m = toMonthInput_(now);

    const mEl = document.getElementById("supMonth");
    if (mEl) mEl.value = m;

    const fromEl = document.getElementById("supFrom");
    const toEl   = document.getElementById("supTo");
    if (fromEl) fromEl.value = "";
    if (toEl)   toEl.value = "";

    onApply?.();
  });
}