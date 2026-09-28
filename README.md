# IndahCell Stock

Aplikasi stok konter: dashboard, kasir, riwayat, gudang. Data bisa jalan
lokal (localStorage) atau tersinkron ke cloud (Firebase).

---

## Menjalankan

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # build produksi
```

---

## Dua Mode

| Mode | Kapan | Data disimpan di | Multi-device |
|---|---|---|---|
| **Lokal** | Firebase belum dikonfigurasi | localStorage browser | ✗ |
| **Cloud** | Firebase dikonfigurasi + login | Firestore + cache lokal | ✓ |

App **otomatis** pilih mode. Badge di navbar menunjukkan status:
`Lokal` (abu-abu) atau `Tersinkron` (hijau).

---

## Mengaktifkan Firebase

### 1. Buat project

Buka [console.firebase.google.com](https://console.firebase.google.com) →
**Add project** → ikuti langkahnya.

### 2. Daftarkan web app

Di project → **Project settings** → **General** → scroll ke **Your apps** →
klik ikon web (`</>`) → daftarkan app.

### 3. Salin config

```bash
cp .env.local.example .env.local
```

Isi dari SDK setup yang muncul:

```
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=nama-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=nama-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=nama-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

Restart `npm run dev`. Badge berubah jadi **Tersinkron** setelah login.

### 4. Aktifkan login

Firebase Console → **Build** → **Authentication** → **Get started** →
**Sign-in method** → aktifkan **Email/Password**.

### 5. Buat Firestore

Firebase Console → **Build** → **Firestore Database** → **Create database** →
pilih lokasi (mis. `asia-southeast2` untuk Jakarta) → mulai mode produksi.

### 6. Pasang security rules

**WAJIB.** Tanpa ini, database bisa dibaca siapa saja.

Firestore → **Rules** → tempel:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null
                         && request.auth.uid == userId;
    }
  }
}
```

Artinya: user hanya bisa baca/tulis datanya sendiri.

### 7. Migrasi data lama

1. Login di app
2. Buka **⚙️ → Akun & Sinkronisasi → Upload Lokal → Cloud**
3. Buka di device lain, login dengan akun yang sama → data otomatis muncul

---

## Struktur

```
src/
├── app/
│   ├── page.tsx          UI utama (tab: dashboard/kasir/riwayat/gudang)
│   ├── layout.tsx        root layout + metadata
│   └── globals.css       Tailwind
├── components/
│   └── ui.tsx            Toast, Modal, TagBadge, SyncBadge
├── hooks/
│   ├── useAuth.ts        login/register/logout
│   └── useStock.ts       state + sinkronisasi
└── lib/
    ├── types.ts          tipe + konstanta
    ├── stock.ts          logika bisnis (fungsi murni)
    ├── storage.ts        localStorage + migrasi
    ├── firestore.ts      CRUD + realtime
    ├── firebase.ts       init Firebase
    └── csv.ts            export CSV
```

**Prinsip:** `lib/` tidak tahu React, `hooks/` tidak tahu UI, `app/` tidak
tahu data disimpan di mana.

---

## Model Data

```
users/{uid}/items/{itemId}
  { id, name, stock, min_stock, tags[], cost_price?, sell_price?, updated_at? }

users/{uid}/history/{logId}
  { id, date, created_at, itemId, itemName?, type, qty, note, amount? }
```

`type`: `OUT` (laku) · `IN` (kulakan) · `ADJUST` (koreksi manual)

---

## Catatan Teknis

**CSV pakai pemisah `;`** — Excel dengan locale Indonesia memakai titik koma
sebagai pemisah kolom. File juga diberi BOM supaya karakter non-ASCII benar.

**id barang berupa string**, bukan number. Data lama (id = `Date.now()`)
otomatis dimigrasi saat dibaca.

**Riwayat menyimpan snapshot nama barang** (`itemName`), jadi riwayat tetap
kebaca walau barangnya sudah dihapus.

**Validasi stok tidak bisa minus** ada di `applySale` dan `upsertItem`,
bukan hanya di UI.

**`strict: false` di tsconfig** — karena itu hasil mutasi memakai optional
field, bukan discriminated union (TypeScript tidak me-narrow union tanpa
strictNullChecks).

---

## Deploy

### Vercel

```bash
npx vercel --prod
```

Tambahkan semua `NEXT_PUBLIC_FIREBASE_*` di
**Vercel → Settings → Environment Variables**.

### Firebase Hosting

```bash
npm run build
npx firebase-tools deploy --only hosting
```

---

## Backup

| Format | Isi | Kegunaan |
|---|---|---|
| **JSON** | items + history lengkap | restore penuh |
| **CSV Gudang** | daftar barang + harga + nilai | analisis di Excel |
| **CSV Riwayat** | log transaksi sesuai filter | laporan penjualan |

Restore JSON **menimpa** data yang ada — file divalidasi dulu sebelum dipakai.
