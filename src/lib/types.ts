/**
 * Tipe data IndahCell.
 *
 * Dipisah dari UI supaya bisa dipakai bareng oleh layer storage,
 * Firestore, dan komponen. Sebelumnya semua interface nempel di page.tsx.
 */

/** Satu barang di gudang. */
export interface StockItem {
  id: string;
  name: string;
  stock: number;
  min_stock: number;
  tags: string[];
  /** Harga kulakan per unit (opsional, buat hitung nilai stok). */
  cost_price?: number;
  /** Harga jual per unit (opsional). */
  sell_price?: number;
  /** Kapan terakhir diubah (ISO string). */
  updated_at?: string;
}

/** Jenis pergerakan stok. */
export type LogType = 'OUT' | 'IN' | 'ADJUST';

/** Satu baris riwayat operasional. */
export interface HistoryLog {
  id: string;
  /** Tanggal operasional (YYYY-MM-DD) — dipakai buat filter harian. */
  date: string;
  /** Waktu pencatatan presisi (ISO string) — dipakai buat urutan. */
  created_at: string;
  itemId: string;
  /** Snapshot nama barang, supaya riwayat tetap kebaca walau barang dihapus. */
  itemName?: string;
  type: LogType;
  qty: number;
  note: string;
  /** Nilai transaksi kalau harga diisi (qty x harga). */
  amount?: number;
}

/** Payload backup/restore. */
export interface BackupPayload {
  items: StockItem[];
  history: HistoryLog[];
  exportDate: string;
  version: string;
}

/** Ringkasan buat kartu dashboard. */
export interface StockSummary {
  totalItems: number;
  needsRestock: number;
  soldToday: number;
  txToday: number;
  /** Total nilai stok (sum stock x cost_price). 0 kalau harga tidak diisi. */
  stockValue: number;
}

export const TAG_COLORS: Record<string, string> = {
  'Robot Online': 'bg-blue-100 text-blue-700',
  'Konter Mbutoh': 'bg-emerald-100 text-emerald-700',
  'Konter Soko': 'bg-amber-100 text-amber-700',
  'Voucher': 'bg-purple-100 text-purple-700',
  'Aksesoris': 'bg-pink-100 text-pink-700',
  'HP': 'bg-cyan-100 text-cyan-700',
  'Elektronik': 'bg-orange-100 text-orange-700',
  'Pulsa': 'bg-indigo-100 text-indigo-700',
};

export const PRESET_TAGS = Object.keys(TAG_COLORS);

export const DATA_VERSION = 'v2';
