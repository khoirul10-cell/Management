import React, { useState } from 'react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Transaction } from '../types';
import { Search, Download, Wand2, Loader2, Pencil, Trash2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, updateDoc, deleteDoc, increment } from 'firebase/firestore';

interface Props {
  transactions: Transaction[];
  userId: string;
}

const ewalletKeys = ['GoPay', 'DANA', 'OVO', 'ShopeePay', 'LinkAja'];
const bankKeys = ['BCA', 'Mandiri', 'BNI', 'BRI', 'SeaBank', 'BSI', 'Jago'];

const formatWalletSource = (ws: string | undefined | null) => {
  if (!ws || ws.toLowerCase() === 'unknown') return null;
  if (ws === 'Uang Cash') return 'Cash';
  if (ewalletKeys.includes(ws)) return `E-Wallet (${ws})`;
  if (bankKeys.includes(ws)) return `Bank (${ws})`;
  return ws;
};

export default function TransactionList({ transactions, userId }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [taggingTxId, setTaggingTxId] = useState<string | null>(null);
  
  // Edit State
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const filteredTransactions = transactions.filter(tx => {
    const matchSearch = tx.category.toLowerCase().includes(searchTerm.toLowerCase()) || 
      tx.description?.toLowerCase().includes(searchTerm.toLowerCase());
      
    let matchDate = true;
    if (startDate) {
      matchDate = matchDate && new Date(tx.timestamp).getTime() >= new Date(startDate).getTime();
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      matchDate = matchDate && new Date(tx.timestamp).getTime() <= end.getTime();
    }

    return matchSearch && matchDate;
  });

  const handleDownloadExcel = () => {
    if (!userId) return;
    // Download using the backend endpoint
    window.open(`/api/export/transactions/${userId}`, '_blank');
  };

  const handleAutoTag = async (tx: Transaction) => {
    if (!userId) return;
    setTaggingTxId(tx.id);
    try {
      const response = await fetch('/api/auto-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: tx.description || tx.category
        })
      });
      const data = await response.json();
      if (response.ok && data.category) {
        // Update in Firestore
        const txRef = doc(db, `users/${userId}/transactions`, tx.id);
        await updateDoc(txRef, {
          category: data.category
        });
      } else {
        console.error('Auto-tag error:', data.error);
        alert(data.error || 'Failed to auto-tag transaction');
      }
    } catch (e: any) {
      console.error('Auto-tag request failed', e);
      alert('Gagal mendapatkan sugesti kategori');
    } finally {
      setTaggingTxId(null);
    }
  };

  const isGenericCategory = (cat: string) => {
    const c = cat.toLowerCase();
    return c === 'other' || c === 'lainnya' || c === 'unknown' || c === '-' || c === '';
  };

  const handleDelete = async (tx: Transaction) => {
    if (!userId) return;
    if (confirm("Apakah Anda yakin ingin menghapus transaksi ini?")) {
      try {
        await deleteDoc(doc(db, `users/${userId}/transactions`, tx.id));
        
        // Revert the sub-balance property atomically
        if (tx.walletSource && tx.walletSource.toLowerCase() !== 'unknown') {
          const amt = Number(tx.amount) || 0;
          const diff = tx.type === 'income' ? -amt : amt; // Inverse logic
          await updateDoc(doc(db, 'users', userId), {
            [`walletBalances.${tx.walletSource}`]: increment(diff)
          });
        }
        
      } catch (e) {
        console.error("Gagal menghapus", e);
        alert("Gagal menghapus transaksi.");
      }
    }
  };

  const handleEditStart = (tx: Transaction) => {
    if ((tx.editCount || 0) >= 2) {
      alert("Transaksi ini sudah diubah 2 kali dan tidak dapat diubah lagi.");
      return;
    }
    setEditingTx(tx);
    setEditAmount(tx.amount.toString());
    setEditCategory(tx.category);
    setEditDescription(tx.description || '');
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !editingTx) return;

    if (!editAmount || !editCategory) {
      alert("Nominal dan Kategori harus diisi.");
      return;
    }

    try {
      const newAmount = Number(editAmount);
      const oldAmount = Number(editingTx.amount) || 0;
      const amountDiff = newAmount - oldAmount;

      const txRef = doc(db, `users/${userId}/transactions`, editingTx.id);
      await updateDoc(txRef, {
        amount: newAmount,
        category: editCategory,
        description: editDescription,
        editCount: (editingTx.editCount || 0) + 1
      });

      // Update walletBalance if editing an assigned transaction
      if (editingTx.walletSource && editingTx.walletSource.toLowerCase() !== 'unknown') {
         const diff = editingTx.type === 'income' ? amountDiff : -amountDiff;
         await updateDoc(doc(db, 'users', userId), {
            [`walletBalances.${editingTx.walletSource}`]: increment(diff)
         });
      }

      setEditingTx(null);
    } catch (error) {
      console.error("Gagal mengedit:", error);
      alert("Gagal menyimpan perubahan.");
    }
  };


  return (
    <div className="space-y-4">
      {transactions.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
              <input 
                type="text" 
                placeholder="Cari transaksi (kategori / rincian)..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <span className="text-slate-500 dark:text-slate-400 flex items-center">-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <button 
                onClick={handleDownloadExcel}
                className="flex items-center gap-2 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 border border-indigo-500/20 px-3 py-2 rounded-xl text-sm font-medium transition-all ml-1"
                title="Download Excel"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {filteredTransactions.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm italic">
          {searchTerm ? 'Transaksi tidak ditemukan.' : 'Belum ada riwayat transaksi.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTransactions.map((tx) => (
            <div key={tx.id} className="p-4 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl hover:bg-slate-50 dark:hover:bg-white/10 transition-all flex flex-col gap-3 group">
              {editingTx?.id === tx.id ? (
                <form onSubmit={handleEditSave} className="w-full flex justify-between gap-4">
                  <div className="flex-1 flex flex-col gap-2">
                    <input 
                      type="text" 
                      value={editCategory} 
                      onChange={(e) => setEditCategory(e.target.value)}
                      placeholder="Kategori"
                      className="w-full text-sm font-semibold bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1 text-slate-900 dark:text-white"
                      required
                    />
                    <input 
                      type="text" 
                      value={editDescription} 
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Deskripsi"
                      className="w-full text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1 text-slate-500 dark:text-slate-400"
                    />
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <input 
                      type="number" 
                      value={editAmount} 
                      onChange={(e) => setEditAmount(e.target.value)}
                      placeholder="Nominal"
                      className="w-24 text-right text-sm font-bold bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1 text-slate-900 dark:text-white"
                      required
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setEditingTx(null)} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">Batal</button>
                      <button type="submit" className="text-xs bg-indigo-500 text-white px-2 py-1 rounded-md hover:bg-indigo-600">Simpan</button>
                    </div>
                  </div>
                </form>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shrink-0 ${tx.type === 'expense' ? 'bg-rose-400/20 text-rose-500 dark:text-rose-400' : 'bg-emerald-400/20 text-emerald-600 dark:text-emerald-400'}`}>
                      <span className="text-lg">{tx.type === 'expense' ? '↓' : '↑'}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900 dark:text-slate-200">
                          {tx.category} 
                          {tx.isLateEntry && <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded-md font-medium">Telat direkap</span>}
                          {formatWalletSource(tx.walletSource) && <span className="ml-2 text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 px-1.5 py-0.5 rounded-md font-medium">{formatWalletSource(tx.walletSource)}</span>}
                          {tx.editCount && tx.editCount > 0 && <span className="ml-2 text-[10px] bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 px-1.5 py-0.5 rounded-md font-medium">Diedit {tx.editCount}x</span>}
                        </p>
                        {isGenericCategory(tx.category) && (
                          <button
                            onClick={() => handleAutoTag(tx)}
                            disabled={taggingTxId === tx.id}
                            className="p-1 rounded-full text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 transition-colors disabled:opacity-50"
                            title="Auto-tag kategori (AI)"
                          >
                            {taggingTxId === tx.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                      <div className="flex gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 items-center">
                        <span>{tx.description}</span>
                        <span>•</span>
                        <span>{format(tx.timestamp, "dd MMM yyyy HH:mm", { locale: id })}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 transition-opacity">
                      <button onClick={() => handleEditStart(tx)} className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 rounded-md transition-colors" title="Edit transaksi">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(tx)} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/20 rounded-md transition-colors" title="Hapus transaksi">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className={`font-bold text-sm text-right shrink-0 ${tx.type === 'expense' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {tx.type === 'expense' ? '-' : '+'}
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(tx.amount)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
