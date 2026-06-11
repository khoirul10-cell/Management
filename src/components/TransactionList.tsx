import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Transaction } from '../types';

interface Props {
  transactions: Transaction[];
}

export default function TransactionList({ transactions }: Props) {
  if (transactions.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500 text-sm italic">
        Belum ada riwayat transaksi.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {transactions.map((tx) => (
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
  );
}
