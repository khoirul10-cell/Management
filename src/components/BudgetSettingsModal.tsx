import { useState, useEffect } from 'react';
import { X, Search, HelpCircle, TrendingUp, AlertTriangle, Check, Plus, Trash2, Sliders, ChevronRight } from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

interface BudgetSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  monthlyBudget: number;
  categoryBudgets: Record<string, number>;
  expensesByCategory: Record<string, number>;
  onSaveTotalBudget: (amount: number) => Promise<void>;
  onSaveCategoryBudget: (category: string, amount: number) => Promise<void>;
  onSaveAllCategoryBudgets: (budgets: Record<string, number>) => Promise<void>;
}

const POPULAR_CATEGORIES = [
  'Makanan & Minuman',
  'Transportasi',
  'Belanja',
  'Tagihan & Utilitas',
  'Hiburan & Hiburan',
  'Kesehatan',
  'Pendidikan',
  'Investasi & Tabungan',
  'Lainnya'
];

export default function BudgetSettingsModal({
  isOpen,
  onClose,
  monthlyBudget: initialMonthlyBudget,
  categoryBudgets: initialCategoryBudgets,
  expensesByCategory,
  onSaveTotalBudget,
  onSaveCategoryBudget,
  onSaveAllCategoryBudgets
}: BudgetSettingsModalProps) {
  const [totalBudgetInput, setTotalBudgetInput] = useState(String(initialMonthlyBudget));
  const [localCategoryBudgets, setLocalCategoryBudgets] = useState<Record<string, number>>({});
  const [newCategoryName, setNewCategoryName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' | null }>({ text: '', type: null });

  // Load initial values
  useEffect(() => {
    setTotalBudgetInput(String(initialMonthlyBudget));
    setLocalCategoryBudgets({ ...initialCategoryBudgets });
  }, [initialMonthlyBudget, initialCategoryBudgets, isOpen]);

  if (!isOpen) return null;

  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(val);
  };

  // Get list of categories to display:
  // Combine custom ones, current transaction categories, and popular categories matching query
  const existingCategories = Array.from(
    new Set([
      ...Object.keys(expensesByCategory),
      ...Object.keys(localCategoryBudgets)
    ])
  ).sort();

  const handleAddNewCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    
    // Add with 0 limit initially
    if (localCategoryBudgets[trimmed] !== undefined) {
      setFeedbackMsg({ text: `Kategori "${trimmed}" sudah terdaftar.`, type: 'info' });
      return;
    }

    setLocalCategoryBudgets(prev => ({
      ...prev,
      [trimmed]: 0
    }));
    setNewCategoryName('');
    setFeedbackMsg({ text: `Kategori "${trimmed}" ditambahkan. Silakan tentukan batas limitnya.`, type: 'success' });
    setTimeout(() => setFeedbackMsg({ text: '', type: null }), 3000);
  };

  const handleRemoveCategoryLimit = (category: string) => {
    setLocalCategoryBudgets(prev => {
      const updated = { ...prev };
      delete updated[category];
      return updated;
    });
  };

  const handleLimitChange = (category: string, value: string) => {
    const num = Number(value);
    if (isNaN(num)) return;
    setLocalCategoryBudgets(prev => ({
      ...prev,
      [category]: Math.max(0, num)
    }));
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    setFeedbackMsg({ text: 'Menyimpan anggaran Anda...', type: 'info' });
    try {
      // 1. Save Total Monthly Budget
      const parsedTotal = Number(totalBudgetInput);
      if (!isNaN(parsedTotal) && parsedTotal >= 0) {
        await onSaveTotalBudget(parsedTotal);
      }

      // 2. Save all category budgets consolidated
      await onSaveAllCategoryBudgets(localCategoryBudgets);

      setFeedbackMsg({ text: '✓ Seluruh anggaran berhasil diperbarui!', type: 'success' });
      setTimeout(() => {
        setFeedbackMsg({ text: '', type: null });
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setFeedbackMsg({ text: `Gagal menyimpan: ${err.message || 'Kesalahan Server'}`, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // Pre-calculate sum of all set category budgets
  const totalAllocated: number = (Object.values(localCategoryBudgets) as number[]).reduce((sum: number, val: number) => sum + val, 0);
  const totalBudgetVal = Number(totalBudgetInput) || 0;
  const isOverAllocated = totalAllocated > totalBudgetVal && totalBudgetVal > 0;

  // Filter existing categories by search query
  const filteredCategories = existingCategories.filter(cat => 
    cat.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      {/* Background click dismiss */}
      <div className="absolute inset-0" onClick={onClose} />

      <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden relative flex flex-col max-h-[90vh] z-10 animate-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-100 dark:border-white/5 flex justify-between items-center bg-slate-50/50 dark:bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
              <Sliders className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white font-sans tracking-tight">Atur Limit Anggaran</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Kendalikan pengeluaran bulanan per kategori keuangan Anda</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Contents */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          
          {/* Section 1: Main Monthly Budget */}
          <div className="bg-indigo-50/50 dark:bg-indigo-500/5 border border-indigo-100 dark:border-indigo-500/10 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-indigo-300 mb-3 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-indigo-500" />
              Total Anggaran Bulanan Utama
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Target Pengeluaran Bulanan Global</p>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">IDR</span>
                  <input
                    type="number"
                    value={totalBudgetInput}
                    onChange={(e) => setTotalBudgetInput(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl pl-12 pr-4 py-2.5 text-sm outline-none text-slate-900 dark:text-white font-semibold transition-focus focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    placeholder="Contoh: 5000000"
                  />
                </div>
              </div>

              {/* Status Alokasi */}
              <div className="p-4 bg-white/50 dark:bg-black/20 rounded-xl border border-slate-100 dark:border-white/5">
                <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 mb-1">
                  <span>Alokasi Kategori:</span>
                  <span className={isOverAllocated ? 'text-rose-500 font-semibold' : 'text-slate-700 dark:text-slate-300 font-semibold'}>
                    {formatIDR(totalAllocated)}
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-white/10 rounded-full h-1.5 mt-2 overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-300 ${isOverAllocated ? 'bg-rose-500' : 'bg-indigo-500'}`}
                    style={{ width: `${Math.min((totalAllocated / Math.max(totalBudgetVal, 1)) * 100, 100)}%` }}
                  />
                </div>
                {isOverAllocated && (
                  <p className="text-[10px] text-rose-500 mt-1.5 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" /> Total limit kategori melebihi anggaran utama!
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Manage Categories Limit & View Progress */}
          <div>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-4">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Batas Limit per Kategori Pengeluaran
              </h3>
              
              {/* Search Bar */}
              <div className="relative max-w-xs w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari kategori..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl pl-9 pr-4 py-1.5 text-xs outline-none text-slate-900 dark:text-white transition-focus focus:border-indigo-500"
                />
              </div>
            </div>

            {/* List of categories with spend trackers */}
            <div className="space-y-4 max-h-[35vh] overflow-y-auto pr-1">
              {filteredCategories.map(cat => {
                const limit = localCategoryBudgets[cat] || 0;
                const spend = expensesByCategory[cat] || 0;
                const percent = limit > 0 ? (spend / limit) * 100 : 0;
                
                // Color mapping of progress line based on severity
                let progressColor = 'bg-indigo-500';
                let textColor = 'text-indigo-600 dark:text-indigo-400';
                if (limit > 0) {
                  if (percent >= 100) {
                    progressColor = 'bg-rose-500';
                    textColor = 'text-rose-600 dark:text-rose-400 font-bold';
                  } else if (percent >= 85) {
                    progressColor = 'bg-amber-500';
                    textColor = 'text-amber-600 dark:text-amber-400 font-bold';
                  }
                }

                return (
                  <div key={cat} className="p-3 border border-slate-100 dark:border-white/5 rounded-2xl bg-slate-50/40 dark:bg-white/[0.01] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                    <div className="flex-1 w-full">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 capitalize flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-600" />
                          {cat}
                        </span>
                        
                        {/* Real-time Spend / Progress label */}
                        <div className="text-right">
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            Terpakai: <span className={`font-semibold ${textColor}`}>{formatIDR(spend)}</span>
                            {limit > 0 && ` dari ${formatIDR(limit)}`}
                          </span>
                        </div>
                      </div>

                      {/* Spend Progress Bar */}
                      {limit > 0 ? (
                        <div className="w-full bg-slate-200/60 dark:bg-white/10 rounded-full h-2 mt-1.5 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${progressColor}`}
                            style={{ width: `${Math.min(percent, 100)}%` }}
                          />
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-400 italic mt-1 font-medium">Batas limit belum ditentukan (Uncapped)</p>
                      )}
                    </div>

                    {/* Numeric Input & Action */}
                    <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
                      <div className="relative w-full md:w-36">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-slate-400 font-medium">IDR</span>
                        <input
                          type="number"
                          value={limit === 0 ? '' : limit}
                          onChange={(e) => handleLimitChange(cat, e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl pl-11 pr-2 py-1.5 text-xs font-semibold outline-none text-slate-900 dark:text-white focus:border-indigo-500"
                          placeholder="No limit"
                        />
                      </div>
                      <button
                        onClick={() => handleRemoveCategoryLimit(cat)}
                        title="Hapus Limit"
                        className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {filteredCategories.length === 0 && (
                <div className="py-8 bg-slate-50 dark:bg-white/[0.01] rounded-2xl text-center border border-dashed border-slate-200 dark:border-white/5">
                  <p className="text-sm text-slate-400 italic">Belum ada kategori yang cocok dengan pencarian.</p>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Add Custom Category or Quick Add Popular */}
          <div className="border-t border-slate-100 dark:border-white/5 pt-5">
            <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
              Tambahkan Kategori Baru
            </h4>
            
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Nama kategori baru... (Misal: Kosan, Asuransi)"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddNewCategory()}
                className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 text-sm outline-none text-slate-900 dark:text-white focus:border-indigo-500"
              />
              <button
                onClick={handleAddNewCategory}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Tambah
              </button>
            </div>

            {/* Popular recommendation tags */}
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Rekomendasi Kategori Finansial:</p>
            <div className="flex flex-wrap gap-1.5">
              {POPULAR_CATEGORIES.map(pop => {
                const exists = localCategoryBudgets[pop] !== undefined;
                return (
                  <button
                    key={pop}
                    onClick={() => {
                      if (!exists) {
                        setLocalCategoryBudgets(prev => ({ ...prev, [pop]: 0 }));
                      }
                    }}
                    disabled={exists}
                    className={`text-xs px-2.5 py-1 rounded-full border text-left transition-all flex items-center gap-1 ${
                      exists 
                        ? 'bg-slate-50 dark:bg-white/5 text-slate-300 dark:text-slate-600 border-slate-200/50 dark:border-white/5 cursor-not-allowed'
                        : 'bg-white hover:bg-slate-50 dark:bg-[#1e293b] dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-500'
                    }`}
                  >
                    <span>{pop}</span>
                    {!exists && <Plus className="w-3 h-3 text-indigo-500" />}
                    {exists && <Check className="w-3 h-3 text-slate-400 dark:text-slate-600" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Feedback Message Panel */}
        {feedbackMsg.text && (
          <div className={`px-6 py-2.5 text-xs font-medium border-t flex items-center gap-2 ${
            feedbackMsg.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-100/50 dark:border-emerald-950/30' :
            feedbackMsg.type === 'error' ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 border-rose-100/50 dark:border-rose-950/30' :
            'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 border-indigo-100/50 dark:border-indigo-950/30'
          }`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" />
            {feedbackMsg.text}
          </div>
        )}

        {/* Modal Footer actions */}
        <div className="p-6 border-t border-slate-100 dark:border-white/5 flex gap-3 bg-slate-50/50 dark:bg-white/[0.02]">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 py-2.5 text-center text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all disabled:opacity-50"
          >
            Batal
          </button>
          
          <button
            onClick={handleSaveAll}
            disabled={isSaving}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-505 dark:disabled:bg-indigo-950/30 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/15 dark:shadow-none hover:shadow-indigo-600/25 transition-all text-center flex items-center justify-center gap-2"
          >
            {isSaving ? 'Menyimpan...' : 'Simpan Semua Perubahan'}
          </button>
        </div>

      </div>
    </div>
  );
}
