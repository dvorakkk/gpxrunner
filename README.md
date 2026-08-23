# Runnershub — Vercel + Google Sheets/Drive (tanpa Apps Script)

Ini adalah migrasi dari **Runnershub** (awalnya 100% Google Apps Script) ke
**Vercel**. Frontend (HTML/CSS/JS) dan alur pengguna **tidak diubah sama
sekali** — hanya backend-nya yang dipindah dari `Code.gs` (Apps Script) ke
Vercel Serverless Functions (Node.js). Database tetap **Google Sheets**
(untuk data Routes/Comments/Likes) dan **Google Drive** (untuk file GPX),
persis seperti sebelumnya.

## Apa yang berubah, apa yang tidak

| Bagian | Sebelumnya | Sekarang |
|---|---|---|
| Hosting | Apps Script Web App | Vercel |
| UI (HTML/CSS/JS) | `Index.html`, `CSS.html`, `JS_*.html` | `public/index.html` (hasil gabungan, isi sama persis) |
| Jembatan API | `google.script.run` → `processApiCall()` | `fetch('/api/call')` → `api/call.js` |
| Akses Sheets | `SpreadsheetApp` (auth implisit sbg pemilik script) | Google Sheets API v4 via **Service Account** |
| Akses Drive | `DriveApp` (auth implisit) | Google Drive API v3 via **Service Account** |
| Skema data (kolom Sheets, struktur folder Drive) | — | **Sama persis**, tidak perlu migrasi data |

Karena skema Sheets & struktur folder Drive tidak berubah, **Spreadsheet dan
folder Drive yang sudah kamu pakai di Apps Script bisa langsung dipakai
ulang** — tidak perlu pindah data.

---

## Langkah 1 — Setup Otentikasi Google

Ada dua cara aplikasi ini bisa akses Sheets & Drive kamu. **Pilih salah satu** sesuai jenis akun Google-mu:

| Jenis Akun | Cara |
|---|---|
| Gmail pribadi (termasuk yang beli storage tambahan via Google One) | **OAuth2** (bagian 1A) |
| Google Workspace dengan akses bikin Shared Drive | Service Account + Shared Drive (bagian 1B) |

Kalau ragu, cek dulu: buka [drive.google.com](https://drive.google.com), lihat sidebar kiri — ada menu **"Shared drives"**? Kalau tidak ada, pakai **OAuth2**.

### 1A — OAuth2 (akun Gmail pribadi)

Kenapa perlu ini: Service Account itu "akun robot" yang **kuota penyimpanannya 0 byte** — walaupun folder Drive-nya sudah di-share sebagai Editor, dia tetap **tidak bisa membuat file baru** di situ (`Service Accounts do not have storage quota` error), karena Google mengharuskan file baru dimiliki oleh identitas yang punya kuota. Shared Drive (fitur Workspace) menyelesaikan ini karena kuotanya milik Shared Drive itu sendiri — tapi kalau kamu tidak punya Workspace, opsi itu tidak tersedia.

Solusinya: autentikasi sebagai **akun Google kamu sendiri** (bukan robot), supaya upload pakai kuota pribadimu.

**1. Buat OAuth Client ID**
- Buka [Google Cloud Console](https://console.cloud.google.com/) → project yang sama dengan sebelumnya
- **APIs & Services → Credentials → Create Credentials → OAuth client ID**
- Application type: **Desktop app**
- Beri nama bebas (mis. `runnergpx-oauth`), klik Create
- Catat **Client ID** dan **Client Secret** yang muncul

**2. Setup OAuth consent screen** (kalau belum pernah)
- **APIs & Services → OAuth consent screen**
- User type: **External**
- Isi nama app, email kamu — untuk "Scopes" tidak perlu diisi manual di sini
- Di bagian **Test users**, tambahkan alamat Gmail kamu sendiri
- Simpan (app akan berstatus "Testing" — itu tidak masalah, tidak perlu publish/verifikasi)

**3. Ambil Refresh Token lewat OAuth Playground** (tidak perlu install/jalankan apa pun)
- Buka [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
- Klik ikon ⚙️ (Settings) di kanan atas → centang **"Use your own OAuth credentials"** → paste **Client ID** dan **Client Secret** dari langkah 1
- Di panel kiri "Select & authorize APIs", cari dan centang dua scope ini:
  - `https://www.googleapis.com/auth/spreadsheets`
  - `https://www.googleapis.com/auth/drive`
- Klik **Authorize APIs** → login pakai akun Gmail kamu yang 5TB itu → kalau muncul peringatan "Google hasn't verified this app", klik **Advanced → Go to [nama app] (unsafe)** — ini aman, karena itu app buatanmu sendiri
- Setelah kembali ke Playground, klik **Exchange authorization code for tokens**
- Copy nilai **Refresh token** yang muncul — itu yang kamu butuhkan

**4. Isi environment variables di Vercel**
- `GOOGLE_OAUTH_CLIENT_ID` → dari langkah 1
- `GOOGLE_OAUTH_CLIENT_SECRET` → dari langkah 1
- `GOOGLE_OAUTH_REFRESH_TOKEN` → dari langkah 3
- Biarkan `GOOGLE_SERVICE_ACCOUNT_KEY_B64` **kosong**

**5. Tidak perlu share apa pun lagi**
Karena ini akunmu sendiri, Sheet dan folder Drive yang sudah kamu miliki otomatis bisa diakses — tidak perlu langkah share-ke-email seperti Service Account. Kalau sebelumnya sempat men-share ke email service account, boleh dibiarkan saja (tidak mengganggu) atau dihapus.

### 1B — Service Account + Shared Drive (akun Google Workspace)

Kalau kamu punya akses bikin Shared Drive, ikuti langkah-langkah lama (Service Account) TAPI dengan satu perubahan penting: folder root GPX-nya harus ada **di dalam Shared Drive**, bukan di My Drive biasa.

**1. Buat Shared Drive**
- Di Google Drive, klik **"Shared drives" → New**, beri nama (mis. `RunnerGPX Storage`)
- Buat folder `GPX_Run_Database` di dalamnya, catat **folder ID**-nya dari URL

**2. Buat Service Account** (sama seperti sebelumnya)
- Google Cloud Console → aktifkan Sheets API + Drive API
- Buat Service Account, download JSON key, base64-encode isinya (lihat bagian "Langkah 3" versi lama di bawah)

**3. Tambahkan Service Account sebagai anggota Shared Drive**
- Buka Shared Drive-nya → **Manage members** → tambahkan email service account sebagai **Content Manager** (atau Manager)
- Share juga Spreadsheet-nya ke email service account sebagai Editor

**4. Isi environment variables di Vercel**
- `GOOGLE_SERVICE_ACCOUNT_KEY_B64` → base64 dari JSON key
- `DRIVE_ROOT_FOLDER_ID` → folder ID dari langkah 1
- Biarkan tiga `GOOGLE_OAUTH_*` kosong


## Langkah 2 — Deploy ke Vercel

1. Push folder project ini (`runnershub-vercel/`) ke repo GitHub baru.
2. Di [vercel.com](https://vercel.com), **Add New → Project**, import repo
   tersebut.
3. Di **Environment Variables**, tambahkan (lihat `.env.example`):
   - `SPREADSHEET_ID`
   - `DRIVE_ROOT_FOLDER_ID` (disarankan diisi, dari Langkah 2)
   - `DRIVE_ROOT_FOLDER_NAME` (opsional, default `GPX_Run_Database`)
   - `ADMIN_SECRET` (opsional — isi kalau mau bisa hapus route lewat API)
   - `GOOGLE_SERVICE_ACCOUNT_KEY_B64` (dari Langkah 3)
4. Deploy. Vercel otomatis mendeteksi `public/` sebagai static output dan
   `api/call.js` sebagai serverless function.
5. Buka URL Vercel-nya — aplikasi harus langsung berfungsi persis seperti
   versi Apps Script (Home, Explore, Upload, Like, Comment, semua tetap
   baca/tulis ke Spreadsheet & Drive yang sama).

### Test lokal sebelum deploy (opsional)
```bash
npm install
npm i -g vercel   # kalau belum ada
cp .env.example .env   # isi nilainya
vercel dev
```

---

## Struktur project

```
runnershub-vercel/
├── api/
│   └── call.js          # Endpoint tunggal, pengganti processApiCall() di Code.gs
├── lib/
│   ├── config.js         # Pengganti Config.gs (baca dari env var)
│   ├── googleAuth.js      # Auth Service Account untuk Sheets & Drive API
│   ├── sheetHelpers.js    # Pengganti SheetHelpers.gs (pakai Sheets API v4)
│   ├── driveHelpers.js    # Pengganti DriveHelpers.gs (pakai Drive API v3)
│   ├── routes.js          # Pengganti Routes.gs (logic sama persis)
│   └── social.js          # Pengganti Social.gs (logic sama persis)
├── public/
│   └── index.html         # Gabungan Index+CSS+semua JS_*.html, tanpa scriptlet GAS
├── package.json
├── vercel.json
└── .env.example
```

## Catatan penting / perbedaan perilaku

- **Tidak ada `LockService`**: fungsi `toggleLike` di Apps Script pakai
  `LockService.getScriptLock()` supaya proses like/unlike tidak bentrok.
  Serverless function di Vercel bisa jalan sebagai beberapa instance
  bersamaan sehingga lock semacam itu tidak tersedia. Risikonya sangat
  kecil (cuma kalau user yang sama menekan like dua kali persis di detik
  yang sama dari dua request berbeda) dan sudah dijelaskan di komentar
  `lib/social.js`. Kalau kamu butuh jaminan 100%, bisa ditambah lock
  eksternal (mis. Vercel KV / Upstash Redis) — tidak disertakan di sini
  supaya migrasi tetap minimal.
- **`Session.getActiveUser()`** (auth Google implisit di Apps Script) juga
  dihapus dari `toggleLike`, karena tidak ada konsep "user Google yang
  sedang login" di web app biasa. Fingerprint dari `localStorage` (sudah
  ada di frontend) tetap dipakai seperti biasa.
- **Cold start**: setiap kali serverless function "bangun" dari idle,
  `sheetIdCache` di `sheetHelpers.js` akan di-refresh dari Sheets API
  (tambahan 1 request). Ini normal dan tidak memengaruhi fungsi apa pun.
- **`ADMIN_SECRET` kosong = delete dinonaktifkan**, sama seperti versi asli.

## Kalau ada error saat deploy

- **`Service Accounts do not have storage quota`** → kamu pakai akun Gmail
  pribadi (bukan Workspace) tapi masih pakai mode Service Account untuk
  Drive. Pindah ke mode **OAuth2** (Langkah 1A).
- **`GOOGLE_SERVICE_ACCOUNT_KEY_B64 is not set`** → env var belum diisi di
  Vercel, atau belum redeploy setelah menambahkannya. (Hanya relevan kalau
  pakai mode Service Account, Langkah 1B.)
- **`403` / `The caller does not have permission`** → mode Service Account:
  Sheet atau folder Drive belum di-share ke email service account.
- **`Requested entity was not found`** saat akses Sheet → `SPREADSHEET_ID`
  salah, atau Sheet belum di-share (mode Service Account) / bukan milik akun
  yang login (mode OAuth2).
- **`invalid_grant` saat OAuth2** → refresh token sudah tidak valid (biasanya
  karena kamu mencabut akses aplikasi ini di
  [myaccount.google.com/permissions](https://myaccount.google.com/permissions)).
  Ulangi Langkah 1A bagian 3 untuk ambil refresh token baru.
