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
  'Robot Online': 'bg-blue-100 text-blue-700 border-blue-200',
  'Konter Mbutoh': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Konter Soko': 'bg-amber-100 text-amber-700 border-amber-200',
  'Voucher': 'bg-purple-100 text-purple-700 border-purple-200',
  'Aksesoris': 'bg-pink-100 text-pink-700 border-pink-200',
  'HP': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  'Elektronik': 'bg-orange-100 text-orange-700 border-orange-200',
  'Pulsa': 'bg-indigo-100 text-indigo-700 border-indigo-200',
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
  const color = TAG_COLORS[tag] || 'bg-gray-100 text-gray-600 border-gray-200';
  return <span className={`inline-block px-2 py-0.5 text-[11px] font-medium rounded-full border ${color}`}>{tag}</span>;
}

// Floating Window Component
function FloatingWindow({ title, children, icon, badge }: { title: string; children: React.ReactNode; icon: string; badge?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">{icon}</span>
          <h2 className="font-semibold text-gray-800 text-[15px]">{title}</h2>
        </div>
        {badge}
      </div>
      <div>{children}</div>
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<StockItem>>({});
  const [showToast, setShowToast] = useState(false);
  const [tagInput, setTagInput] = useState('');

  // Floating windows open state
  const [openWindows, setOpenWindows] = useState({ restock: false, addItem: false });

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
    save([...items, { id: Date.now(), ...newItemForm }], history);
    setNewItemForm({ name: '', stock: 0, min_stock: 5, tags: [] });
    setOpenWindows({ ...openWindows, addItem: false });
  };

  const toggleNewTag = (tag: string) => {
    setNewItemForm(f => ({ ...f, tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag] }));
  };

  const toggleEditTag = (tag: string) => {
    setEditForm(f => {
      const tags = f.tags || [];
      return { ...f, tags: tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag] };
    });
  };

  const addCustomTag = () => {
    if (tagInput.trim() && !newItemForm.tags.includes(tagInput.trim())) {
      setNewItemForm(f => ({ ...f, tags: [...f.tags, tagInput.trim()] }));
      setTagInput('');
    }
  };

  const startEdit = (item: StockItem) => { setEditingId(item.id); setEditForm({ ...item }); };

  const saveEdit = () => {
    const ni = [...items]; const nh = [...history];
    const idx = ni.findIndex(i => i.id === editingId);
    if (idx !== -1 && editForm.name !== undefined) {
      const oldStock = ni[idx].stock;
      const newStock = editForm.stock ?? oldStock;
      if (oldStock !== newStock) {
        nh.push({ id: Date.now(), date: todayRaw, created_at: new Date().toISOString(), itemId: editingId!, type: 'ADJUST', qty: Math.abs(newStock - oldStock), note: `Koreksi (${oldStock} → ${newStock})` });
      }
      ni[idx] = { ...ni[idx], ...editForm } as StockItem;
      save(ni, nh);
    }
    setEditingId(null);
  };

  const restockPrompt = (item: StockItem) => {
    const qty = prompt(`Berapa banyak ${item.name} yang baru dibeli (kulakan)?`);
    const p = parseInt(qty ?? '');
    if (!isNaN(p) && p > 0) {
      const ni = [...items]; const nh = [...history];
      const idx = ni.findIndex(i => i.id === item.id);
      ni[idx].stock += p;
      nh.push({ id: Date.now(), date: todayRaw, created_at: new Date().toISOString(), itemId: item.id, type: 'IN', qty: p, note: 'Restok / Kulakan' });
      save(ni, nh);
    }
  };

  const deleteItem = (id: number) => { if (confirm('Yakin hapus?')) save(items.filter(i => i.id !== id), history); };

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

  const deleteLog = (id: number) => {
    if (!confirm('Batalin transaksi ini?')) return;
    const nh = [...history]; const ni = [...items];
    const li = nh.findIndex(h => h.id === id);
    if (li === -1) return;
    const log = nh[li];
    const ii = ni.findIndex(i => i.id === log.itemId);
    if (ii !== -1) {
      if (log.type === 'OUT') ni[ii].stock += log.qty;
      else if (log.type === 'IN') ni[ii].stock -= log.qty;
    }
    nh.splice(li, 1);
    save(ni, nh);
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'input', label: 'Catat Laku', icon: '➕' },
    { id: 'history', label: 'Riwayat', icon: '📋' },
    { id: 'items', label: 'Master', icon: '📦' },
  ];

  return (
    <div className="font-sans min-h-screen pb-20 md:pb-0 bg-[#f5f5f7] text-gray-800">

      {/* Desktop Nav */}
      <nav className="hidden md:flex bg-white/80 backdrop-blur-xl sticky top-0 z-50 px-6 py-3 items-center justify-between border-b border-gray-200/60 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center font-bold text-white text-sm shadow-md shadow-blue-500/20">IC</div>
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-tight">Indah Cell</h1>
            <p className="text-[11px] text-gray-400 leading-tight">Stock Tracker</p>
          </div>
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setCurrentTab(t.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${currentTab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <span className="mr-1.5">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
        <div className="text-xs text-gray-400">{todayFormatted}</div>
      </nav>

      {/* Mobile Header */}
      <header className="md:hidden bg-white/80 backdrop-blur-xl sticky top-0 z-50 px-4 py-3 flex items-center justify-between border-b border-gray-200/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center font-bold text-white text-xs shadow-md shadow-blue-500/20">IC</div>
          <div>
            <h1 className="text-sm font-bold text-gray-900 leading-tight">Indah Cell</h1>
            <p className="text-[10px] text-gray-400 leading-tight">Stock Tracker</p>
          </div>
        </div>
        <div className="text-[11px] text-gray-400">{todayFormatted}</div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">

        {/* ===== DASHBOARD ===== */}
        {currentTab === 'dashboard' && <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-gray-200/60 shadow-sm"><div className="text-xs text-gray-400 mb-1">Total Item</div><div className="text-2xl font-bold text-gray-900">{items.length}</div></div>
            <div className="bg-white p-4 rounded-2xl border border-gray-200/60 shadow-sm border-l-4 border-l-red-400"><div className="text-xs text-gray-400 mb-1">Wajib Restok</div><div className="text-2xl font-bold text-red-500">{itemsNeedsRestock.length}</div></div>
            <div className="bg-white p-4 rounded-2xl border border-gray-200/60 shadow-sm"><div className="text-xs text-gray-400 mb-1">Laku Hari Ini</div><div className="text-2xl font-bold text-blue-600">{salesToday}</div></div>
            <div className="bg-white p-4 rounded-2xl border border-gray-200/60 shadow-sm"><div className="text-xs text-gray-400 mb-1">Transaksi</div><div className="text-2xl font-bold text-gray-900">{txToday}</div></div>
          </div>

          {/* Restock Alert */}
          {itemsNeedsRestock.length > 0 && (
            <FloatingWindow title="Wajib Restok Segera" icon="🔴" badge={<span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">{itemsNeedsRestock.length} item</span>}>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {itemsNeedsRestock.map(item => (
                  <div key={item.id} className="flex justify-between items-center p-3 bg-red-50/50 rounded-xl border border-red-100">
                    <div>
                      <div className="font-medium text-gray-800 text-sm">{item.name}</div>
                      <div className="flex gap-1.5 mt-1 flex-wrap">{item.tags?.map(t => <TagBadge key={t} tag={t} />)}</div>
                    </div>
                    <div className="text-right ml-3">
                      <div className="text-xl font-bold text-red-500">{item.stock}</div>
                      <div className="text-[10px] text-gray-400">min {item.min_stock}</div>
                    </div>
                  </div>
                ))}
              </div>
            </FloatingWindow>
          )}

          {/* Stock Table */}
          <FloatingWindow title="Pantauan Stok" icon="📦" badge={
            <div className="flex gap-2 items-center">
              <select value={filterTag} onChange={e => setFilterTag(e.target.value)} className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 focus:outline-none focus:border-blue-400">
                <option value="">Semua Tag</option>
                {allTags.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Cari..." className="text-xs bg-white border border-gray-200 rounded-lg px-3 py-1.5 w-32 md:w-48 focus:outline-none focus:border-blue-400 text-gray-600"/>
            </div>
          }>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead><tr className="text-[11px] text-gray-400 uppercase tracking-wider border-b border-gray-100"><th className="px-5 py-3">Nama</th><th className="px-5 py-3">Tag</th><th className="px-5 py-3 text-center">Stok</th><th className="px-5 py-3 text-right">Status</th></tr></thead>
                <tbody className="divide-y divide-gray-50">{filteredDashboardItems.map(item => (
                  <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-800 text-sm">{item.name}</td>
                    <td className="px-5 py-3"><div className="flex gap-1 flex-wrap">{item.tags?.map(t => <TagBadge key={t} tag={t} />)}</div></td>
                    <td className="px-5 py-3 text-center"><span className={`text-lg font-bold ${item.stock <= item.min_stock ? 'text-red-500' : 'text-gray-800'}`}>{item.stock}</span></td>
                    <td className="px-5 py-3 text-right">
                      {item.stock <= item.min_stock ? <span className="px-2.5 py-1 bg-red-100 text-red-600 rounded-full text-[11px] font-semibold">Restok</span>
                      : item.stock <= item.min_stock + 5 ? <span className="px-2.5 py-1 bg-amber-100 text-amber-600 rounded-full text-[11px] font-semibold">Menipis</span>
                      : <span className="px-2.5 py-1 bg-emerald-100 text-emerald-600 rounded-full text-[11px] font-semibold">Aman</span>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
              {filteredDashboardItems.length === 0 && <div className="p-8 text-center text-gray-400 text-sm">Tidak ditemukan.</div>}
            </div>
          </FloatingWindow>
        </>}

        {/* ===== CATAT LAKU ===== */}
        {currentTab === 'input' && (
          <FloatingWindow title="Catat Barang Laku" icon="🛒">
            <form onSubmit={recordSale} className="p-5 md:p-8 space-y-5 max-w-xl mx-auto">
              <div><label className="block text-xs font-medium text-gray-500 mb-1.5">Tanggal</label><input type="date" value={saleForm.date} onChange={e => setSaleForm({ ...saleForm, date: e.target.value })} required className="w-full border border-gray-200 rounded-xl p-3 text-gray-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-white" /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1.5">Barang</label><select value={saleForm.itemId} onChange={e => setSaleForm({ ...saleForm, itemId: e.target.value })} required className="w-full border border-gray-200 rounded-xl p-3 text-gray-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-white"><option value="" disabled>-- Pilih --</option>{items.map(i => <option key={i.id} value={i.id}>{i.name} (Stok: {i.stock})</option>)}</select></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1.5">Jumlah</label>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => saleForm.qty > 1 && setSaleForm({ ...saleForm, qty: saleForm.qty - 1 })} className="w-12 h-12 rounded-xl bg-gray-100 border border-gray-200 text-xl text-gray-600 hover:bg-gray-200 transition font-bold">−</button>
                  <input type="number" value={saleForm.qty} onChange={e => setSaleForm({ ...saleForm, qty: parseInt(e.target.value) || 1 })} min="1" required className="w-full border border-gray-200 rounded-xl p-3 text-center text-xl font-bold text-gray-800 focus:outline-none focus:border-blue-400 bg-white" />
                  <button type="button" onClick={() => setSaleForm({ ...saleForm, qty: saleForm.qty + 1 })} className="w-12 h-12 rounded-xl bg-gray-100 border border-gray-200 text-xl text-gray-600 hover:bg-gray-200 transition font-bold">+</button>
                </div>
              </div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1.5">Catatan</label><input type="text" value={saleForm.note} onChange={e => setSaleForm({ ...saleForm, note: e.target.value })} placeholder="Opsional" className="w-full border border-gray-200 rounded-xl p-3 text-gray-800 focus:outline-none focus:border-blue-400 bg-white" /></div>
              <button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-4 rounded-xl transition shadow-lg shadow-blue-500/20 text-sm">Simpan Penjualan</button>
            </form>
            {showToast && <div className="mx-5 mb-5 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-center text-sm font-medium">Berhasil dicatat! Stok otomatis berkurang.</div>}
          </FloatingWindow>
        )}

        {/* ===== RIWAYAT ===== */}
        {currentTab === 'history' && (
          <FloatingWindow title="Riwayat Keluar / Masuk" icon="📋" badge={
            <div className="flex gap-2"><input type="date" value={historyFilterDate} onChange={e => setHistoryFilterDate(e.target.value)} className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 focus:outline-none focus:border-blue-400" /><button onClick={() => setHistoryFilterDate('')} className="text-xs bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg text-gray-500 transition">Semua</button></div>
          }>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead><tr className="text-[11px] text-gray-400 uppercase tracking-wider border-b border-gray-100"><th className="px-5 py-3">Tgl</th><th className="px-5 py-3">Item</th><th className="px-5 py-3 text-center">Qty</th><th className="px-5 py-3 text-right">Aksi</th></tr></thead>
                <tbody className="divide-y divide-gray-50">{filteredHistory.map(log => (
                  <tr key={log.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(log.date)}</td>
                    <td className="px-5 py-3">
                      <div className="text-[11px] mb-0.5">{log.type === 'OUT' ? <span className="text-amber-600 font-semibold">LAKU</span> : log.type === 'IN' ? <span className="text-emerald-600 font-semibold">RESTOK</span> : <span className="text-gray-400 font-semibold">KOREKSI</span>}</div>
                      <div className="font-medium text-gray-800 text-sm">{getItemName(log.itemId)}</div>
                      {log.note && <div className="text-[11px] text-gray-400 mt-0.5">{log.note}</div>}
                    </td>
                    <td className={`px-5 py-3 text-center font-bold text-base ${log.type === 'OUT' ? 'text-amber-600' : 'text-emerald-600'}`}>{log.type === 'OUT' ? '−' : '+'}{log.qty}</td>
                    <td className="px-5 py-3 text-right"><button onClick={() => deleteLog(log.id)} className="text-red-400 hover:text-red-600 text-xs font-medium transition">Batal</button></td>
                  </tr>
                ))}</tbody>
              </table>
              {filteredHistory.length === 0 && <div className="p-8 text-center text-gray-400 text-sm">Tidak ada riwayat.</div>}
            </div>
          </FloatingWindow>
        )}

        {/* ===== MASTER BARANG ===== */}
        {currentTab === 'items' && <>
          {/* Add Item Floating Window */}
          <FloatingWindow title="Tambah Barang Baru" icon="✨">
            <form onSubmit={addItem} className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-1"><label className="block text-xs font-medium text-gray-500 mb-1">Nama</label><input type="text" value={newItemForm.name} onChange={e => setNewItemForm({ ...newItemForm, name: e.target.value })} required placeholder="Cth: Voucher Tsel 5GB" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-blue-400 bg-white" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Stok Awal</label><input type="number" value={newItemForm.stock} onChange={e => setNewItemForm({ ...newItemForm, stock: parseInt(e.target.value) || 0 })} required min="0" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-blue-400 bg-white" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Min Restok</label><input type="number" value={newItemForm.min_stock} onChange={e => setNewItemForm({ ...newItemForm, min_stock: parseInt(e.target.value) || 0 })} required min="0" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-blue-400 bg-white" /></div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">Tag</label>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_TAGS.map(t => (
                    <button type="button" key={t} onClick={() => toggleNewTag(t)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${newItemForm.tags.includes(t) ? TAG_COLORS[t] + ' ring-2 ring-offset-1 ring-blue-400' : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'}`}>{t}</button>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomTag())} placeholder="Tag custom..." className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-400 bg-white" />
                  <button type="button" onClick={addCustomTag} className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg text-gray-600 transition">Tambah</button>
                </div>
              </div>
              <button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold py-3 rounded-xl transition shadow-lg shadow-blue-500/20 text-sm">Simpan Barang</button>
            </form>
          </FloatingWindow>

          {/* Items List */}
          <FloatingWindow title="Kelola Barang" icon="📦" badge={<span className="text-xs text-gray-400">{items.length} item</span>}>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead><tr className="text-[11px] text-gray-400 uppercase tracking-wider border-b border-gray-100"><th className="px-5 py-3">Barang</th><th className="px-5 py-3">Tag</th><th className="px-5 py-3 text-center">Stok</th><th className="px-5 py-3 text-right">Aksi</th></tr></thead>
                <tbody className="divide-y divide-gray-50">{items.map(item => (
                  <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-5 py-3 text-sm font-medium text-gray-800">
                      {editingId === item.id ? <input type="text" value={editForm.name ?? ''} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="border border-blue-400 rounded-lg px-2 py-1 w-full text-sm bg-white" /> : item.name}
                    </td>
                    <td className="px-5 py-3">
                      {editingId === item.id ? (
                        <div className="flex gap-1 flex-wrap">{PRESET_TAGS.map(t => <button type="button" key={t} onClick={() => toggleEditTag(t)} className={`px-2 py-0.5 rounded-full text-[10px] border transition ${editForm.tags?.includes(t) ? TAG_COLORS[t] : 'bg-gray-50 text-gray-300 border-gray-200'}`}>{t}</button>)}</div>
                      ) : (
                        <div className="flex gap-1 flex-wrap">{item.tags?.map(t => <TagBadge key={t} tag={t} />)}</div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {editingId === item.id ? <input type="number" value={editForm.stock ?? 0} onChange={e => setEditForm({ ...editForm, stock: parseInt(e.target.value) || 0 })} className="border border-blue-400 rounded-lg px-2 py-1 w-16 text-center text-sm bg-white" /> : <span className="font-bold text-base">{item.stock}</span>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {editingId === item.id ? (
                        <div className="flex justify-end gap-2"><button onClick={saveEdit} className="text-emerald-600 text-xs font-medium">Save</button><button onClick={() => setEditingId(null)} className="text-gray-400 text-xs">Batal</button></div>
                      ) : (
                        <div className="flex justify-end items-center gap-2">
                          <button onClick={() => restockPrompt(item)} className="text-[11px] bg-emerald-50 border border-emerald-200 text-emerald-600 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition font-medium">+Kulakan</button>
                          <button onClick={() => startEdit(item)} className="text-blue-500 text-xs font-medium">Edit</button>
                          <button onClick={() => deleteItem(item.id)} className="text-red-400 text-xs font-medium">Hapus</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </FloatingWindow>
        </>}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-gray-200/60 pt-1.5 px-2 flex justify-around items-center z-50 pb-[env(safe-area-inset-bottom,6px)]">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setCurrentTab(tab.id)} className={`flex flex-col items-center py-1.5 px-3 rounded-xl transition-all ${currentTab === tab.id ? 'text-blue-600' : 'text-gray-400'} ${tab.id === 'input' ? 'relative' : ''}`}>
            {tab.id === 'input' ? (
              <div className="absolute -top-5 bg-gradient-to-br from-blue-500 to-blue-600 text-white w-11 h-11 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/30 border-4 border-white text-lg">{tab.icon}</div>
            ) : (
              <span className="text-lg mb-0.5">{tab.icon}</span>
            )}
            <span className={`text-[10px] font-medium ${tab.id === 'input' ? 'mt-5' : ''}`}>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
