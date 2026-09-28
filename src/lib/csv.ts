/**
 * Export CSV — buat dibuka di Excel / Google Sheets.
 *
 * Catatan penting soal Excel + locale Indonesia:
 *  - Excel ID memakai titik koma (;) sebagai pemisah kolom, bukan koma.
 *    Kita pakai ";" supaya file langsung rapi saat dobel-klik.
 *  - Angka desimal pakai koma di locale ID, jadi kita bulatkan ke integer
 *    supaya tidak pecah saat dibuka Excel.
 *  - BOM ditambahkan supaya karakter non-ASCII terbaca benar.
 */
import type { HistoryLog, StockItem } from './types';

const SEP = ';';
const BOM = '\uFEFF';

/** Bungkus nilai yang mengandung pemisah / kutip / baris baru. */
function cell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (s.includes(SEP) || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(cells: unknown[]): string {
  return cells.map(cell).join(SEP);
}

const TYPE_LABEL: Record<string, string> = {
  OUT: 'Laku',
  IN: 'Kulakan',
  ADJUST: 'Koreksi',
};

export function exportItemsCSV(items: StockItem[]): string {
  const header = row([
    'Nama Barang',
    'Kategori',
    'Stok',
    'Batas Menipis',
    'Status',
    'Harga Kulakan',
    'Harga Jual',
    'Nilai Stok',
  ]);
  const lines = items.map((i) =>
    row([
      i.name,
      (i.tags ?? []).join(', '),
      i.stock,
      i.min_stock,
      i.stock <= i.min_stock ? 'PERLU RESTOK' : 'Aman',
      Math.round(i.cost_price ?? 0),
      Math.round(i.sell_price ?? 0),
      Math.round((i.cost_price ?? 0) * i.stock),
    ]),
  );
  return BOM + [header, ...lines].join('\r\n');
}

export function exportHistoryCSV(
  history: HistoryLog[],
  resolveName: (id: string) => string,
): string {
  const header = row(['Tanggal', 'Waktu', 'Jenis', 'Barang', 'Jumlah', 'Catatan', 'Nilai']);
  const lines = history.map((l) => {
    const dt = new Date(l.created_at);
    const time = Number.isNaN(dt.getTime())
      ? ''
      : dt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    return row([
      l.date,
      time,
      TYPE_LABEL[l.type] ?? l.type,
      l.itemName ?? resolveName(l.itemId),
      l.qty,
      l.note,
      Math.round(l.amount ?? 0),
    ]);
  });
  return BOM + [header, ...lines].join('\r\n');
}
