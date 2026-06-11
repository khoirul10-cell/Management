import { useState } from 'react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Transaction } from '../types';
import { Search, Download } from 'lucide-react';

interface Props {
  transactions: Transaction[];
  userId: string;
}

export default function TransactionList({ transactions, userId }: Props) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTransactions = transactions.filter(tx => 
    tx.category.toLowerCase().includes(searchTerm.toLowerCase()) || 
    tx.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDownloadExcel = () => {
    if (!userId) return;
    // Download using the backend endpoint
    window.open(`/api/export/transactions/${userId}`, '_blank');
  };

  return (
    <div className="space-y-4">
      {transactions.length > 0 && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Cari transaksi (kategori / rincian)..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <button 
            onClick={handleDownloadExcel}
            className="flex items-center gap-2 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 border border-indigo-500/20 px-3 py-2 rounded-xl text-sm font-medium transition-all"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Excel</span>
          </button>
        </div>
      )}

      {filteredTransactions.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm italic">
          {searchTerm ? 'Transaksi tidak ditemukan.' : 'Belum ada riwayat transaksi.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTransactions.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${tx.type === 'expense' ? 'bg-rose-400/20 text-rose-400' : 'bg-emerald-400/20 text-emerald-400'}`}>
                   <span className="text-lg">
                     {tx.type === 'expense' ? '↓' : '↑'}
                   </span>
                </div>
                <div>
                  <p className="font-semibold text-slate-200">{tx.category}</p>
                  <div className="flex gap-2 text-[11px] text-slate-400 mt-0.5">
                    <span>{tx.description}</span>
                    <span>•</span>
                    <span>{format(tx.timestamp, "dd MMM yyyy HH:mm", { locale: id })}</span>
                  </div>
                </div>
              </div>
              <div className={`font-bold text-sm ${tx.type === 'expense' ? 'text-rose-400' : 'text-emerald-400'}`}>
                {tx.type === 'expense' ? '-' : '+'}
                {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(tx.amount)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
