import { Router } from "express";
import {
  r2UploadOne,
  r2UploadFalla,
  r2UploadCalidad,
  r2UploadConformidad,
  r2GetStatus,
  r2DeleteSlot,
  r2UploadAvatar,
} from "../r2-uploads.js";

const router = Router();

// =========================
// =========================
// UPLOADER → Cloudflare R2
// =========================
const R2_ACTIONS = new Set(["getStatus", "uploadOne", "uploadFalla", "uploadCalidad", "uploadConformidad", "deleteSlot", "uploadAvatar"]);

router.post("/api/uploader/proxy", async (req, res) => {
  try {
    const body   = req.body || {};
    const action = String(body.action || "").trim();
    const { action: _omit, ...payload } = body;

    console.log("[R2_UPLOADER] action:", action);

    if (!R2_ACTIONS.has(action)) {
      return res.status(400).json({ ok: false, error: "Acción no permitida" });
    }

    let result;
    switch (action) {
      case "getStatus":
        result = await r2GetStatus(payload);
        break;
      case "uploadOne":
        result = await r2UploadOne(payload);
        break;
      case "uploadFalla":
        result = await r2UploadFalla(payload);
        break;
      case "uploadCalidad":
        result = await r2UploadCalidad(payload);
        break;
      case "uploadConformidad":
        result = await r2UploadConformidad(payload);
        break;
      case "deleteSlot":
        result = await r2DeleteSlot(payload);
        break;
      case "uploadAvatar":
        result = await r2UploadAvatar(payload);
        break;
      default:
        return res.status(400).json({ ok: false, error: "Acción desconocida" });
    }

    return res.json(result);
  } catch (e) {
    console.error("[R2_UPLOADER] ERROR:", e.message);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

export default router;
