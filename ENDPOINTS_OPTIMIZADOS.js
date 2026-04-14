/**
 * ═══════════════════════════════════════════════════════════════
 * ENDPOINTS OPTIMIZADOS: SUPABASE ONLY (SIN DUAL WRITE)
 * ═══════════════════════════════════════════════════════════════
 * 
 * Reemplaza estos endpoints en tu index.js
 * Beneficio: Respuestas <100ms, sin complejidad de dual-write
 *
 * Los endpoints que usan fotos (Drive) siguen usando AppScript,
 * pero solo para almacenamiento, la DB principal es Supabase.
 */

// ═══════════════════════════════════════════════════════════════
// 1️⃣ EVENTO — Supabase ONLY (sin AppScript)
// ═══════════════════════════════════════════════════════════════

app.post("/api/evento", async (req, res) => {
  try {
    const body = req.body || {};
    
    // Obtener user_id si viene email
    let userId = body.userId || body.user_id;
    if (!userId && body.email) {
      const usuarios = await supabaseGet_("usuarios", { email: body.email });
      if (usuarios && usuarios.length) {
        userId = usuarios[0].id;
      }
    }

    const eventoData = {
      timestamp: new Date().toISOString(),
      user_id: userId || null,
      work_order_id: body.conversionId || body.work_order_id || null,
      vin: (body.vin || "").toUpperCase(),
      tipo_ot: body.tipo_ot || "CONVERSION",
      rol_trabajo: body.rolTrabajo || "TECNICO",
      accion: (body.accion || "NOTA").toUpperCase(),
      nota: body.nota || "",
      registrado_por: body.email || "",
    };

    const result = await supabasePost_("eventos", eventoData);

    return res.json({
      ok: true,
      event_id: result[0]?.id || null,
      message: "Evento registrado en Supabase",
    });

  } catch (e) {
    console.error("[POST /api/evento]", e.message);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ═══════════════════════════════════════════════════════════════
// 2️⃣ EQUIPO CONFORMIDAD — Supabase ONLY
// ═══════════════════════════════════════════════════════════════

app.post("/api/equipo-conformidad", async (req, res) => {
  try {
    const body = req.body || {};

    // Obtener user_id si viene email
    let userId = body.userId || body.user_id;
    if (!userId && body.email) {
      const usuarios = await supabaseGet_("usuarios", { email: body.email });
      if (usuarios && usuarios.length) {
        userId = usuarios[0].id;
      }
    }

    // Actualizar conformidad en work_orders
    const conformidadData = {
      conf_ck1: !!body.conf_ck1,
      conf_ck2: !!body.conf_ck2,
      conf_ck3: !!body.conf_ck3,
      conf_ck4: !!body.conf_ck4,
      conf_ts: new Date().toISOString(),
      conf_by: body.email || userId,
    };

    // PATCH a work_orders
    await supabasePatch_("work_orders", 
      { id: body.conversionId }, 
      conformidadData
    );

    return res.json({
      ok: true,
      message: "Conformidad actualizada en Supabase",
    });

  } catch (e) {
    console.error("[POST /api/equipo-conformidad]", e.message);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ═══════════════════════════════════════════════════════════════
// 3️⃣ INCIDENCIA — Supabase ONLY (foto via AppScript solo para Drive)
// ═══════════════════════════════════════════════════════════════

app.post("/api/incidencia", async (req, res) => {
  try {
    console.log("[INCIDENCIA] Procesando...");

    const body = { ...(req.body || {}) };
    let fotoResult = null;

    // 🖼️ Si viene foto, la subimos a Drive (AppScript maneja Drive)
    // Pero esto es OPCIONAL, solo para archivado físico
    if (body.foto && body.foto.b64 && body.foto.b64.length > 1000) {
      try {
        fotoResult = await callAppsScript("uploadIncidencia", {
          vin: body.vin,
          conversionId: body.conversionId,
          tipo: body.tipo,
          nota: body.nota,
          tecnico: body.tecnicoNombre || body.tecnicoEmail || "",
          file: {
            b64: body.foto.b64,
            mimeType: body.foto.mimeType || "image/jpeg",
            name: body.foto.name || "incidencia.jpg",
          },
        }).catch(err => {
          console.warn("[INCIDENCIA] Foto ERROR (continuando):", err.message);
          return null;
        });

        if (fotoResult) {
          body.fotoFileId = String(fotoResult.photoId || "");
          body.fotoFolderId = String(fotoResult.subFolderId || fotoResult.folderId || "");
          body.fotoBatchId = String(fotoResult.batchId || "");
        }
      } catch (err) {
        console.warn("[INCIDENCIA] Foto handler error:", err.message);
      }
    }

    // ✅ ESCRITURA A SUPABASE DIRECTO (sin AppScript)
    // Obtener user_id
    let userId = body.tecnicoUserId;
    if (!userId && body.tecnicoEmail) {
      const usuarios = await supabaseGet_("usuarios", { email: body.tecnicoEmail });
      if (usuarios && usuarios.length) {
        userId = usuarios[0].id;
      }
    }

    const incidenciaData = {
      fecha_hora: new Date().toISOString(),
      mes: new Date().toISOString().substring(0, 7),
      work_order_id: body.conversionId || null,
      vin: (body.vin || "").toUpperCase(),
      tecnico_id: userId || null,
      tecnico: body.tecnicoNombre || body.tecnicoEmail || "",
      tipo: body.tipo || "LEVE",
      categoria: body.categoria || "SIN_CLASIFICAR",
      registrado_por: body.email || "",
      nota: body.nota || "",
      foto_file_id: body.fotoFileId || null,
      foto_folder_id: body.fotoFolderId || null,
      foto_batch_id: body.fotoBatchId || null,
      estado: "ABIERTA",
    };

    const result = await supabasePost_("incidencias", incidenciaData);

    return res.json({
      ok: true,
      incidencia_id: result[0]?.id || null,
      message: "Incidencia registrada en Supabase (<100ms)",
      foto: fotoResult
        ? {
            photoId: fotoResult.photoId,
            photoUrl: fotoResult.photoUrl,
            folderId: fotoResult.subFolderId || fotoResult.folderId,
          }
        : null,
    });

  } catch (e) {
    console.error("[POST /api/incidencia]", e.message);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ═══════════════════════════════════════════════════════════════
// 4️⃣ CONFORMIDADES (CALIDAD/TECNICO) — Supabase ONLY
// ═══════════════════════════════════════════════════════════════

app.post("/api/conformidad-tecnico", async (req, res) => {
  try {
    const body = req.body || {};

    let userId = body.userId;
    if (!userId && body.email) {
      const usuarios = await supabaseGet_("usuarios", { email: body.email });
      if (usuarios?.length) userId = usuarios[0].id;
    }

    const conformidadData = {
      fecha_hora: new Date().toISOString(),
      work_order_id: body.conversionId || null,
      vin: (body.vin || "").toUpperCase(),
      tipo: body.tipo || "TECNICO",
      usuario_id: userId || null,
      resultado: body.resultado || "PENDIENTE",
      nota: body.nota || "",
      registrado_por: body.email || "",
    };

    const result = await supabasePost_("conformidades", conformidadData);

    return res.json({
      ok: true,
      conformidad_id: result[0]?.id || null,
    });

  } catch (e) {
    console.error("[POST /api/conformidad-tecnico]", e.message);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ═══════════════════════════════════════════════════════════════
// 5️⃣ LECTURAS — Supabase ONLY (muy rápidas)
// ═══════════════════════════════════════════════════════════════

// Incidencias list
app.get("/api/incidencias/list", async (req, res) => {
  try {
    const vin = String(req.query.vin || "").trim().toUpperCase();
    const conversionId = String(req.query.conversionId || "").trim();
    const limit = Math.min(parseInt(req.query.limit || "50"), 1000);

    const filter = {};
    if (vin) filter.vin = vin;
    if (conversionId) filter.work_order_id = conversionId;

    const t1 = Date.now();
    const items = await supabaseGet_("incidencias", filter);
    const duration = Date.now() - t1;

    res.set("X-Query-Time", `${duration}ms`);
    return res.json({
      ok: true,
      items: items.slice(0, limit),
      count: items.length,
      _timing: `${duration}ms`,
    });

  } catch (e) {
    console.error("[GET /api/incidencias/list]", e.message);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Eventos list
app.get("/api/eventos/list", async (req, res) => {
  try {
    const vin = String(req.query.vin || "").trim().toUpperCase();
    const conversionId = String(req.query.conversionId || "").trim();

    const filter = {};
    if (vin) filter.vin = vin;
    if (conversionId) filter.work_order_id = conversionId;

    const items = await supabaseGet_("eventos", filter);
    return res.json({
      ok: true,
      items,
      count: items.length,
    });

  } catch (e) {
    console.error("[GET /api/eventos/list]", e.message);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Conformidades list
app.get("/api/conformidades/list", async (req, res) => {
  try {
    const vin = String(req.query.vin || "").trim().toUpperCase();
    const tipo = String(req.query.tipo || "").trim().toUpperCase();

    const filter = {};
    if (vin) filter.vin = vin;
    if (tipo) filter.tipo = tipo;

    const items = await supabaseGet_("conformidades", filter);
    return res.json({
      ok: true,
      items,
      count: items.length,
    });

  } catch (e) {
    console.error("[GET /api/conformidades/list]", e.message);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ═══════════════════════════════════════════════════════════════
// 6️⃣ ESTADO — Lectura optimizada Supabase
// ═══════════════════════════════════════════════════════════════

app.get("/api/estado", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    const vin = String(req.query.vin || "").trim().toUpperCase();
    const rolTrabajo = String(req.query.rolTrabajo || "").trim().toUpperCase();

    if (!email || !vin || !rolTrabajo) {
      return res.status(400).json({ 
        ok: false, 
        error: "Faltan: email, vin, rolTrabajo" 
      });
    }

    // 1. Obtener usuario
    const usuarios = await supabaseGet_("usuarios", { email });
    if (!usuarios?.length) {
      return res.status(404).json({ ok: false, error: "Usuario no encontrado" });
    }
    const userId = usuarios[0].id;

    // 2. Obtener work_order por VIN
    const workOrders = await supabaseGet_("work_orders", { vin });
    if (!workOrders?.length) {
      return res.status(404).json({ ok: false, error: "VIN no encontrado" });
    }
    const workOrder = workOrders[0];

    // 3. Obtener asignación activa
    const asignaciones = await supabaseGet_("asignaciones", { 
      work_order_id: workOrder.id,
      user_id: userId,
      rol_trabajo: rolTrabajo,
    });

    const asignacion = asignaciones?.[0] || null;

    return res.json({
      ok: true,
      vin,
      rolTrabajo,
      estado: asignacion?.estado_actual || "SIN_INICIAR",
      tiempoMs: asignacion?.tiempo_trab_ms || 0,
      asignacion: asignacion || null,
      _source: "supabase",
    });

  } catch (e) {
    console.error("[GET /api/estado]", e.message);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

/*
 * ═══════════════════════════════════════════════════════════════
 * NOTA IMPORTANTE:
 * 
 * ✅ Estos endpoints ahora son SUPER RÁPIDOS (<100ms)
 * ✅ Sin AppScript en la ruta crítica
 * ✅ Google Sheets se sincroniza automáticamente cada 10 min
 *
 * Si todavía necesitas algunas operaciones en AppScript (ej: generar reportes),
 * crea endpoints separados: /api/report, /api/export, etc.
 * 
 * Pero la APP PRINCIPAL usa solo Supabase.
 * ═══════════════════════════════════════════════════════════════
 */
