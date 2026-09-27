'use client';
import { useState, useMemo, useCallback } from 'react';

interface StockItem {
  id: number;
  name: string;
  stock: number;
  min_stock: number;
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

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function loadItems(): StockItem[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem('indahcell_items');
  if (raw) return JSON.parse(raw);
  const init: StockItem[] = [
    { id: 1, name: 'Voucher Tsel 2.5GB', stock: 15, min_stock: 5 },
    { id: 2, name: 'Voucher Tsel 4GB', stock: 3, min_stock: 5 },
    { id: 3, name: 'Voucher XL 3GB', stock: 8, min_stock: 10 },
    { id: 4, name: 'Kabel Data Type-C', stock: 12, min_stock: 5 },
    { id: 5, name: 'Softcase Bening', stock: 4, min_stock: 5 },
  ];
  localStorage.setItem('indahcell_items', JSON.stringify(init));
  return init;
}

function loadHistory(): HistoryLog[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem('indahcell_history');
  return raw ? JSON.parse(raw) : [];
}

export default function Home() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [items, setItems] = useState<StockItem[]>(loadItems);
  const [history, setHistory] = useState<HistoryLog[]>(loadHistory);
  const [searchQuery, setSearchQuery] = useState('');
  const [historyFilterDate, setHistoryFilterDate] = useState(getToday);
  const [saleForm, setSaleForm] = useState({ date: getToday(), itemId: '', qty: 1, note: '' });
  const [newItemForm, setNewItemForm] = useState({ name: '', stock: 0, min_stock: 5 });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<StockItem>>({});
  const [showToast, setShowToast] = useState(false);

  const todayFormatted = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
  const todayRaw = getToday();

  const save = useCallback((ni: StockItem[], nh: HistoryLog[]) => {
    setItems(ni);
    setHistory(nh);
    localStorage.setItem('indahcell_items', JSON.stringify(ni));
    localStorage.setItem('indahcell_history', JSON.stringify(nh));
  }, []);

  const itemsNeedsRestock = items.filter(i => i.stock <= i.min_stock).sort((a, b) => a.stock - b.stock);

  const filteredDashboardItems = useMemo(() => {
    const list = searchQuery ? items.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase())) : items;
    return [...list].sort((a, b) => a.stock - b.stock);
  }, [items, searchQuery]);

  const filteredHistory = useMemo(() => {
    let sorted = [...history].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (historyFilterDate) sorted = sorted.filter(l => l.date === historyFilterDate);
    return sorted;
  }, [history, historyFilterDate]);

  const salesToday = history.filter(l => l.date === todayRaw && l.type === 'OUT').reduce((s, l) => s + l.qty, 0);
  const txToday = history.filter(l => l.date === todayRaw && l.type === 'OUT').length;

  const getItemName = (id: number) => items.find(i => i.id === id)?.name ?? 'Barang Dihapus';
  const formatDate = (d: string) => { const p = d.split('-'); return `${p[2]}/${p[1]}/${p[0].substring(2)}`; };

  const addItem = (e: React.FormEvent) => {
    e.preventDefault();
    save([...items, { id: Date.now(), ...newItemForm }], history);
    setNewItemForm({ name: '', stock: 0, min_stock: 5 });
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

  const cls = (tab: string) => `px-4 py-2 rounded-md text-sm font-medium transition ${currentTab === tab ? 'bg-[#1e1e1e] text-white' : 'text-gray-400 hover:text-white'}`;

  return (
    <div className="font-sans min-h-screen pb-20 md:pb-0 bg-[#121212] text-[#e5e5e5]">
      <nav className="hidden md:flex bg-[#1e1e1e]/90 backdrop-blur sticky top-0 z-50 px-6 py-4 items-center justify-between border-b border-[#333]">
        <div className="flex items-center gap-2"><div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-white">IC</div><h1 className="text-xl font-bold text-white">IndahCell Stock</h1></div>
        <div className="flex gap-1 bg-[#121212] p-1 rounded-lg border border-[#333]">
          {['dashboard','input','history','items'].map(t=><button key={t} onClick={()=>setCurrentTab(t)} className={cls(t)}>{t==='input'?'Catat Laku':t.charAt(0).toUpperCase()+t.slice(1)}</button>)}
        </div>
      </nav>
      <header className="md:hidden bg-[#1e1e1e]/90 backdrop-blur sticky top-0 z-50 px-4 py-4 flex items-center justify-between border-b border-[#333]">
        <div className="flex items-center gap-2"><div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-white text-xs">IC</div><h1 className="text-lg font-bold text-white">IndahCell Stock</h1></div>
        <div className="text-xs text-gray-400">{todayFormatted}</div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">

        {currentTab==='dashboard'&&<div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#1e1e1e] p-4 rounded-xl border border-[#333]"><div className="text-sm text-gray-400 mb-1">Total Item</div><div className="text-2xl font-bold">{items.length}</div></div>
            <div className="bg-[#1e1e1e] p-4 rounded-xl border-l-4 border-l-red-500 border border-y-[#333] border-r-[#333]"><div className="text-sm text-gray-400 mb-1">Wajib Restok</div><div className="text-2xl font-bold text-red-500">{itemsNeedsRestock.length}</div></div>
            <div className="bg-[#1e1e1e] p-4 rounded-xl border border-[#333]"><div className="text-sm text-gray-400 mb-1">Laku Hari Ini</div><div className="text-2xl font-bold text-blue-500">{salesToday}</div></div>
            <div className="bg-[#1e1e1e] p-4 rounded-xl border border-[#333]"><div className="text-sm text-gray-400 mb-1">Trx Hari Ini</div><div className="text-2xl font-bold">{txToday}</div></div>
          </div>
          {itemsNeedsRestock.length>0&&<div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4"><h3 className="text-red-500 font-bold mb-3">Wajib Restok Segera!</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-3">{itemsNeedsRestock.map(item=><div key={item.id} className="bg-[#1e1e1e] p-3 rounded-lg flex justify-between items-center border border-[#333]"><div><div className="font-medium text-white">{item.name}</div><div className="text-xs text-gray-400">Min: {item.min_stock}</div></div><div className="text-right"><div className="text-lg font-bold text-red-500">{item.stock}</div><div className="text-xs text-gray-400">Sisa</div></div></div>)}</div></div>}
          <div className="bg-[#1e1e1e] rounded-xl overflow-hidden border border-[#333]">
            <div className="p-4 border-b border-[#333] flex justify-between items-center"><h2 className="font-bold text-lg">Pantauan Stok</h2><input type="text" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Cari..." className="bg-[#121212] border border-[#333] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 w-40 md:w-64 text-white"/></div>
            <table className="w-full text-left"><thead><tr className="bg-[#121212] text-gray-400 text-xs uppercase"><th className="p-4">Nama</th><th className="p-4 text-center">Stok</th><th className="p-4 text-right">Status</th></tr></thead><tbody className="divide-y divide-[#333]">{filteredDashboardItems.map(item=><tr key={item.id} className="hover:bg-[#333]/50"><td className="p-4 font-medium text-white">{item.name}</td><td className="p-4 text-center"><span className={`text-lg font-bold ${item.stock<=item.min_stock?'text-red-500':'text-white'}`}>{item.stock}</span></td><td className="p-4 text-right">{item.stock<=item.min_stock?<span className="px-2.5 py-1 bg-red-500/20 text-red-500 rounded-full text-xs">Restok</span>:item.stock<=item.min_stock+5?<span className="px-2.5 py-1 bg-yellow-500/20 text-yellow-500 rounded-full text-xs">Hampir Habis</span>:<span className="px-2.5 py-1 bg-green-500/20 text-green-500 rounded-full text-xs">Aman</span>}</td></tr>)}</tbody></table>
          </div>
        </div>}

        {currentTab==='input'&&<div className="bg-[#1e1e1e] rounded-xl p-5 md:p-8 max-w-2xl mx-auto border border-[#333]">
          <h2 className="text-xl font-bold mb-6 text-white border-b border-[#333] pb-4">Catat Barang Laku</h2>
          <form onSubmit={recordSale} className="space-y-5">
            <div><label className="block text-sm text-gray-400 mb-2">Tanggal</label><input type="date" value={saleForm.date} onChange={e=>setSaleForm({...saleForm,date:e.target.value})} required className="w-full bg-[#121212] border border-[#333] rounded-lg p-3 text-white focus:outline-none focus:border-blue-500"/></div>
            <div><label className="block text-sm text-gray-400 mb-2">Barang</label><select value={saleForm.itemId} onChange={e=>setSaleForm({...saleForm,itemId:e.target.value})} required className="w-full bg-[#121212] border border-[#333] rounded-lg p-3 text-white focus:outline-none focus:border-blue-500"><option value="" disabled>-- Pilih --</option>{items.map(i=><option key={i.id} value={i.id}>{i.name} (Stok: {i.stock})</option>)}</select></div>
            <div><label className="block text-sm text-gray-400 mb-2">Jumlah</label><div className="flex items-center gap-3"><button type="button" onClick={()=>saleForm.qty>1&&setSaleForm({...saleForm,qty:saleForm.qty-1})} className="w-12 h-12 rounded-lg bg-[#121212] border border-[#333] text-xl hover:bg-[#333] text-white">-</button><input type="number" value={saleForm.qty} onChange={e=>setSaleForm({...saleForm,qty:parseInt(e.target.value)||1})} min="1" required className="w-full bg-[#121212] border border-[#333] rounded-lg p-3 text-center text-xl font-bold text-white focus:outline-none focus:border-blue-500"/><button type="button" onClick={()=>setSaleForm({...saleForm,qty:saleForm.qty+1})} className="w-12 h-12 rounded-lg bg-[#121212] border border-[#333] text-xl hover:bg-[#333] text-white">+</button></div></div>
            <div><label className="block text-sm text-gray-400 mb-2">Catatan</label><input type="text" value={saleForm.note} onChange={e=>setSaleForm({...saleForm,note:e.target.value})} placeholder="Opsional" className="w-full bg-[#121212] border border-[#333] rounded-lg p-3 text-white focus:outline-none focus:border-blue-500"/></div>
            <button type="submit" className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 rounded-xl transition">Simpan</button>
          </form>
          {showToast&&<div className="mt-4 p-4 bg-green-500/20 text-green-500 rounded-lg text-center font-medium">Berhasil dicatat!</div>}
        </div>}

        {currentTab==='history'&&<div className="bg-[#1e1e1e] rounded-xl overflow-hidden border border-[#333]">
          <div className="p-4 border-b border-[#333] flex flex-col md:flex-row md:justify-between md:items-center gap-4"><h2 className="font-bold text-lg">Riwayat</h2><div className="flex gap-2"><input type="date" value={historyFilterDate} onChange={e=>setHistoryFilterDate(e.target.value)} className="bg-[#121212] border border-[#333] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"/><button onClick={()=>setHistoryFilterDate('')} className="px-3 py-2 bg-[#121212] border border-[#333] rounded-lg text-sm hover:bg-[#333]">Semua</button></div></div>
          <table className="w-full text-left"><thead><tr className="bg-[#121212] text-gray-400 text-xs uppercase"><th className="p-4">Tgl</th><th className="p-4">Item</th><th className="p-4 text-center">Qty</th><th className="p-4 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-[#333]">{filteredHistory.map(log=><tr key={log.id} className="hover:bg-[#333]/50"><td className="p-4 text-sm whitespace-nowrap">{formatDate(log.date)}</td><td className="p-4 font-medium text-white"><div className="text-xs mb-1">{log.type==='OUT'?<span className="text-yellow-500">LAKU</span>:log.type==='IN'?<span className="text-green-500">RESTOK</span>:<span className="text-gray-400">KOREKSI</span>}</div>{getItemName(log.itemId)}</td><td className={`p-4 text-center font-bold ${log.type==='OUT'?'text-yellow-500':'text-green-500'}`}>{log.type==='OUT'?'-':'+'}{log.qty}</td><td className="p-4 text-right"><button onClick={()=>deleteLog(log.id)} className="text-red-500 hover:text-red-400 text-sm">Batal</button></td></tr>)}</tbody></table>
        </div>}

        {currentTab==='items'&&<div className="space-y-6">
          <div className="bg-[#1e1e1e] p-5 rounded-xl border border-[#333]">
            <h3 className="font-bold text-lg mb-4">Tambah Barang</h3>
            <form onSubmit={addItem} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="md:col-span-2"><label className="block text-xs text-gray-400 mb-1">Nama</label><input type="text" value={newItemForm.name} onChange={e=>setNewItemForm({...newItemForm,name:e.target.value})} required className="w-full bg-[#121212] border border-[#333] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"/></div>
              <div><label className="block text-xs text-gray-400 mb-1">Stok</label><input type="number" value={newItemForm.stock} onChange={e=>setNewItemForm({...newItemForm,stock:parseInt(e.target.value)||0})} required min="0" className="w-full bg-[#121212] border border-[#333] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"/></div>
              <div><label className="block text-xs text-gray-400 mb-1">Min Restok</label><div className="flex gap-2"><input type="number" value={newItemForm.min_stock} onChange={e=>setNewItemForm({...newItemForm,min_stock:parseInt(e.target.value)||0})} required min="0" className="w-full bg-[#121212] border border-[#333] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"/><button type="submit" className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium">+</button></div></div>
            </form>
          </div>
          <div className="bg-[#1e1e1e] rounded-xl overflow-hidden border border-[#333]">
            <div className="p-4 border-b border-[#333]"><h2 className="font-bold text-lg">Kelola Barang</h2></div>
            <table className="w-full text-left"><thead><tr className="bg-[#121212] text-gray-400 text-xs uppercase"><th className="p-4">Barang</th><th className="p-4 text-center">Stok</th><th className="p-4 text-right w-40">Aksi</th></tr></thead><tbody className="divide-y divide-[#333]">{items.map(item=><tr key={item.id} className="hover:bg-[#333]/50"><td className="p-4 text-white font-medium">{editingId===item.id?<input type="text" value={editForm.name??''} onChange={e=>setEditForm({...editForm,name:e.target.value})} className="bg-[#121212] border border-blue-500 rounded px-2 py-1 w-full text-white"/>:item.name}</td><td className="p-4 text-center">{editingId===item.id?<input type="number" value={editForm.stock??0} onChange={e=>setEditForm({...editForm,stock:parseInt(e.target.value)||0})} className="bg-[#121212] border border-blue-500 rounded px-2 py-1 w-16 text-center text-white"/>:<span className="font-bold text-lg">{item.stock}</span>}</td><td className="p-4 text-right">{editingId===item.id?<div className="flex justify-end gap-2"><button onClick={saveEdit} className="text-green-500 text-sm">Save</button><button onClick={()=>setEditingId(null)} className="text-gray-400 text-sm">Cancel</button></div>:<div className="flex justify-end items-center gap-3"><button onClick={()=>restockPrompt(item)} className="text-xs bg-[#121212] border border-[#333] hover:border-green-500 hover:text-green-500 px-2 py-1 rounded">+Kulakan</button><button onClick={()=>startEdit(item)} className="text-blue-500 text-sm">Edit</button><button onClick={()=>deleteItem(item.id)} className="text-red-500 text-sm">Del</button></div>}</td></tr>)}</tbody></table>
          </div>
        </div>}
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#1e1e1e]/90 backdrop-blur border-t border-[#333] pt-2 px-2 flex justify-around items-center z-50 pb-[env(safe-area-inset-bottom,8px)]">
        {[{id:'dashboard',label:'Dashboard',icon:'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z'},{id:'input',label:'Laku',icon:'M12 4v16m8-8H4'},{id:'history',label:'Riwayat',icon:'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01'},{id:'items',label:'Master',icon:'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4'}].map(tab=>
          <button key={tab.id} onClick={()=>setCurrentTab(tab.id)} className={`flex flex-col items-center p-2 ${currentTab===tab.id?'text-blue-500':'text-gray-500'} ${tab.id==='input'?'relative':''}`}>
            {tab.id==='input'&&<div className="absolute -top-6 bg-blue-500 text-white w-12 h-12 rounded-full flex items-center justify-center border-4 border-[#121212]"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon}/></svg></div>}
            {tab.id!=='input'&&<svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon}/></svg>}
            <span className={`text-[10px] font-medium ${tab.id==='input'?'mt-6':''}`}>{tab.label}</span>
          </button>
        )}
      </nav>
    </div>
  );
}
