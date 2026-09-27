'use client';
import { useState, useMemo, useCallback } from 'react';

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

function getToday(): string { return new Date().toISOString().split('T')[0]; }

function loadItems(): StockItem[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem('indahcell_items_v2');
  if (raw) return JSON.parse(raw);
  const init: StockItem[] = [
    { id: 1, name: 'Voucher Tsel 2.5GB', stock: 15, min_stock: 5, tags: ['Voucher', 'Robot Online'] },
    { id: 2, name: 'Voucher Tsel 4GB', stock: 3, min_stock: 5, tags: ['Voucher', 'Robot Online'] },
    { id: 3, name: 'Voucher XL 3GB', stock: 8, min_stock: 10, tags: ['Voucher'] },
    { id: 4, name: 'Kabel Data Type-C', stock: 12, min_stock: 5, tags: ['Aksesoris', 'Konter Mbutoh'] },
    { id: 5, name: 'Softcase Bening', stock: 4, min_stock: 5, tags: ['Aksesoris', 'Konter Soko'] },
  ];
  localStorage.setItem('indahcell_items_v2', JSON.stringify(init));
  return init;
}

function loadHistory(): HistoryLog[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem('indahcell_history_v2');
  return raw ? JSON.parse(raw) : [];
}

function TagBadge({ tag }: { tag: string }) {
  const color = TAG_COLORS[tag] || 'bg-gray-100 text-gray-700';
  return <span className={`inline-block px-2 py-0.5 text-[11px] font-medium rounded-sm ${color}`}>{tag}</span>;
}

function Modal({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-md rounded-xl shadow-lg border border-gray-100 overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 px-2">&times;</button>
        </div>
        <div className="p-5 overflow-y-auto max-h-[80vh]">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [items, setItems] = useState<StockItem[]>(loadItems);
  const [history, setHistory] = useState<HistoryLog[]>(loadHistory);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [historyFilterDate, setHistoryFilterDate] = useState(getToday);
  
  const [saleForm, setSaleForm] = useState({ date: getToday(), itemId: '', qty: 1, note: '' });
  const [newItemForm, setNewItemForm] = useState({ name: '', stock: 0, min_stock: 5, tags: [] as string[] });
  const [editForm, setEditForm] = useState<StockItem | null>(null);
  
  const [showToast, setShowToast] = useState(false);
  const [tagInput, setTagInput] = useState('');

  // Dialog states
  const [dialogRestock, setDialogRestock] = useState<{ isOpen: boolean; item: StockItem | null; qty: number }>({ isOpen: false, item: null, qty: 1 });
  const [dialogConfirm, setDialogConfirm] = useState<{ isOpen: boolean; message: string; onConfirm: () => void }>({ isOpen: false, message: '', onConfirm: () => {} });
  const [dialogEdit, setDialogEdit] = useState(false);
  const [dialogAdd, setDialogAdd] = useState(false);

  const todayFormatted = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
  const todayRaw = getToday();

  const save = useCallback((ni: StockItem[], nh: HistoryLog[]) => {
    setItems(ni); setHistory(nh);
    localStorage.setItem('indahcell_items_v2', JSON.stringify(ni));
    localStorage.setItem('indahcell_history_v2', JSON.stringify(nh));
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

  const addItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemForm.name.trim()) return;
    save([...items, { id: Date.now(), ...newItemForm }], history);
    setNewItemForm({ name: '', stock: 0, min_stock: 5, tags: [] });
    setDialogAdd(false);
  };

  const toggleNewTag = (tag: string) => {
    setNewItemForm(f => ({ ...f, tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag] }));
  };

  const addCustomTag = () => {
    if (tagInput.trim() && !newItemForm.tags.includes(tagInput.trim())) {
      setNewItemForm(f => ({ ...f, tags: [...f.tags, tagInput.trim()] }));
      setTagInput('');
    }
  };

  const startEdit = (item: StockItem) => {
    setEditForm({ ...item });
    setDialogEdit(true);
  };

  const toggleEditTag = (tag: string) => {
    if (!editForm) return;
    const tags = editForm.tags || [];
    setEditForm({ ...editForm, tags: tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag] });
  };

  const addCustomEditTag = () => {
    if (!editForm || !tagInput.trim()) return;
    if (!editForm.tags.includes(tagInput.trim())) {
      setEditForm({ ...editForm, tags: [...editForm.tags, tagInput.trim()] });
    }
    setTagInput('');
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
      ni[idx] = { ...editForm };
      save(ni, nh);
    }
    setDialogEdit(false);
  };

  const confirmRestock = () => {
    if (!dialogRestock.item || dialogRestock.qty <= 0) return;
    const ni = [...items]; const nh = [...history];
    const idx = ni.findIndex(i => i.id === dialogRestock.item!.id);
    if (idx !== -1) {
      ni[idx].stock += dialogRestock.qty;
      nh.push({ id: Date.now(), date: todayRaw, created_at: new Date().toISOString(), itemId: dialogRestock.item!.id, type: 'IN', qty: dialogRestock.qty, note: 'Restok' });
      save(ni, nh);
    }
    setDialogRestock({ isOpen: false, item: null, qty: 1 });
  };

  const requestDelete = (id: number) => {
    setDialogConfirm({
      isOpen: true,
      message: 'Hapus barang ini dari sistem secara permanen?',
      onConfirm: () => {
        save(items.filter(i => i.id !== id), history);
        setDialogConfirm({ isOpen: false, message: '', onConfirm: () => {} });
      }
    });
  };

  const requestDeleteLog = (id: number) => {
    setDialogConfirm({
      isOpen: true,
      message: 'Batalkan transaksi ini dan kembalikan stok?',
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
        }
        setDialogConfirm({ isOpen: false, message: '', onConfirm: () => {} });
      }
    });
  };

  const recordSale = (e: React.FormEvent) => {
    e.preventDefault();
    const idx = items.findIndex(i => i.id === Number(saleForm.itemId));
    if (idx === -1) return;
    const ni = [...items]; const nh = [...history];
    nh.push({ id: Date.now(), date: saleForm.date, created_at: new Date().toISOString(), itemId: Number(saleForm.itemId), type: 'OUT', qty: saleForm.qty, note: saleForm.note });
    ni[idx].stock -= saleForm.qty;
    save(ni, nh);
    setSaleForm({ ...saleForm, itemId: '', qty: 1, note: '' });
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'input', label: 'Catat Laku' },
    { id: 'history', label: 'Riwayat' },
    { id: 'items', label: 'Master Data' },
  ];

  return (
    <div className="min-h-screen pb-20 md:pb-0 bg-[#fafafa] text-[#111]">
      <nav className="hidden md:flex bg-white sticky top-0 z-40 px-6 py-4 items-center justify-between border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="font-semibold text-lg tracking-tight">Indah Cell</div>
        </div>
        <div className="flex gap-2">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setCurrentTab(t.id)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${currentTab === t.id ? 'bg-black text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="text-sm text-gray-500">{todayFormatted}</div>
      </nav>

      <header className="md:hidden bg-white sticky top-0 z-40 px-5 py-4 flex items-center justify-between border-b border-gray-200">
        <div className="font-semibold tracking-tight">Indah Cell</div>
        <div className="text-xs text-gray-500">{todayFormatted}</div>
      </header>

      <main className="max-w-5xl mx-auto p-5 md:p-8">
        
        {currentTab === 'dashboard' && (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-xl border border-gray-200"><div className="text-sm text-gray-500 mb-1">Total Item</div><div className="text-3xl font-medium tracking-tight">{items.length}</div></div>
              <div className="bg-white p-5 rounded-xl border border-red-200"><div className="text-sm text-red-500 mb-1">Restok</div><div className="text-3xl font-medium tracking-tight text-red-600">{itemsNeedsRestock.length}</div></div>
              <div className="bg-white p-5 rounded-xl border border-gray-200"><div className="text-sm text-gray-500 mb-1">Laku Hari Ini</div><div className="text-3xl font-medium tracking-tight">{salesToday}</div></div>
              <div className="bg-white p-5 rounded-xl border border-gray-200"><div className="text-sm text-gray-500 mb-1">Transaksi</div><div className="text-3xl font-medium tracking-tight">{txToday}</div></div>
            </div>

            {itemsNeedsRestock.length > 0 && (
              <section className="bg-white rounded-xl border border-red-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-red-100 bg-red-50 flex items-center justify-between">
                  <h2 className="font-medium text-red-800">Wajib Restok</h2>
                </div>
                <div className="p-0">
                  <table className="w-full text-left text-sm">
                    <tbody className="divide-y divide-gray-100">
                      {itemsNeedsRestock.map(item => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-5 py-3 font-medium">{item.name}</td>
                          <td className="px-5 py-3 text-right">
                            <span className="text-red-600 font-semibold">{item.stock}</span>
                            <span className="text-gray-400 text-xs ml-1">/ min {item.min_stock}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="font-medium">Stok Barang</h2>
                <div className="flex gap-2">
                  <select value={filterTag} onChange={e => setFilterTag(e.target.value)} className="text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:border-gray-400 bg-white">
                    <option value="">Semua Kategori</option>
                    {allTags.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Cari barang..." className="text-sm border border-gray-200 rounded-md px-3 py-1.5 w-full sm:w-48 focus:outline-none focus:border-gray-400 bg-white" />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className="text-gray-500 border-b border-gray-100 bg-gray-50/50"><th className="px-5 py-3 font-medium">Nama</th><th className="px-5 py-3 font-medium">Kategori</th><th className="px-5 py-3 text-right font-medium">Stok</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredDashboardItems.map(item => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-5 py-4 font-medium">{item.name}</td>
                        <td className="px-5 py-4"><div className="flex gap-1.5 flex-wrap">{item.tags?.map(t => <TagBadge key={t} tag={t} />)}</div></td>
                        <td className="px-5 py-4 text-right">
                          <span className={`text-base font-semibold ${item.stock <= item.min_stock ? 'text-red-600' : ''}`}>{item.stock}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredDashboardItems.length === 0 && <div className="p-10 text-center text-gray-500">Tidak ada barang.</div>}
              </div>
            </section>
          </div>
        )}

        {currentTab === 'input' && (
          <div className="max-w-md mx-auto">
            <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-medium">Catat Penjualan</h2></div>
              <form onSubmit={recordSale} className="p-5 space-y-5">
                <div><label className="block text-sm text-gray-600 mb-1.5">Tanggal</label><input type="date" value={saleForm.date} onChange={e => setSaleForm({ ...saleForm, date: e.target.value })} required className="w-full border border-gray-300 rounded-md p-2.5 focus:outline-none focus:border-black bg-white text-sm" /></div>
                <div><label className="block text-sm text-gray-600 mb-1.5">Barang</label>
                  <select value={saleForm.itemId} onChange={e => setSaleForm({ ...saleForm, itemId: e.target.value })} required className="w-full border border-gray-300 rounded-md p-2.5 focus:outline-none focus:border-black bg-white text-sm">
                    <option value="" disabled>-- Pilih Barang --</option>
                    {items.filter(i => i.stock > 0).map(i => <option key={i.id} value={i.id}>{i.name} (Stok: {i.stock})</option>)}
                  </select>
                </div>
                <div><label className="block text-sm text-gray-600 mb-1.5">Jumlah Keluar</label>
                  <input type="number" value={saleForm.qty} onChange={e => setSaleForm({ ...saleForm, qty: parseInt(e.target.value) || 1 })} min="1" required className="w-full border border-gray-300 rounded-md p-2.5 focus:outline-none focus:border-black bg-white text-sm" />
                </div>
                <div><label className="block text-sm text-gray-600 mb-1.5">Catatan</label><input type="text" value={saleForm.note} onChange={e => setSaleForm({ ...saleForm, note: e.target.value })} placeholder="Opsional" className="w-full border border-gray-300 rounded-md p-2.5 focus:outline-none focus:border-black bg-white text-sm" /></div>
                <button type="submit" className="w-full bg-black hover:bg-gray-800 text-white font-medium py-3 rounded-md transition text-sm mt-2">Simpan</button>
              </form>
            </section>
            {showToast && <div className="mt-4 p-3 bg-gray-900 text-white rounded-md text-center text-sm">Berhasil dicatat. Stok berkurang otomatis.</div>}
          </div>
        )}

        {currentTab === 'history' && (
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="font-medium">Riwayat Transaksi</h2>
              <div className="flex gap-2">
                <input type="date" value={historyFilterDate} onChange={e => setHistoryFilterDate(e.target.value)} className="text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none bg-white" />
                <button onClick={() => setHistoryFilterDate('')} className="text-sm bg-gray-100 px-3 py-1.5 rounded-md hover:bg-gray-200">Semua</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="text-gray-500 border-b border-gray-100 bg-gray-50/50"><th className="px-5 py-3 font-medium">Tanggal</th><th className="px-5 py-3 font-medium">Item</th><th className="px-5 py-3 text-right font-medium">Qty</th><th className="px-5 py-3 text-right font-medium">Aksi</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredHistory.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-5 py-4 text-gray-500 whitespace-nowrap">{formatDate(log.date)}</td>
                      <td className="px-5 py-4">
                        <div className="text-xs mb-1 font-medium">{log.type === 'OUT' ? <span className="text-gray-500 border px-1.5 py-0.5 rounded-sm">LAKU</span> : log.type === 'IN' ? <span className="text-gray-500 border px-1.5 py-0.5 rounded-sm">RESTOK</span> : <span className="text-gray-400 border px-1.5 py-0.5 rounded-sm">KOREKSI</span>}</div>
                        <div className="font-medium">{getItemName(log.itemId)}</div>
                        {log.note && <div className="text-xs text-gray-500 mt-1">{log.note}</div>}
                      </td>
                      <td className="px-5 py-4 text-right font-semibold">{log.type === 'OUT' ? '−' : '+'}{log.qty}</td>
                      <td className="px-5 py-4 text-right"><button onClick={() => requestDeleteLog(log.id)} className="text-red-600 hover:underline text-sm">Batal</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredHistory.length === 0 && <div className="p-10 text-center text-gray-500">Belum ada transaksi.</div>}
            </div>
          </section>
        )}

        {currentTab === 'items' && (
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="font-medium">Master Data</h2>
              <button onClick={() => setDialogAdd(true)} className="bg-black text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800">Tambah Barang</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="text-gray-500 border-b border-gray-100 bg-gray-50/50"><th className="px-5 py-3 font-medium">Barang</th><th className="px-5 py-3 font-medium">Kategori</th><th className="px-5 py-3 text-right font-medium">Stok</th><th className="px-5 py-3 text-right font-medium">Manajemen</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-5 py-4 font-medium">{item.name}</td>
                      <td className="px-5 py-4"><div className="flex gap-1.5 flex-wrap">{item.tags?.map(t => <TagBadge key={t} tag={t} />)}</div></td>
                      <td className="px-5 py-4 text-right font-medium">{item.stock}</td>
                      <td className="px-5 py-4 text-right space-x-3">
                        <button onClick={() => setDialogRestock({ isOpen: true, item, qty: 1 })} className="text-blue-600 font-medium hover:underline">Restok</button>
                        <button onClick={() => startEdit(item)} className="text-gray-600 font-medium hover:underline">Edit</button>
                        <button onClick={() => requestDelete(item.id)} className="text-red-600 font-medium hover:underline">Hapus</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-2 py-2 flex justify-around items-center z-40 pb-[calc(env(safe-area-inset-bottom)+8px)]">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setCurrentTab(tab.id)} className={`flex-1 text-center py-2 text-sm font-medium transition-colors ${currentTab === tab.id ? 'text-black' : 'text-gray-400'}`}>
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Floating Window: Tambah Barang */}
      <Modal isOpen={dialogAdd} onClose={() => setDialogAdd(false)} title="Tambah Barang">
        <form onSubmit={addItem} className="space-y-4">
          <div><label className="block text-sm font-medium mb-1.5">Nama Barang</label><input type="text" value={newItemForm.name} onChange={e => setNewItemForm({ ...newItemForm, name: e.target.value })} required className="w-full border border-gray-300 rounded-md p-2.5 text-sm" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1.5">Stok Awal</label><input type="number" value={newItemForm.stock} onChange={e => setNewItemForm({ ...newItemForm, stock: parseInt(e.target.value) || 0 })} required min="0" className="w-full border border-gray-300 rounded-md p-2.5 text-sm" /></div>
            <div><label className="block text-sm font-medium mb-1.5">Batas Restok</label><input type="number" value={newItemForm.min_stock} onChange={e => setNewItemForm({ ...newItemForm, min_stock: parseInt(e.target.value) || 0 })} required min="0" className="w-full border border-gray-300 rounded-md p-2.5 text-sm" /></div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Kategori (Pilih / Tambah)</label>
            <div className="flex gap-2 flex-wrap mb-3">
              {PRESET_TAGS.map(t => (
                <button type="button" key={t} onClick={() => toggleNewTag(t)} className={`px-3 py-1 text-xs rounded-sm border ${newItemForm.tags.includes(t) ? 'bg-black text-white border-black' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>{t}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomTag())} placeholder="Kategori baru..." className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm" />
              <button type="button" onClick={addCustomTag} className="bg-gray-100 border border-gray-200 px-3 py-2 rounded-md text-sm hover:bg-gray-200">Tambah</button>
            </div>
          </div>
          <button type="submit" className="w-full bg-black text-white font-medium py-3 rounded-md mt-4">Simpan Barang</button>
        </form>
      </Modal>

      {/* Floating Window: Edit Barang */}
      <Modal isOpen={dialogEdit} onClose={() => setDialogEdit(false)} title="Edit Barang">
        {editForm && (
          <div className="space-y-4">
            <div><label className="block text-sm font-medium mb-1.5">Nama Barang</label><input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full border border-gray-300 rounded-md p-2.5 text-sm" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium mb-1.5">Koreksi Stok</label><input type="number" value={editForm.stock} onChange={e => setEditForm({ ...editForm, stock: parseInt(e.target.value) || 0 })} min="0" className="w-full border border-gray-300 rounded-md p-2.5 text-sm" /></div>
              <div><label className="block text-sm font-medium mb-1.5">Batas Restok</label><input type="number" value={editForm.min_stock} onChange={e => setEditForm({ ...editForm, min_stock: parseInt(e.target.value) || 0 })} min="0" className="w-full border border-gray-300 rounded-md p-2.5 text-sm" /></div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Kategori</label>
              <div className="flex gap-2 flex-wrap mb-3">
                {PRESET_TAGS.map(t => (
                  <button type="button" key={t} onClick={() => toggleEditTag(t)} className={`px-3 py-1 text-xs rounded-sm border ${editForm.tags?.includes(t) ? 'bg-black text-white border-black' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>{t}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomEditTag())} placeholder="Kategori baru..." className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm" />
                <button type="button" onClick={addCustomEditTag} className="bg-gray-100 border border-gray-200 px-3 py-2 rounded-md text-sm hover:bg-gray-200">Tambah</button>
              </div>
            </div>
            <button onClick={saveEdit} className="w-full bg-black text-white font-medium py-3 rounded-md mt-4">Simpan Perubahan</button>
          </div>
        )}
      </Modal>

      {/* Floating Window: Restok */}
      <Modal isOpen={dialogRestock.isOpen} onClose={() => setDialogRestock({ isOpen: false, item: null, qty: 1 })} title="Barang Masuk (Restok)">
        {dialogRestock.item && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Berapa banyak barang yang baru datang untuk <strong>{dialogRestock.item.name}</strong>?</p>
            <div>
              <label className="block text-sm font-medium mb-1.5">Jumlah Tambahan</label>
              <input type="number" value={dialogRestock.qty} onChange={e => setDialogRestock({ ...dialogRestock, qty: parseInt(e.target.value) || 1 })} min="1" className="w-full border border-gray-300 rounded-md p-2.5 text-sm text-center text-lg font-medium" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setDialogRestock({ isOpen: false, item: null, qty: 1 })} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-md text-sm font-medium">Batal</button>
              <button onClick={confirmRestock} className="flex-1 bg-black text-white py-3 rounded-md text-sm font-medium">Simpan Stok</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Floating Window: Confirm */}
      <Modal isOpen={dialogConfirm.isOpen} onClose={() => setDialogConfirm({ isOpen: false, message: '', onConfirm: () => {} })} title="Konfirmasi">
        <div className="space-y-6 text-center">
          <p className="text-gray-700">{dialogConfirm.message}</p>
          <div className="flex gap-3">
            <button onClick={() => setDialogConfirm({ isOpen: false, message: '', onConfirm: () => {} })} className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-md text-sm font-medium">Batal</button>
            <button onClick={dialogConfirm.onConfirm} className="flex-1 bg-red-600 text-white py-2.5 rounded-md text-sm font-medium">Ya, Hapus</button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
