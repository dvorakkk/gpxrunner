/**
 * config.js — Global constants shared across all backend modules.
 * Mirrors the original Config.gs, but values come from environment
 * variables instead of hard-coded constants (set these in the Vercel
 * dashboard → Project → Settings → Environment Variables).
 */

const CONFIG = {
  // Required. The same Spreadsheet ID you were already using in Apps Script.
  SPREADSHEET_ID: process.env.SPREADSHEET_ID || "",

  // Used only if DRIVE_ROOT_FOLDER_ID is not set — the app searches Drive
  // for a folder with this name (and creates it if missing).
  ROOT_FOLDER_NAME: process.env.DRIVE_ROOT_FOLDER_NAME || "GPX_Run_Database",

  // Recommended: paste the explicit Drive folder ID so the app doesn't have
  // to search for it on every cold start.
  ROOT_FOLDER_ID: process.env.DRIVE_ROOT_FOLDER_ID || "",

  // Required to call deleteRoute via the web API. Leave empty to keep deletes disabled.
  ADMIN_SECRET: process.env.ADMIN_SECRET || "",

  MAX_POLYLINE_JSON: 45000, // Sheets cell limit is 50k; stay under it

  // Service account credentials (legacy — kept for backward compatibility,
  // but Drive uploads from a plain personal Gmail account will fail with
  // "Service Accounts do not have storage quota" unless GOOGLE_OAUTH_* below
  // is configured instead). See README.md.
  GOOGLE_SERVICE_ACCOUNT_KEY_B64: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64 || "",

  // OAuth2 credentials — authenticates as YOUR OWN Google account instead of
  // a service account, so Drive uploads use your personal storage quota.
  // Required for personal Gmail accounts (no Google Workspace / Shared Drives).
  GOOGLE_OAUTH_CLIENT_ID:     process.env.GOOGLE_OAUTH_CLIENT_ID     || "",
  GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
  GOOGLE_OAUTH_REFRESH_TOKEN: process.env.GOOGLE_OAUTH_REFRESH_TOKEN || ""
};

const SCHEMAS = {
  Routes: [
    "route_id", "route_name", "type", "is_map_art", "distance_km", "elev_gain",
    "level", "itra_display", "country", "province", "regency", "likes_count",
    "gpx_file_id", "polyline_json", "details", "timestamp"
  ],
  Comments: [
    "comment_id", "route_id", "user_name", "comment_text", "timestamp"
  ],
  Likes: [
    "like_id", "route_id", "user_fingerprint", "timestamp"
  ]
};

module.exports = { CONFIG, SCHEMAS };
