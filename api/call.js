/**
 * api/call.js — Single dispatcher endpoint, ported from processApiCall()
 * in the original Code.gs.
 *
 * POST /api/call
 * Body: { action: string, payload: object }
 * Returns: { ok: true, data: any } | { ok: false, error: string }
 *
 * This mirrors the original request/response shape exactly so the existing
 * frontend (JS_State.html's callApi) needs almost no changes — it just
 * needs to fetch() this URL instead of using google.script.run.
 */

const { CONFIG } = require("../lib/config");
const {
  saveRoute,
  getHomeData,
  getExploreData,
  getGpxDownload,
  deleteRoute
} = require("../lib/routes");
const { toggleLike, addComment, getComments } = require("../lib/social");

module.exports = async function handler(req, res) {
  // Basic CORS (safe to keep even for same-origin deploys on Vercel)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const action = body && body.action;
    const payload = (body && body.payload) || {};
    let result;

    switch (action) {
      // ── Route CRUD ──────────────────────────────────────────────────────
      case "saveRoute":
        result = await saveRoute(payload.meta, payload.base64Gpx);
        break;
      case "getHomeData":
        result = await getHomeData();
        break;
      case "getExploreData":
        result = await getExploreData(payload || {});
        break;
      case "getGpxDownload":
        result = await getGpxDownload(payload.routeId);
        break;
      case "deleteRoute":
        if (!CONFIG.ADMIN_SECRET)
          throw new Error("deleteRoute is disabled");
        if (!payload || payload.adminSecret !== CONFIG.ADMIN_SECRET)
          throw new Error("Unauthorized");
        result = await deleteRoute(payload.routeId);
        break;

      // ── Social ───────────────────────────────────────────────────────────
      case "toggleLike":
        result = await toggleLike(payload.routeId, payload.userFingerprint);
        break;
      case "addComment":
        result = await addComment(payload.routeId, payload.userName, payload.commentText);
        break;
      case "getComments":
        result = await getComments(payload.routeId);
        break;

      default:
        throw new Error("Unknown action: " + action);
    }

    res.status(200).json({ ok: true, data: result });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message });
  }
};
