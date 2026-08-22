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

## Langkah 1 — Buat Service Account di Google Cloud

Service Account adalah "akun robot" yang dipakai Vercel untuk baca/tulis ke
Sheets & Drive kamu (menggantikan peran "kamu sebagai pemilik script" di
Apps Script).

1. Buka [Google Cloud Console](https://console.cloud.google.com/).
2. Buat project baru (atau pakai yang sudah ada).
3. Di menu **APIs & Services → Library**, aktifkan dua API ini:
   - **Google Sheets API**
   - **Google Drive API**
4. Buka **APIs & Services → Credentials → Create Credentials → Service Account**.
   - Nama bebas, mis. `runnershub-backend`.
   - Role: tidak perlu diberi role project-level apa pun (akses diatur lewat
     sharing di langkah 2), klik lanjut/selesai saja.
5. Setelah service account dibuat, klik masuk ke dalamnya → tab **Keys**
   → **Add Key → Create new key → JSON**. File `.json` akan otomatis
   terdownload — **simpan baik-baik, ini kredensial sensitif**.
6. Catat alamat email service account-nya, formatnya seperti:
   `runnershub-backend@nama-project.iam.gserviceaccount.com`

## Langkah 2 — Share Spreadsheet & folder Drive ke Service Account

Service account **tidak otomatis punya akses** ke Sheet/Drive kamu — harus
di-share manual, seperti share ke orang lain:

1. Buka Google Sheet yang dipakai Runnershub (Spreadsheet ID:
   `1MVVsZSRli0Sn8qHoG_8jwxioeZ-pA0Q14FDqdZ2ESKk` — sesuaikan kalau beda).
   Klik **Share**, tempel email service account, beri akses **Editor**.
2. Buka folder Drive `GPX_Run_Database` (folder root tempat GPX disimpan).
   Klik **Share**, tempel email service account yang sama, beri akses
   **Editor**.
   - Kalau kamu tidak yakin folder mana, cek `ROOT_FOLDER_ID` di `Config.gs`
     lama, atau cari folder bernama `GPX_Run_Database` di Drive kamu.
   - Catat **folder ID**-nya dari URL:
     `https://drive.google.com/drive/folders/FOLDER_ID_DI_SINI`

> ⚠️ Penting: karena file/folder yang **dibuat baru** oleh service account
> akan dimiliki oleh service account itu sendiri (bukan akun Google kamu),
> pastikan folder root sudah ada dan sudah di-share sebagai **Editor**
> *sebelum* deploy pertama — jangan biarkan service account membuat folder
> root sendiri di Drive-nya sendiri, karena nanti kamu tidak akan melihatnya
> di My Drive kamu.

## Langkah 3 — Encode kredensial ke base64

File JSON dari Langkah 1 perlu di-encode ke base64 agar bisa disimpan
sebagai satu environment variable di Vercel.

**Di Mac/Linux:**
```bash
base64 -i service-account-key.json | tr -d '\n' > key.b64.txt
```

**Di Windows (PowerShell):**
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account-key.json")) | Out-File key.b64.txt
```

Isi file `key.b64.txt` itulah yang akan jadi nilai env var
`GOOGLE_SERVICE_ACCOUNT_KEY_B64`.

## Langkah 4 — Deploy ke Vercel

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

- **`GOOGLE_SERVICE_ACCOUNT_KEY_B64 is not set`** → env var belum diisi di
  Vercel, atau belum redeploy setelah menambahkannya.
- **`403` / `The caller does not have permission`** → Sheet atau folder
  Drive belum di-share ke email service account (Langkah 2).
- **`Requested entity was not found`** saat akses Sheet → `SPREADSHEET_ID`
  salah, atau Sheet belum di-share.
