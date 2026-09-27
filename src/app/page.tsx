'use client';
import { useState, useEffect, useMemo } from 'react';

export default function Home() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [items, setItems] = useState([]);
  const [history, setHistory] = useState([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [historyFilterDate, setHistoryFilterDate] = useState(() => new Date().toISOString().split('T')[0]);
  
  const [saleForm, setSaleForm] = useState({
    date: new Date().toISOString().split('T')[0],
    itemId: '',
    qty: 1,
    note: ''
  });
  
  const [newItemForm, setNewItemForm] = useState({
    name: '',
    stock: 0,
    min_stock: 5
  });
  
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showToast, setShowToast] = useState(false);
  
  const todayFormatted = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
  const todayRaw = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const savedItems = localStorage.getItem('indahcell_items');
    const savedHistory = localStorage.getItem('indahcell_history');
    if (savedItems) setItems(JSON.parse(savedItems));
    else {
      const initItems = [
        { id: 1, name: 'Voucher Tsel 2.5GB', stock: 15, min_stock: 5 },
        { id: 2, name: 'Voucher Tsel 4GB', stock: 3, min_stock: 5 },
        { id: 3, name: 'Voucher XL 3GB', stock: 8, min_stock: 10 },
        { id: 4, name: 'Kabel Data Type-C', stock: 12, min_stock: 5 },
        { id: 5, name: 'Softcase Bening', stock: 4, min_stock: 5 }
      ];
      setItems(initItems);
      localStorage.setItem('indahcell_items', JSON.stringify(initItems));
    }
    if (savedHistory) setHistory(JSON.parse(savedHistory));
  }, []);

  const saveData = (newItems, newHistory) => {
    setItems(newItems);
    setHistory(newHistory);
    localStorage.setItem('indahcell_items', JSON.stringify(newItems));
    localStorage.setItem('indahcell_history', JSON.stringify(newHistory));
  };

  const itemsNeedsRestock = items.filter(item => item.stock <= item.min_stock).sort((a, b) => a.stock - b.stock);
  
  const filteredDashboardItems = useMemo(() => {
    if (!searchQuery) return [...items].sort((a,b) => a.stock - b.stock);
    const q = searchQuery.toLowerCase();
    return items.filter(i => i.name.toLowerCase().includes(q)).sort((a,b) => a.stock - b.stock);
  }, [items, searchQuery]);

  const filteredHistory = useMemo(() => {
    let sorted = [...history].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (historyFilterDate) sorted = sorted.filter(log => log.date === historyFilterDate);
    return sorted;
  }, [history, historyFilterDate]);

  const salesToday = history.filter(log => log.date === todayRaw && log.type === 'OUT').reduce((sum, log) => sum + log.qty, 0);
  const txToday = history.filter(log => log.date === todayRaw && log.type === 'OUT').length;

  const addItem = (e) => {
    e.preventDefault();
    const newItems = [...items, { id: Date.now(), ...newItemForm }];
    setNewItemForm({ name: '', stock: 0, min_stock: 5 });
    saveData(newItems, history);
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditForm({ ...item });
  };

  const saveEdit = () => {
    const newItems = [...items];
    const newHistory = [...history];
    const index = newItems.findIndex(i => i.id === editingId);
    if (index !== -1) {
      const oldStock = newItems[index].stock;
      const newStock = editForm.stock;
      if (oldStock !== newStock) {
        newHistory.push({
          id: Date.now(),
          date: todayRaw,
          created_at: new Date().toISOString(),
          itemId: editingId,
          type: 'ADJUST',
          qty: Math.abs(newStock - oldStock),
          note: `Koreksi manual (Dari ${oldStock} ke ${newStock})`
        });
      }
      newItems[index] = { ...editForm };
      saveData(newItems, newHistory);
    }
    setEditingId(null);
  };

  const restockPrompt = (item) => {
    const qty = prompt(`Berapa banyak ${item.name} yang baru dibeli (kulakan)?`);
    const parsedQty = parseInt(qty);
    if (!isNaN(parsedQty) && parsedQty > 0) {
      const newItems = [...items];
      const newHistory = [...history];
      const index = newItems.findIndex(i => i.id === item.id);
      newItems[index].stock += parsedQty;
      newHistory.push({
        id: Date.now(),
        date: todayRaw,
        created_at: new Date().toISOString(),
        itemId: item.id,
        type: 'IN',
        qty: parsedQty,
        note: 'Restok / Kulakan'
      });
      saveData(newItems, newHistory);
      alert(`Sukses menambah ${parsedQty} stok untuk ${item.name}`);
    }
  };

  const deleteItem = (id) => {
    if(confirm('Yakin hapus barang ini? Riwayat penjualannya tidak akan hilang tapi namanya jadi "Barang Dihapus"')){
      saveData(items.filter(i => i.id !== id), history);
    }
  };

  const recordSale = (e) => {
    e.preventDefault();
    const index = items.findIndex(i => i.id === Number(saleForm.itemId));
    if (index === -1) return;
    
    const newItems = [...items];
    const newHistory = [...history];
    
    newHistory.push({
      id: Date.now(),
      date: saleForm.date,
      created_at: new Date().toISOString(),
      itemId: Number(saleForm.itemId),
      type: 'OUT',
      qty: saleForm.qty,
      note: saleForm.note
    });
    
    newItems[index].stock -= saleForm.qty;
    saveData(newItems, newHistory);
    
    setSaleForm({ ...saleForm, itemId: '', qty: 1, note: '' });
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const deleteLog = (id) => {
    if(!confirm('Batalin transaksi ini? Stok barang akan dikembalikan otomatis.')) return;
    const newHistory = [...history];
    const newItems = [...items];
    
    const logIndex = newHistory.findIndex(h => h.id === id);
    if (logIndex === -1) return;
    
    const log = newHistory[logIndex];
    const itemIndex = newItems.findIndex(i => i.id === log.itemId);
    
    if (itemIndex !== -1) {
      if (log.type === 'OUT') newItems[itemIndex].stock += log.qty;
      else if (log.type === 'IN') newItems[itemIndex].stock -= log.qty;
    }
    
    newHistory.splice(logIndex, 1);
    saveData(newItems, newHistory);
  };

  const formatDate = (dateStr) => {
    const parts = dateStr.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0].substring(2)}`;
  };

  const getItemName = (id) => {
    const item = items.find(i => i.id === id);
    return item ? item.name : 'Barang Dihapus';
  };

  return (
    <div className="antialiased font-sans min-h-screen pb-20 md:pb-0 bg-[#121212] text-[#e5e5e5]">
      
      <nav className="hidden md:flex bg-[#1e1e1e]/90 backdrop-blur sticky top-0 z-50 px-6 py-4 items-center justify-between border-b border-[#333]">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-white">IC</div>
          <h1 className="text-xl font-bold tracking-tight text-white">IndahCell Stock</h1>
        </div>
        <div className="flex space-x-1 bg-[#121212] p-1 rounded-lg border border-[#333]">
          {['dashboard', 'input', 'history', 'items'].map(tab => (
            <button key={tab} onClick={() => setCurrentTab(tab)} className={`px-4 py-2 rounded-md text-sm font-medium transition ${currentTab === tab ? 'bg-[#1e1e1e] text-white' : 'text-gray-400 hover:text-white'}`}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </nav>

      <header className="md:hidden bg-[#1e1e1e]/90 backdrop-blur sticky top-0 z-50 px-4 py-4 flex items-center justify-between border-b border-[#333]">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-white text-xs">IC</div>
          <h1 className="text-lg font-bold tracking-tight text-white">IndahCell Stock</h1>
        </div>
        <div className="text-xs text-gray-400">{todayFormatted}</div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        {currentTab === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#1e1e1e]/90 p-4 rounded-xl border border-[#333]">
                <div className="text-sm text-gray-400 mb-1">Total Item</div>
                <div className="text-2xl font-bold">{items.length}</div>
              </div>
              <div className="bg-[#1e1e1e]/90 p-4 rounded-xl border-l-4 border-l-red-500 border border-y-[#333] border-r-[#333]">
                <div className="text-sm text-gray-400 mb-1">Wajib Restok</div>
                <div className="text-2xl font-bold text-red-500">{itemsNeedsRestock.length}</div>
              </div>
              <div className="bg-[#1e1e1e]/90 p-4 rounded-xl border border-[#333]">
                <div className="text-sm text-gray-400 mb-1">Laku Hari Ini</div>
                <div className="text-2xl font-bold text-blue-500">{salesToday}</div>
              </div>
              <div className="bg-[#1e1e1e]/90 p-4 rounded-xl border border-[#333]">
                <div className="text-sm text-gray-400 mb-1">Trx Hari Ini</div>
                <div className="text-2xl font-bold">{txToday}</div>
              </div>
            </div>

            {itemsNeedsRestock.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <h3 className="text-red-500 font-bold flex items-center mb-3">Wajib Restok Segera!</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {itemsNeedsRestock.map(item => (
                    <div key={item.id} className="bg-[#1e1e1e]/90 p-3 rounded-lg flex justify-between items-center border border-[#333]">
                      <div>
                        <div className="font-medium text-white">{item.name}</div>
                        <div className="text-xs text-gray-400">Batas min: {item.min_stock}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-red-500">{item.stock}</div>
                        <div className="text-xs text-gray-400">Tersisa</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-[#1e1e1e]/90 rounded-xl overflow-hidden border border-[#333]">
              <div className="p-4 border-b border-[#333] flex justify-between items-center">
                <h2 className="font-bold text-lg">Pantauan Stok</h2>
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Cari barang..." className="bg-[#121212] border border-[#333] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 w-40 md:w-64 text-white"/>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#121212] text-gray-400 text-xs uppercase tracking-wider">
                      <th className="p-4 font-medium">Nama Barang</th>
                      <th className="p-4 font-medium text-center">Stok</th>
                      <th className="p-4 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#333]">
                    {filteredDashboardItems.map(item => (
                      <tr key={item.id} className="hover:bg-[#333]/50 transition">
                        <td className="p-4 font-medium text-white">{item.name}</td>
                        <td className="p-4 text-center">
                          <span className={`text-lg font-bold ${item.stock <= item.min_stock ? 'text-red-500' : 'text-white'}`}>{item.stock}</span>
                        </td>
                        <td className="p-4 text-right">
                          {item.stock <= item.min_stock ? <span className="px-2.5 py-1 bg-red-500/20 text-red-500 rounded-full text-xs font-medium">Restok</span>
                           : item.stock <= item.min_stock + 5 ? <span className="px-2.5 py-1 bg-yellow-500/20 text-yellow-500 rounded-full text-xs font-medium">Hampir Habis</span>
                           : <span className="px-2.5 py-1 bg-green-500/20 text-green-500 rounded-full text-xs font-medium">Aman</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {currentTab === 'input' && (
          <div className="glass rounded-xl p-5 md:p-8 max-w-2xl mx-auto bg-[#1e1e1e]/90 border border-[#333] animate-in fade-in">
            <h2 className="text-xl font-bold mb-6 text-white border-b border-[#333] pb-4">Catat Barang Laku</h2>
            <form onSubmit={recordSale} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Tanggal</label>
                <input type="date" value={saleForm.date} onChange={e => setSaleForm({...saleForm, date: e.target.value})} required className="w-full bg-[#121212] border border-[#333] rounded-lg p-3 text-white focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Pilih Barang</label>
                <select value={saleForm.itemId} onChange={e => setSaleForm({...saleForm, itemId: e.target.value})} required className="w-full bg-[#121212] border border-[#333] rounded-lg p-3 text-white focus:outline-none focus:border-blue-500">
                  <option value="" disabled>-- Pilih Barang --</option>
                  {items.map(item => <option key={item.id} value={item.id}>{item.name} (Stok: {item.stock})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Jumlah Laku</label>
                <div className="flex items-center space-x-3">
                  <button type="button" onClick={() => saleForm.qty > 1 && setSaleForm({...saleForm, qty: saleForm.qty-1})} className="w-12 h-12 rounded-lg bg-[#121212] border border-[#333] flex items-center justify-center text-xl hover:bg-[#333] transition text-white">-</button>
                  <input type="number" value={saleForm.qty} onChange={e => setSaleForm({...saleForm, qty: parseInt(e.target.value)||1})} min="1" required className="w-full bg-[#121212] border border-[#333] rounded-lg p-3 text-center text-xl font-bold text-white focus:outline-none focus:border-blue-500" />
                  <button type="button" onClick={() => setSaleForm({...saleForm, qty: saleForm.qty+1})} className="w-12 h-12 rounded-lg bg-[#121212] border border-[#333] flex items-center justify-center text-xl hover:bg-[#333] transition text-white">+</button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Catatan (Opsional)</label>
                <input type="text" value={saleForm.note} onChange={e => setSaleForm({...saleForm, note: e.target.value})} placeholder="Misal: Laku di konter Soko" className="w-full bg-[#121212] border border-[#333] rounded-lg p-3 text-white focus:outline-none focus:border-blue-500" />
              </div>
              <div className="pt-4">
                <button type="submit" className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 rounded-xl transition">Simpan Penjualan</button>
              </div>
            </form>
            {showToast && <div className="mt-4 p-4 bg-green-500/20 text-green-500 rounded-lg text-center font-medium">Penjualan berhasil dicatat! Stok otomatis berkurang.</div>}
          </div>
        )}

        {currentTab === 'history' && (
          <div className="bg-[#1e1e1e]/90 rounded-xl overflow-hidden border border-[#333] animate-in fade-in">
            <div className="p-4 border-b border-[#333] flex flex-col md:flex-row md:justify-between md:items-center gap-4">
              <h2 className="font-bold text-lg">Riwayat Keluar/Masuk</h2>
              <div className="flex space-x-2">
                <input type="date" value={historyFilterDate} onChange={e => setHistoryFilterDate(e.target.value)} className="bg-[#121212] border border-[#333] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                <button onClick={() => setHistoryFilterDate('')} className="px-3 py-2 bg-[#121212] border border-[#333] rounded-lg text-sm hover:bg-[#333] transition">Semua</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#121212] text-gray-400 text-xs uppercase tracking-wider">
                    <th className="p-4 font-medium">Tgl</th>
                    <th className="p-4 font-medium">Item</th>
                    <th className="p-4 font-medium text-center">Qty</th>
                    <th className="p-4 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#333]">
                  {filteredHistory.map(log => (
                    <tr key={log.id} className="hover:bg-[#333]/50 transition">
                      <td className="p-4 text-sm whitespace-nowrap">{formatDate(log.date)}</td>
                      <td className="p-4 font-medium text-white">
                        <div className="text-xs mb-1">
                          {log.type === 'OUT' && <span className="text-yellow-500">LAKU</span>}
                          {log.type === 'IN' && <span className="text-green-500">RESTOK</span>}
                          {log.type === 'ADJUST' && <span className="text-gray-400">KOREKSI</span>}
                        </div>
                        {getItemName(log.itemId)}
                      </td>
                      <td className={`p-4 text-center font-bold ${log.type === 'OUT' ? 'text-yellow-500' : 'text-green-500'}`}>
                        {log.type === 'OUT' ? '-' : '+'}{log.qty}
                      </td>
                      <td className="p-4 text-right">
                        <button onClick={() => deleteLog(log.id)} className="text-red-500 hover:text-red-400 text-sm">Batal</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {currentTab === 'items' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="bg-[#1e1e1e]/90 p-5 md:p-6 rounded-xl border border-[#333]">
              <h3 className="font-bold text-lg mb-4 text-white">Tambah Barang Baru</h3>
              <form onSubmit={addItem} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-400 mb-1">Nama Barang / Voucher</label>
                  <input type="text" value={newItemForm.name} onChange={e => setNewItemForm({...newItemForm, name: e.target.value})} required className="w-full bg-[#121212] border border-[#333] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Stok Awal</label>
                  <input type="number" value={newItemForm.stock} onChange={e => setNewItemForm({...newItemForm, stock: parseInt(e.target.value)||0})} required min="0" className="w-full bg-[#121212] border border-[#333] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Batas Wajib Restok</label>
                  <div className="flex space-x-2">
                    <input type="number" value={newItemForm.min_stock} onChange={e => setNewItemForm({...newItemForm, min_stock: parseInt(e.target.value)||0})} required min="0" className="w-full bg-[#121212] border border-[#333] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
                    <button type="submit" className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium transition">+</button>
                  </div>
                </div>
              </form>
            </div>

            <div className="bg-[#1e1e1e]/90 rounded-xl overflow-hidden border border-[#333]">
              <div className="p-4 border-b border-[#333]">
                <h2 className="font-bold text-lg">Kelola Data Barang</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#121212] text-gray-400 text-xs uppercase tracking-wider">
                      <th className="p-4 font-medium">Barang</th>
                      <th className="p-4 font-medium text-center">Stok</th>
                      <th className="p-4 font-medium text-right w-40">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#333]">
                    {items.map(item => (
                      <tr key={item.id} className="hover:bg-[#333]/50 transition">
                        <td className="p-4 text-white font-medium">
                          {editingId === item.id ? <input type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="bg-[#121212] border border-blue-500 rounded px-2 py-1 w-full text-white" />
                          : <span onDoubleClick={() => startEdit(item)}>{item.name}</span>}
                        </td>
                        <td className="p-4 text-center">
                          {editingId === item.id ? <input type="number" value={editForm.stock} onChange={e => setEditForm({...editForm, stock: parseInt(e.target.value)||0})} className="bg-[#121212] border border-blue-500 rounded px-2 py-1 w-16 text-center text-white" />
                          : <span className="font-bold text-lg">{item.stock}</span>}
                        </td>
                        <td className="p-4 text-right">
                          {editingId === item.id ? (
                            <div className="flex justify-end space-x-2">
                              <button onClick={saveEdit} className="text-green-500 text-sm">Save</button>
                              <button onClick={() => setEditingId(null)} className="text-gray-400 text-sm">Cancel</button>
                            </div>
                          ) : (
                            <div className="flex justify-end items-center space-x-3">
                              <button onClick={() => restockPrompt(item)} className="text-xs bg-[#121212] border border-[#333] hover:border-green-500 hover:text-green-500 px-2 py-1 rounded transition">+ Kulakan</button>
                              <button onClick={() => startEdit(item)} className="text-blue-500 text-sm">Edit</button>
                              <button onClick={() => deleteItem(item.id)} className="text-red-500 text-sm">Del</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#1e1e1e]/90 backdrop-blur border-t border-[#333] pb-safe pt-2 px-2 flex justify-around items-center z-50">
        {[
          {id: 'dashboard', label: 'Dashboard', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z'},
          {id: 'input', label: 'Laku', icon: 'M12 4v16m8-8H4'},
          {id: 'history', label: 'Riwayat', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01'},
          {id: 'items', label: 'Master', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4'}
        ].map(tab => (
          <button key={tab.id} onClick={() => setCurrentTab(tab.id)} className={`flex flex-col items-center p-2 ${currentTab === tab.id ? 'text-blue-500' : 'text-gray-500'} ${tab.id === 'input' ? 'relative' : ''}`}>
            {tab.id === 'input' && <div className="absolute -top-6 bg-blue-500 text-white w-12 h-12 rounded-full flex items-center justify-center border-4 border-[#121212]"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon}></path></svg></div>}
            {tab.id !== 'input' && <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon}></path></svg>}
            <span className={`text-[10px] font-medium ${tab.id === 'input' ? 'mt-6' : ''}`}>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
