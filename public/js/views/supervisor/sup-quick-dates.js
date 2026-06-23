// =========================
// public/js/views/supervisor/sup-quick-dates.js
// FECHAS RÁPIDAS: AYER / HOY / ESTE MES
// =========================

const FMT_DATE_  = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" });
const FMT_MONTH_ = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima", year: "numeric", month: "2-digit" });

// Devuelve YYYY-MM-DD en hora Perú
function peruDate_(offsetDays = 0) {
  return FMT_DATE_.format(new Date(Date.now() + offsetDays * 86_400_000));
}

// Devuelve YYYY-MM en hora Perú
function peruMonth_() {
  const s = FMT_MONTH_.format(new Date()); // e.g. "2026-06"
  return s.slice(0, 7);
}

export function bindSupQuickDates_({ onApply }) {
  document.getElementById("btnSupHoy")?.addEventListener("click", () => {
    const s = peruDate_(0);

    const fromEl = document.getElementById("supFrom");
    const toEl   = document.getElementById("supTo");
    if (fromEl) fromEl.value = s;
    if (toEl)   toEl.value = s;

    const mEl = document.getElementById("supMonth");
    if (mEl) mEl.value = "";

    onApply?.();
  });

  document.getElementById("btnSupAyer")?.addEventListener("click", () => {
    const s = peruDate_(-1);

    const fromEl = document.getElementById("supFrom");
    const toEl   = document.getElementById("supTo");
    if (fromEl) fromEl.value = s;
    if (toEl)   toEl.value = s;

    const mEl = document.getElementById("supMonth");
    if (mEl) mEl.value = "";

    onApply?.();
  });

  document.getElementById("btnSupEsteMes")?.addEventListener("click", () => {
    const m = peruMonth_();

    const mEl = document.getElementById("supMonth");
    if (mEl) mEl.value = m;

    const fromEl = document.getElementById("supFrom");
    const toEl   = document.getElementById("supTo");
    if (fromEl) fromEl.value = "";
    if (toEl)   toEl.value = "";

    onApply?.();
  });
}