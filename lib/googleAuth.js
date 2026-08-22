/**
 * googleAuth.js — Builds authenticated Sheets & Drive API clients using a
 * Google Cloud Service Account, replacing the implicit GAS auth
 * (SpreadsheetApp / DriveApp) used in the original Apps Script version.
 *
 * Setup required (see README.md):
 *   1. Create a Service Account in Google Cloud Console.
 *   2. Enable "Google Sheets API" and "Google Drive API" for the project.
 *   3. Create a JSON key for the service account, base64-encode the file,
 *      and set it as GOOGLE_SERVICE_ACCOUNT_KEY_B64 in Vercel env vars.
 *   4. Share your Google Sheet AND your Drive root folder with the
 *      service account's email (as Editor) — otherwise it can't read/write.
 */

const { google } = require("googleapis");
const { CONFIG } = require("./config");

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive"
];

let cachedAuth = null;

function getCredentials() {
  if (!CONFIG.GOOGLE_SERVICE_ACCOUNT_KEY_B64) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY_B64 is not set. See README.md for setup instructions."
    );
  }
  const jsonStr = Buffer
    .from(CONFIG.GOOGLE_SERVICE_ACCOUNT_KEY_B64, "base64")
    .toString("utf8");
  return JSON.parse(jsonStr);
}

function getAuth() {
  if (cachedAuth) return cachedAuth;
  const credentials = getCredentials();
  cachedAuth = new google.auth.GoogleAuth({
    credentials,
    scopes: SCOPES
  });
  return cachedAuth;
}

async function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: "v4", auth });
}

async function getDriveClient() {
  const auth = getAuth();
  return google.drive({ version: "v3", auth });
}

module.exports = { getAuth, getSheetsClient, getDriveClient };
