import { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area, LineChart, Line, Legend } from 'recharts';
import { Transaction } from '../types';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { TrendingUp, Calendar, Info } from 'lucide-react';

interface Props {
  transactions: Transaction[];
  walletBalances: Record<string, number>;
}

export default function Charts({ transactions, walletBalances }: Props) {
  const [chartType, setChartType] = useState<'pie' | 'bar'>('pie');
  const [incomeChartType, setIncomeChartType] = useState<'pie' | 'bar'>('pie');
  const [trendTab, setTrendTab] = useState<'expense' | 'income'>('expense');

  const expenseTransactions = transactions.filter(t => t.type === 'expense');
  const incomeTransactions = transactions.filter(t => t.type === 'income');
  
  // ============================
  // Expense Categories
  // ============================
  const categoryMap = new Map<string, number>();
  expenseTransactions.forEach(t => {
    const val = Number(t.amount);
    const amt = isNaN(val) ? 0 : val;
    categoryMap.set(t.category, (categoryMap.get(t.category) || 0) + amt);
  });
  
  const totalExpenseAmount = expenseTransactions.reduce((acc, t) => {
    const val = Number(t.amount);
    return acc + (isNaN(val) ? 0 : val);
  }, 0);
  
  const pieData = Array.from(categoryMap.entries()).map(([name, value]) => ({ 
    name, 
    value,
    percentage: totalExpenseAmount > 0 ? (value / totalExpenseAmount) * 100 : 0
  })).sort((a, b) => b.value - a.value);
  
  const COLORS = ['#6366f1', '#10b981', '#f43f5e', '#f59e0b', '#3b82f6', '#8b5cf6', '#64748b'];
  const INCOME_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#6366f1', '#84cc16'];

  // ============================
  // Komposisi Saldo (By Platform)
  // ============================
  const ewalletKeys = ['gopay', 'dana', 'ovo', 'shopeepay', 'linkaja'];
  const bankKeys = ['bca', 'mandiri', 'bni', 'bri', 'seabank', 'bsi', 'jago'];
  
  const balanceCategoryMap = new Map<string, number>();
  
  // Calculate directly from wallet balances
  Object.entries(walletBalances).forEach(([ws, val]) => {
      const amt = Number(val) || 0;
      if (amt <= 0) return; // Only show positive balances in the chart
      
      const wsLower = ws.toLowerCase();
      let platformGroup = 'Lainnya';
      if (wsLower === 'uang cash' || wsLower === 'cash') platformGroup = 'Cash';
      else if (ewalletKeys.includes(wsLower)) platformGroup = 'E-Wallet';
      else if (bankKeys.includes(wsLower)) platformGroup = 'Bank';
      else platformGroup = 'Lainnya';
      
      balanceCategoryMap.set(platformGroup, (balanceCategoryMap.get(platformGroup) || 0) + amt);
  });
  
  // Add pending income/expense that has no wallet source yet as 'Lainnya'
  const pendingIncome = incomeTransactions.filter(t => !t.walletSource || t.walletSource.toLowerCase() === 'unknown').reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  const pendingExpense = expenseTransactions.filter(t => !t.walletSource || t.walletSource.toLowerCase() === 'unknown').reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  const pendingBalance = pendingIncome - pendingExpense;
  
  if (pendingBalance > 0) {
     balanceCategoryMap.set('Lainnya', (balanceCategoryMap.get('Lainnya') || 0) + pendingBalance);
  } else if (pendingBalance < 0) {
     // If negative pending balance, subtract from 'Lainnya' if exists, but ensure it doesn't go negative on the chart
     const currentLainnya = balanceCategoryMap.get('Lainnya') || 0;
     const newLainnya = Math.max(0, currentLainnya + pendingBalance);
     if (newLainnya > 0) {
        balanceCategoryMap.set('Lainnya', newLainnya);
     } else {
        balanceCategoryMap.delete('Lainnya');
     }
  }

  const totalBalanceAmount = Array.from(balanceCategoryMap.values()).reduce((acc, val) => acc + val, 0);
  
  const pieIncomeData = Array.from(balanceCategoryMap.entries()).map(([name, value]) => ({
      name,
      value,
      percentage: totalBalanceAmount > 0 ? (value / totalBalanceAmount) * 100 : 0
  })).sort((a, b) => b.value - a.value);

  // ============================
  // Expense Trend
  // ============================
  const dates = Array.from(new Set(expenseTransactions.map(t => format(t.timestamp, 'yyyy-MM-dd')))).sort();
  const trendData = dates.map(date => {
      const dateStr = format(new Date(date), 'dd MMM', { locale: id });
      const total = expenseTransactions.filter(t => format(t.timestamp, 'yyyy-MM-dd') === date).reduce((sum, t) => {
        const val = Number(t.amount);
        return sum + (isNaN(val) ? 0 : val);
      }, 0);
      return { date: dateStr, amount: total };
  });

  // ============================
  // Income Trend
  // ============================
  const incomeDates = Array.from(new Set(incomeTransactions.map(t => format(t.timestamp, 'yyyy-MM-dd')))).sort();
  const incomeTrendData = incomeDates.map(date => {
      const dateStr = format(new Date(date), 'dd MMM', { locale: id });
      const total = incomeTransactions.filter(t => format(t.timestamp, 'yyyy-MM-dd') === date).reduce((sum, t) => {
        const val = Number(t.amount);
        return sum + (isNaN(val) ? 0 : val);
      }, 0);
      return { date: dateStr, amount: total };
  });

  // ============================
  // Monthly Spending & Income Trend
  // ============================
  const monthlyTrendData = (() => {
    const tempMonthsSet = new Set<string>();
    const now = new Date();
    
    // Add last 6 months to guarantee continuous trend coordinates
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      tempMonthsSet.add(format(d, 'yyyy-MM'));
    }
    
    // Also capture all months present in transaction history
    transactions.forEach(t => {
      const txDate = new Date(t.timestamp);
      if (!isNaN(txDate.getTime())) {
        tempMonthsSet.add(format(txDate, 'yyyy-MM'));
      }
    });
    
    const sortedYearMonths = Array.from(tempMonthsSet).sort();
    
    return sortedYearMonths.map(ym => {
      const [year, month] = ym.split('-');
      const dateObj = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
      const monthLabel = format(dateObj, 'MMM yyyy', { locale: id });
      
      const spending = transactions
        .filter(t => t.type === 'expense' && format(new Date(t.timestamp), 'yyyy-MM') === ym)
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        
      const income = transactions
        .filter(t => t.type === 'income' && format(new Date(t.timestamp), 'yyyy-MM') === ym)
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        
      return {
        month: monthLabel,
        Pengeluaran: spending,
        Pemasukan: income,
        rawYM: ym
      };
    });
  })();

  if (transactions.length === 0) {
    return (
      <div className="bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl p-6 flex items-center justify-center h-64">
        <p className="text-slate-500 dark:text-slate-400 text-sm italic">Belum ada data visualisasi (Catat transaksi dulu)</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Tren Pengeluaran & Pemasukan Bulanan Line Chart */}
      <div className="bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl p-5 flex flex-col w-full relative overflow-hidden" id="monthly-spending-trends-card">
        {/* subtle background decor */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 relative z-10">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-500" />
              Tren Pengeluaran & Pemasukan Bulanan
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Perbandingan tren bulanan untuk melacak arus kas bersih</p>
          </div>
          
          <div className="flex items-center gap-2 text-[11px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold px-3 py-1 rounded-full border border-indigo-500/20">
            <Calendar className="w-3 h-3" />
            <span>{monthlyTrendData.length} Bulan Terakhir</span>
          </div>
        </div>

        <div className="w-full flex-1" style={{ minHeight: '280px' }}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={monthlyTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
              <XAxis 
                dataKey="month" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 11, fill: 'var(--chart-text)' }} 
              />
              <YAxis 
                width={65}
                axisLine={false} 
                tickLine={false} 
                tickFormatter={(value) => {
                  if (value >= 1000000) {
                    return `Rp${(value / 1000000).toFixed(1)}jt`;
                  }
                  return `Rp${(value / 1000).toFixed(0)}rb`;
                }} 
                tick={{ fontSize: 11, fill: 'var(--chart-text)' }} 
              />
              <RechartsTooltip 
                contentStyle={{ 
                  backgroundColor: 'var(--chart-tooltip-bg)', 
                  border: '1px solid var(--chart-tooltip-border)', 
                  borderRadius: '12px', 
                  color: 'var(--chart-tooltip-text)' 
                }}
                formatter={(value: number) => 
                  new Intl.NumberFormat('id-ID', { 
                    style: 'currency', 
                    currency: 'IDR', 
                    minimumFractionDigits: 0, 
                    maximumFractionDigits: 0 
                  }).format(value)
                } 
                labelStyle={{ color: 'var(--chart-text)', fontWeight: 'bold', marginBottom: '6px' }}
              />
              <Legend 
                verticalAlign="top" 
                height={36} 
                iconType="circle"
                wrapperStyle={{ fontSize: '11px', fontWeight: '500' }}
              />
              <Line 
                type="monotone" 
                dataKey="Pengeluaran" 
                stroke="#f43f5e" 
                strokeWidth={3.5} 
                activeDot={{ r: 8 }} 
                dot={{ r: 4 }} 
              />
              <Line 
                type="monotone" 
                dataKey="Pemasukan" 
                stroke="#10b981" 
                strokeWidth={2.5} 
                strokeDasharray="5 5"
                activeDot={{ r: 6 }} 
                dot={{ r: 3 }} 
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Trend Charts */}
      <div className="bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl p-5 flex flex-col w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Kurva Trend</h3>
          <div className="flex bg-slate-100 dark:bg-white/5 rounded-lg p-1">
            <button 
              onClick={() => setTrendTab('expense')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${trendTab === 'expense' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
            >
              Pengeluaran
            </button>
            <button 
              onClick={() => setTrendTab('income')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${trendTab === 'income' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
            >
              Pemasukan
            </button>
          </div>
        </div>
        <div className="w-full flex-1" style={{ minHeight: '250px' }}>
          <ResponsiveContainer width="100%" height="100%" minHeight={250}>
            {trendTab === 'expense' ? (
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <defs>
                  <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--chart-text)' }} />
                <YAxis width={65} axisLine={false} tickLine={false} tickFormatter={(value) => `Rp${value/1000}k`} tick={{ fontSize: 11, fill: 'var(--chart-text)' }} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: '12px', color: 'var(--chart-tooltip-text)' }}
                  itemStyle={{ color: 'var(--chart-tooltip-text)' }}
                  formatter={(value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} 
                  labelStyle={{ color: 'var(--chart-text)', marginBottom: '4px' }}
                />
                <Area type="monotone" dataKey="amount" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorAmount)" />
              </AreaChart>
            ) : (
              <BarChart data={incomeTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--chart-text)' }} />
                <YAxis width={65} axisLine={false} tickLine={false} tickFormatter={(value) => `Rp${value/1000}k`} tick={{ fontSize: 11, fill: 'var(--chart-text)' }} />
                <RechartsTooltip 
                  cursor={{ fill: 'var(--chart-grid)' }} 
                  contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: '12px', color: 'var(--chart-tooltip-text)' }}
                  itemStyle={{ color: 'var(--chart-tooltip-text)' }}
                  formatter={(value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} 
                  labelStyle={{ color: 'var(--chart-text)', marginBottom: '4px' }}
                />
                <Bar dataKey="amount" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
        {/* Expense By Category */}
        <div className="flex-1 bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl p-5 flex flex-col min-h-[350px]">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Pengeluaran (Kategori)</h3>
            <div className="flex bg-slate-100 dark:bg-white/5 rounded-lg p-1">
              <button 
                onClick={() => setChartType('pie')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${chartType === 'pie' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
              >
                Bulat
              </button>
              <button 
                onClick={() => setChartType('bar')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${chartType === 'bar' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
              >
                Batang
              </button>
            </div>
          </div>
          <div className="flex-1 w-full" style={{ minHeight: '300px' }}>
            <ResponsiveContainer width="100%" height="100%" minHeight={300}>
              {chartType === 'pie' ? (
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={100}
                    innerRadius={60}
                    fill="#8884d8"
                    dataKey="value"
                    nameKey="name"
                    label={({ cx, cy, midAngle, outerRadius, name, percent }: any) => {
                      const MathPI = Math.PI;
                      const RADIAN = MathPI / 180;
                      const radius = outerRadius + 22;
                      const x = cx + radius * Math.cos(-midAngle * RADIAN);
                      const y = cy + radius * Math.sin(-midAngle * RADIAN);
                      return (
                        <text x={x} y={y} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={11} fill="var(--chart-text)" style={{ fontWeight: "600" }}>
                          <tspan x={x} dy="-0.6em">{name}</tspan>
                          <tspan x={x} dy="1.4em" style={{ fontWeight: "400" }}>{(percent * 100).toFixed(0)}%</tspan>
                        </text>
                      );
                    }}
                  >
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="var(--chart-grid)" />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: '12px', color: 'var(--chart-tooltip-text)' }}
                    itemStyle={{ color: 'var(--chart-tooltip-text)' }}
                    formatter={(value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} 
                  />
                </PieChart>
              ) : (
                <BarChart data={pieData} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--chart-text)' }} angle={-45} textAnchor="end" height={60} />
                  <YAxis width={40} axisLine={false} tickLine={false} tickFormatter={(value) => `${Number(value || 0).toFixed(0)}%`} tick={{ fontSize: 11, fill: 'var(--chart-text)' }} />
                  <RechartsTooltip 
                    cursor={{ fill: 'var(--chart-grid)' }} 
                    contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: '12px', color: 'var(--chart-tooltip-text)' }}
                    itemStyle={{ color: 'var(--chart-tooltip-text)' }}
                    formatter={(value: number, name: string, props: any) => [`${Number(value || 0).toFixed(1)}% (Rp${((props?.payload?.value || 0)/1000).toFixed(0)}k)`, "Persentase"]} 
                  />
                  <Bar dataKey="percentage" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40}>
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Income By Platform */}
        <div className="flex-1 bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl p-5 flex flex-col min-h-[350px]">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Komposisi Saldo</h3>
            <div className="flex bg-slate-100 dark:bg-white/5 rounded-lg p-1">
              <button 
                onClick={() => setIncomeChartType('pie')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${incomeChartType === 'pie' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
              >
                Bulat
              </button>
              <button 
                onClick={() => setIncomeChartType('bar')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${incomeChartType === 'bar' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
              >
                Batang
              </button>
            </div>
          </div>
          <div className="flex-1 w-full" style={{ minHeight: '300px' }}>
            <ResponsiveContainer width="100%" height="100%" minHeight={300}>
              {incomeChartType === 'pie' ? (
                <PieChart>
                  <Pie
                    data={pieIncomeData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={100}
                    innerRadius={60}
                    fill="#10b981"
                    dataKey="value"
                    nameKey="name"
                    label={({ cx, cy, midAngle, outerRadius, name, percent }: any) => {
                      const MathPI = Math.PI;
                      const RADIAN = MathPI / 180;
                      const radius = outerRadius + 22;
                      const x = cx + radius * Math.cos(-midAngle * RADIAN);
                      const y = cy + radius * Math.sin(-midAngle * RADIAN);
                      return (
                        <text x={x} y={y} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={11} fill="var(--chart-text)" style={{ fontWeight: "600" }}>
                          <tspan x={x} dy="-0.6em">{name}</tspan>
                          <tspan x={x} dy="1.4em" style={{ fontWeight: "400" }}>{(percent * 100).toFixed(0)}%</tspan>
                        </text>
                      );
                    }}
                  >
                    {pieIncomeData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={INCOME_COLORS[index % INCOME_COLORS.length]} stroke="var(--chart-grid)" />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: '12px', color: 'var(--chart-tooltip-text)' }}
                    itemStyle={{ color: 'var(--chart-tooltip-text)' }}
                    formatter={(value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} 
                  />
                </PieChart>
              ) : (
                <BarChart data={pieIncomeData} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--chart-text)' }} angle={-45} textAnchor="end" height={60} />
                  <YAxis width={40} axisLine={false} tickLine={false} tickFormatter={(value) => `${Number(value || 0).toFixed(0)}%`} tick={{ fontSize: 11, fill: 'var(--chart-text)' }} />
                  <RechartsTooltip 
                    cursor={{ fill: 'var(--chart-grid)' }} 
                    contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: '12px', color: 'var(--chart-tooltip-text)' }}
                    itemStyle={{ color: 'var(--chart-tooltip-text)' }}
                    formatter={(value: number, name: string, props: any) => [`${Number(value || 0).toFixed(1)}% (Rp${((props?.payload?.value || 0)/1000).toFixed(0)}k)`, "Persentase"]} 
                  />
                  <Bar dataKey="percentage" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40}>
                    {pieIncomeData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={INCOME_COLORS[index % INCOME_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

