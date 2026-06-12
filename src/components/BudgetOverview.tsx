import { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface BudgetOverviewProps {
  budget: number;
  totalExpense: number;
  categoryBudgets: Record<string, number>;
  expensesByCategory: Record<string, number>;
  onSaveCategoryBudget: (category: string, amount: number) => void;
}

export default function BudgetOverview({
  budget,
  totalExpense,
  categoryBudgets,
  expensesByCategory,
  onSaveCategoryBudget
}: BudgetOverviewProps) {
  const [showCategoryBudgets, setShowCategoryBudgets] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [categoryBudgetInput, setCategoryBudgetInput] = useState('');

  const formatIDR = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);

  const allCategories = Array.from(new Set([...Object.keys(expensesByCategory), ...Object.keys(categoryBudgets)])).sort();

  if (budget <= 0) return null;

  return (
    <div className="bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl p-5 mb-6">
       <div className="flex justify-between items-end mb-3">
         <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-200">Sisa Budget Bulan Ini</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Pengeluaran: {formatIDR(totalExpense)} dari {formatIDR(budget)}</p>
         </div>
         <div className="text-right">
            <p className={`text-xl font-bold ${totalExpense > budget ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {formatIDR(budget - totalExpense)}
            </p>
         </div>
       </div>
       <div className="w-full bg-slate-100 dark:bg-white/10 rounded-full h-2 mb-4">
          <div 
            className={`h-full rounded-full ${totalExpense > budget ? 'bg-rose-500' : 'bg-emerald-500'}`} 
            style={{ width: `${Math.min((totalExpense / Math.max(budget, 1)) * 100, 100)}%` }}
          ></div>
       </div>
       
       <div className="border-t border-slate-200 dark:border-white/10 pt-4 mt-2">
          <button 
            onClick={() => setShowCategoryBudgets(!showCategoryBudgets)}
            className="flex items-center text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
             {showCategoryBudgets ? <ChevronUp className="w-4 h-4 mr-1"/> : <ChevronDown className="w-4 h-4 mr-1"/>}
             Target Kategori ({Object.keys(categoryBudgets).length})
          </button>
          
          {showCategoryBudgets && (
            <div className="mt-4 space-y-4">
              {allCategories.map(category => {
                const categoryBudget = categoryBudgets[category] || 0;
                const expense = expensesByCategory[category] || 0;
                const isEditing = editingCategory === category;
                
                return (
                  <div key={category} className="bg-white dark:bg-white/5 rounded-xl p-3 border border-slate-100 dark:border-white/5 shadow-sm dark:shadow-none">
                     <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 capitalize">{category}</span>
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input 
                              type="number" 
                              value={categoryBudgetInput}
                              onChange={(e) => setCategoryBudgetInput(e.target.value)}
                              className="w-24 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded px-2 py-1 text-xs outline-none text-slate-900 dark:text-white focus:border-indigo-500"
                              placeholder="Budget..."
                            />
                            <button 
                              onClick={() => {
                                onSaveCategoryBudget(category, Number(categoryBudgetInput));
                                setEditingCategory(null);
                              }} 
                              className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded font-medium transition-colors"
                            >
                              Save
                            </button>
                            <button 
                              onClick={() => setEditingCategory(null)} 
                              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-1 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {categoryBudget > 0 ? (
                              <span className="text-xs text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5 px-2 py-1 flex rounded">
                                {formatIDR(expense)} / <span className="text-slate-900 dark:text-slate-200 ml-1 font-medium">{formatIDR(categoryBudget)}</span>
                              </span>
                            ) : (
                              <span className="text-xs text-slate-500 dark:text-slate-400">{formatIDR(expense)} (No limit)</span>
                            )}
                            <button 
                              onClick={() => {
                                setCategoryBudgetInput(String(categoryBudget));
                                setEditingCategory(category);
                              }}
                              className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-400/10 px-2 py-0.5 rounded ml-2 font-medium"
                            >
                              {categoryBudget > 0 ? 'Edit' : 'Set limit'}
                            </button>
                          </div>
                        )}
                     </div>
                     
                     {categoryBudget > 0 && (
                       <div className="w-full bg-slate-100 dark:bg-white/5 rounded-full h-1.5 mt-2">
                         <div 
                           className={`h-full rounded-full ${expense > categoryBudget ? 'bg-rose-500' : 'bg-indigo-500'}`} 
                           style={{ width: `${Math.min((expense / categoryBudget) * 100, 100)}%` }}
                         ></div>
                       </div>
                     )}
                  </div>
                );
              })}
              {allCategories.length === 0 && (
                <p className="text-xs text-slate-500 italic">Belum ada kategori pengeluaran.</p>
              )}
            </div>
          )}
       </div>
    </div>
  );
}
