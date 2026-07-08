import { Router } from "express";
import { supabaseHeaders_, supabaseGet_, supabasePost_, supabasePatch_ } from "../lib/supabase.js";
import { addServerTiming_ } from "../lib/timing.js";
import { r2UploadIncidencia, photoUrls } from "../r2-uploads.js";

const router = Router();

// SUPABASE WRITE + Drive upload (foto async)
router.post("/api/incidencia", async (req, res) => {
  try {
    console.log("[INCIDENCIA] body =", Object.keys(req.body || {}));

    const body = { ...(req.body || {}) };
    const hasFoto = !!(body.foto && body.foto.b64);

    // Guardar foto payload antes de borrarla
    const fotoPayload = hasFoto ? { ...body.foto } : null;
    delete body.foto;

    // 1) WRITE a Supabase INMEDIATAMENTE (sin esperar Drive)
    let supabaseResult = null;
    try {
      const incidenciaData = {
        fecha_hora: new Date().toISOString(),
        mes: new Date().toISOString().substring(0, 7),
        work_order_id: body.conversionId || null,
        vin: body.vin || null,
        tecnico: body.tecnicoNombre || body.tecnicoEmail || "",
        tipo: body.tipo || "LEVE",
        registrado_por: body.email || body.registrado_por || "",
        nota: body.nota || "",
        foto_file_id: "",
        foto_folder_id: "",
        foto_batch_id: "",
      };

      supabaseResult = await supabasePost_("incidencias", incidenciaData);
    } catch (err) {
      console.error("[INCIDENCIA] Supabase write error:", err.message);
      return res.status(500).json({ ok: false, error: "Error guardando incidencia: " + err.message });
    }

    // Responder al cliente INMEDIATAMENTE
    res.json({ ok: true, saved: true });

    // 2) Si hay foto, subir a R2 en BACKGROUND y actualizar Supabase
    if (hasFoto && supabaseResult) {
      const incId = Array.isArray(supabaseResult) ? supabaseResult[0]?.id : supabaseResult?.id;
      (async () => {
        try {
          const up = await r2UploadIncidencia({
            vin:  body.vin,
            tipo: body.tipo,
            file: {
              b64:      fotoPayload.b64,
              mimeType: fotoPayload.mimeType || "image/jpeg",
            },
          });

          if (incId && up?.photoId) {
            await supabasePatch_("incidencias", { id: incId }, {
              foto_file_id:   String(up.photoId || ""),  // clave R2
              foto_folder_id: "",
              foto_batch_id:  String(up.batchId || ""),
            });
            console.log(`[INCIDENCIA] Foto subida a R2 y actualizada: ${incId}`);
          }
        } catch (err) {
          console.error("[INCIDENCIA] R2 upload error:", err.message);
        }
      })();
    }

  } catch (e) {
    console.error("[INCIDENCIA] ERROR:", e);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  }
});

// endpoint: mis incidencias por email (vista TECNICO)
router.get("/api/incidencias/by-tecnico", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    const days  = Math.min(Number(req.query.days || 90), 365);
    if (!email) return res.status(400).json({ ok: false, error: "Falta email" });

    // 1) Obtener nombre del técnico desde tabla usuarios
    const usuarios = await supabaseGet_("usuarios", { email });
    const nombre = String(usuarios?.[0]?.nombre || "").trim();
    if (!nombre) return res.json({ ok: true, items: [], nombre: "" });

    // 2) Incidencias de los últimos `days` días
    const since = new Date(Date.now() - days * 86400 * 1000).toISOString();

    // supabaseGet_ solo soporta eq., construimos la URL directamente para gte
    const headers = supabaseHeaders_();
    if (!headers) throw new Error("Supabase no configurado (.env)");
    const qUrl = `${process.env.SUPABASE_URL}/rest/v1/incidencias`
      + `?tecnico=eq.${encodeURIComponent(nombre)}`
      + `&fecha_hora=gte.${encodeURIComponent(since)}`
      + `&order=fecha_hora.desc&limit=500`;
    const qRes = await fetch(qUrl, { method: "GET", headers });
    if (!qRes.ok) {
      const t = await qRes.text().catch(() => "");
      throw new Error(`Supabase incidencias: ${qRes.status} ${t.slice(0, 200)}`);
    }
    const rows = await qRes.json();

    const items = rows
      .sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora))
      .map(inc => {
        const urls = photoUrls(inc.foto_file_id);
        return {
          id:            inc.id,
          fecha:         inc.fecha_hora,
          fecha_hora:    inc.fecha_hora,
          vin:           inc.vin,
          tipo:          inc.tipo,
          tecnico:       inc.tecnico || "",
          nota:          inc.nota || "",
          registrado_por: inc.registrado_por || "",
          fotoFileId:    inc.foto_file_id || "",
          fotoUrl:       urls.url,
          fotoThumbUrl:  urls.thumbUrl,
          fotoImgUrl:    urls.imgUrl,
        };
      });

    return res.json({ ok: true, items, nombre });
  } catch (e) {
    console.error("[GET /api/incidencias/by-tecnico]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// endpoint Node → Supabase (incidencias list) - LECTURA SOLO + TIMING
router.get("/api/incidencias/list", async (req, res) => {
  try {
    const vin = String(req.query.vin || "").trim().toUpperCase();
    const conversionId = String(req.query.conversionId || "").trim();
    const email = String(req.query.email || "").trim().toLowerCase();
    const limit = Number(req.query.limit || 200);
    const timings = [];

    if (!vin && !conversionId) {
      addServerTiming_(res, timings);
      return res.status(400).json({ ok:false, error:"Falta vin o conversionId" });
    }

    // ?? LECTURA DESDE SUPABASE
    let incidencias = [];

    if (vin) {
      const t1 = Date.now();
      incidencias = await supabaseGet_("incidencias", { vin });
      timings.push({ label: "incidencias_by_vin", duration: Date.now() - t1 });
    } else if (conversionId) {
      const t1 = Date.now();
      incidencias = await supabaseGet_("incidencias", { work_order_id: conversionId });
      timings.push({ label: "incidencias_by_conversion", duration: Date.now() - t1 });
    }

    const t2 = Date.now();
    const items = incidencias
      .slice(0, limit)
      .map(inc => {
        const urls = photoUrls(inc.foto_file_id);  // R2 si key tiene "/", Drive si no
        return {
          id: inc.id,
          fecha: inc.fecha_hora,
          fecha_hora: inc.fecha_hora,
          vin: inc.vin,
          tipo: inc.tipo,
          tecnico: inc.tecnico || "",
          nota: inc.nota || "",
          registrado_por: inc.registrado_por || "",
          fotoFileId:   inc.foto_file_id || "",
          fotoUrl:      urls.url,
          fotoThumbUrl: urls.thumbUrl,
          fotoImgUrl:   urls.imgUrl,
          fotoFolderId: inc.foto_folder_id || "",
          fotoBatchId:  inc.foto_batch_id  || "",
        };
      });
    timings.push({ label: "map_response", duration: Date.now() - t2 });

    addServerTiming_(res, timings);
    return res.json({
      ok: true,
      items,
    });
  } catch (e) {
    console.error("[GET /api/incidencias/list]", e.message);
    addServerTiming_(res, timings || []);
    return res.status(500).json({ ok:false, error: String(e.message || e) });
  }
});

// -----------------------------------------------------------------
// GET /api/incidencias/report — reporte global con resumen
// -----------------------------------------------------------------
router.get("/api/incidencias/report", async (req, res) => {
  try {
    const from  = String(req.query.from  || "").trim();   // YYYY-MM-DD
    const to    = String(req.query.to    || "").trim();   // YYYY-MM-DD
    const month = String(req.query.month || "").trim();   // YYYY-MM
    const tipo  = String(req.query.tipo  || "ALL").toUpperCase(); // LEVE|MODERADA|CRITICA|ALL
    const q     = String(req.query.q     || "").trim().toLowerCase();
    const limit = Math.min(Number(req.query.limit || 1000), 2000);

    const headers = supabaseHeaders_();
    if (!headers) throw new Error("Supabase no configurado (.env)");

    // Build date filter
    let dateFrom = "", dateTo = "";
    if (month) {
      dateFrom = `${month}-01T00:00:00.000Z`;
      // Last day of month
      const [y, m] = month.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      dateTo = `${month}-${String(lastDay).padStart(2,"0")}T23:59:59.999Z`;
    } else if (from || to) {
      if (from) dateFrom = `${from}T00:00:00.000Z`;
      if (to)   dateTo   = `${to}T23:59:59.999Z`;
    }

    let qUrl = `${process.env.SUPABASE_URL}/rest/v1/incidencias?order=fecha_hora.desc&limit=${limit}`;
    if (dateFrom) qUrl += `&fecha_hora=gte.${encodeURIComponent(dateFrom)}`;
    if (dateTo)   qUrl += `&fecha_hora=lte.${encodeURIComponent(dateTo)}`;
    if (tipo !== "ALL") qUrl += `&tipo=eq.${encodeURIComponent(tipo)}`;

    const t1 = Date.now();
    const qRes = await fetch(qUrl, { method: "GET", headers });
    if (!qRes.ok) {
      const t = await qRes.text().catch(() => "");
      throw new Error(`Supabase incidencias: ${qRes.status} ${t.slice(0,200)}`);
    }
    let rows = await qRes.json();
    const queryMs = Date.now() - t1;

    // Text filter (nota or vin or tecnico)
    if (q) {
      rows = rows.filter(r =>
        String(r.nota || "").toLowerCase().includes(q) ||
        String(r.vin  || "").toLowerCase().includes(q) ||
        String(r.tecnico || "").toLowerCase().includes(q)
      );
    }

    // Map items
    const items = rows.map(inc => {
      const urls = photoUrls(inc.foto_file_id);
      return {
        id:             inc.id,
        fecha_hora:     inc.fecha_hora,
        mes:            inc.mes,
        vin:            inc.vin || "",
        tecnico:        inc.tecnico || "",
        tipo:           inc.tipo,
        registrado_por: inc.registrado_por || "",
        nota:           inc.nota || "",
        fotoFileId:     inc.foto_file_id || "",
        fotoUrl:        urls.url,
        fotoThumbUrl:   urls.thumbUrl,
        fotoImgUrl:     urls.imgUrl,
      };
    });

    // Summary
    const byTipo = { CRITICA: 0, MODERADA: 0, LEVE: 0 };
    const byTecnico = {};
    const byVin = {};
    for (const it of items) {
      if (it.tipo === "CRITICA")  byTipo.CRITICA++;
      else if (it.tipo === "MODERADA") byTipo.MODERADA++;
      else if (it.tipo === "LEVE") byTipo.LEVE++;

      if (it.tecnico) {
        if (!byTecnico[it.tecnico]) byTecnico[it.tecnico] = { tecnico: it.tecnico, total: 0, CRITICA: 0, MODERADA: 0, LEVE: 0 };
        byTecnico[it.tecnico].total++;
        byTecnico[it.tecnico][it.tipo] = (byTecnico[it.tecnico][it.tipo] || 0) + 1;
      }
      if (it.vin) {
        if (!byVin[it.vin]) byVin[it.vin] = { vin: it.vin, total: 0, CRITICA: 0, MODERADA: 0, LEVE: 0 };
        byVin[it.vin].total++;
        if (it.tipo === "CRITICA")       byVin[it.vin].CRITICA++;
        else if (it.tipo === "MODERADA") byVin[it.vin].MODERADA++;
        else if (it.tipo === "LEVE")     byVin[it.vin].LEVE++;
      }
    }

    const vinValues = Object.values(byVin);
    const totalVins      = vinValues.length;
    const vinsConCritica = vinValues.filter(v => v.CRITICA > 0).length;
    const vinsConReinci  = vinValues.filter(v => v.total > 1).length;

    const summary = {
      total:    items.length,
      critica:  byTipo.CRITICA,
      moderada: byTipo.MODERADA,
      leve:     byTipo.LEVE,
      totalVins,
      vinsConCritica,
      vinsConReinci,
      byTecnico: Object.values(byTecnico).sort((a,b) => b.total - a.total).slice(0,20),
      byVin:     vinValues.sort((a,b) => b.CRITICA - a.CRITICA || b.total - a.total).slice(0,20),
    };

    return res.json({ ok: true, items, summary, _queryMs: queryMs });
  } catch (e) {
    console.error("[GET /api/incidencias/report]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// -----------------------------------------------------------------
// ? ENDPOINTS OPTIMIZADOS SUPABASE (queries ultra-rápidas)
// -----------------------------------------------------------------

// 5?? GET /api/search/incidencias — Búsqueda LIKE
router.get("/api/search/incidencias", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();

    if (q.length < 2) {
      return res.json({ ok: true, items: [], message: "Mínimo 2 caracteres" });
    }

    const t1 = Date.now();

    let query = `${process.env.SUPABASE_URL}/rest/v1/incidencias?`;
    query += `nota=ilike.%${encodeURIComponent(q)}%`;
    query += `&select=id,fecha_hora,vin,tipo,nota,tecnico,registrado_por`;
    query += `&order=fecha_hora.desc&limit=100`;

    const headers = supabaseHeaders_();
    const res_data = await fetch(query, { method: "GET", headers });

    if (!res_data.ok) throw new Error(`${res_data.status}`);

    const items = await res_data.json();
    const duration = Date.now() - t1;

    return res.json({
      ok: true,
      items,
      count: items.length,
      _timing: `${duration}ms`,
      _source: "supabase",
    });
  } catch (e) {
    console.error("[GET /api/search/incidencias]", e.message);
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

export default router;
