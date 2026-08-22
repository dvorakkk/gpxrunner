/**
 * routes.js — API handlers for route CRUD and data retrieval.
 * Node.js port of Routes.gs. Logic is intentionally kept close to the
 * original so behavior matches exactly.
 */

const crypto = require("crypto");
const { CONFIG } = require("./config");
const { sheetToObjects, appendRow, deleteRowById, deleteRowsByIds } = require("./sheetHelpers");
const { saveGpxToDrive, getFileBuffer, trashFile, sanitize } = require("./driveHelpers");

function uuid() {
  return crypto.randomUUID();
}

// ─── saveRoute ──────────────────────────────────────────────────────────────

/**
 * Creates a new route record.
 *
 * @param {Object} meta        Route metadata from the frontend form
 * @param {string} base64Gpx   Base64-encoded GPX XML string (may be empty)
 * @returns {Object}           The saved route object (mirrors the sheet row)
 */
async function saveRoute(meta, base64Gpx) {
  if (!meta || !meta.route_name) throw new Error("route_name is required");
  if (!["Trail", "Road"].includes(meta.type))
    throw new Error("type must be 'Trail' or 'Road'");

  const routeId = uuid();
  let gpxFileId = "";
  const name = String(meta.route_name).trim().substring(0, 120);
  if (!name) throw new Error("route_name is required");

  let polylineJson = capPolylineJson(meta.polyline_json);

  // Decode and store GPX file in Drive if provided
  if (base64Gpx) {
    const gpxStr = Buffer.from(base64Gpx, "base64").toString("utf8");
    gpxFileId = await saveGpxToDrive(routeId, name, meta.country, gpxStr);
  }

  const route = {
    route_id: routeId,
    route_name: name,
    type: meta.type,
    is_map_art: meta.is_map_art ? "true" : "false",
    distance_km: Number(meta.distance_km) || 0,
    elev_gain: Number(meta.elev_gain) || 0,
    level: String(meta.level || "").substring(0, 40),
    itra_display: String(meta.itra_display || "").substring(0, 60),
    country: (meta.country || "").trim().substring(0, 80),
    province: (meta.province || "").trim().substring(0, 80),
    regency: (meta.regency || "").trim().substring(0, 80),
    likes_count: 0,
    gpx_file_id: gpxFileId,
    polyline_json: polylineJson,
    details: (meta.details || "").trim().substring(0, 2000),
    timestamp: new Date().toISOString()
  };

  try {
    await appendRow("Routes", route);
  } catch (e) {
    if (gpxFileId) await trashFile(gpxFileId);
    throw e;
  }
  return route;
}

/** Keeps polyline JSON under the Sheets cell size limit. */
function capPolylineJson(raw) {
  const max = CONFIG.MAX_POLYLINE_JSON || 45000;
  let str = raw == null || raw === "" ? "[]" : String(raw);
  if (str.length <= max) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed) || (parsed && Array.isArray(parsed.p))) return str;
    } catch (e) {}
    return "[]";
  }
  try {
    const parsed = JSON.parse(str);
    const pts = Array.isArray(parsed) ? parsed : (parsed && parsed.p) || [];
    const ele = (!Array.isArray(parsed) && parsed && parsed.e) || [];
    const keep = Math.max(2, Math.floor(pts.length * max / str.length));
    const step = Math.max(1, Math.floor(pts.length / keep));
    const p = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
    const e = ele.length ? ele.filter((_, i) => i % step === 0 || i === ele.length - 1) : [];
    const out = JSON.stringify(e.length ? { p: p, e: e } : p);
    return out.length <= max ? out : JSON.stringify({ p: p.slice(0, 40), e: e.slice(0, 40) });
  } catch (e) {
    return "[]";
  }
}

// ─── COMMENT COUNTS ─────────────────────────────────────────────────────────

async function attachCommentCounts(routes) {
  if (!routes || !routes.length) return routes;
  const comments = await sheetToObjects("Comments");
  const counts = {};
  comments.forEach(c => {
    counts[c.route_id] = (counts[c.route_id] || 0) + 1;
  });
  routes.forEach(r => { r.comments_count = counts[r.route_id] || 0; });
  return routes;
}

// ─── getHomeData ────────────────────────────────────────────────────────────

async function getHomeData() {
  const routes = await sheetToObjects("Routes");
  await attachCommentCounts(routes);

  const mapArt = routes
    .filter(r => r.is_map_art === "true" || r.is_map_art === true)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 6);

  const popular = [...routes]
    .sort((a, b) => {
      const diff = Number(b.likes_count) - Number(a.likes_count);
      if (diff !== 0) return diff;
      return a.route_id < b.route_id ? -1 : 1;
    })
    .slice(0, 12);

  const stats = {
    total: routes.length,
    totalTrail: routes.filter(r => r.type === "Trail").length,
    totalRoad: routes.filter(r => r.type === "Road").length,
    countries: new Set(routes.map(r => r.country).filter(Boolean)).size
  };

  return { mapArt, popular, stats };
}

// ─── getExploreData ─────────────────────────────────────────────────────────

async function getExploreData(filters) {
  filters = filters || {};
  const all = await sheetToObjects("Routes");
  await attachCommentCounts(all);
  let routes = all;

  if (filters.type && filters.type !== "All")
    routes = routes.filter(r => r.type === filters.type);

  if (filters.country && filters.country !== "All")
    routes = routes.filter(r => r.country === filters.country);

  if (filters.province && filters.province !== "All")
    routes = routes.filter(r => r.province === filters.province);

  if (filters.regency && filters.regency !== "All")
    routes = routes.filter(r => r.regency === filters.regency);

  if (filters.distBucket && filters.distBucket !== "All") {
    routes = routes.filter(r => {
      const d = Number(r.distance_km);
      switch (filters.distBucket) {
        case "<5k": return d < 5;
        case "5-10k": return d >= 5 && d < 10;
        case "10-21k": return d >= 10 && d < 22;
        case "22-42k":
        case "22-50k": return d >= 22 && d < 50;
        case ">50k": return d >= 50;
        default: return true;
      }
    });
  }

  let searched = false;
  if (filters.search) {
    const tokens = String(filters.search).toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length) {
      searched = true;
      const haystackOf = r => [
        r.route_name, r.country, r.province, r.regency, r.details
      ].map(v => String(v || "")).join(" ").toLowerCase();

      routes = routes
        .map(r => ({ r, matches: tokens.filter(t => haystackOf(r).includes(t)).length }))
        .filter(x => x.matches > 0)
        .sort((a, b) => b.matches - a.matches ||
                         new Date(b.r.timestamp) - new Date(a.r.timestamp))
        .map(x => x.r);
    }
  }

  const sortedRoutes = searched
    ? routes
    : routes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const unique = arr => [...new Set(arr.filter(Boolean))].sort();

  return {
    routes: sortedRoutes,
    filterOptions: {
      countries: unique(all.map(r => r.country)),
      provinces: unique(all.map(r => r.province)),
      regencies: unique(all.map(r => r.regency))
    }
  };
}

// ─── getGpxDownload ─────────────────────────────────────────────────────────

async function getGpxDownload(routeId) {
  if (!routeId) throw new Error("routeId is required");

  const routes = await sheetToObjects("Routes");
  const route = routes.find(r => String(r.route_id) === String(routeId));
  if (!route) throw new Error("Route not found: " + routeId);
  if (!route.gpx_file_id) throw new Error("This route has no GPX file attached");

  let bytes;
  try {
    bytes = await getFileBuffer(route.gpx_file_id);
  } catch (e) {
    throw new Error("GPX file is no longer available in Drive");
  }

  return {
    filename: sanitize(route.route_name || "route") + ".gpx",
    base64: bytes.toString("base64")
  };
}

// ─── deleteRoute ────────────────────────────────────────────────────────────

async function deleteRoute(routeId) {
  if (!routeId) throw new Error("routeId is required");

  const routes = await sheetToObjects("Routes");
  const route = routes.find(r => r.route_id === routeId);
  if (route && route.gpx_file_id) await trashFile(route.gpx_file_id);

  await deleteRowById("Routes", "route_id", routeId);

  const commentIds = (await sheetToObjects("Comments"))
    .filter(c => c.route_id === routeId)
    .map(c => c.comment_id);
  await deleteRowsByIds("Comments", "comment_id", commentIds);

  const likeIds = (await sheetToObjects("Likes"))
    .filter(l => l.route_id === routeId)
    .map(l => l.like_id);
  await deleteRowsByIds("Likes", "like_id", likeIds);

  return { deleted: routeId };
}

module.exports = {
  saveRoute,
  getHomeData,
  getExploreData,
  getGpxDownload,
  deleteRoute
};
