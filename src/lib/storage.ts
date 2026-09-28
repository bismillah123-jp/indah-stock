/**
 * Layer storage — abstraksi di atas localStorage.
 *
 * Tujuan: komponen UI tidak boleh tahu data disimpan di mana. Sekarang
 * localStorage; setelah Firebase nyala, tinggal ganti implementasinya
 * tanpa mengubah page.tsx.
 *
 * Semua operasi dibungkus try/catch karena localStorage bisa:
 *  - penuh (QuotaExceededError)
 *  - diblokir (mode private / cookie disabled)
 *  - berisi JSON rusak
 */
import { DATA_VERSION, type BackupPayload, type HistoryLog, type StockItem } from './types';

const KEY_ITEMS = `indahcell_items_${DATA_VERSION}`;
const KEY_HISTORY = `indahcell_history_${DATA_VERSION}`;

/** Data awal saat pertama kali buka (biar tidak kosong melompong). */
export const SEED_ITEMS: StockItem[] = [
  { id: 'seed-1', name: 'Voucher Tsel 2.5GB', stock: 15, min_stock: 5, tags: ['Voucher', 'Robot Online'] },
  { id: 'seed-2', name: 'Voucher Tsel 4GB', stock: 3, min_stock: 5, tags: ['Voucher', 'Robot Online'] },
  { id: 'seed-3', name: 'Kabel Data Type-C', stock: 12, min_stock: 5, tags: ['Aksesoris', 'Konter Mbutoh'] },
];

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/** Cek apakah localStorage bisa dipakai (mode private bisa memblokir). */
export function storageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const k = '__indahcell_test__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export function loadItems(): StockItem[] | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(KEY_ITEMS);
  if (!raw) return null;
  const parsed = safeParse<StockItem[]>(raw, []);
  return Array.isArray(parsed) ? migrateItems(parsed) : null;
}

export function loadHistory(): HistoryLog[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(KEY_HISTORY);
  const parsed = safeParse<HistoryLog[]>(raw, []);
  return Array.isArray(parsed) ? migrateHistory(parsed) : [];
}

/**
 * Migrasi data lama: id dulu angka (Date.now()), sekarang string.
 * Juga isi itemName yang belum ada supaya riwayat tetap kebaca.
 */
function migrateItems(list: StockItem[]): StockItem[] {
  return list.map((it) => ({
    ...it,
    id: String(it.id),
    tags: Array.isArray(it.tags) ? it.tags : [],
    stock: Number(it.stock) || 0,
    min_stock: Number(it.min_stock) || 0,
  }));
}

function migrateHistory(list: HistoryLog[]): HistoryLog[] {
  return list.map((h) => ({
    ...h,
    id: String(h.id),
    itemId: String(h.itemId),
    qty: Number(h.qty) || 0,
    note: h.note ?? '',
  }));
}

/**
 * Hasil penyimpanan.
 *
 * Sengaja TIDAK pakai discriminated union karena project ini jalan dengan
 * `strict: false`, dan tanpa strictNullChecks TypeScript tidak bisa
 * me-narrow union berdasarkan field `ok`.
 */
export interface SaveResult {
  ok: boolean;
  error?: string;
}

export function saveAll(items: StockItem[], history: HistoryLog[]): SaveResult {
  if (typeof window === 'undefined') return { ok: false, error: 'Tidak ada window' };
  try {
    window.localStorage.setItem(KEY_ITEMS, JSON.stringify(items));
    window.localStorage.setItem(KEY_HISTORY, JSON.stringify(history));
    return { ok: true };
  } catch (e) {
    const err = e as DOMException;
    if (err?.name === 'QuotaExceededError') {
      return { ok: false, error: 'Penyimpanan browser penuh. Hapus riwayat lama atau unduh backup.' };
    }
    return { ok: false, error: 'Gagal menyimpan data ke browser.' };
  }
}

export function buildBackup(items: StockItem[], history: HistoryLog[]): BackupPayload {
  return {
    items,
    history,
    exportDate: new Date().toISOString(),
    version: DATA_VERSION,
  };
}

/** Validasi file backup sebelum dipakai (jangan sampai menimpa data dengan sampah). */
export function validateBackup(
  raw: unknown,
): { ok: boolean; data?: BackupPayload; error?: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'File bukan JSON objek.' };
  const o = raw as Partial<BackupPayload>;
  if (!Array.isArray(o.items)) return { ok: false, error: 'File tidak punya daftar barang.' };
  if (o.items.length > 0) {
    const sample = o.items[0] as unknown as Record<string, unknown>;
    if (typeof sample.name !== 'string') return { ok: false, error: 'Format barang tidak dikenali.' };
  }
  return {
    ok: true,
    data: {
      items: migrateItems(o.items as StockItem[]),
      history: Array.isArray(o.history) ? migrateHistory(o.history as HistoryLog[]) : [],
      exportDate: o.exportDate ?? new Date().toISOString(),
      version: o.version ?? DATA_VERSION,
    },
  };
}
