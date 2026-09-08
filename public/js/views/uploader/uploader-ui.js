// =========================
// views/uploader/uploader-ui.js
// UI + eventos + scanners + previews
// Usa el módulo compartido qr-scanner.js
// =========================

import {
  CONTROL_URL,
  todayYYYYMMDD,
  humanBytes,
  getStatus,
  uploadOne,
  uploadFalla,
  uploadCalidadBatch,
  uploadConformidad,
  deleteSlot,
} from "./uploader-api.js";

import { createScanner } from "../../core/qr-scanner.js";
import { ahorroLegible } from "../../core/image-compress.js";

export function initUploaderUI(root, options = {}) {
  const shell = root.querySelector(".uploader-shell") || root;
  const $ = (id) => shell.querySelector(`#up_${id}`);

  // =========================
  // Estado local UI
  // =========================
  const selectedFilesBySlot = {};
  let compFilesVisual = [null, null, null, null];
  let fallaFiles = [];
  let qcFiles = [null, null, null, null];
  let confFile = null;

  const scannerParams = createScanner("up_qrReader_params");
  const scannerFalla  = createScanner("up_qrReader_falla");
  const scannerQc     = createScanner("up_qrReader_qc");
  const scannerConf   = createScanner("up_qrReader_conf");
  const scannerSold   = createScanner("up_qrReader_sold");

  const slotLabels = {
    vin: "Foto del VIN",
    comp_1: "Compresión",
    comp_2: "Compresión",
    comp_3: "Compresión",
    comp_4: "Compresión",
    corr_pre: "Corriente antes",
    corr_post: "Corriente después",
    voltaje: "Voltaje",
    scan_carro: "Scan del carro",
    sold_sensor_antes: "Sensor nivel ANTES",
    sold_sensor_post:  "Sensor nivel DESPUÉS",
    sold_cabina_antes: "Cabina ANTES",
    sold_cabina_post:  "Cabina DESPUÉS",
  };

  const screens = {
    menu: $("screenMenu"),
    params: $("screenParams"),
    falla: $("screenFalla"),
    calidad: $("screenCalidad"),
    conformidad: $("screenConformidad"),
    soldadura: $("screenSoldadura"),
  };

  // =========================
  // Helpers
  // =========================
  function setText(id, txt) {
    const el = $(id);
    if (el) el.textContent = String(txt || "");
  }

  // =========================
  // Estado por slot
  // ---------------------------------------------------------------------
  // Todo el avance de una subida se escribía en #up_out, un <pre> al final de
  // la pantalla. En un celular eso queda dos pantallazos más abajo del botón
  // que el técnico acaba de tocar: no ve nada, cree que no pasó nada y vuelve
  // a tocar. De ahí las fotos duplicadas y los "no sube" que sí subían.
  //
  // El estado ahora vive en la propia tarjeta del slot —donde están sus ojos—
  // y el <pre> queda como bitácora de la pantalla completa.
  // =========================

  /**
   * Slots que no tienen tarjeta propia porque comparten una.
   * `comp_1..4` son las cuatro tomas de la prueba de compresión y viven en una
   * sola tarjeta con cuatro miniaturas; `calidad_1..4`, igual. Sin este mapa,
   * el estado de esas subidas no se pintaba en ningún lado.
   */
  function claveDeTarjeta(slot) {
    if (/^comp_\d$/.test(slot)) return "comp";
    if (/^calidad_\d$/.test(slot)) return "qc";
    return slot;
  }

  function tarjetaSlot(slot) {
    return shell.querySelector(`.slotCard[data-slot="${claveDeTarjeta(slot)}"]`);
  }

  /**
   * marcarSlot — pinta la tarjeta y bloquea sus botones mientras hay trabajo.
   *
   * Bloquear no es cosmético: sin eso, dos toques seguidos disparan dos
   * subidas al mismo slot y la segunda pisa a la primera a medio camino.
   */
  function marcarSlot(slot, estado, texto) {
    const card = tarjetaSlot(slot);
    if (card) {
      if (estado) card.setAttribute("data-estado", estado);
      else card.removeAttribute("data-estado");

      const ocupado = estado === "trabajando";
      card.querySelectorAll("button[data-pick], button[data-clear]").forEach((b) => {
        b.disabled = ocupado;
      });
    }
    if (texto != null) setText(`${claveDeTarjeta(slot)}_meta`, texto);
  }

  /**
   * conBotonOcupado — bloquea el botón mientras corre la acción.
   *
   * Los botones grandes de enviar (falla, calidad, conformidad) no tenían
   * ningún freno: un segundo toque mientras la primera tanda todavía se estaba
   * comprimiendo mandaba una segunda tanda entera, y en R2 quedaban dos lotes
   * de la misma falla con distinto batchId. Nadie lo veía desde la app.
   */
  async function conBotonOcupado(btn, etiquetaOcupado, accion) {
    if (!btn) return await accion();
    if (btn.disabled) return;

    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = etiquetaOcupado;
    try {
      return await accion();
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  /** Texto de la etapa en curso. El técnico necesita saber si ya salió de su teléfono. */
  const ETAPAS = {
    decodificando: "Abriendo foto…",
    comprimiendo: "Comprimiendo…",
    upload: "Subiendo…",
  };

  function getQueryParam(name) {
    try {
      return new URLSearchParams(window.location.search).get(name) || "";
    } catch {
      return "";
    }
  }

  // normalizeScanText se importa de qr-scanner.js (usado internamente por createScanner)

  function showScreen(name) {
    Object.values(screens).forEach((s) => s && s.classList.remove("active"));
    const el = screens[name];
    if (el) el.classList.add("active");
    stopAllScanners().catch(() => {});

    // Refresh previews when entering params screen (comp thumbnails may not be populated yet)
    if (name === "params") {
      const vin = ($("vinText")?.value || "").trim();
      if (vin) refreshStatus().catch(() => {});
    }
  }

  /**
   * puedeSalirDeParams — ¿se puede abandonar el registro tal como está?
   *
   * No se puede si falta alguna de las cinco obligatorias. El motivo no es
   * disciplina: un registro sin las cuatro compresiones o sin la foto del VIN
   * no sirve para nada río abajo —calidad no puede inspeccionar, el supervisor
   * no puede cerrar la OT— y el técnico se entera al día siguiente, cuando el
   * carro ya no está. Es mucho más barato pararlo aquí.
   *
   * Sin VIN escrito no hay registro empezado que proteger, y bloquear ahí solo
   * dejaría encerrado a quien entró a la pantalla por equivocación.
   *
   * Se vuelve a preguntar al servidor antes de decidir: lo que vale es lo que
   * está guardado en R2, no lo que la pantalla recuerde de hace diez minutos.
   */
  async function puedeSalirDeParams() {
    const vin = ($("vinText")?.value || "").trim();
    if (!vin) return true;

    await refreshStatus().catch(() => {});
    const faltan = SLOTS_OBLIGATORIOS.filter((sl) => !estadoRegistro[sl]);
    if (!faltan.length) return true;

    const compFaltan = faltan.filter((sl) => sl.startsWith("comp_")).length;
    const partes = [];
    if (faltan.includes("vin")) partes.push("la foto del VIN");
    if (compFaltan) partes.push(`${compFaltan} de las 4 compresiones`);

    const caja = $("resumen");
    if (caja) {
      caja.setAttribute("data-bloqueado", "si");
      caja.scrollIntoView({ block: "nearest", behavior: "smooth" });
      // El aviso se quita solo: si se queda pegado, la próxima vez que el
      // técnico mire la caja no sabrá si le habla de ahora o de hace un rato.
      setTimeout(() => caja.removeAttribute("data-bloqueado"), 6000);
    }
    setText("resumenFaltan", `No puedes salir todavía: falta ${partes.join(" y ")}.`);
    return false;
  }

  async function openBackControl() {
    // Volver al Control de Trabajo desde el registro es salir igual que
    // pulsar "⬅ Volver": la guardia tiene que valer para las dos puertas.
    if (screens.params?.classList.contains("active") && !(await puedeSalirDeParams())) return;

    if (typeof options.onBackControl === "function") {
      options.onBackControl();
      return;
    }
    // fallback local (sin redirect)
    showScreen("menu");
  }

  // =========================
  // Lightbox
  // =========================
  function openImageModal(src) {
    const modal = $("imgModal");
    const img = $("imgModalImg");
    if (!modal || !img || !src) return;
    img.src = src;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeImageModal() {
    const modal = $("imgModal");
    const img = $("imgModalImg");
    if (!modal || !img) return;
    modal.classList.remove("open");
    img.src = "";
    modal.setAttribute("aria-hidden", "true");
  }

  // =========================
  // Preview helpers
  // =========================
  /**
   * miniatura — pinta un archivo local en una caja de preview.
   *
   * El object URL se revoca en onload/onerror. Antes cada sitio ponía su
   * propio `setTimeout(revoke, 15000)`: si el teléfono tardaba más de 15 s en
   * decodificar una foto de 12 MP la miniatura salía en blanco, y si tardaba
   * menos el archivo entero seguía retenido en memoria hasta que venciera el
   * reloj — con cuatro fotos abiertas a la vez, eso es lo que tumbaba la
   * pestaña en los Android con poca RAM.
   */
  function miniatura(box, file, { alt = "preview", vacio = "" } = {}) {
    if (!box) return;
    if (!file) {
      box.innerHTML = `<span class="small">${vacio}</span>`;
      return;
    }
    const url = URL.createObjectURL(file);
    const img = document.createElement("img");
    img.alt = alt;
    img.decoding = "async";
    const soltar = () => URL.revokeObjectURL(url);
    img.onload = soltar;
    img.onerror = () => {
      soltar();
      box.innerHTML = `<span class="small">${vacio || "sin vista previa"}</span>`;
    };
    img.src = url;
    box.innerHTML = "";
    box.appendChild(img);
  }

  function setPreview(slot, file) {
    const box = $(`${slot}_previewBox`);
    if (!box) return;

    if (!file) {
      miniatura(box, null, { vacio: "Sin foto" });
      marcarSlot(slot, null, "Ningún archivo seleccionado.");
      return;
    }

    // Ya no hay rama especial para HEIC. Safari en iPhone los pinta sin
    // problema, y donde no se puedan pintar el onerror de `miniatura` deja el
    // aviso. Adivinar por la extensión solo servía para negarle la vista
    // previa a la mitad de los técnicos que sí la podían ver.
    miniatura(box, file, { alt: slotLabels[slot] || "foto", vacio: "Sin vista previa" });
    marcarSlot(slot, null, `${file.name || "(foto)"} • ${humanBytes(file.size || 0)}`);
  }

  function setRemotePreview(slot, p) {
    const box = $(`${slot}_previewBox`);
    const meta = $(`${slot}_meta`);
    if (!box || !meta || !p) return;

    const src1 = p.thumbUrl || "";
    const src2 = p.imgUrl || "";
    // Si el slot acaba de subirse, su tarjeta ya dice cuánto pesó y cuánto se
    // ahorró; el refresco posterior no debe borrar ese dato para poner un
    // genérico. (Y hace rato que las fotos no viven en Drive sino en R2.)
    if (tarjetaSlot(slot)?.getAttribute("data-estado") !== "ok") {
      meta.textContent = "📡 Ya guardada en el servidor.";
    }

    const img = document.createElement("img");
    img.alt = "foto guardada";
    img.loading = "eager";
    img.referrerPolicy = "no-referrer";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    img.style.display = "block";
    img.src = src1 || src2;

    img.onerror = () => {
      if (src2 && img.src !== src2) {
        img.src = src2;
      } else {
        box.innerHTML = `<span class="small">No se pudo cargar preview</span>`;
      }
    };

    box.innerHTML = "";
    box.appendChild(img);
  }

  function setRemoteCompPreview(idx1to4, p) {
    const box = $(`comp_p${idx1to4}`);
    if (!box || !p) return;

    const src1 = p.thumbUrl || "";
    const src2 = p.imgUrl || "";

    const img = document.createElement("img");
    img.alt = "foto guardada";
    img.loading = "eager";
    img.referrerPolicy = "no-referrer";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    img.style.display = "block";
    img.src = src1 || src2;

    img.onerror = () => {
      if (src2 && img.src !== src2) {
        img.src = src2;
      } else {
        box.innerHTML = `<span class="small">${idx1to4}</span>`;
      }
    };

    box.innerHTML = "";
    box.appendChild(img);
  }

  // =========================
  // Status (parámetros)
  // =========================
  /**
   * Los nueve archivos del registro, agrupados como los ve el técnico: la
   * prueba de compresión son cuatro tomas de un mismo paso, no cuatro pasos.
   * La cuenta sigue siendo sobre 9 archivos porque eso es lo que exige el
   * registro; lo que cambia es cómo se nombra lo que falta.
   */
  const PASOS_REGISTRO = [
    { titulo: "Compresión", slots: ["comp_1", "comp_2", "comp_3", "comp_4"] },
    { titulo: "Foto del VIN", slots: ["vin"] },
    { titulo: "Amperaje antes", slots: ["corr_pre"] },
    { titulo: "Amperaje después", slots: ["corr_post"] },
    { titulo: "Voltaje", slots: ["voltaje"] },
    { titulo: "Scan del carro", slots: ["scan_carro"] },
  ];

  const TOTAL_REGISTRO = PASOS_REGISTRO.reduce((a, p) => a + p.slots.length, 0);

  /**
   * Las cinco que no son negociables: la foto del VIN y las cuatro tomas de
   * compresión. Sin el VIN no se sabe de qué carro es el registro, y una
   * prueba de compresión con tres cilindros no es una prueba de compresión.
   * El resto de fotos se puede completar después; estas no.
   */
  const SLOTS_OBLIGATORIOS = ["vin", "comp_1", "comp_2", "comp_3", "comp_4"];

  /** Último estado confirmado por el servidor. Lo llena renderStatus. */
  let estadoRegistro = {};

  /**
   * renderResumen — la línea de arriba: cuántas van y qué falta, por nombre.
   *
   * Decir "faltan 3" no sirve de nada si el técnico tiene que bajar nueve
   * tarjetas para averiguar cuáles. Se nombran, y la compresión se nombra con
   * su cuenta propia porque ahí faltar una o faltar las cuatro es distinto.
   */
  function renderResumen(estado = {}) {
    const listas = PASOS_REGISTRO.reduce(
      (a, p) => a + p.slots.filter((sl) => estado[sl]).length, 0
    );

    setText("resumenCuenta", `${listas} / ${TOTAL_REGISTRO}`);

    const barra = $("resumenBarra");
    if (barra) barra.style.width = `${Math.round((listas / TOTAL_REGISTRO) * 100)}%`;

    const faltan = PASOS_REGISTRO.flatMap((p) => {
      const hechas = p.slots.filter((sl) => estado[sl]).length;
      if (hechas === p.slots.length) return [];
      return [p.slots.length > 1 ? `${p.titulo} (${hechas}/${p.slots.length})` : p.titulo];
    });

    setText("resumenFaltan", faltan.length ? `Falta: ${faltan.join(", ")}` : "Registro completo 🎉");

    const caja = $("resumen");
    if (caja) caja.setAttribute("data-completo", faltan.length ? "no" : "si");

    // Las tarjetas también se pintan desde lo que dice el servidor, no solo
    // desde las subidas de esta sesión. Un técnico que vuelve a un carro que
    // dejó a medias veía todas las tarjetas en gris aunque la mitad estuviera
    // guardada, y el distintivo de "obligatoria" seguía en ámbar para siempre.
    for (const paso of PASOS_REGISTRO) {
      const card = tarjetaSlot(paso.slots[0]);
      if (!card || card.getAttribute("data-estado") === "trabajando") continue;
      const completo = paso.slots.every((sl) => estado[sl]);
      if (completo) card.setAttribute("data-estado", "ok");
      else card.removeAttribute("data-estado");
    }
  }

  function renderStatus(j) {
    estadoRegistro = j.status || {};
    renderResumen(estadoRegistro);

    // El detalle deja de repetir la lista de faltantes: eso ya lo dice el
    // resumen de arriba, y decirlo dos veces con distinto formato solo hacía
    // dudar de cuál de los dos estaba al día. Aquí quedan los enlaces, que es
    // lo único que el resumen no puede dar.
    const lineas = [
      `VIN ${j.vin || "-"} · ${j.dateStr || "-"}`,
      `Carpeta: ${j.monthFolderName || "-"} / ${j.carFolderName || "-"} / REGISTRO`,
      "",
    ];

    for (const paso of PASOS_REGISTRO) {
      for (const slot of paso.slots) {
        const ok = j.status && j.status[slot];
        const url = j.previews?.[slot]?.url || "";
        lineas.push(`${ok ? "✅" : "⬜"} ${slotLabels[slot] || slot}${url ? `  ${url}` : ""}`);
      }
    }

    const s = lineas.join("\n");
    setText("out", s);
  }

  async function refreshStatus() {
    const vin = ($("vinText")?.value || "").trim();
    const dateStr = $("dateStr")?.value || todayYYYYMMDD();

    if (!vin) {
      estadoRegistro = {};
      renderResumen({});
      setText("resumenFaltan", "Escanea un VIN para ver el avance.");
      setText("out", "Escribe o escanea un VIN para consultar su estado.");
      return;
    }

    try {
      const j = await getStatus({ vin, dateStr, apsUrl: options.apsUrl });
      if (!j.ok) {
        setText("out", "❌ getStatus: " + (j.error || "Error"));
        return;
      }

      renderStatus(j);

      if (j.previews) {
        ["vin", "corr_pre", "corr_post", "voltaje", "scan_carro"].forEach((slot) => {
          const p = j.previews[slot];
          if (p) setRemotePreview(slot, p);
        });

        ["comp_1", "comp_2", "comp_3", "comp_4"].forEach((slot, i) => {
          const p = j.previews[slot];
          if (p) setRemoteCompPreview(i + 1, p);
        });
      }
    } catch (e) {
      setText("out", `❌ Error getStatus: ${e}`);
    }
  }

  async function uploadOneClient(slot, file, outId = "out", vinOverride = "", dateOverride = "") {
    const vin = String(vinOverride || $("vinText")?.value || "").trim();
    const dateStr = String(dateOverride || $("dateStr")?.value || todayYYYYMMDD());

    if (!vin) {
      marcarSlot(slot, "error", "Falta el VIN.");
      setText(outId, "❌ Falta VIN.");
      return { ok: false, error: "Falta VIN" };
    }

    marcarSlot(slot, "trabajando", ETAPAS.decodificando);

    try {
      const j = await uploadOne({
        vin,
        dateStr,
        slot,
        file,
        apsUrl: options.apsUrl,
        onProgress: (p) => marcarSlot(slot, "trabajando", ETAPAS[p.phase] || "Procesando…"),
      });

      if (!j.ok) {
        marcarSlot(slot, "error", `No se pudo subir: ${j.error || "error"}`);
        setText(outId, `❌ uploadOne(${slot}): ${j.error}`);
        return j;
      }

      if (j.preview) {
        if (slot.startsWith("comp_")) {
          const idx = Number(slot.split("_")[1] || "0");
          if (idx >= 1 && idx <= 4) setRemoteCompPreview(idx, j.preview);
        } else {
          setRemotePreview(slot, j.preview);
        }
      }

      // El ahorro se muestra en la tarjeta: es la única señal de que la foto
      // de 4 MB del iPhone no se fue entera por los datos del técnico.
      marcarSlot(slot, "ok", `✅ Guardada · ${ahorroLegible(j.foto)}`);
      setText(outId, `✅ Guardado: ${slot} (${ahorroLegible(j.foto)})`);
      return j;
    } catch (e) {
      marcarSlot(slot, "error", `Error: ${e?.message || e}`);
      setText(outId, `❌ Error ${slot}: ${e}`);
      return { ok: false, error: String(e) };
    }
  }

  // =========================
  // Compresión (4 fotos)
  // =========================
  function clearComp() {
    compFilesVisual = [null, null, null, null];
    ["comp_p1", "comp_p2", "comp_p3", "comp_p4"].forEach((id, idx) => {
      const box = $(id);
      if (box) box.innerHTML = `<span class="small">${idx + 1}</span>`;
    });
    setText("comp_meta", "Ningún archivo seleccionado.");

    const c1 = $("comp_cam");
    const c2 = $("comp_file");
    if (c1) c1.value = "";
    if (c2) c2.value = "";
  }

  function renderCompPreviews() {
    const ids = ["comp_p1", "comp_p2", "comp_p3", "comp_p4"];

    ids.forEach((id, idx) => {
      const box = $(id);
      const f = compFilesVisual[idx];
      if (!box) return;

      miniatura(box, f, { alt: `compresión ${idx + 1}`, vacio: String(idx + 1) });
    });

    const chosen = compFilesVisual.filter(Boolean);
    const totalSize = chosen.reduce((a, f) => a + (f.size || 0), 0);
    setText(
      "comp_meta",
      chosen.length ? `${chosen.length}/4 seleccionadas • ${humanBytes(totalSize)}` : "Ningún archivo seleccionado."
    );
  }

  async function addCompOne(file) {
    if (!file) return;

    let idx0 = compFilesVisual.findIndex((x) => !x);
    if (idx0 === -1) idx0 = 3; // reemplaza la 4ta si ya está lleno

    compFilesVisual[idx0] = file;
    renderCompPreviews();

    const slot = `comp_${idx0 + 1}`;
    await uploadOneClient(slot, file, "out");

    try {
      await refreshStatus();
    } catch {}
  }

  async function onPickCompCam(fileList) {
    const f = fileList?.[0] || null;
    if (!f) return;
    await addCompOne(f);
    const el = $("comp_cam");
    if (el) el.value = "";
  }

  async function onPickCompFiles(fileList) {
    const arr = Array.from(fileList || []);
    if (!arr.length) return;

    const take = arr.slice(-4);
    for (const f of take) {
      await addCompOne(f);
    }

    const el = $("comp_file");
    if (el) el.value = "";
  }

  // =========================
  // Falla (N fotos)
  // =========================
  function renderFalla() {
    const grid = $("fallaGrid");
    if (!grid) return;

    grid.innerHTML = "";

    fallaFiles.forEach((f, idx) => {
      const wrap = document.createElement("div");
      wrap.style.position = "relative";

      const thumb = document.createElement("div");
      thumb.className = "thumb";
      miniatura(thumb, f, { alt: `falla ${idx + 1}` });
      wrap.appendChild(thumb);

      const x = document.createElement("button");
      x.type = "button";
      x.textContent = "✖";
      x.className = "btn3";
      x.style.position = "absolute";
      x.style.top = "6px";
      x.style.right = "6px";
      x.style.padding = "4px 8px";
      x.style.borderRadius = "10px";
      x.onclick = () => {
        fallaFiles.splice(idx, 1);
        renderFalla();
      };
      wrap.appendChild(x);

      grid.appendChild(wrap);
    });

    const total = fallaFiles.reduce((a, f) => a + (f.size || 0), 0);
    setText("fallaFotosMeta", `${fallaFiles.length} archivo(s) • ${humanBytes(total)}`);
  }

  function addFallaFiles(fileList) {
    const arr = Array.from(fileList || []);
    if (!arr.length) return;
    fallaFiles.push(...arr);
    renderFalla();
  }

  // =========================
  // Calidad (3-4 fotos)
  // =========================
  function clearQc() {
    qcFiles = [null, null, null, null];
    ["qc_p1", "qc_p2", "qc_p3", "qc_p4"].forEach((id, idx) => {
      const box = $(id);
      if (box) box.innerHTML = `<span class="small">${idx + 1}</span>`;
    });
    setText("qc_meta", "0/4 seleccionadas.");

    const c1 = $("qc_cam");
    const c2 = $("qc_file");
    if (c1) c1.value = "";
    if (c2) c2.value = "";
  }

  function renderQc() {
    const ids = ["qc_p1", "qc_p2", "qc_p3", "qc_p4"];
    ids.forEach((id, idx) => {
      const box = $(id);
      const f = qcFiles[idx];
      if (!box) return;

      miniatura(box, f, { alt: `calidad ${idx + 1}`, vacio: String(idx + 1) });
    });

    const chosen = qcFiles.filter(Boolean);
    const total = chosen.reduce((a, f) => a + (f.size || 0), 0);
    setText("qc_meta", `${chosen.length}/4 seleccionadas • ${humanBytes(total)} (mín 3)`);
  }

  async function addQcOne(file) {
    if (!file) return;

    // desplaza y mete al final
    qcFiles[0] = qcFiles[1];
    qcFiles[1] = qcFiles[2];
    qcFiles[2] = qcFiles[3];
    qcFiles[3] = file;

    renderQc();

    const chosen = qcFiles.filter(Boolean);
    const idx = chosen.length; // 1..4
    const slot = `calidad_${idx}`;

    const vin = ($("qcVin")?.value || "").trim();
    const dateStr = $("qcDate")?.value || todayYYYYMMDD();

    await uploadOneClient(slot, file, "outQc", vin, dateStr);
  }

  async function onPickQcCam(fileList) {
    const f = fileList?.[0] || null;
    if (!f) return;
    await addQcOne(f);
    const el = $("qc_cam");
    if (el) el.value = "";
  }

  async function onPickQcFiles(fileList) {
    const arr = Array.from(fileList || []);
    if (!arr.length) return;

    const take = arr.slice(-4);
    for (const f of take) {
      await addQcOne(f);
    }

    const el = $("qc_file");
    if (el) el.value = "";
  }

  // =========================
  // Conformidad (1 foto + checklist)
  // =========================
  function renderConfPhoto() {
    const box = $("conf_previewBox");
    const meta = $("conf_meta");
    if (!box || !meta) return;

    if (!confFile) {
      box.innerHTML = `<span class="small">Sin foto</span>`;
      meta.textContent = "Ningún archivo seleccionado.";
      return;
    }

    meta.textContent = `${confFile.name || "(foto)"} • ${humanBytes(confFile.size || 0)}`;
    miniatura(box, confFile, { alt: "equipo" });
  }

  function openConformidad(tipo) {
    if ($("confTipo")) $("confTipo").value = tipo;
    if ($("confTitle")) $("confTitle").textContent = `Conformidad equipo (${tipo})`;

    const vin = ($("vinText")?.value || "").trim();
    if (vin && $("confVin")) $("confVin").value = vin;
    if ($("confDate")) $("confDate").value = $("dateStr")?.value || todayYYYYMMDD();

    if ($("chk1")) $("chk1").checked = false;
    if ($("chk2")) $("chk2").checked = false;
    if ($("chk3")) $("chk3").checked = false;

    confFile = null;
    renderConfPhoto();

    showScreen("conformidad");
  }

  // =========================
  // Scanners (params/falla/qc/conf) – usa qr-scanner.js compartido
  // =========================
  const scannerMap = {
    params: {
      scanner: scannerParams,
      box: "qrBox_params", stop: "btnStop_params",
      msg: "scanMsg_params", mode: "scanMode_params",
      setVin: (v) => {
        if ($("vinText")) $("vinText").value = v;
        refreshStatus().catch(() => {});
      },
    },
    falla: {
      scanner: scannerFalla,
      box: "qrBox_falla", stop: "btnStop_falla",
      msg: "scanMsg_falla", mode: "scanMode_falla",
      setVin: (v) => { if ($("fallaVin")) $("fallaVin").value = v; },
    },
    qc: {
      scanner: scannerQc,
      box: "qrBox_qc", stop: "btnStop_qc",
      msg: "scanMsg_qc", mode: "scanMode_qc",
      setVin: (v) => { if ($("qcVin")) $("qcVin").value = v; },
    },
    conf: {
      scanner: scannerConf,
      box: "qrBox_conf", stop: "btnStop_conf",
      msg: "scanMsg_conf", mode: "scanMode_conf",
      setVin: (v) => { if ($("confVin")) $("confVin").value = v; },
    },
    sold: {
      scanner: scannerSold,
      box: "qrBox_sold", stop: "btnStop_sold",
      msg: "scanMsg_sold", mode: "scanMode_sold",
      setVin: (v) => {
        if ($("soldVin")) $("soldVin").value = v;
        refreshSoldStatus().catch(() => {});
      },
    },
  };

  async function stopScanner(which) {
    const m = scannerMap[which];
    if (!m) return;

    await m.scanner.stop();

    const boxEl = $(m.box);
    const stopEl = $(m.stop);
    const modeEl = $(m.mode);

    if (boxEl) boxEl.style.display = "none";
    if (stopEl) stopEl.style.display = "none";
    if (modeEl) modeEl.textContent = "";
  }

  async function stopAllScanners() {
    await stopScanner("params");
    await stopScanner("falla");
    await stopScanner("qc");
    await stopScanner("conf");
    await stopScanner("sold");
  }

  async function startScanner(which, mode) {
    await stopScanner(which);

    const m = scannerMap[which];
    if (!m) return;

    const boxEl = $(m.box);
    const stopEl = $(m.stop);
    const msgEl = $(m.msg);
    const modeEl = $(m.mode);

    if (boxEl) boxEl.style.display = "block";
    if (stopEl) stopEl.style.display = "inline-block";
    if (msgEl) msgEl.textContent = "";
    if (modeEl) {
      modeEl.textContent = mode === "QR" ? "Modo: SOLO QR" : "Modo: SOLO BARRAS (CODE_128 y otros)";
    }

    try {
      await m.scanner.start({
        mode,
        msgEl: $(m.msg),
        onDecoded: (code) => {
          m.setVin(code);
          if ($(m.msg)) $(m.msg).textContent = `Detectado (${mode === "QR" ? "QR" : "BARRAS"}): ${code}`;
          stopScanner(which).catch(() => {});
        },
      });
    } catch (e) {
      if ($(m.msg)) $(m.msg).textContent = `Error cámara (${mode}): ${e}`;
    }
  }

  // =========================
  // Navegación interna
  // =========================
  function applyVinFromUrl() {
    const vin = (getQueryParam("vin") || getQueryParam("VIN") || "").trim();
    if (vin) {
      if ($("vinText")) $("vinText").value = vin;
      if ($("fallaVin")) $("fallaVin").value = vin;
      if ($("qcVin")) $("qcVin").value = vin;
      if ($("confVin")) $("confVin").value = vin;
      if ($("soldVin")) $("soldVin").value = vin;
    }

    const dateStr = (getQueryParam("date") || getQueryParam("fecha") || "").trim();
    if (dateStr) {
      if ($("dateStr")) $("dateStr").value = dateStr;
      if ($("fallaDate")) $("fallaDate").value = dateStr;
      if ($("qcDate")) $("qcDate").value = dateStr;
      if ($("confDate")) $("confDate").value = dateStr;
      if ($("soldDate")) $("soldDate").value = dateStr;
    }

    const pantalla = (getQueryParam("pantalla") || getQueryParam("screen") || "").toLowerCase();
    if (pantalla === "params") showScreen("params");
    if (pantalla === "falla") showScreen("falla");
    if (pantalla === "calidad" || pantalla === "qc") showScreen("calidad");
    if (pantalla === "conformidad" || pantalla === "conf") showScreen("conformidad");

    if (vin) {
      refreshStatus().catch(() => {});
    }
  }

  function setDefaultDates() {
    const t = todayYYYYMMDD();
    if ($("dateStr") && !$("dateStr").value) $("dateStr").value = t;
    if ($("fallaDate") && !$("fallaDate").value) $("fallaDate").value = t;
    if ($("qcDate") && !$("qcDate").value) $("qcDate").value = t;
    if ($("confDate") && !$("confDate").value) $("confDate").value = t;
    if ($("soldDate") && !$("soldDate").value) $("soldDate").value = t;
  }

  // =========================
  // Soldadura status
  // =========================
  async function refreshSoldStatus() {
    const vin     = ($("soldVin")?.value || "").trim();
    const dateStr = $("soldDate")?.value || todayYYYYMMDD();
    if (!vin) return;

    try {
      const j = await getStatus({ vin, dateStr, apsUrl: options.apsUrl });
      if (!j.ok) return;

      const soldSlots = ["sold_sensor_antes", "sold_sensor_post", "sold_cabina_antes", "sold_cabina_post"];
      soldSlots.forEach((slot) => {
        const p = j.previews && j.previews[slot];
        if (p) setRemotePreview(slot, p);
      });

      const done = soldSlots.filter((s) => j.status && j.status[s]).length;
      setText("outSold", done === 4 ? "✅ 4/4 fotos registradas." : `📷 ${done}/4 fotos registradas.`);
    } catch (e) {
      setText("outSold", `❌ Error: ${e}`);
    }
  }

  // =========================
  // Wire events
  // =========================
  function wireEvents() {
    // Menú
    $("goParams")?.addEventListener("click", () => showScreen("params"));

    $("goFalla")?.addEventListener("click", () => {
      const vin = ($("vinText")?.value || "").trim();
      if (vin && $("fallaVin")) $("fallaVin").value = vin;
      if ($("fallaDate")) $("fallaDate").value = $("dateStr")?.value || todayYYYYMMDD();
      showScreen("falla");
    });

    $("goCalidad")?.addEventListener("click", () => {
      const vin = ($("vinText")?.value || "").trim();
      if (vin && $("qcVin")) $("qcVin").value = vin;
      if ($("qcDate")) $("qcDate").value = $("dateStr")?.value || todayYYYYMMDD();
      showScreen("calidad");
    });

    $("goConfTanque")?.addEventListener("click", () => openConformidad("TANQUE"));
    $("goConfReductor")?.addEventListener("click", () => openConformidad("REDUCTOR"));

    $("goSoldadura")?.addEventListener("click", () => {
      const vin = ($("vinText")?.value || "").trim();
      if (vin && $("soldVin")) $("soldVin").value = vin;
      if ($("soldDate")) $("soldDate").value = $("dateStr")?.value || todayYYYYMMDD();
      showScreen("soldadura");
      refreshSoldStatus().catch(() => {});
    });

    $("btnBackControl")?.addEventListener("click", openBackControl);

    // Lightbox
    $("imgModalClose")?.addEventListener("click", closeImageModal);

    $("imgModal")?.addEventListener("click", (e) => {
      if (e.target === $("imgModal")) closeImageModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeImageModal();
    });

    shell.addEventListener("click", (e) => {
      const img = e.target?.closest?.(".thumb img");
      if (!img) return;
      openImageModal(img.currentSrc || img.src);
    });

    // Nav buttons (data-nav)
    shell.addEventListener("click", async (ev) => {
      const b = ev.target.closest("button");
      if (!b) return;
      if (b.getAttribute("data-nav") !== "menu") return;

      if (screens.params?.classList.contains("active")) {
        await conBotonOcupado(b, "⏳ Comprobando…", async () => {
          if (await puedeSalirDeParams()) showScreen("menu");
        });
        return;
      }
      showScreen("menu");
    });

    // Params: status
    $("btnRefresh")?.addEventListener("click", () =>
      conBotonOcupado($("btnRefresh"), "🔄 Consultando…", refreshStatus)
    );
    $("vinText")?.addEventListener("change", refreshStatus);
    $("dateStr")?.addEventListener("change", refreshStatus);

    // Delegación tomar/subir/quitar (slots normales + comp)
    shell.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button");
      if (!btn) return;

      const slot = btn.getAttribute("data-slot");
      if (!slot) return;

      if (btn.getAttribute("data-pick") === "cam") {
        if (slot === "comp") $("comp_cam")?.click();
        else $(`${slot}_cam`)?.click();
      }

      if (btn.getAttribute("data-pick") === "file") {
        if (slot === "comp") $("comp_file")?.click();
        else $(`${slot}_file`)?.click();
      }

      if (btn.getAttribute("data-clear") === "1") {
        if (slot === "comp") {
          clearComp();
        } else {
          // Borrar del backend (R2) si hay VIN disponible
          const isSold = slot.startsWith("sold_");
          const vinToDel = isSold
            ? ($(`soldVin`)?.value || "").trim()
            : ($(`vinText`)?.value || "").trim();
          const dateToDel = isSold
            ? ($(`soldDate`)?.value || todayYYYYMMDD())
            : ($(`dateStr`)?.value || todayYYYYMMDD());
          if (vinToDel) {
            deleteSlot({ vin: vinToDel, dateStr: dateToDel, slot, apsUrl: options.apsUrl })
              .then(() => {
                // Confirmar que R2 ya no tiene el archivo
                if (isSold) refreshSoldStatus().catch(() => {});
                else       refreshStatus().catch(() => {});
              })
              .catch(() => {});
          }
          delete selectedFilesBySlot[slot];
          setPreview(slot, null);
          const cam = $(`${slot}_cam`);
          const fil = $(`${slot}_file`);
          if (cam) cam.value = "";
          if (fil) fil.value = "";
        }
      }
    });

    // Slots normales (suben al toque)
    const normalSlots = ["vin", "corr_pre", "corr_post", "voltaje", "scan_carro"];
    normalSlots.forEach((slot) => {
      const cam = $(`${slot}_cam`);
      const fil = $(`${slot}_file`);

      const onPick = async (e) => {
        const f = e.target?.files?.[0];
        if (!f) return;

        setPreview(slot, f);

        const j = await uploadOneClient(slot, f, "out");
        if (j && j.ok) {
          if (cam) cam.value = "";
          if (fil) fil.value = "";
          delete selectedFilesBySlot[slot];
          try {
            await refreshStatus();
          } catch {}
        } else {
          selectedFilesBySlot[slot] = f;
        }
      };

      if (cam) cam.addEventListener("change", onPick);
      if (fil) fil.addEventListener("change", onPick);
      setPreview(slot, null);
    });

    // Soldadura slots (suben al toque, VIN desde #up_soldVin)
    const soldSlots = ["sold_sensor_antes", "sold_sensor_post", "sold_cabina_antes", "sold_cabina_post"];
    soldSlots.forEach((slot) => {
      const cam = $(`${slot}_cam`);
      const fil = $(`${slot}_file`);

      const onPick = async (e) => {
        const f = e.target?.files?.[0];
        if (!f) return;

        setPreview(slot, f);

        const vin = ($("soldVin")?.value || "").trim();
        const dateStr = $("soldDate")?.value || todayYYYYMMDD();
        const j = await uploadOneClient(slot, f, "outSold", vin, dateStr);
        if (j && j.ok) {
          if (cam) cam.value = "";
          if (fil) fil.value = "";
          delete selectedFilesBySlot[slot];
          try { await refreshSoldStatus(); } catch {}
        } else {
          selectedFilesBySlot[slot] = f;
        }
      };

      if (cam) cam.addEventListener("change", onPick);
      if (fil) fil.addEventListener("change", onPick);
      setPreview(slot, null);
    });

    $("soldVin")?.addEventListener("change", () => refreshSoldStatus().catch(() => {}));
    $("soldDate")?.addEventListener("change", () => refreshSoldStatus().catch(() => {}));

    // Scanner soldadura
    $("btnScanQR_sold")?.addEventListener("click", () => startScanner("sold", "QR"));
    $("btnScanBAR_sold")?.addEventListener("click", () => startScanner("sold", "BAR"));
    $("btnStop_sold")?.addEventListener("click", () => stopScanner("sold"));

    // Compresión (4)
    $("comp_cam")?.addEventListener("change", (e) => onPickCompCam(e.target.files));
    $("comp_file")?.addEventListener("change", (e) => onPickCompFiles(e.target.files));
    clearComp();

    // Scanners
    $("btnScanQR_params")?.addEventListener("click", () => startScanner("params", "QR"));
    $("btnScanBAR_params")?.addEventListener("click", () => startScanner("params", "BAR"));
    $("btnStop_params")?.addEventListener("click", () => stopScanner("params"));

    $("btnScanQR_falla")?.addEventListener("click", () => startScanner("falla", "QR"));
    $("btnScanBAR_falla")?.addEventListener("click", () => startScanner("falla", "BAR"));
    $("btnStop_falla")?.addEventListener("click", () => stopScanner("falla"));

    $("btnScanQR_qc")?.addEventListener("click", () => startScanner("qc", "QR"));
    $("btnScanBAR_qc")?.addEventListener("click", () => startScanner("qc", "BAR"));
    $("btnStop_qc")?.addEventListener("click", () => stopScanner("qc"));

    $("btnScanQR_conf")?.addEventListener("click", () => startScanner("conf", "QR"));
    $("btnScanBAR_conf")?.addEventListener("click", () => startScanner("conf", "BAR"));
    $("btnStop_conf")?.addEventListener("click", () => stopScanner("conf"));

    // Falla files
    $("btnFallaCam")?.addEventListener("click", () => $("falla_cam")?.click());
    $("btnFallaFile")?.addEventListener("click", () => $("falla_file")?.click());
    $("btnFallaClear")?.addEventListener("click", () => {
      fallaFiles = [];
      renderFalla();
    });

    $("falla_cam")?.addEventListener("change", (e) => {
      addFallaFiles(e.target.files);
      e.target.value = "";
    });

    $("falla_file")?.addEventListener("change", (e) => {
      addFallaFiles(e.target.files);
      e.target.value = "";
    });

    $("btnEnviarFalla")?.addEventListener("click", async () => {
      await conBotonOcupado($("btnEnviarFalla"), "⏳ ENVIANDO…", async () => {
        const vin = ($("fallaVin")?.value || "").trim();
        const dateStr = $("fallaDate")?.value || todayYYYYMMDD();
        const note = ($("fallaNota")?.value || "").trim();

        if (!vin) {
          setText("outFalla", "❌ Falta VIN.");
          return;
        }

        if (!note && fallaFiles.length === 0) {
          setText("outFalla", "⚠️ Agrega una nota o al menos una foto.");
          return;
        }

        try {
          const j = await uploadFalla({
            vin,
            dateStr,
            note,
            files: fallaFiles,
            apsUrl: options.apsUrl,
            onProgress: (p) => {
              if (p.phase === "prepare") {
                setText("outFalla", `Comprimiendo foto ${p.index}/${p.total}…\n`);
              } else if (p.phase === "upload") {
                setText("outFalla", `Subiendo FALLA: ${p.total} foto(s) + nota · ${humanBytes(p.bytes)}\n`);
              }
            },
          });

          if (!j.ok) {
            setText("outFalla", "❌ uploadFalla: " + (j.error || "Error"));
            return;
          }

          setText(
            "outFalla",
            `✅ Falla registrada.\nCarpeta: ${j.carFolderName}/FALLAS\nBatch: ${j.batchId}\nGuardados: ${j.savedCount}`
          );

          fallaFiles = [];
          renderFalla();
        } catch (e) {
          setText("outFalla", `❌ Error FALLA: ${e}`);
        }
      });
    });

    renderFalla();

    // Calidad files
    $("btnQcCam")?.addEventListener("click", () => $("qc_cam")?.click());
    $("btnQcFile")?.addEventListener("click", () => $("qc_file")?.click());
    $("btnQcClear")?.addEventListener("click", clearQc);

    $("qc_cam")?.addEventListener("change", (e) => onPickQcCam(e.target.files));
    $("qc_file")?.addEventListener("change", (e) => onPickQcFiles(e.target.files));
    clearQc();

    $("btnQcUpload")?.addEventListener("click", async () => {
      await conBotonOcupado($("btnQcUpload"), "⏳ ENVIANDO…", async () => {
        const vin = ($("qcVin")?.value || "").trim();
        const dateStr = $("qcDate")?.value || todayYYYYMMDD();

        if (!vin) {
          setText("outQc", "❌ Falta VIN.");
          return;
        }

        const chosen = qcFiles.filter(Boolean);
        if (chosen.length < 3) {
          setText("outQc", "⚠️ Debes subir mínimo 3 fotos de calidad.");
          return;
        }

        const items = [];
        for (let i = 0; i < 4; i++) {
          const f = qcFiles[i];
          if (!f) continue;
          items.push({ slot: `calidad_${i + 1}`, file: f });
        }

        try {
          const j = await uploadCalidadBatch({
            vin,
            dateStr,
            items,
            apsUrl: options.apsUrl,
            onProgress: (p) => {
              if (p.phase === "prepare") {
                setText("outQc", `Comprimiendo foto ${p.index}/${p.total}…\n`);
              } else if (p.phase === "upload") {
                setText("outQc", `Enviando CALIDAD: ${p.total} foto(s) · ${humanBytes(p.bytes)}\n`);
              }
            },
          });

          if (!j.ok) {
            setText("outQc", "❌ uploadCalidad: " + (j.error || "Error"));
            return;
          }

          setText(
            "outQc",
            `✅ Calidad registrada.\nCarpeta: ${j.carFolderName}/CALIDAD\nGuardados: ${
              Array.isArray(j.saved) ? j.saved.length : items.length
            }`
          );

          clearQc();
        } catch (e) {
          setText("outQc", `❌ Error CALIDAD: ${e}`);
        }
      });
    });

    // Conformidad
    $("btnConfCam")?.addEventListener("click", () => $("conf_cam")?.click());
    $("btnConfFile")?.addEventListener("click", () => $("conf_file")?.click());
    $("btnConfClear")?.addEventListener("click", () => {
      confFile = null;
      renderConfPhoto();
    });

    $("conf_cam")?.addEventListener("change", (e) => {
      confFile = e.target.files?.[0] || null;
      renderConfPhoto();
      e.target.value = "";
    });

    $("conf_file")?.addEventListener("change", (e) => {
      confFile = e.target.files?.[0] || null;
      renderConfPhoto();
      e.target.value = "";
    });

    $("btnEnviarConf")?.addEventListener("click", async () => {
      await conBotonOcupado($("btnEnviarConf"), "⏳ ENVIANDO…", async () => {
        const tipo = ($("confTipo")?.value || "").trim();
        const vin = ($("confVin")?.value || "").trim();
        const dateStr = $("confDate")?.value || todayYYYYMMDD();
        const tecnico = ($("confTecnico")?.value || "").trim();

        const checklist = {
          revisadoConTiempo: !!$("chk1")?.checked,
          responsablePerdida: !!$("chk2")?.checked,
          todoConforme: !!$("chk3")?.checked,
        };

        if (!vin) {
          setText("outConf", "❌ Falta VIN.");
          return;
        }
        if (!tecnico) {
          setText("outConf", "❌ Falta nombre del técnico.");
          return;
        }
        if (!confFile) {
          setText("outConf", "❌ Falta foto del equipo.");
          return;
        }

        if (!checklist.revisadoConTiempo || !checklist.responsablePerdida || !checklist.todoConforme) {
          setText("outConf", "⚠️ Debes marcar los 3 checks de conformidad.");
          return;
        }

        try {
          const j = await uploadConformidad({
            tipo,
            vin,
            dateStr,
            tecnico,
            checklist,
            file: confFile,
            apsUrl: options.apsUrl,
            onProgress: (p) => {
              setText("outConf", ETAPAS[p.phase] || "Enviando conformidad…");
            },
          });

          if (!j.ok) {
            setText("outConf", "❌ uploadConformidad: " + (j.error || "Error"));
            return;
          }

          setText(
            "outConf",
            `✅ Conformidad registrada.\n` +
              `Tipo: ${tipo}\n` +
              `Carpeta: ${j.carFolderName}/${j.mainFolderName}/${j.subFolderName}\n` +
              `Acta: ${j.actaName}\n` +
              `Foto: ${j.photoName}`
          );

          confFile = null;
          renderConfPhoto();
        } catch (e) {
          setText("outConf", `❌ Error CONFORMIDAD: ${e}`);
        }
      });
    });

    renderConfPhoto();
  }

  // =========================
  // API pública del controlador UI
  // =========================
  function show(payload = {}) {
    const vin = String(payload.vin || "").trim();
    const dateStr = String(payload.dateStr || "").trim();
    const screen = String(payload.screen || "").trim().toLowerCase();

    if (vin) {
      if ($("vinText")) $("vinText").value = vin;
      if ($("fallaVin")) $("fallaVin").value = vin;
      if ($("qcVin")) $("qcVin").value = vin;
      if ($("confVin")) $("confVin").value = vin;
      if ($("soldVin")) $("soldVin").value = vin;
    }

    if (dateStr) {
      if ($("dateStr")) $("dateStr").value = dateStr;
      if ($("fallaDate")) $("fallaDate").value = dateStr;
      if ($("qcDate")) $("qcDate").value = dateStr;
      if ($("confDate")) $("confDate").value = dateStr;
      if ($("soldDate")) $("soldDate").value = dateStr;
    }

    if (root) root.style.display = "block";

    if (screen === "params") showScreen("params");
    else if (screen === "falla") showScreen("falla");
    else if (screen === "calidad" || screen === "qc") showScreen("calidad");
    else if (screen === "conformidad" || screen === "conf") showScreen("conformidad");
    else if (screen === "soldadura") {
      showScreen("soldadura");
      if (vin) refreshSoldStatus().catch(() => {});
    }
    else showScreen("menu");

    if (($("vinText")?.value || "").trim()) {
      refreshStatus().catch(() => {});
    }
  }

  function hide() {
    stopAllScanners().catch(() => {});
    if (root) root.style.display = "none";
  }

  // Init
  setDefaultDates();
  wireEvents();
  applyVinFromUrl();
  showScreen("menu");

  return {
    show,
    hide,
    refreshStatus,
    showScreen,
    stopAllScanners,
  };
}