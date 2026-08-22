/**
 * driveHelpers.js — Google Drive folder provisioning and GPX file storage.
 * Node.js port of DriveHelpers.gs using the Drive API v3 (googleapis).
 *
 * Folder hierarchy (unchanged): Root / Country / {routeId}_{routeName} / routeName.gpx
 *
 * IMPORTANT: because this now runs as a Service Account (not "you" the
 * script owner), the Service Account is the actual owner of any folder it
 * creates. Files it creates live in the Service Account's own Drive quota
 * unless you point ROOT_FOLDER_ID at a folder that lives in a Shared Drive,
 * or a folder that has been explicitly shared with the service account as
 * Editor. See README.md.
 */

const { getDriveClient } = require("./googleAuth");
const { CONFIG } = require("./config");

const FOLDER_MIME = "application/vnd.google-apps.folder";

// ─── ROOT FOLDER ────────────────────────────────────────────────────────────

let rootFolderIdCache = null;

/**
 * Returns the root Drive folder ID, creating it if absent.
 * Prefers CONFIG.ROOT_FOLDER_ID if set; otherwise searches by name.
 */
async function getRootFolderId() {
  if (rootFolderIdCache) return rootFolderIdCache;

  const drive = await getDriveClient();

  if (CONFIG.ROOT_FOLDER_ID) {
    rootFolderIdCache = CONFIG.ROOT_FOLDER_ID;
    return rootFolderIdCache;
  }

  const q = `name='${escapeQ(CONFIG.ROOT_FOLDER_NAME)}' and mimeType='${FOLDER_MIME}' and trashed=false`;
  const list = await drive.files.list({
    q,
    fields: "files(id,name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });

  if (list.data.files && list.data.files.length) {
    rootFolderIdCache = list.data.files[0].id;
    return rootFolderIdCache;
  }

  const created = await drive.files.create({
    requestBody: { name: CONFIG.ROOT_FOLDER_NAME, mimeType: FOLDER_MIME },
    fields: "id",
    supportsAllDrives: true
  });
  rootFolderIdCache = created.data.id;
  return rootFolderIdCache;
}

// ─── FOLDER UTILITIES ───────────────────────────────────────────────────────

function escapeQ(str) {
  return String(str).replace(/'/g, "\\'");
}

/**
 * Gets or creates a sub-folder by name inside a parent folder.
 * Trims the name; falls back to "Unknown" if blank.
 */
async function getOrCreateSubFolder(parentId, name) {
  const drive = await getDriveClient();
  const safe = (name || "Unknown").trim() || "Unknown";

  const q = `name='${escapeQ(safe)}' and mimeType='${FOLDER_MIME}' and '${parentId}' in parents and trashed=false`;
  const list = await drive.files.list({
    q,
    fields: "files(id,name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });
  if (list.data.files && list.data.files.length) return list.data.files[0].id;

  const created = await drive.files.create({
    requestBody: { name: safe, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: "id",
    supportsAllDrives: true
  });
  return created.data.id;
}

/**
 * Strips characters that are illegal in Drive folder/file names.
 * Truncates to 100 characters.
 */
function sanitize(str) {
  return String(str).replace(/[\/\\:*?"<>|]/g, "_").substring(0, 100);
}

// ─── GPX FILE STORAGE ───────────────────────────────────────────────────────

/**
 * Saves a GPX string to Drive under:
 *   GPX_Run_Database / country / {routeId}_{routeName} / routeName.gpx
 *
 * @param {string} routeId      UUID of the route
 * @param {string} routeName    Human-readable route name
 * @param {string} country      Used as the top-level sub-folder
 * @param {string} gpxContent   Raw GPX XML string
 * @returns {string}            Drive file ID of the saved .gpx file
 */
async function saveGpxToDrive(routeId, routeName, country, gpxContent) {
  const drive = await getDriveClient();
  const rootId = await getRootFolderId();
  const cFolderId = await getOrCreateSubFolder(rootId, country || "Unknown");
  const rFolderId = await getOrCreateSubFolder(cFolderId, sanitize(routeId + "_" + routeName));
  const fname = sanitize(routeName) + ".gpx";

  const created = await drive.files.create({
    requestBody: { name: fname, parents: [rFolderId] },
    media: { mimeType: "application/gpx+xml", body: gpxContent },
    fields: "id",
    supportsAllDrives: true
  });

  return created.data.id;
}

/** Fetches raw file bytes (as a Buffer) for a given Drive file ID. */
async function getFileBuffer(fileId) {
  const drive = await getDriveClient();
  const resp = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(resp.data);
}

/** Trashes (soft-deletes) a Drive file. Swallows errors, matching the GAS original. */
async function trashFile(fileId) {
  try {
    const drive = await getDriveClient();
    await drive.files.update({
      fileId,
      requestBody: { trashed: true },
      supportsAllDrives: true
    });
  } catch (e) { /* ignore, matches original try/catch */ }
}

module.exports = { saveGpxToDrive, getFileBuffer, trashFile, sanitize };
