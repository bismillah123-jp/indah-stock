/**
 * Logika bisnis stok — fungsi murni, tanpa React.
 *
 * Dipisah supaya bisa diuji tanpa render komponen, dan supaya aturan
 * (stok tidak boleh minus, nilai stok, ringkasan) cuma ada di satu tempat.
 */
import type { HistoryLog, LogType, StockItem, StockSummary } from './types';

export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

/** Format tanggal YYYY-MM-DD jadi DD/MM/YY buat tampilan. */
export function formatDate(d: string): string {
  if (!d) return '-';
  const p = d.split('-');
  if (p.length !== 3) return d;
  return `${p[2]}/${p[1]}/${p[0].substring(2)}`;
}

/** Format angka jadi rupiah tanpa simbol berat. */
export function formatRupiah(n: number): string {
  if (!Number.isFinite(n) || n === 0) return 'Rp0';
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}

/** Buat id unik berbasis waktu + acak (aman dipakai di beberapa device). */
export function newId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${t}-${r}`;
}

export function needsRestock(item: StockItem): boolean {
  return item.stock <= item.min_stock;
}

export function itemsNeedingRestock(items: StockItem[]): StockItem[] {
  return items.filter(needsRestock).sort((a, b) => a.stock - b.stock);
}

/** Total nilai stok = sum(stock x cost_price). */
export function stockValue(items: StockItem[]): number {
  return items.reduce((sum, i) => sum + (i.cost_price ?? 0) * i.stock, 0);
}

export function summarize(items: StockItem[], history: HistoryLog[], date = todayISO()): StockSummary {
  const outToday = history.filter((l) => l.date === date && l.type === 'OUT');
  return {
    totalItems: items.length,
    needsRestock: items.filter(needsRestock).length,
    soldToday: outToday.reduce((s, l) => s + l.qty, 0),
    txToday: outToday.length,
    stockValue: stockValue(items),
  };
}

/** Urutkan barang berdasarkan nama tanpa mengubah array asli. */
export function sortByName(items: StockItem[]): StockItem[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, 'id'));
}

/** Urutkan barang berdasarkan stok terkecil dulu (yang kritis di atas). */
export function sortByStock(items: StockItem[]): StockItem[] {
  return [...items].sort((a, b) => a.stock - b.stock);
}

export function filterItems(items: StockItem[], query: string, tag: string): StockItem[] {
  let list = items;
  const q = query.trim().toLowerCase();
  if (q) list = list.filter((i) => i.name.toLowerCase().includes(q));
  if (tag) list = list.filter((i) => i.tags?.includes(tag));
  return list;
}

export function filterHistory(
  history: HistoryLog[],
  opts: { date?: string; from?: string; to?: string; type?: LogType | ''; query?: string },
): HistoryLog[] {
  let list = [...history].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  if (opts.date) list = list.filter((l) => l.date === opts.date);
  if (opts.from) list = list.filter((l) => l.date >= opts.from!);
  if (opts.to) list = list.filter((l) => l.date <= opts.to!);
  if (opts.type) list = list.filter((l) => l.type === opts.type);
  if (opts.query) {
    const q = opts.query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (l) => (l.itemName ?? '').toLowerCase().includes(q) || l.note.toLowerCase().includes(q),
      );
    }
  }
  return list;
}

// ---------------------------------------------------------------- mutations
// Semua fungsi di bawah mengembalikan array BARU (tidak memutasi input),
// supaya React bisa mendeteksi perubahan dengan benar.

/**
 * Hasil mutasi stok.
 *
 * Sengaja pakai optional field, bukan discriminated union: project ini
 * jalan dengan `strict: false` sehingga TypeScript tidak me-narrow union
 * berdasarkan field `ok`. Dengan bentuk ini semua pemanggil tetap aman.
 */
export interface MutationResult {
  ok: boolean;
  items?: StockItem[];
  history?: HistoryLog[];
  error?: string;
}

export function applySale(
  items: StockItem[],
  history: HistoryLog[],
  input: { itemId: string; qty: number; date: string; note: string },
): MutationResult {
  const qty = Math.floor(input.qty);
  if (!input.itemId) return { ok: false, error: 'Pilih barang dulu.' };
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: 'Jumlah harus lebih dari 0.' };

  const idx = items.findIndex((i) => i.id === input.itemId);
  if (idx === -1) return { ok: false, error: 'Barang tidak ditemukan.' };

  const target = items[idx];
  if (target.stock < qty) {
    return { ok: false, error: `Stok tersisa hanya ${target.stock}.` };
  }

  const nextItems = items.map((it, i) =>
    i === idx ? { ...it, stock: it.stock - qty, updated_at: new Date().toISOString() } : it,
  );
  const log: HistoryLog = {
    id: newId(),
    date: input.date,
    created_at: new Date().toISOString(),
    itemId: input.itemId,
    itemName: target.name,
    type: 'OUT',
    qty,
    note: input.note.trim(),
    amount: target.sell_price ? target.sell_price * qty : undefined,
  };
  return { ok: true, items: nextItems, history: [log, ...history] };
}

export function applyRestock(
  items: StockItem[],
  history: HistoryLog[],
  input: { itemId: string; qty: number; date: string },
): MutationResult {
  const qty = Math.floor(input.qty);
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: 'Jumlah harus lebih dari 0.' };
  const idx = items.findIndex((i) => i.id === input.itemId);
  if (idx === -1) return { ok: false, error: 'Barang tidak ditemukan.' };

  const target = items[idx];
  const nextItems = items.map((it, i) =>
    i === idx ? { ...it, stock: it.stock + qty, updated_at: new Date().toISOString() } : it,
  );
  const log: HistoryLog = {
    id: newId(),
    date: input.date,
    created_at: new Date().toISOString(),
    itemId: input.itemId,
    itemName: target.name,
    type: 'IN',
    qty,
    note: 'Kulakan / Restok',
    amount: target.cost_price ? target.cost_price * qty : undefined,
  };
  return { ok: true, items: nextItems, history: [log, ...history] };
}

/**
 * Batalkan satu log: stok dikembalikan ke posisi sebelum transaksi.
 * Log ADJUST tidak mengubah stok (nilainya sudah tercermin di edit manual).
 */
export function undoLog(
  items: StockItem[],
  history: HistoryLog[],
  logId: string,
): MutationResult {
  const log = history.find((l) => l.id === logId);
  if (!log) return { ok: false, error: 'Transaksi tidak ditemukan.' };

  let nextItems = items;
  if (log.type !== 'ADJUST') {
    const idx = items.findIndex((i) => i.id === log.itemId);
    if (idx === -1) {
      // Barang sudah dihapus: batalkan log saja, stok tidak bisa dikembalikan.
      return { ok: true, items, history: history.filter((l) => l.id !== logId) };
    }
    const delta = log.type === 'OUT' ? log.qty : -log.qty;
    nextItems = items.map((it, i) =>
      i === idx
        ? { ...it, stock: Math.max(0, it.stock + delta), updated_at: new Date().toISOString() }
        : it,
    );
  }
  return { ok: true, items: nextItems, history: history.filter((l) => l.id !== logId) };
}

export function upsertItem(items: StockItem[], item: StockItem): MutationResult {
  const name = item.name.trim();
  if (!name) return { ok: false, error: 'Nama barang wajib diisi.' };
  const clean: StockItem = {
    ...item,
    name,
    stock: Math.max(0, Math.floor(item.stock) || 0),
    min_stock: Math.max(0, Math.floor(item.min_stock) || 0),
    tags: item.tags ?? [],
    updated_at: new Date().toISOString(),
  };
  const idx = items.findIndex((i) => i.id === item.id);
  const nextItems =
    idx === -1 ? [...items, clean] : items.map((it, i) => (i === idx ? clean : it));
  return { ok: true, items: nextItems, history: [] };
}

export function deleteItem(items: StockItem[], itemId: string): StockItem[] {
  return items.filter((i) => i.id !== itemId);
}

/** Hitung perubahan stok dari edit manual, buat catat log ADJUST. */
export function buildAdjustLog(
  oldItem: StockItem,
  newStock: number,
  date = todayISO(),
): HistoryLog | null {
  if (oldItem.stock === newStock) return null;
  return {
    id: newId(),
    date,
    created_at: new Date().toISOString(),
    itemId: oldItem.id,
    itemName: oldItem.name,
    type: 'ADJUST',
    qty: Math.abs(newStock - oldItem.stock),
    note: `Koreksi manual (${oldItem.stock} → ${newStock})`,
  };
}
