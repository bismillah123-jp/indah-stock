'use client';
import { useState, useMemo, useCallback, useEffect } from 'react';

interface StockItem {
  id: number;
  name: string;
  stock: number;
  min_stock: number;
  tags: string[];
}

interface HistoryLog {
  id: number;
  date: string;
  created_at: string;
  itemId: number;
  type: 'OUT' | 'IN' | 'ADJUST';
  qty: number;
  note: string;
}

const TAG_COLORS: Record<string, string> = {
  'Robot Online': 'bg-blue-100 text-blue-700',
  'Konter Mbutoh': 'bg-emerald-100 text-emerald-700',
  'Konter Soko': 'bg-amber-100 text-amber-700',
  'Voucher': 'bg-purple-100 text-purple-700',
  'Aksesoris': 'bg-pink-100 text-pink-700',
  'HP': 'bg-cyan-100 text-cyan-700',
  'Elektronik': 'bg-orange-100 text-orange-700',
  'Pulsa': 'bg-indigo-100 text-indigo-700',
};

const PRESET_TAGS = Object.keys(TAG_COLORS);
const DATA_VERSION = 'v2';

function getToday(): string { return new Date().toISOString().split('T')[0]; }

// Simple Toast component (no heavy library)
function Toast({ message, type, onClose }: { message: string, type: 'success' | 'error', onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] animate-in fade-in slide-in-from-top-4 duration-300">
      <div className={`px-4 py-2.5 rounded-full shadow-lg text-sm font-medium border flex items-center gap-2 ${type === 'success' ? 'bg-gray-900 text-white border-gray-800' : 'bg-red-600 text-white border-red-700'}`}>
        <span>{message}</span>
      </div>
    </div>
  );
}

function TagBadge({ tag }: { tag: string }) {
  const color = TAG_COLORS[tag] || 'bg-gray-100 text-gray-700';
  return <span className={`inline-block px-2 py-0.5 text-[11px] font-medium rounded-sm ${color}`}>{tag}</span>;
}

function Modal({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-xl shadow-xl overflow-hidden flex flex-col scale-in-95 duration-200">
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">&times;</button>
        </div>
        <div className="p-5 overflow-y-auto max-h-[80vh]">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [isMounted, setIsMounted] = useState(false);
  const [currentTab, setCurrentTab] = useState('dashboard');
  
  const [items, setItems] = useState<StockItem[]>([]);
  const [history, setHistory] = useState<HistoryLog[]>([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [historyFilterDate, setHistoryFilterDate] = useState(getToday());
  
  const [saleForm, setSaleForm] = useState({ date: getToday(), itemId: '', qty: 1, note: '' });
  const [newItemForm, setNewItemForm] = useState({ name: '', stock: 0, min_stock: 5, tags: [] as string[] });
  const [editForm, setEditForm] = useState<StockItem | null>(null);
  
  const [tagInput, setTagInput] = useState('');
  const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);

  const [dialogRestock, setDialogRestock] = useState<{ isOpen: boolean; item: StockItem | null; qty: number }>({ isOpen: false, item: null, qty: 1 });
  const [dialogConfirm, setDialogConfirm] = useState<{ isOpen: boolean; message: string; onConfirm: () => void }>({ isOpen: false, message: '', onConfirm: () => {} });
  const [dialogEdit, setDialogEdit] = useState(false);
  const [dialogAdd, setDialogAdd] = useState(false);
  const [dialogSettings, setDialogSettings] = useState(false);

  // Fix Next.js Hydration mismatch by loading from localStorage after mount
  useEffect(() => {
    try {
      const rawItems = localStorage.getItem(`indahcell_items_${DATA_VERSION}`);
      const rawHist = localStorage.getItem(`indahcell_history_${DATA_VERSION}`);
      
       
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (rawItems) setItems(JSON.parse(rawItems));
      else {
        // Initial dummy data for first load
        const init = [
          { id: 1, name: 'Voucher Tsel 2.5GB', stock: 15, min_stock: 5, tags: ['Voucher', 'Robot Online'] },
          { id: 2, name: 'Voucher Tsel 4GB', stock: 3, min_stock: 5, tags: ['Voucher', 'Robot Online'] },
          { id: 3, name: 'Kabel Data Type-C', stock: 12, min_stock: 5, tags: ['Aksesoris', 'Konter Mbutoh'] }
        ];
        setItems(init);
        localStorage.setItem(`indahcell_items_${DATA_VERSION}`, JSON.stringify(init));
      }
      
      if (rawHist) setHistory(JSON.parse(rawHist));
    } catch (e) {
      console.error("Failed to load local data", e);
    }
    setIsMounted(true);
  }, []);

  const todayFormatted = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
  const todayRaw = getToday();

  const showMsg = (msg: string, type: 'success'|'error' = 'success') => setToast({ msg, type });

  const save = useCallback((ni: StockItem[], nh: HistoryLog[]) => {
    setItems(ni); setHistory(nh);
    localStorage.setItem(`indahcell_items_${DATA_VERSION}`, JSON.stringify(ni));
    localStorage.setItem(`indahcell_history_${DATA_VERSION}`, JSON.stringify(nh));
  }, []);

  const itemsNeedsRestock = items.filter(i => i.stock <= i.min_stock).sort((a, b) => a.stock - b.stock);

  const filteredDashboardItems = useMemo(() => {
    let list = items;
    if (searchQuery) list = list.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));
    if (filterTag) list = list.filter(i => i.tags?.includes(filterTag));
    return [...list].sort((a, b) => a.stock - b.stock);
  }, [items, searchQuery, filterTag]);

  const filteredHistory = useMemo(() => {
    let sorted = [...history].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (historyFilterDate) sorted = sorted.filter(l => l.date === historyFilterDate);
    return sorted;
  }, [history, historyFilterDate]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    items.forEach(i => i.tags?.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [items]);

  const salesToday = history.filter(l => l.date === todayRaw && l.type === 'OUT').reduce((s, l) => s + l.qty, 0);
  const txToday = history.filter(l => l.date === todayRaw && l.type === 'OUT').length;
  const getItemName = (id: number) => items.find(i => i.id === id)?.name ?? 'Barang Dihapus';
  const formatDate = (d: string) => { const p = d.split('-'); return `${p[2]}/${p[1]}/${p[0].substring(2)}`; };

  // --- Actions ---

  const recordSale = (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleForm.itemId) return showMsg('Pilih barang dulu', 'error');
    if (saleForm.qty <= 0) return showMsg('Jumlah harus lebih dari 0', 'error');
    
    const idx = items.findIndex(i => i.id === Number(saleForm.itemId));
    if (idx === -1) return;
    
    const targetItem = items[idx];
    if (targetItem.stock < saleForm.qty) {
      return showMsg(`Gagal: Stok tersisa hanya ${targetItem.stock}`, 'error');
    }

    const ni = [...items]; const nh = [...history];
    nh.push({ id: Date.now(), date: saleForm.date, created_at: new Date().toISOString(), itemId: Number(saleForm.itemId), type: 'OUT', qty: saleForm.qty, note: saleForm.note.trim() });
    ni[idx].stock -= saleForm.qty;
    save(ni, nh);
    
    setSaleForm({ ...saleForm, itemId: '', qty: 1, note: '' });
    showMsg('Barang laku berhasil dicatat');
  };

  const addItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemForm.name.trim()) return;
    save([...items, { id: Date.now(), ...newItemForm, name: newItemForm.name.trim() }], history);
    setNewItemForm({ name: '', stock: 0, min_stock: 5, tags: [] });
    setDialogAdd(false);
    showMsg('Barang baru tersimpan');
  };

  const saveEdit = () => {
    if (!editForm || !editForm.name.trim()) return;
    const ni = [...items]; const nh = [...history];
    const idx = ni.findIndex(i => i.id === editForm.id);
    if (idx !== -1) {
      const oldStock = ni[idx].stock;
      const newStock = editForm.stock;
      if (oldStock !== newStock) {
        nh.push({ id: Date.now(), date: todayRaw, created_at: new Date().toISOString(), itemId: editForm.id, type: 'ADJUST', qty: Math.abs(newStock - oldStock), note: `Koreksi manual (${oldStock} → ${newStock})` });
      }
      ni[idx] = { ...editForm, name: editForm.name.trim() };
      save(ni, nh);
      showMsg('Perubahan tersimpan');
    }
    setDialogEdit(false);
  };

  const confirmRestock = () => {
    if (!dialogRestock.item || dialogRestock.qty <= 0) return;
    const ni = [...items]; const nh = [...history];
    const idx = ni.findIndex(i => i.id === dialogRestock.item!.id);
    if (idx !== -1) {
      ni[idx].stock += dialogRestock.qty;
      nh.push({ id: Date.now(), date: todayRaw, created_at: new Date().toISOString(), itemId: dialogRestock.item!.id, type: 'IN', qty: dialogRestock.qty, note: 'Kulakan / Restok' });
      save(ni, nh);
      showMsg('Stok berhasil ditambah');
    }
    setDialogRestock({ isOpen: false, item: null, qty: 1 });
  };

  const requestDeleteLog = (id: number) => {
    setDialogConfirm({
      isOpen: true,
      message: 'Batalkan transaksi ini? Stok akan dikembalikan seperti sebelum transaksi.',
      onConfirm: () => {
        const nh = [...history]; const ni = [...items];
        const li = nh.findIndex(h => h.id === id);
        if (li !== -1) {
          const log = nh[li];
          const ii = ni.findIndex(i => i.id === log.itemId);
          if (ii !== -1) {
            if (log.type === 'OUT') ni[ii].stock += log.qty;
            else if (log.type === 'IN') ni[ii].stock -= log.qty;
          }
          nh.splice(li, 1);
          save(ni, nh);
          showMsg('Transaksi dibatalkan');
        }
        setDialogConfirm({ isOpen: false, message: '', onConfirm: () => {} });
      }
    });
  };

  // --- Data Export/Import ---
  const exportData = () => {
    const data = { items, history, exportDate: new Date().toISOString(), version: DATA_VERSION };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `indahcell_backup_${todayRaw}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showMsg('Backup data berhasil diunduh');
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = ev.target?.result as string;
        const parsed = JSON.parse(raw);
        if (parsed.items && Array.isArray(parsed.items)) {
          save(parsed.items, parsed.history || []);
          showMsg('Data berhasil direstore!');
          setDialogSettings(false);
        } else {
          showMsg('Format file backup tidak valid', 'error');
        }
      } catch (err) {
        showMsg('Gagal membaca file', 'error');
      }
    };
    reader.readAsText(file);
  };

  // UI Helpers
  const addCustomTag = () => { if (tagInput.trim() && !newItemForm.tags.includes(tagInput.trim())) { setNewItemForm(f => ({ ...f, tags: [...f.tags, tagInput.trim()] })); setTagInput(''); } };
  const addCustomEditTag = () => { if (editForm && tagInput.trim() && !editForm.tags.includes(tagInput.trim())) { setEditForm({ ...editForm, tags: [...editForm.tags, tagInput.trim()] }); setTagInput(''); } };

  if (!isMounted) return <div className="min-h-screen bg-[#fafafa] flex items-center justify-center text-sm text-gray-500">Memuat data...</div>;

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'input', label: 'Kasir / Laku' },
    { id: 'history', label: 'Riwayat' },
    { id: 'items', label: 'Gudang' },
  ];

  return (
    <div className="min-h-screen pb-20 md:pb-0 bg-[#fafafa] text-[#111]">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <nav className="hidden md:flex bg-white sticky top-0 z-40 px-6 py-4 items-center justify-between border-b border-gray-200">
        <div className="flex items-center gap-4">
          <div className="font-semibold text-lg tracking-tight">Indah Cell</div>
          <div className="flex gap-1 ml-4">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setCurrentTab(t.id)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${currentTab === t.id ? 'bg-black text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}>{t.label}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500">{todayFormatted}</div>
          <button onClick={() => setDialogSettings(true)} className="text-gray-400 hover:text-black">⚙️</button>
        </div>
      </nav>

      <header className="md:hidden bg-white sticky top-0 z-40 px-5 py-4 flex items-center justify-between border-b border-gray-200">
        <div className="font-semibold tracking-tight">Indah Cell</div>
        <div className="flex items-center gap-3">
          <div className="text-[11px] text-gray-500">{todayFormatted}</div>
          <button onClick={() => setDialogSettings(true)} className="text-gray-500">⚙️</button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-5 md:p-8">
        
        {currentTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm"><div className="text-sm text-gray-500 mb-1">Total Item</div><div className="text-3xl font-medium">{items.length}</div></div>
              <div className="bg-white p-5 rounded-xl border border-red-200 shadow-sm"><div className="text-sm text-red-500 mb-1">Restok Segera</div><div className="text-3xl font-medium text-red-600">{itemsNeedsRestock.length}</div></div>
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm"><div className="text-sm text-gray-500 mb-1">Barang Keluar</div><div className="text-3xl font-medium">{salesToday}</div></div>
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm"><div className="text-sm text-gray-500 mb-1">Trx Hari Ini</div><div className="text-3xl font-medium">{txToday}</div></div>
            </div>

            {itemsNeedsRestock.length > 0 && (
              <section className="bg-white rounded-xl border border-red-200 overflow-hidden shadow-sm">
                <div className="px-5 py-3.5 border-b border-red-100 bg-red-50"><h2 className="font-medium text-red-800 text-sm">Wajib Restok</h2></div>
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {itemsNeedsRestock.map(item => (
                      <tr key={item.id} className="hover:bg-red-50/50">
                        <td className="px-5 py-3 font-medium">{item.name}</td>
                        <td className="px-5 py-3 text-right"><span className="text-red-600 font-semibold">{item.stock}</span><span className="text-gray-400 text-xs ml-1">/ min {item.min_stock}</span></td>
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
                  <select value={filterTag} onChange={e => setFilterTag(e.target.value)} className="text-sm border border-gray-200 rounded-md px-3 py-2 bg-white w-full sm:w-auto">
                    <option value="">Semua Kategori</option>
                    {allTags.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Cari barang..." className="text-sm border border-gray-200 rounded-md px-3 py-2 w-full sm:w-64 bg-white" />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className="text-gray-500 border-b border-gray-100"><th className="px-5 py-3 font-medium">Nama</th><th className="px-5 py-3 font-medium">Kategori</th><th className="px-5 py-3 text-right font-medium">Stok Saat Ini</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredDashboardItems.map(item => (
                      <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-4 font-medium">{item.name}</td>
                        <td className="px-5 py-4"><div className="flex gap-1.5 flex-wrap">{item.tags?.map(t => <TagBadge key={t} tag={t} />)}</div></td>
                        <td className="px-5 py-4 text-right">
                          <span className={`text-base font-semibold ${item.stock <= item.min_stock ? 'text-red-600' : ''}`}>{item.stock}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredDashboardItems.length === 0 && <div className="p-12 text-center text-gray-500 text-sm">Tidak ditemukan barang yang sesuai.</div>}
              </div>
            </section>
          </div>
        )}

        {currentTab === 'input' && (
          <div className="max-w-md mx-auto mt-4">
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50"><h2 className="font-medium text-center">Catat Kasir (Barang Keluar)</h2></div>
              <form onSubmit={recordSale} className="p-6 space-y-5">
                <div><label className="block text-sm text-gray-600 mb-1.5 font-medium">Barang Terjual</label>
                  <select value={saleForm.itemId} onChange={e => setSaleForm({ ...saleForm, itemId: e.target.value })} required className="w-full border border-gray-300 rounded-md p-3 focus:border-black bg-white text-sm transition-colors">
                    <option value="" disabled>-- Pilih Barang --</option>
                    {items.filter(i => i.stock > 0).sort((a,b) => a.name.localeCompare(b.name)).map(i => <option key={i.id} value={i.id}>{i.name} (Stok: {i.stock})</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm text-gray-600 mb-1.5 font-medium">Tanggal</label><input type="date" value={saleForm.date} onChange={e => setSaleForm({ ...saleForm, date: e.target.value })} required className="w-full border border-gray-300 rounded-md p-3 focus:border-black bg-white text-sm" /></div>
                  <div><label className="block text-sm text-gray-600 mb-1.5 font-medium">Jumlah Keluar</label><input type="number" value={saleForm.qty} onChange={e => setSaleForm({ ...saleForm, qty: parseInt(e.target.value) || 1 })} min="1" required className="w-full border border-gray-300 rounded-md p-3 focus:border-black bg-white text-sm text-center" /></div>
                </div>
                <div><label className="block text-sm text-gray-600 mb-1.5 font-medium">Catatan Pembeli (Opsional)</label><input type="text" value={saleForm.note} onChange={e => setSaleForm({ ...saleForm, note: e.target.value })} placeholder="Cth: Dibayar besok, Laku ecer" className="w-full border border-gray-300 rounded-md p-3 focus:border-black bg-white text-sm" /></div>
                <button type="submit" className="w-full bg-black hover:bg-gray-800 text-white font-medium py-3.5 rounded-md transition text-sm shadow-md mt-2">Kurangi Stok & Simpan</button>
              </form>
            </section>
          </div>
        )}

        {currentTab === 'history' && (
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h2 className="font-medium text-sm">Riwayat Operasional</h2>
              <div className="flex gap-2">
                <input type="date" value={historyFilterDate} onChange={e => setHistoryFilterDate(e.target.value)} className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white" />
                <button onClick={() => setHistoryFilterDate('')} className="text-sm bg-gray-100 px-3 py-1.5 rounded-md hover:bg-gray-200 border border-gray-200">Semua</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="text-gray-500 border-b border-gray-100"><th className="px-5 py-3 font-medium">Tanggal</th><th className="px-5 py-3 font-medium">Aktivitas</th><th className="px-5 py-3 text-right font-medium">Perubahan</th><th className="px-5 py-3 text-right font-medium">Tindakan</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredHistory.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-5 py-4 text-gray-500 whitespace-nowrap">{formatDate(log.date)}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 mb-1">
                          {log.type === 'OUT' ? <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium border border-gray-200">LAKU</span> : log.type === 'IN' ? <span className="text-[10px] bg-gray-900 text-white px-1.5 py-0.5 rounded font-medium">KULAKAN</span> : <span className="text-[10px] bg-gray-50 text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded font-medium">KOREKSI</span>}
                          <span className="font-medium text-gray-900">{getItemName(log.itemId)}</span>
                        </div>
                        {log.note && <div className="text-xs text-gray-500">{log.note}</div>}
                      </td>
                      <td className={`px-5 py-4 text-right font-semibold ${log.type === 'OUT' ? 'text-gray-900' : 'text-gray-900'}`}>{log.type === 'OUT' ? '−' : '+'}{log.qty}</td>
                      <td className="px-5 py-4 text-right"><button onClick={() => requestDeleteLog(log.id)} className="text-red-600 hover:text-red-800 text-sm font-medium">Batal</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredHistory.length === 0 && <div className="p-12 text-center text-gray-500 text-sm">Riwayat kosong untuk tanggal ini.</div>}
            </div>
          </section>
        )}

        {currentTab === 'items' && (
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h2 className="font-medium text-sm">Gudang & Master Data</h2>
              <button onClick={() => setDialogAdd(true)} className="bg-black text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800 shadow-sm">+ Barang Baru</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="text-gray-500 border-b border-gray-100"><th className="px-5 py-3 font-medium">Barang</th><th className="px-5 py-3 font-medium">Kategori</th><th className="px-5 py-3 text-right font-medium">Sisa Stok</th><th className="px-5 py-3 text-right font-medium">Manajemen</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {items.sort((a,b) => a.name.localeCompare(b.name)).map(item => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4 font-medium text-gray-900">{item.name}</td>
                      <td className="px-5 py-4"><div className="flex gap-1.5 flex-wrap">{item.tags?.map(t => <TagBadge key={t} tag={t} />)}</div></td>
                      <td className="px-5 py-4 text-right font-semibold text-base">{item.stock}</td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button onClick={() => setDialogRestock({ isOpen: true, item, qty: 1 })} className="text-black bg-gray-100 hover:bg-gray-200 border border-gray-200 px-3 py-1.5 rounded-md text-xs font-medium">Restok</button>
                          <button onClick={() => { setEditForm({ ...item }); setDialogEdit(true); }} className="text-gray-500 hover:text-black font-medium">Edit</button>
                          <button onClick={() => setDialogConfirm({ isOpen: true, message: `Hapus permanen ${item.name}? Data stok tidak bisa dikembalikan.`, onConfirm: () => { save(items.filter(i => i.id !== item.id), history); setDialogConfirm({isOpen:false, message:'', onConfirm:()=>{}}); showMsg('Barang dihapus'); } })} className="text-red-500 hover:text-red-700 font-medium ml-1">Hapus</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {items.length === 0 && <div className="p-12 text-center text-gray-500 text-sm">Gudang kosong. Tambah barang dulu.</div>}
            </div>
          </section>
        )}
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-2 py-2 flex justify-around items-center z-40 pb-[calc(env(safe-area-inset-bottom)+8px)] shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setCurrentTab(tab.id)} className={`flex-1 text-center py-2.5 text-[13px] font-medium transition-colors ${currentTab === tab.id ? 'text-black' : 'text-gray-400'}`}>
            {tab.label}
          </button>
        ))}
      </nav>

      {/* --- Modals --- */}
      
      <Modal isOpen={dialogSettings} onClose={() => setDialogSettings(false)} title="Pengaturan & Backup">
        <div className="space-y-6">
          <div>
            <h4 className="text-sm font-medium mb-2 text-gray-900">Backup Data</h4>
            <p className="text-xs text-gray-500 mb-3">Karena data disimpan di HP/Browser ini saja (tanpa server), pastikan rutin download backup supaya data tidak hilang kalau browser terhapus.</p>
            <button onClick={exportData} className="w-full bg-white border border-gray-300 text-gray-800 py-2.5 rounded-md text-sm font-medium shadow-sm hover:bg-gray-50">📥 Download Backup JSON</button>
          </div>
          <hr className="border-gray-100" />
          <div>
            <h4 className="text-sm font-medium mb-2 text-gray-900">Restore Data</h4>
            <p className="text-xs text-gray-500 mb-3">Kembalikan data dari file backup sebelumnya. Peringatan: ini akan menimpa data yang ada sekarang!</p>
            <label className="w-full bg-red-50 border border-red-200 text-red-700 py-2.5 rounded-md text-sm font-medium cursor-pointer text-center block hover:bg-red-100 transition-colors">
              Pilih File Backup
              <input type="file" accept=".json" className="hidden" onChange={importData} />
            </label>
          </div>
        </div>
      </Modal>

      <Modal isOpen={dialogAdd} onClose={() => setDialogAdd(false)} title="Tambah Barang Gudang">
        <form onSubmit={addItem} className="space-y-4">
          <div><label className="block text-sm font-medium mb-1.5 text-gray-700">Nama Barang</label><input type="text" value={newItemForm.name} onChange={e => setNewItemForm({ ...newItemForm, name: e.target.value })} required className="w-full border border-gray-300 rounded-md p-2.5 text-sm" placeholder="Cth: Voucher XL 5GB" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1.5 text-gray-700">Stok Awal</label><input type="number" value={newItemForm.stock} onChange={e => setNewItemForm({ ...newItemForm, stock: parseInt(e.target.value) || 0 })} required min="0" className="w-full border border-gray-300 rounded-md p-2.5 text-sm" /></div>
            <div><label className="block text-sm font-medium mb-1.5 text-gray-700">Batas Menipis</label><input type="number" value={newItemForm.min_stock} onChange={e => setNewItemForm({ ...newItemForm, min_stock: parseInt(e.target.value) || 0 })} required min="0" className="w-full border border-gray-300 rounded-md p-2.5 text-sm" /></div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">Kategori (Boleh lebih dari 1)</label>
            <div className="flex gap-1.5 flex-wrap mb-3">
              {PRESET_TAGS.map(t => (
                <button type="button" key={t} onClick={() => setNewItemForm(f => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t] }))} className={`px-2.5 py-1 text-xs rounded-sm border transition-colors ${newItemForm.tags.includes(t) ? 'bg-black text-white border-black' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}>{t}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomTag())} placeholder="Kategori baru custom..." className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm" />
              <button type="button" onClick={addCustomTag} className="bg-gray-100 border border-gray-200 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-200">Tambah</button>
            </div>
          </div>
          <button type="submit" className="w-full bg-black text-white font-medium py-3 rounded-md mt-4 shadow-sm hover:bg-gray-800 transition-colors">Simpan Barang</button>
        </form>
      </Modal>

      <Modal isOpen={dialogEdit} onClose={() => setDialogEdit(false)} title="Edit Profil Barang">
        {editForm && (
          <div className="space-y-4">
            <div><label className="block text-sm font-medium mb-1.5 text-gray-700">Nama Barang</label><input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full border border-gray-300 rounded-md p-2.5 text-sm" required /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium mb-1.5 text-gray-700">Koreksi Stok Asli</label><input type="number" value={editForm.stock} onChange={e => setEditForm({ ...editForm, stock: parseInt(e.target.value) || 0 })} min="0" className="w-full border border-gray-300 rounded-md p-2.5 text-sm" /></div>
              <div><label className="block text-sm font-medium mb-1.5 text-gray-700">Batas Menipis</label><input type="number" value={editForm.min_stock} onChange={e => setEditForm({ ...editForm, min_stock: parseInt(e.target.value) || 0 })} min="0" className="w-full border border-gray-300 rounded-md p-2.5 text-sm" /></div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">Kategori</label>
              <div className="flex gap-1.5 flex-wrap mb-3">
                {PRESET_TAGS.map(t => (
                  <button type="button" key={t} onClick={() => setEditForm({ ...editForm, tags: editForm.tags.includes(t) ? editForm.tags.filter(x => x !== t) : [...editForm.tags, t] })} className={`px-2.5 py-1 text-xs rounded-sm border transition-colors ${editForm.tags?.includes(t) ? 'bg-black text-white border-black' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}>{t}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomEditTag())} placeholder="Kategori custom..." className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm" />
                <button type="button" onClick={addCustomEditTag} className="bg-gray-100 border border-gray-200 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-200">Tambah</button>
              </div>
            </div>
            <button onClick={saveEdit} className="w-full bg-black text-white font-medium py-3 rounded-md mt-4 shadow-sm hover:bg-gray-800 transition-colors">Simpan Perubahan</button>
          </div>
        )}
      </Modal>

      <Modal isOpen={dialogRestock.isOpen} onClose={() => setDialogRestock({ isOpen: false, item: null, qty: 1 })} title="Kulakan (Restok)">
        {dialogRestock.item && (
          <div className="space-y-5">
            <p className="text-sm text-gray-600">Berapa banyak barang yang baru masuk ke gudang untuk <strong>{dialogRestock.item.name}</strong>?</p>
            <div>
              <label className="block text-sm font-medium mb-1.5">Jumlah Tambahan</label>
              <input type="number" value={dialogRestock.qty} onChange={e => setDialogRestock({ ...dialogRestock, qty: parseInt(e.target.value) || 1 })} min="1" className="w-full border border-gray-300 rounded-md p-3 text-sm text-center text-xl font-bold bg-gray-50" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setDialogRestock({ isOpen: false, item: null, qty: 1 })} className="flex-1 bg-white border border-gray-300 text-gray-700 py-3 rounded-md text-sm font-medium hover:bg-gray-50">Batal</button>
              <button onClick={confirmRestock} className="flex-[2] bg-black text-white py-3 rounded-md text-sm font-medium shadow-sm hover:bg-gray-800">Tambahkan ke Stok</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={dialogConfirm.isOpen} onClose={() => setDialogConfirm({ isOpen: false, message: '', onConfirm: () => {} })} title="Konfirmasi Tindakan">
        <div className="space-y-6">
          <p className="text-gray-700 text-sm leading-relaxed">{dialogConfirm.message}</p>
          <div className="flex gap-3">
            <button onClick={() => setDialogConfirm({ isOpen: false, message: '', onConfirm: () => {} })} className="flex-1 bg-white border border-gray-300 text-gray-700 py-2.5 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors">Kembali</button>
            <button onClick={dialogConfirm.onConfirm} className="flex-1 bg-red-600 text-white py-2.5 rounded-md text-sm font-medium shadow-sm hover:bg-red-700 transition-colors">Yakin, Proses</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
