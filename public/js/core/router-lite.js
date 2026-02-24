// =========================
// public/js/core/router-lite.js
// Router ultra simple (enter/exit por vista)
// =========================
const reg = new Map(); // name -> {enter, exit}
let current = null;

function register(name, enter, exit) {
  reg.set(String(name || "").toUpperCase(), { enter, exit });
}

function open(name) {
  const key = String(name || "").toUpperCase();
  if (current?.exit) {
    try { current.exit(); } catch {}
  }
  const v = reg.get(key);
  if (v?.enter) {
    try { v.enter(); } catch {}
  }
  current = v || null;
}

open.register = register;

export { open as openView };