import { useMemo } from 'react';
import { Transaction } from '../types';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Calendar, TrendingDown, TrendingUp, Wallet } from 'lucide-react';

interface MonthlyOverviewProps {
  transactions: Transaction[];
}

export default function MonthlyOverview({ transactions }: MonthlyOverviewProps) {
  const monthlyData = useMemo(() => {
    const data: Record<string, { income: number, expense: number, date: Date }> = {};
    
    transactions.forEach(tx => {
      const monthKey = format(tx.timestamp, 'yyyy-MM');
      if (!data[monthKey]) {
        data[monthKey] = { income: 0, expense: 0, date: tx.timestamp };
      }
      if (tx.type === 'income') {
        data[monthKey].income += tx.amount;
      } else {
        data[monthKey].expense += tx.amount;
      }
    });

    return Object.entries(data)
      .sort((a, b) => b[0].localeCompare(a[0])) // Sort descending by month key
      .map(([key, value]) => ({
        monthKey: key,
        ...value
      }));
  }, [transactions]);

  const formatIDR = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {monthlyData.map((data) => {
        const balance = data.income - data.expense;
        
        return (
          <div key={data.monthKey} className="bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl p-5 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors flex flex-col justify-between">
             <div className="flex justify-between items-center mb-4">
                 <div className="flex items-center gap-2 text-indigo-400">
                    <Calendar className="w-5 h-5" />
                    <span className="font-semibold text-lg capitalize">{format(data.date, 'MMMM yyyy', { locale: id })}</span>
                 </div>
             </div>
             
             <div className="space-y-4 mb-6">
                 <div className="flex justify-between items-center bg-emerald-500/5 p-3 rounded-xl border border-emerald-500/10">
                    <span className="text-emerald-400/80 text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-400"/> Pemasukan</span>
                    <span className="text-emerald-400 font-medium">{formatIDR(data.income)}</span>
                 </div>
                 <div className="flex justify-between items-center bg-rose-500/5 p-3 rounded-xl border border-rose-500/10">
                    <span className="text-rose-400/80 text-sm flex items-center gap-2"><TrendingDown className="w-4 h-4 text-rose-400"/> Pengeluaran</span>
                    <span className="text-rose-400 font-medium">{formatIDR(data.expense)}</span>
                 </div>
             </div>
             
             <div className="pt-4 border-t border-slate-200 dark:border-white/10 flex justify-between items-end">
                <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">Sisa Saldo</span>
                <span className={`text-2xl font-bold ${balance >= 0 ? 'text-slate-900 dark:text-white' : 'text-rose-400'}`}>
                   {formatIDR(balance)}
                </span>
             </div>
          </div>
        );
      })}
      
      {monthlyData.length === 0 && (
         <div className="col-span-full py-20 text-center text-slate-500 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl">
            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>Belum ada data bulanan.</p>
         </div>
      )}
    </div>
  );
}
