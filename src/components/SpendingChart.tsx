import React, { useMemo } from 'react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip,
  Cell
} from 'recharts';
import { Transaction } from '../types';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { TrendingDown, Calendar } from 'lucide-react';

interface SpendingChartProps {
  transactions: Transaction[];
}

export default function SpendingChart({ transactions }: SpendingChartProps) {
  const data = useMemo(() => {
    const tempMonthsSet = new Set<string>();
    const now = new Date();
    
    // Last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      tempMonthsSet.add(format(d, 'yyyy-MM'));
    }
    
    // Add transaction months
    transactions.forEach(t => {
      const txDate = new Date(t.timestamp);
      if (!isNaN(txDate.getTime())) {
        tempMonthsSet.add(format(txDate, 'yyyy-MM'));
      }
    });
    
    const sortedYM = Array.from(tempMonthsSet).sort();
    
    return sortedYM.map(ym => {
      const [year, month] = ym.split('-');
      const dateObj = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
      
      const expense = transactions
        .filter(t => t.type === 'expense' && format(new Date(t.timestamp), 'yyyy-MM') === ym)
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        
      return {
        month: format(dateObj, 'MMM yyyy', { locale: id }),
        Pengeluaran: expense,
      };
    });
  }, [transactions]);

  if (transactions.length === 0) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl p-5 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-rose-500" />
            Grafik Pengeluaran Bulanan
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Estimasi pola pengeluaran bulanan Anda</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] bg-rose-50 dark:bg-rose-500/10 text-rose-600 font-bold px-3 py-1 rounded-full border border-rose-500/20">
          <Calendar className="w-3 h-3" />
          <span>Riwayat Bulanan</span>
        </div>
      </div>
      <div className="w-full flex-1" style={{ minHeight: '250px' }}>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--chart-text)' }} />
            <YAxis 
              width={65}
              axisLine={false} 
              tickLine={false} 
              tickFormatter={(value) => {
                if (value >= 1000000) return `Rp${(value / 1000000).toFixed(1)}jt`;
                return `Rp${(value / 1000).toFixed(0)}k`;
              }} 
              tick={{ fontSize: 11, fill: 'var(--chart-text)' }} 
            />
            <RechartsTooltip 
              cursor={{ fill: 'var(--chart-grid)' }}
              contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: '12px', color: 'var(--chart-tooltip-text)' }}
              itemStyle={{ color: '#f43f5e' }}
              formatter={(value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value)}
              labelStyle={{ color: 'var(--chart-text)', fontWeight: 'bold' }}
            />
            <Bar dataKey="Pengeluaran" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={40}>
               {data.map((entry, index) => (
                 <Cell key={`cell-${index}`} fill="#f43f5e" />
               ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
