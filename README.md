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

## Sinkronisasi Cloud (Firebase)

Project Firebase sudah dikonfigurasi: **`indahcell-2026`**.
Config ada di `.env.local` (tidak ikut git).

### Cara kerja

App memakai **kode sinkronisasi** (bukan login). Setiap device punya kode
acak 20 karakter. Device yang memakai kode sama akan saling sinkron realtime.

```
stores/{kodeDevice}/items/{itemId}
stores/{kodeDevice}/history/{logId}
```

### Menyambungkan device kedua

1. Di device pertama: **⚙️ → Kode Sinkronisasi → Salin**
2. Di device kedua: **⚙️ → Kode Sinkronisasi → tempel kode → Sambungkan**
3. Selesai. Kedua device memakai data yang sama.

### Kenapa bukan login (Firebase Auth)?

Firebase Auth (Identity Platform) **butuh billing aktif**. Untuk aplikasi stok
konter kecil, memaksa pemilik toko mendaftarkan kartu kredit itu berlebihan.
Kode sinkronisasi acak memberi manfaat yang sama (pisah data antar konter)
tanpa biaya.

**Konsekuensinya:** kode bersifat rahasia. Siapa pun yang tahu kodenya bisa
melihat dan mengubah data. Jangan dibagikan ke orang lain.

### Kalau nanti butuh login sungguhan

1. Aktifkan billing di Google Cloud project `indahcell-2026`
2. Firebase Console → Authentication → Sign-in method → Email/Password
3. Ganti rules di `firestore.rules` jadi berbasis `request.auth.uid`
4. Ganti `storeId` di `src/lib/device.ts` dengan `user.uid`

### Deploy ulang rules

```bash
firebase deploy --only firestore:rules --project=indahcell-2026
```

### Struktur Firestore rules

Rules ada di `firestore.rules`. Intinya:
- `stores/{storeId}/**` boleh dibaca/ditulis kalau panjang storeId 19-32 karakter
- Semua path lain ditolak

Batasan panjang mencegah orang mencoba kode pendek yang mudah ditebak.

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
│   └── useStock.ts       state + sinkronisasi
└── lib/
    ├── types.ts          tipe + konstanta
    ├── stock.ts          logika bisnis (fungsi murni)
    ├── storage.ts        localStorage + migrasi
    ├── firestore.ts      CRUD + realtime
    ├── firebase.ts       init Firebase
    ├── device.ts         kode sinkronisasi device
    └── csv.ts            export CSV
```

**Prinsip:** `lib/` tidak tahu React, `hooks/` tidak tahu UI, `app/` tidak
tahu data disimpan di mana.

---

## Model Data

```
stores/{storeId}/items/{itemId}
  { id, name, stock, min_stock, tags[], cost_price?, sell_price?, updated_at? }

stores/{storeId}/history/{logId}
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
