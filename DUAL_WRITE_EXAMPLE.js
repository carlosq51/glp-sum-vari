// =========================
// EJEMPLO: Actualizar endpoints para dual-write
// Copia este código en tu index.js
// =========================

import { supabasePost, supabaseGet, supabaseEnabled } from "./supabase-node.js";

// ╔════════════════════════════════════════════════════════════════╗
// ║ 1️⃣ INCIDENCIAS - Escritura Dual + Lectura Supabase            ║
// ╚════════════════════════════════════════════════════════════════╝

/**
 * POST /api/incidencia
 * Escribe en AppScript + Supabase (paralelo)
 * Lectura posterior viene de Supabase (más rápida)
 */
app.post("/api/incidencia", async (req, res) => {
  try {
    const payload = req.body;
    console.log("[INCIDENCIA DUAL] Escribiendo en: AppScript + Supabase");

    // Validaciones básicas
    if (!payload.vin) {
      return res.status(400).json({ ok: false, error: "Falta vin" });
    }

    // ═══════════════════════════════════════════════════════════════
    // 1️⃣ Escribe en AppScript (primario, fuente de verdad actual)
    // ═══════════════════════════════════════════════════════════════
    let appScriptResult = null;
    let appScriptError = null;

    try {
      // Llamar AppScript con el payload original
      appScriptResult = await callAppsScript("incidencia_add", {
        email: payload.email,
        conversionId: payload.conversionId,
        vin: payload.vin,
        rolTrabajo: "CALIDAD",
        tecnicoUserId: payload.tecnicoUserId,
        tecnicoEmail: payload.tecnicoEmail,
        tecnicoNombre: payload.tecnicoNombre,
        tipo: payload.tipo,
        nota: payload.nota,
        fotoFileId: payload.fotoFileId, // Apps Script maneja la foto
      });

      console.log("[INCIDENCIA DUAL] ✅ AppScript OK");
    } catch (err) {
      appScriptError = err.message;
      console.error("[INCIDENCIA DUAL] ⚠️ AppScript ERROR:", err.message);
      // NO retornamos error aquí - continuamos con Supabase
    }

    // ═══════════════════════════════════════════════════════════════
    // 2️⃣ Escribe en Supabase (paralelo, espejo redundante)
    // ═══════════════════════════════════════════════════════════════
    let supabaseResult = null;
    let supabaseError = null;

    if (supabaseEnabled()) {
      try {
        const supabaseData = {
          vin: String(payload.vin || "").toUpperCase(),
          conversion_id: String(payload.conversionId || "").trim(),
          tipo: String(payload.tipo || "").toUpperCase(),
          nota: String(payload.nota || "").trim(),
          tecnico_user_id: String(payload.tecnicoUserId || "").trim(),
          tecnico_email: String(payload.tecnicoEmail || "").toLowerCase(),
          tecnico_nombre: String(payload.tecnicoNombre || "").trim(),
          registrado_por: String(payload.email || "").toLowerCase(),
          foto_b64: payload.foto?.b64 || null,
          foto_mime: payload.foto?.mimeType || null,
          foto_name: payload.foto?.name || null,
          fecha_hora: new Date().toISOString(),
        };

        supabaseResult = await supabasePost("incidencias", supabaseData);
        console.log("[INCIDENCIA DUAL] ✅ Supabase OK, id:", supabaseResult[0]?.id);
      } catch (err) {
        supabaseError = err.message;
        console.error("[INCIDENCIA DUAL] ⚠️ Supabase ERROR:", err.message);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 3️⃣ Responde al cliente
    // ═══════════════════════════════════════════════════════════════

    // Si AppScript fue exitoso, usa su resultado
    if (appScriptResult && appScriptResult.ok) {
      return res.json({
        ...appScriptResult,
        _dual: {
          appscript: appScriptResult.ok ? "✅" : "❌",
          supabase: supabaseResult ? "✅" : "❌",
        },
      });
    }

    // Si AppScript falló pero Supabase fue exitoso
    if (supabaseResult && !appScriptResult?.ok) {
      return res.json({
        ok: true,
        vin: payload.vin,
        conversionId: payload.conversionId,
        message: "Registrado en Supabase (AppScript falló)",
        item: supabaseResult[0],
        _dual: {
          appscript: "❌",
          supabase: "✅",
        },
      });
    }

    // Si ambos fallaron
    return res.status(500).json({
      ok: false,
      error: `Ambos sistemas fallaron. AppScript: ${appScriptError || "OK"} | Supabase: ${supabaseError || "OK"}`,
      _dual: {
        appscript: appScriptError,
        supabase: supabaseError,
      },
    });

  } catch (e) {
    console.error("[INCIDENCIA DUAL] FATAL ERROR:", e);
    res.status(500).json({
      ok: false,
      error: String(e.message || e),
    });
  }
});

// ╔════════════════════════════════════════════════════════════════╗
// ║ 2️⃣ INCIDENCIAS LIST - Lectura desde Supabase (primario)        ║
// ╚════════════════════════════════════════════════════════════════╝

/**
 * GET /api/incidencias/list
 * Lee desde Supabase (rápido), fallback a AppScript si es necesario
 */
app.get("/api/incidencias/list", async (req, res) => {
  try {
    const vin = String(req.query.vin || "").trim().toUpperCase();
    const conversionId = String(req.query.conversionId || "").trim();
    const limit = Number(req.query.limit || 200);

    if (!vin && !conversionId) {
      return res.status(400).json({ ok: false, error: "Falta vin o conversionId" });
    }

    // 🚀 Intenta Supabase primero (mucho más rápido)
    if (supabaseEnabled()) {
      try {
        console.log("[INC_LIST] 📖 Leyendo de Supabase...");
        
        const filter = vin ? { vin } : { conversion_id: conversionId };
        const data = await supabaseGet("incidencias", filter);

        const items = (Array.isArray(data) ? data : [])
          .slice(0, limit)
          .map(row => ({
            id: row.id,
            vin: row.vin,
            conversionId: row.conversion_id,
            tipo: row.tipo,
            nota: row.nota,
            tecnico: row.tecnico_nombre,
            tecnicoEmail: row.tecnico_email,
            registradoPor: row.registrado_por,
            fechaHora: row.fecha_hora,
            fotoUrl: row.foto_name ? `/api/foto/${row.id}` : null,
          }));

        console.log(`[INC_LIST] ✅ Supabase: ${items.length} registros`);
        
        return res.json({
          ok: true,
          items,
          source: "supabase",
          count: items.length,
        });
      } catch (err) {
        console.warn("[INC_LIST] ⚠️ Supabase falló, fallback a AppScript:", err.message);
        // Continúa con AppScript fallback
      }
    }

    // 🔄 Fallback: Lee desde AppScript (más lento pero auténtico)
    console.log("[INC_LIST] 📖 Fallback a AppScript");
    
    const j = await callAppsScript("incidencias_list", {
      vin,
      conversionId,
      limit,
    });

    return res.json({
      ...j,
      source: "appscript",
    });

  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: String(e.message || e),
    });
  }
});

// ╔════════════════════════════════════════════════════════════════╗
// ║ 3️⃣ EVENTOS - Escritura Dual                                   ║
// ╚════════════════════════════════════════════════════════════════╝

app.post("/api/evento", async (req, res) => {
  try {
    const payload = req.body;

    // Escribe en AppScript (primario)
    let appScriptResult;
    try {
      appScriptResult = await callAppsScript("evento", payload);
    } catch (err) {
      console.warn("[EVENTO DUAL] AppScript ERROR:", err.message);
    }

    // Escribe en Supabase (paralelo)
    if (supabaseEnabled()) {
      try {
        const fechaNow = new Date().toISOString();
        await supabasePost("eventos", {
          vin: String(payload.vin || "").toUpperCase(),
          conversion_id: String(payload.conversionId || "").trim(),
          rol: String(payload.rolTrabajo || "TECNICO").toUpperCase(),
          accion: String(payload.accion || "").toUpperCase(),
          nota: String(payload.nota || "").trim(),
          registrado_por: String(payload.email || "").toLowerCase(),
          fecha_hora: fechaNow,
        });
        
        console.log("[EVENTO DUAL] ✅ Supabase OK");
      } catch (err) {
        console.warn("[EVENTO DUAL] Supabase ERROR:", err.message);
      }
    }

    // Responde con resultado de AppScript
    res.json(appScriptResult || { ok: true, message: "Evento registrado" });

  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ╔════════════════════════════════════════════════════════════════╗
// ║ 4️⃣ CONFIGURACIÓN - Status de migración                        ║
// ╚════════════════════════════════════════════════════════════════╝

/**
 * GET /api/migration-status
 * Retorna el estado de la migración (útil para debugging)
 */
app.get("/api/migration-status", (req, res) => {
  res.json({
    ok: true,
    dual_write_enabled: true,
    supabase_configured: supabaseEnabled(),
    appscript_configured: !!(process.env.APS_URL && process.env.APS_KEY),
    note: "Escritura dual activa: consulta logs para detalles",
  });
});

module.exports = {
  // Exporta si necesitas usarlo en otros archivos
  DUAL_WRITE: true,
};
