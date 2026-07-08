import { Router } from "express";
import { supabaseHeaders_ } from "../lib/supabase.js";

const router = Router();

// ── GET /api/tecnico/cola ─────────────────────────────────────────────
// Devuelve compañeros libres (especialidad par) + VINs disponibles para la especialidad dada
router.get("/api/tecnico/cola", async (req, res) => {
  try {
    const esp = String(req.query.especialidad || "").toUpperCase().trim();
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();
    if (!headers) throw new Error("Supabase no configurado");

    const pairEsp = esp === "MOTOR" ? "TANQUE" : esp === "TANQUE" ? "MOTOR" : null;

    // ── 1. Compañeros libres ───────────────────────────────────────────
    let companeros = [];
    if (pairEsp) {
      const [rComp, rBusy] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/usuarios?rol=eq.TECNICO&especialidad=eq.${pairEsp}&activo=eq.true&select=id,nombre`, { method: "GET", headers }),
        fetch(`${SUPABASE_URL}/rest/v1/asignaciones?rol_trabajo=eq.${pairEsp}&activo=eq.true&estado_actual=neq.FINALIZADO&select=user_id`, { method: "GET", headers }),
      ]);
      const allPairs = rComp.ok ? await rComp.json() : [];
      const busyIds  = new Set((rBusy.ok ? await rBusy.json() : []).map(a => a.user_id));
      companeros = allPairs.filter(u => !busyIds.has(u.id)).map(u => ({ id: u.id, nombre: u.nombre }));
    }

    // ── 2. VINs en proceso: par activo pero mi especialidad libre ──────
    let vins = [];
    if (pairEsp) {
      const [rPairAct, rMyAct] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/asignaciones?rol_trabajo=eq.${pairEsp}&activo=eq.true&estado_actual=neq.FINALIZADO&select=work_order_id,estado_actual,usuarios(nombre),work_orders(id,vin)`, { method: "GET", headers }),
        fetch(`${SUPABASE_URL}/rest/v1/asignaciones?rol_trabajo=eq.${esp}&activo=eq.true&estado_actual=neq.FINALIZADO&select=work_order_id`, { method: "GET", headers }),
      ]);
      const pairRows = rPairAct.ok ? await rPairAct.json() : [];
      const myActIds = new Set((rMyAct.ok ? await rMyAct.json() : []).map(a => a.work_order_id));
      vins = pairRows
        .filter(a => a.work_orders?.vin && !myActIds.has(a.work_order_id))
        .map(a => ({
          vin:     a.work_orders.vin,
          tecnico: a.usuarios?.nombre || "—",
          estado:  a.estado_actual || "",
        }));
    }

    // ── 3. Fallback: VINs sin convertir ───────────────────────────────
    let vinsFallback = [];
    if (!vins.length) {
      const rPend = await fetch(
        `${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CONVERSION&estado_general=eq.PENDIENTE&select=vin&limit=30&order=created_at.asc`,
        { method: "GET", headers }
      );
      const pendRows = rPend.ok ? await rPend.json() : [];
      if (pendRows.length) {
        vinsFallback = pendRows.map(w => ({ vin: w.vin, tecnico: "Sin asignar", estado: "PENDIENTE" }));
      } else {
        const rMovil = await fetch(
          `${SUPABASE_URL}/rest/v1/movilizador_traslados?estado=neq.ENTREGADO_FINAL&select=vin,estado,trasladado_por&limit=30&order=trasladado_at.asc`,
          { method: "GET", headers }
        );
        vinsFallback = (rMovil.ok ? await rMovil.json() : []).map(t => ({
          vin:     t.vin,
          tecnico: t.trasladado_por || "Movilizador",
          estado:  t.estado || "EN ESPERA",
        }));
      }
    }

    return res.json({ ok: true, companeros, vins, vinsFallback, fallbackUsed: !vins.length, especialidad: esp, pairEsp: pairEsp || null });
  } catch (e) {
    console.error("[GET /api/tecnico/cola]", e.message);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ── GET /api/tecnico/equipo-stats ────────────────────────────────────────────
// Compara por tasa diaria (conv / días trabajados) solo entre técnicos activos
// para una comparación justa (excluye inactivos con 0 conversiones).
router.get("/api/tecnico/equipo-stats", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const esp = String(req.query.especialidad || "").toUpperCase();
    if (!["MOTOR", "TANQUE"].includes(esp))
      return res.json({ ok: true, avgDailyRate: 0, activeTechs: 0, totalTechs: 0 });

    const now = new Date();
    const day = now.getDay();
    const daysBack = day === 0 ? 6 : day - 1;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack);
    const mondaySince = monday.toISOString().split("T")[0] + "T00:00:00";

    const rUsers = await fetch(
      `${SUPABASE_URL}/rest/v1/usuarios?rol=eq.TECNICO&especialidad=eq.${esp}&activo=eq.true&select=id`,
      { method: "GET", headers: supabaseHeaders_() }
    );
    const users = rUsers.ok ? await rUsers.json() : [];
    if (!users.length) return res.json({ ok: true, avgDailyRate: 0, activeTechs: 0, totalTechs: 0 });

    // Fetch with updated_at so we can count distinct working days per tech
    const rFin = await fetch(
      `${SUPABASE_URL}/rest/v1/asignaciones?rol_trabajo=eq.${esp}&estado_actual=eq.FINALIZADO&updated_at=gte.${encodeURIComponent(mondaySince)}&select=user_id,updated_at&limit=5000`,
      { method: "GET", headers: supabaseHeaders_() }
    );
    const finRows = rFin.ok ? await rFin.json() : [];

    // Group by user: count finalizadas + distinct working days
    const byUser = {};
    for (const row of finRows) {
      if (!byUser[row.user_id]) byUser[row.user_id] = { count: 0, days: new Set() };
      byUser[row.user_id].count++;
      if (row.updated_at) byUser[row.user_id].days.add(row.updated_at.split("T")[0]);
    }

    // Daily rate per active tech (only those with >= 1 conversion this week)
    const rates = Object.values(byUser).map(u => u.count / Math.max(u.days.size, 1));
    const activeTechs = rates.length;
    const avgDailyRate = activeTechs
      ? Math.round((rates.reduce((s, r) => s + r, 0) / activeTechs) * 10) / 10
      : 0;
    const medianDailyRate = activeTechs
      ? (() => { const s = [...rates].sort((a,b) => a-b); const m = Math.floor(s.length/2); return s.length % 2 ? s[m] : (s[m-1]+s[m])/2; })()
      : 0;

    return res.json({
      ok: true,
      avgDailyRate,
      medianDailyRate: Math.round(medianDailyRate * 10) / 10,
      activeTechs,
      totalTechs: users.length,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

export default router;
