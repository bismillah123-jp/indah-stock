'use client';
import { useCallback, useMemo, useState } from 'react';
import { useStock } from '@/hooks/useStock';
import { Modal, SyncBadge, TagBadge, Toast } from '@/components/ui';
import { getDeviceId, isValidSyncCode, normalizeSyncCode, setDeviceId } from '@/lib/device';
import { PRESET_TAGS, type HistoryLog, type StockItem } from '@/lib/types';
import {
  applyRestock,
  applySale,
  buildAdjustLog,
  deleteItem,
  filterHistory,
  filterItems,
  formatDate,
  formatRupiah,
  itemsNeedingRestock,
  newId,
  sortByName,
  sortByStock,
  summarize,
  todayISO,
  undoLog,
  upsertItem,
} from '@/lib/stock';
import { buildBackup, validateBackup } from '@/lib/storage';
import { exportHistoryCSV, exportItemsCSV } from '@/lib/csv';

type TabId = 'dashboard' | 'input' | 'history' | 'items';

const TABS: { id: TabId; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'input', label: 'Kasir / Laku' },
  { id: 'history', label: 'Riwayat' },
  { id: 'items', label: 'Gudang' },
];

const INP = 'w-full border border-gray-300 rounded-md p-2.5 text-sm focus:border-black outline-none bg-white';

export default function Home() {
  // Device ID dibaca sekali lewat initializer (bukan di useEffect) supaya
  // tidak memicu lint react-hooks/set-state-in-effect.
  const [deviceId] = useState(() => getDeviceId());
  const stock = useStock(deviceId);
  const { items, history, mounted, sync, persist, pushLocalToCloud, pullCloudToLocal } = stock;

  const [tab, setTab] = useState<TabId>('dashboard');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [query, setQuery] = useState('');
  const [filterTag, setFilterTag] = useState('');

  // Filter riwayat: default KOSONG supaya riwayat lama tidak tersembunyi.
  const [histDate, setHistDate] = useState('');
  const [histFrom, setHistFrom] = useState('');
  const [histTo, setHistTo] = useState('');
  const [histType, setHistType] = useState<'' | 'OUT' | 'IN' | 'ADJUST'>('');
  const [histQuery, setHistQuery] = useState('');

  const [saleForm, setSaleForm] = useState({ date: todayISO(), itemId: '', qty: 1, note: '' });
  const [newForm, setNewForm] = useState({
    name: '', stock: 0, min_stock: 5, tags: [] as string[], cost_price: 0, sell_price: 0,
  });
  const [editForm, setEditForm] = useState<StockItem | null>(null);
  const [tagInput, setTagInput] = useState('');

  const [dlgAdd, setDlgAdd] = useState(false);
  const [dlgEdit, setDlgEdit] = useState(false);
  const [dlgSettings, setDlgSettings] = useState(false);
  const [dlgSync, setDlgSync] = useState(false);
  const [syncCodeInput, setSyncCodeInput] = useState('');
  const [dlgRestock, setDlgRestock] = useState<{ open: boolean; item: StockItem | null; qty: number }>({ open: false, item: null, qty: 1 });
  const [dlgConfirm, setDlgConfirm] = useState<{ open: boolean; message: string; onConfirm: () => void }>({ open: false, message: '', onConfirm: () => {} });

  const today = todayISO();
  const show = useCallback((msg: string, type: 'success' | 'error' = 'success') => setToast({ msg, type }), []);

  const restockList = useMemo(() => itemsNeedingRestock(items), [items]);
  const summary = useMemo(() => summarize(items, history, today), [items, history, today]);
  const dashboardItems = useMemo(() => sortByStock(filterItems(items, query, filterTag)), [items, query, filterTag]);
  const warehouseItems = useMemo(() => sortByName(items), [items]);
  const saleOptions = useMemo(() => sortByName(items.filter((i) => i.stock > 0)), [items]);
  const allTags = useMemo(() => Array.from(new Set(items.flatMap((i) => i.tags ?? []))).sort(), [items]);
  const histList = useMemo(
    () => filterHistory(history, { date: histDate, from: histFrom, to: histTo, type: histType, query: histQuery }),
    [history, histDate, histFrom, histTo, histType, histQuery],
  );

  const itemName = useCallback((id: string) => items.find((i) => i.id === id)?.name ?? 'Barang Dihapus', [items]);
  const todayFormatted = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

  // ------------------------------------------------------------- actions
  const onSale = (e: React.FormEvent) => {
    e.preventDefault();
    const r = applySale(items, history, {
      itemId: saleForm.itemId, qty: saleForm.qty, date: saleForm.date, note: saleForm.note,
    });
    if (!r.ok) return show(r.error ?? 'Gagal', 'error');
    const log = r.history[0];
    persist(r.items, r.history, { items: r.items, history: [log] });
    setSaleForm({ ...saleForm, itemId: '', qty: 1, note: '' });
    show('Barang laku dicatat');
  };

  const onAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const item: StockItem = { id: newId(), ...newForm, name: newForm.name.trim() };
    const r = upsertItem(items, item);
    if (!r.ok) return show(r.error ?? 'Gagal', 'error');
    persist(r.items, history, { items: [item] });
    setNewForm({ name: '', stock: 0, min_stock: 5, tags: [], cost_price: 0, sell_price: 0 });
    setDlgAdd(false);
    show('Barang baru tersimpan');
  };

  const onSaveEdit = () => {
    if (!editForm || !editForm.name.trim()) return;
    const old = items.find((i) => i.id === editForm.id);
    if (!old) return;
    const r = upsertItem(items, editForm);
    if (!r.ok) return show(r.error ?? 'Gagal', 'error');
    const adj = buildAdjustLog(old, editForm.stock, today);
    const nextHist = adj ? [adj, ...history] : history;
    persist(r.items, nextHist, { items: [editForm], history: adj ? [adj] : [] });
    setDlgEdit(false);
    show('Perubahan tersimpan');
  };

  const onRestock = () => {
    if (!dlgRestock.item) return;
    const r = applyRestock(items, history, { itemId: dlgRestock.item.id, qty: dlgRestock.qty, date: today });
    if (!r.ok) return show(r.error ?? 'Gagal', 'error');
    const log = r.history[0];
    persist(r.items, r.history, { items: r.items, history: [log] });
    setDlgRestock({ open: false, item: null, qty: 1 });
    show('Stok ditambah');
  };

  const onUndoLog = (logId: string) => {
    setDlgConfirm({
      open: true,
      message: 'Batalkan transaksi ini? Stok akan dikembalikan ke posisi sebelumnya.',
      onConfirm: () => {
        const r = undoLog(items, history, logId);
        if (!r.ok) return show(r.error ?? 'Gagal', 'error');
        persist(r.items, r.history, { items: r.items, deletedLogIds: [logId] });
        setDlgConfirm({ open: false, message: '', onConfirm: () => {} });
        show('Transaksi dibatalkan');
      },
    });
  };

  const onDeleteItem = (item: StockItem) => {
    setDlgConfirm({
      open: true,
      message: `Hapus permanen "${item.name}"? Riwayat transaksinya tetap tersimpan.`,
      onConfirm: () => {
        const next = deleteItem(items, item.id);
        persist(next, history, { deletedItemIds: [item.id] });
        setDlgConfirm({ open: false, message: '', onConfirm: () => {} });
        show('Barang dihapus');
      },
    });
  };

  // -------------------------------------------------------------- export
  const download = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onExportJSON = () => {
    download(JSON.stringify(buildBackup(items, history), null, 2), `indahcell_backup_${today}.json`, 'application/json');
    show('Backup JSON diunduh');
  };

  const onExportItemsCSV = () => {
    download(exportItemsCSV(items), `indahcell_gudang_${today}.csv`, 'text/csv;charset=utf-8');
    show('CSV gudang diunduh');
  };

  const onExportHistoryCSV = () => {
    if (!histList.length) return show('Tidak ada riwayat untuk diekspor', 'error');
    download(exportHistoryCSV(histList, itemName), `indahcell_riwayat_${today}.csv`, 'text/csv;charset=utf-8');
    show('CSV riwayat diunduh');
  };

  const onImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const v = validateBackup(parsed);
        if (!v.ok || !v.data) return show(v.error ?? 'File tidak valid', 'error');
        persist(v.data.items, v.data.history, { items: v.data.items, history: v.data.history });
        show('Data berhasil direstore');
        setDlgSettings(false);
      } catch {
        show('Gagal membaca file', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const onMigrate = async () => {
    const ok = await pushLocalToCloud();
    show(ok ? 'Data lokal diunggah ke cloud' : 'Gagal unggah', ok ? 'success' : 'error');
  };
  const onPull = async () => {
    const ok = await pullCloudToLocal();
    show(ok ? 'Data cloud diambil' : 'Gagal ambil', ok ? 'success' : 'error');
  };

  /** Salin kode sinkronisasi device ini ke clipboard. */
  const onCopySyncCode = async () => {
    try {
      await navigator.clipboard.writeText(deviceId);
      show('Kode sinkronisasi disalin');
    } catch {
      show('Gagal menyalin. Salin manual dari kotak di atas.', 'error');
    }
  };

  /** Sambungkan device ini ke kode sinkronisasi milik device lain. */
  const onConnectSync = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidSyncCode(syncCodeInput)) {
      return show('Kode sinkronisasi tidak valid (minimal 12 karakter).', 'error');
    }
    const code = normalizeSyncCode(syncCodeInput);
    if (code === deviceId) {
      return show('Itu kode device ini sendiri.', 'error');
    }
    if (!setDeviceId(code)) {
      return show('Gagal menyimpan kode.', 'error');
    }
    setDlgSync(false);
    setSyncCodeInput('');
    // Muat ulang supaya data dari device tujuan diambil.
    window.location.reload();
  };

  const resetHistFilter = () => {
    setHistDate(''); setHistFrom(''); setHistTo(''); setHistType(''); setHistQuery('');
  };
  const hasHistFilter = Boolean(histDate || histFrom || histTo || histType || histQuery);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center text-sm text-gray-500">
        Memuat data...
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 md:pb-0 bg-[#fafafa] text-[#111]">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {sync.error && (
        <div className="bg-red-50 border-b border-red-200 px-5 py-2 text-xs text-red-700 flex justify-between items-center gap-3">
          <span>{sync.error}</span>
          <button onClick={() => stock.setSyncError(null)} className="text-red-500 hover:text-red-800 font-medium shrink-0">Tutup</button>
        </div>
      )}

      {/* ------------------------------------------------------- navbar */}
      <nav className="hidden md:flex bg-white sticky top-0 z-40 px-6 py-4 items-center justify-between border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="font-semibold text-lg tracking-tight">Indah Cell</div>
          <SyncBadge online={sync.online} syncing={sync.syncing} loading={sync.loading} />
          <div className="flex gap-1 ml-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t.id ? 'bg-black text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-500">{todayFormatted}</div>
          {sync.online && (
            <button onClick={() => setDlgSync(true)} className="text-xs text-gray-500 hover:text-black border border-gray-200 rounded-md px-2.5 py-1.5">
              Sinkron
            </button>
          )}
          <button onClick={() => setDlgSettings(true)} aria-label="Pengaturan" className="text-gray-400 hover:text-black">⚙️</button>
        </div>
      </nav>

      <header className="md:hidden bg-white sticky top-0 z-40 px-5 py-3 flex items-center justify-between border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="font-semibold tracking-tight">Indah Cell</span>
          <SyncBadge online={sync.online} syncing={sync.syncing} loading={sync.loading} />
        </div>
        <div className="flex items-center gap-3">
          {sync.online && (
            <button onClick={() => setDlgSync(true)} className="text-[11px] text-gray-500 border border-gray-200 rounded px-2 py-1">Sinkron</button>
          )}
          <button onClick={() => setDlgSettings(true)} aria-label="Pengaturan" className="text-gray-500">⚙️</button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-5 md:p-8">
        {/* --------------------------------------------------- dashboard */}
        {tab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                <div className="text-sm text-gray-500 mb-1">Total Item</div>
                <div className="text-3xl font-medium">{summary.totalItems}</div>
              </div>
              <div className="bg-white p-5 rounded-xl border border-red-200 shadow-sm">
                <div className="text-sm text-red-500 mb-1">Restok Segera</div>
                <div className="text-3xl font-medium text-red-600">{summary.needsRestock}</div>
              </div>
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                <div className="text-sm text-gray-500 mb-1">Barang Keluar</div>
                <div className="text-3xl font-medium">{summary.soldToday}</div>
              </div>
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                <div className="text-sm text-gray-500 mb-1">Trx Hari Ini</div>
                <div className="text-3xl font-medium">{summary.txToday}</div>
              </div>
            </div>

            {summary.stockValue > 0 && (
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm text-gray-500">Estimasi Nilai Stok</div>
                  <div className="text-2xl font-medium mt-1">{formatRupiah(summary.stockValue)}</div>
                </div>
                <div className="text-xs text-gray-400 text-right max-w-[45%]">
                  Dihitung dari harga kulakan yang diisi di tiap barang.
                </div>
              </div>
            )}

            {restockList.length > 0 && (
              <section className="bg-white rounded-xl border border-red-200 overflow-hidden shadow-sm">
                <div className="px-5 py-3.5 border-b border-red-100 bg-red-50 flex items-center justify-between">
                  <h2 className="font-medium text-red-800 text-sm">Wajib Restok</h2>
                  <button onClick={() => setTab('items')} className="text-xs text-red-700 hover:text-red-900 font-medium">Kelola →</button>
                </div>
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {restockList.map((item) => (
                      <tr key={item.id} className="hover:bg-red-50/50">
                        <td className="px-5 py-3 font-medium">{item.name}</td>
                        <td className="px-5 py-3 text-right">
                          <span className="text-red-600 font-semibold">{item.stock}</span>
                          <span className="text-gray-400 text-xs ml-1">/ min {item.min_stock}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <section className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/30">
                <h2 className="font-medium text-sm">Cek Ketersediaan</h2>
                <div className="flex gap-2">
                  <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)} className="text-sm border border-gray-200 rounded-md px-3 py-2 bg-white">
                    <option value="">Semua Kategori</option>
                    {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari barang..." className="text-sm border border-gray-200 rounded-md px-3 py-2 w-full sm:w-56 bg-white" />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-100">
                      <th className="px-5 py-3 font-medium">Nama</th>
                      <th className="px-5 py-3 font-medium">Kategori</th>
                      <th className="px-5 py-3 text-right font-medium">Stok</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {dashboardItems.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-4 font-medium">{item.name}</td>
                        <td className="px-5 py-4">
                          <div className="flex gap-1.5 flex-wrap">{item.tags?.map((t) => <TagBadge key={t} tag={t} />)}</div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className={`text-base font-semibold ${item.stock <= item.min_stock ? 'text-red-600' : ''}`}>{item.stock}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {dashboardItems.length === 0 && (
                  <div className="p-12 text-center text-gray-500 text-sm">Tidak ditemukan barang yang sesuai.</div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* ------------------------------------------------------- kasir */}
        {tab === 'input' && (
          <div className="max-w-md mx-auto mt-4">
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <h2 className="font-medium text-center">Catat Kasir (Barang Keluar)</h2>
              </div>
              <form onSubmit={onSale} className="p-6 space-y-5">
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5 font-medium">Barang Terjual</label>
                  <select
                    value={saleForm.itemId}
                    onChange={(e) => setSaleForm({ ...saleForm, itemId: e.target.value })}
                    required
                    className="w-full border border-gray-300 rounded-md p-3 bg-white text-sm"
                  >
                    <option value="" disabled>-- Pilih Barang --</option>
                    {saleOptions.map((i) => (
                      <option key={i.id} value={i.id}>{i.name} (Stok: {i.stock})</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1.5 font-medium">Tanggal</label>
                    <input type="date" value={saleForm.date} onChange={(e) => setSaleForm({ ...saleForm, date: e.target.value })} required className="w-full border border-gray-300 rounded-md p-3 bg-white text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1.5 font-medium">Jumlah Keluar</label>
                    <input type="number" value={saleForm.qty} onChange={(e) => setSaleForm({ ...saleForm, qty: parseInt(e.target.value) || 1 })} min="1" required className="w-full border border-gray-300 rounded-md p-3 bg-white text-sm text-center" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5 font-medium">Catatan (Opsional)</label>
                  <input type="text" value={saleForm.note} onChange={(e) => setSaleForm({ ...saleForm, note: e.target.value })} placeholder="Cth: Dibayar besok, Laku ecer" className="w-full border border-gray-300 rounded-md p-3 bg-white text-sm" />
                </div>
                <button type="submit" className="w-full bg-black hover:bg-gray-800 text-white font-medium py-3.5 rounded-md transition text-sm shadow-md mt-2">
                  Kurangi Stok &amp; Simpan
                </button>
              </form>
            </section>
          </div>
        )}

        {/* ----------------------------------------------------- riwayat */}
        {tab === 'history' && (
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 space-y-3">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <h2 className="font-medium text-sm">Riwayat Operasional</h2>
                <button onClick={onExportHistoryCSV} className="text-xs bg-white border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 font-medium">
                  Export CSV
                </button>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <input type="date" value={histFrom} onChange={(e) => { setHistFrom(e.target.value); setHistDate(''); }} className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white" title="Dari tanggal" />
                <span className="text-gray-400 text-xs">s/d</span>
                <input type="date" value={histTo} onChange={(e) => { setHistTo(e.target.value); setHistDate(''); }} className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white" title="Sampai tanggal" />
                <input type="date" value={histDate} onChange={(e) => { setHistDate(e.target.value); setHistFrom(''); setHistTo(''); }} className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white" title="Tanggal tertentu" />
                <select value={histType} onChange={(e) => setHistType(e.target.value as '' | 'OUT' | 'IN' | 'ADJUST')} className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white">
                  <option value="">Semua Jenis</option>
                  <option value="OUT">Laku</option>
                  <option value="IN">Kulakan</option>
                  <option value="ADJUST">Koreksi</option>
                </select>
                <input type="text" value={histQuery} onChange={(e) => setHistQuery(e.target.value)} placeholder="Cari barang / catatan..." className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white flex-1 min-w-[150px]" />
                {hasHistFilter && (
                  <button onClick={resetHistFilter} className="text-xs bg-gray-100 px-3 py-1.5 rounded-md hover:bg-gray-200 border border-gray-200">
                    Reset
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-100">
                    <th className="px-5 py-3 font-medium">Tanggal</th>
                    <th className="px-5 py-3 font-medium">Aktivitas</th>
                    <th className="px-5 py-3 text-right font-medium">Perubahan</th>
                    <th className="px-5 py-3 text-right font-medium">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {histList.map((log: HistoryLog) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-5 py-4 text-gray-500 whitespace-nowrap">{formatDate(log.date)}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 mb-1">
                          {log.type === 'OUT' ? (
                            <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium border border-gray-200">LAKU</span>
                          ) : log.type === 'IN' ? (
                            <span className="text-[10px] bg-gray-900 text-white px-1.5 py-0.5 rounded font-medium">KULAKAN</span>
                          ) : (
                            <span className="text-[10px] bg-gray-50 text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded font-medium">KOREKSI</span>
                          )}
                          <span className="font-medium text-gray-900">{log.itemName ?? itemName(log.itemId)}</span>
                        </div>
                        {log.note && <div className="text-xs text-gray-500">{log.note}</div>}
                      </td>
                      <td className="px-5 py-4 text-right font-semibold text-gray-900">
                        {log.type === 'OUT' ? '−' : '+'}{log.qty}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button onClick={() => onUndoLog(log.id)} className="text-red-600 hover:text-red-800 text-sm font-medium">Batal</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {histList.length === 0 && (
                <div className="p-12 text-center text-gray-500 text-sm">Belum ada riwayat yang cocok.</div>
              )}
            </div>
          </section>
        )}

        {/* ------------------------------------------------------ gudang */}
        {tab === 'items' && (
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h2 className="font-medium text-sm">Gudang &amp; Master Data</h2>
              <div className="flex gap-2">
                <button onClick={onExportItemsCSV} className="text-xs bg-white border border-gray-300 px-3 py-2 rounded-md hover:bg-gray-50 font-medium">Export CSV</button>
                <button onClick={() => setDlgAdd(true)} className="bg-black text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800 shadow-sm">+ Barang Baru</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-100">
                    <th className="px-5 py-3 font-medium">Barang</th>
                    <th className="px-5 py-3 font-medium">Kategori</th>
                    <th className="px-5 py-3 text-right font-medium">Sisa Stok</th>
                    <th className="px-5 py-3 text-right font-medium">Manajemen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {warehouseItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4 font-medium text-gray-900">
                        {item.name}
                        {item.cost_price ? (
                          <div className="text-[11px] text-gray-400 font-normal">Modal {formatRupiah(item.cost_price)}</div>
                        ) : null}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex gap-1.5 flex-wrap">{item.tags?.map((t) => <TagBadge key={t} tag={t} />)}</div>
                      </td>
                      <td className="px-5 py-4 text-right font-semibold text-base">{item.stock}</td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button onClick={() => setDlgRestock({ open: true, item, qty: 1 })} className="text-black bg-gray-100 hover:bg-gray-200 border border-gray-200 px-3 py-1.5 rounded-md text-xs font-medium">Restok</button>
                          <button onClick={() => { setEditForm({ ...item }); setDlgEdit(true); }} className="text-gray-500 hover:text-black font-medium">Edit</button>
                          <button onClick={() => onDeleteItem(item)} className="text-red-500 hover:text-red-700 font-medium ml-1">Hapus</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {items.length === 0 && (
                <div className="p-12 text-center text-gray-500 text-sm">Gudang kosong. Tambah barang dulu.</div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* --------------------------------------------------- mobile nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-2 py-2 flex justify-around items-center z-40 pb-[calc(env(safe-area-inset-bottom)+8px)] shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 text-center py-2.5 text-[13px] font-medium transition-colors ${tab === t.id ? 'text-black' : 'text-gray-400'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* ------------------------------------------------------- modals */}
      <Modal isOpen={dlgSettings} onClose={() => setDlgSettings(false)} title="Pengaturan &amp; Backup">
        <div className="space-y-6">
          {sync.online && (
            <div>
              <h4 className="text-sm font-medium mb-2 text-gray-900">Sinkronisasi Cloud</h4>
              <p className="text-xs text-gray-500 mb-3">
                Data otomatis tersinkron ke cloud. Untuk memakai data yang sama di device
                lain, bagikan kode sinkronisasi lewat tombol di bawah.
              </p>
              <div className="flex gap-2">
                <button onClick={() => { setDlgSettings(false); setDlgSync(true); }} className="flex-1 bg-black text-white py-2.5 rounded-md text-sm font-medium hover:bg-gray-800">
                  Kode Sinkronisasi
                </button>
                <button onClick={onPull} disabled={sync.syncing} className="flex-1 bg-white border border-gray-300 py-2.5 rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
                  Ambil dari Cloud
                </button>
              </div>
              <button onClick={onMigrate} disabled={sync.syncing} className="w-full mt-2 bg-white border border-gray-300 py-2.5 rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
                Upload Semua Data Lokal ke Cloud
              </button>
            </div>
          )}
          <div>
            <h4 className="text-sm font-medium mb-2 text-gray-900">Backup Data</h4>
            <p className="text-xs text-gray-500 mb-3">
              {sync.online
                ? 'Data tersimpan di cloud dan browser ini. Backup manual tetap disarankan.'
                : 'Data hanya tersimpan di browser ini. Rutin download backup supaya tidak hilang.'}
            </p>
            <div className="space-y-2">
              <button onClick={onExportJSON} className="w-full bg-white border border-gray-300 text-gray-800 py-2.5 rounded-md text-sm font-medium shadow-sm hover:bg-gray-50">
                Download Backup JSON
              </button>
              <div className="flex gap-2">
                <button onClick={onExportItemsCSV} className="flex-1 bg-white border border-gray-300 text-gray-800 py-2.5 rounded-md text-sm font-medium hover:bg-gray-50">CSV Gudang</button>
                <button onClick={onExportHistoryCSV} className="flex-1 bg-white border border-gray-300 text-gray-800 py-2.5 rounded-md text-sm font-medium hover:bg-gray-50">CSV Riwayat</button>
              </div>
            </div>
          </div>
          <hr className="border-gray-100" />
          <div>
            <h4 className="text-sm font-medium mb-2 text-gray-900">Restore Data</h4>
            <p className="text-xs text-gray-500 mb-3">
              Kembalikan data dari file backup. Peringatan: ini menimpa data yang ada sekarang.
            </p>
            <label className="w-full bg-red-50 border border-red-200 text-red-700 py-2.5 rounded-md text-sm font-medium cursor-pointer text-center block hover:bg-red-100 transition-colors">
              Pilih File Backup
              <input type="file" accept=".json" className="hidden" onChange={onImport} />
            </label>
          </div>
        </div>
      </Modal>

      <Modal isOpen={dlgSync} onClose={() => setDlgSync(false)} title="Sinkronisasi Antar Device">
        <div className="space-y-5">
          <div>
            <h4 className="text-sm font-medium mb-2 text-gray-900">Kode Device Ini</h4>
            <p className="text-xs text-gray-500 mb-3">
              Bagikan kode ini ke device lain supaya keduanya memakai data yang sama.
              Masukkan kode ini di device kedua lewat menu di bawah.
            </p>
            <div className="flex gap-2">
              <input readOnly value={deviceId} className={`${INP} font-mono text-xs`} onFocus={(e) => e.target.select()} />
              <button type="button" onClick={onCopySyncCode} className="bg-gray-100 border border-gray-200 px-3 rounded-md text-sm font-medium hover:bg-gray-200 shrink-0">
                Salin
              </button>
            </div>
          </div>

          <hr className="border-gray-100" />

          <form onSubmit={onConnectSync} className="space-y-3">
            <h4 className="text-sm font-medium text-gray-900">Sambungkan ke Device Lain</h4>
            <p className="text-xs text-gray-500">
              Masukkan kode dari device lain. Device ini akan memakai data device tersebut.
            </p>
            <input
              type="text"
              value={syncCodeInput}
              onChange={(e) => setSyncCodeInput(e.target.value)}
              placeholder="xxxx-xxxx-xxxx-xxxx-xxxx"
              className={`${INP} font-mono text-xs`}
            />
            <button type="submit" className="w-full bg-black text-white font-medium py-2.5 rounded-md hover:bg-gray-800">
              Sambungkan
            </button>
          </form>

          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3 rounded-md leading-relaxed">
            <strong>Catatan:</strong> kode ini bersifat rahasia. Siapa pun yang tahu kodenya
            bisa melihat dan mengubah data stok. Jangan dibagikan ke orang lain.
          </div>
        </div>
      </Modal>

      <Modal isOpen={dlgAdd} onClose={() => setDlgAdd(false)} title="Tambah Barang Gudang">
        <form onSubmit={onAdd} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5 text-gray-700">Nama Barang</label>
            <input type="text" value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} required className={INP} placeholder="Cth: Voucher XL 5GB" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-gray-700">Stok Awal</label>
              <input type="number" value={newForm.stock} onChange={(e) => setNewForm({ ...newForm, stock: parseInt(e.target.value) || 0 })} required min="0" className={INP} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-gray-700">Batas Menipis</label>
              <input type="number" value={newForm.min_stock} onChange={(e) => setNewForm({ ...newForm, min_stock: parseInt(e.target.value) || 0 })} required min="0" className={INP} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-gray-700">Harga Kulakan</label>
              <input type="number" value={newForm.cost_price} onChange={(e) => setNewForm({ ...newForm, cost_price: parseInt(e.target.value) || 0 })} min="0" className={INP} placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-gray-700">Harga Jual</label>
              <input type="number" value={newForm.sell_price} onChange={(e) => setNewForm({ ...newForm, sell_price: parseInt(e.target.value) || 0 })} min="0" className={INP} placeholder="0" />
            </div>
          </div>
          <TagPicker
            selected={newForm.tags}
            onToggle={(t) => setNewForm((f) => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] }))}
            tagInput={tagInput}
            setTagInput={setTagInput}
            onAdd={() => {
              const v = tagInput.trim();
              if (v && !newForm.tags.includes(v)) {
                setNewForm((f) => ({ ...f, tags: [...f.tags, v] }));
                setTagInput('');
              }
            }}
          />
          <button type="submit" className="w-full bg-black text-white font-medium py-3 rounded-md mt-4 shadow-sm hover:bg-gray-800 transition-colors">
            Simpan Barang
          </button>
        </form>
      </Modal>

      <Modal isOpen={dlgEdit} onClose={() => setDlgEdit(false)} title="Edit Profil Barang">
        {editForm && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-gray-700">Nama Barang</label>
              <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={INP} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-gray-700">Koreksi Stok</label>
                <input type="number" value={editForm.stock} onChange={(e) => setEditForm({ ...editForm, stock: parseInt(e.target.value) || 0 })} min="0" className={INP} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-gray-700">Batas Menipis</label>
                <input type="number" value={editForm.min_stock} onChange={(e) => setEditForm({ ...editForm, min_stock: parseInt(e.target.value) || 0 })} min="0" className={INP} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-gray-700">Harga Kulakan</label>
                <input type="number" value={editForm.cost_price ?? 0} onChange={(e) => setEditForm({ ...editForm, cost_price: parseInt(e.target.value) || 0 })} min="0" className={INP} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-gray-700">Harga Jual</label>
                <input type="number" value={editForm.sell_price ?? 0} onChange={(e) => setEditForm({ ...editForm, sell_price: parseInt(e.target.value) || 0 })} min="0" className={INP} />
              </div>
            </div>
            <TagPicker
              selected={editForm.tags}
              onToggle={(t) => setEditForm((f) => (f ? { ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] } : f))}
              tagInput={tagInput}
              setTagInput={setTagInput}
              onAdd={() => {
                const v = tagInput.trim();
                if (v && editForm && !editForm.tags.includes(v)) {
                  setEditForm({ ...editForm, tags: [...editForm.tags, v] });
                  setTagInput('');
                }
              }}
            />
            <button onClick={onSaveEdit} className="w-full bg-black text-white font-medium py-3 rounded-md mt-4 shadow-sm hover:bg-gray-800 transition-colors">
              Simpan Perubahan
            </button>
          </div>
        )}
      </Modal>

      <Modal isOpen={dlgRestock.open} onClose={() => setDlgRestock({ open: false, item: null, qty: 1 })} title="Kulakan (Restok)">
        {dlgRestock.item && (
          <div className="space-y-5">
            <p className="text-sm text-gray-600">
              Berapa banyak <strong>{dlgRestock.item.name}</strong> yang baru masuk?
            </p>
            <div>
              <label className="block text-sm font-medium mb-1.5">Jumlah Tambahan</label>
              <input type="number" value={dlgRestock.qty} onChange={(e) => setDlgRestock({ ...dlgRestock, qty: parseInt(e.target.value) || 1 })} min="1" className="w-full border border-gray-300 rounded-md p-3 text-sm text-center text-xl font-bold bg-gray-50" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setDlgRestock({ open: false, item: null, qty: 1 })} className="flex-1 bg-white border border-gray-300 text-gray-700 py-3 rounded-md text-sm font-medium hover:bg-gray-50">
                Batal
              </button>
              <button onClick={onRestock} className="flex-[2] bg-black text-white py-3 rounded-md text-sm font-medium shadow-sm hover:bg-gray-800">
                Tambahkan ke Stok
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={dlgConfirm.open} onClose={() => setDlgConfirm({ open: false, message: '', onConfirm: () => {} })} title="Konfirmasi Tindakan">
        <div className="space-y-6">
          <p className="text-gray-700 text-sm leading-relaxed">{dlgConfirm.message}</p>
          <div className="flex gap-3">
            <button onClick={() => setDlgConfirm({ open: false, message: '', onConfirm: () => {} })} className="flex-1 bg-white border border-gray-300 text-gray-700 py-2.5 rounded-md text-sm font-medium hover:bg-gray-50">
              Kembali
            </button>
            <button onClick={dlgConfirm.onConfirm} className="flex-1 bg-red-600 text-white py-2.5 rounded-md text-sm font-medium shadow-sm hover:bg-red-700">
              Yakin, Proses
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function TagPicker({
  selected,
  onToggle,
  tagInput,
  setTagInput,
  onAdd,
}: {
  selected: string[];
  onToggle: (t: string) => void;
  tagInput: string;
  setTagInput: (v: string) => void;
  onAdd: () => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2 text-gray-700">Kategori (boleh lebih dari 1)</label>
      <div className="flex gap-1.5 flex-wrap mb-3">
        {PRESET_TAGS.map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => onToggle(t)}
            className={`px-2.5 py-1 text-xs rounded-sm border transition-colors ${selected.includes(t) ? 'bg-black text-white border-black' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAdd(); } }}
          placeholder="Kategori baru custom..."
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button type="button" onClick={onAdd} className="bg-gray-100 border border-gray-200 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-200">
          Tambah
        </button>
      </div>
    </div>
  );
}
