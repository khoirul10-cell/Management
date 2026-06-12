import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, getDoc, setDoc, updateDoc, serverTimestamp, addDoc, writeBatch, increment } from 'firebase/firestore';
import { signOut, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { db, auth, googleProvider, cachedAccessToken, setCachedAccessToken, handleFirestoreError, OperationType } from '../lib/firebase';
import { Transaction } from '../types';
import AIChatInput from './AIChatInput';
import TransactionList from './TransactionList';
import Charts from './Charts';
import DebtManager from './DebtManager';
import MonthlyOverview from './MonthlyOverview';
import BudgetOverview from './BudgetOverview';
import InvestmentPortfolio from './InvestmentPortfolio';
import GlobalCurrencies from './GlobalCurrencies';
import { LogOut, Wallet, Target, TrendingDown, TrendingUp, ChevronDown, ChevronUp, LayoutDashboard, FileText, Calendar as CalendarIcon, Plus, Download, Sun, Moon, Globe, Menu, Trash2, Settings, Bell } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'monthly' | 'debts' | 'portfolio' | 'currencies'>('overview');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budget, setBudget] = useState<number>(0);
  const [categoryBudgets, setCategoryBudgets] = useState<Record<string, number>>({});
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [isAddingBalance, setIsAddingBalance] = useState(false);
  const [balanceAddAmount, setBalanceAddAmount] = useState('');
  
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>({});
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [activeWalletTab, setActiveWalletTab] = useState<'cash' | 'ewallet' | 'bank'>('cash');
  const [tempWalletBalances, setTempWalletBalances] = useState<Record<string, number>>({
    'Uang Cash': 0, 'GoPay': 0, 'DANA': 0, 'OVO': 0, 'ShopeePay': 0, 'LinkAja': 0, 'BCA': 0, 'Mandiri': 0, 'BNI': 0, 'BRI': 0, 'SeaBank': 0, 'BSI': 0, 'Jago': 0, 'Lainnya': 0
  });

  // Reset Data Feature States
  const [resetCount, setResetCount] = useState(0);
  const [lastResetMonth, setLastResetMonth] = useState('');
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [selectedTxForWallet, setSelectedTxForWallet] = useState<Transaction | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('theme') !== 'light';
    }
    return true;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      root.classList.remove('light');
      localStorage.setItem('theme', 'dark');
      root.style.backgroundColor = '#020617';
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      root.style.backgroundColor = '#f8fafc';
    }
  }, [isDarkMode]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    // Fetch user settings (budget)
    const fetchUser = async (retries = 2) => {
      try {
        const userRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
          setBudget(docSnap.data().monthlyBudget || 0);
          setBudgetInput(String(docSnap.data().monthlyBudget || 0));
          setCategoryBudgets(docSnap.data().categoryBudgets || {});
          
          if (docSnap.data().walletBalances) {
            setWalletBalances(docSnap.data().walletBalances);
            setTempWalletBalances((prev) => ({
              ...prev,
              ...docSnap.data().walletBalances
            }));
          }
          
          const currentMonth = format(new Date(), 'yyyy-MM');
          if (docSnap.data().lastResetMonth === currentMonth) {
            setResetCount(docSnap.data().resetCount || 0);
          } else {
            setResetCount(0);
          }
          setLastResetMonth(docSnap.data().lastResetMonth || '');
        } else {
          // Initialize user doc if not exists
          await setDoc(userRef, {
            monthlyBudget: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      } catch (err: any) {
        if(err?.message?.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        } else if (err?.message?.includes('Missing or insufficient permissions') && retries > 0) {
          setTimeout(() => fetchUser(retries - 1), 1000); // Retry after a delay
        } else {
          try {
             handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
          } catch(e) {}
        }
      }
    };
    fetchUser();

    // Listen to transactions
    const q = query(
      collection(db, `users/${user.uid}/transactions`),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txData: Transaction[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        txData.push({
          id: doc.id,
          userId: data.userId,
          type: data.type,
          amount: data.amount,
          category: data.category,
          description: data.description,
          timestamp: data.timestamp?.toDate() || new Date(),
          isLateEntry: data.isLateEntry || false,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        });
      });
      setTransactions(txData);
    }, (error) => {
      try { handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/transactions`); } catch(e){}
    });

    return () => unsubscribe();
  }, []);

  const handleSaveBudget = async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const val = Number(budgetInput);
      await setDoc(doc(db, 'users', user.uid), {
        monthlyBudget: val,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setBudget(val);
      setIsEditingBudget(false);
    } catch (e) {
      try { handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`); } catch(err){}
    }
  };

  const handleSaveCategoryBudget = async (category: string, val: number) => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const newCategoryBudgets = { ...categoryBudgets, [category]: val };
      if (val <= 0) {
        delete newCategoryBudgets[category];
      }
      await setDoc(doc(db, 'users', user.uid), {
        categoryBudgets: newCategoryBudgets,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setCategoryBudgets(newCategoryBudgets);
    } catch (e) {
      try { handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`); } catch(err){}
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handleAddBalance = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const amount = Number(balanceAddAmount);
    if (amount <= 0) return;
    
    try {
      await addDoc(collection(db, `users/${user.uid}/transactions`), {
        userId: user.uid,
        type: 'income',
        amount: amount,
        category: 'Penambahan Saldo',
        description: 'Penambahan manual saldo bulan ini',
        timestamp: new Date(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setIsAddingBalance(false);
      setBalanceAddAmount('');
    } catch (e) {
      console.error("Failed to add balance", e);
    }
  };

  const handleAssignWalletToTx = async (txId: string, walletName: string) => {
    const user = auth.currentUser;
    if (!user || !selectedTxForWallet) return;
    try {
      const txRef = doc(db, `users/${user.uid}/transactions`, txId);
      await setDoc(txRef, {
        walletSource: walletName,
        needsWalletAssignment: null
      }, { merge: true });
      
      const amt = Number(selectedTxForWallet.amount) || 0;
      const diff = selectedTxForWallet.type === 'income' ? amt : -amt;
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        [`walletBalances.${walletName}`]: increment(diff)
      });

      setSelectedTxForWallet(null);
    } catch (e) {
      console.error("Failed to assign wallet", e);
    }
  };

  const handleResetData = async () => {
    const user = auth.currentUser;
    if (!user) return;
    
    if (resetCount >= 3) {
       alert("Batas maksimal riset data (3 kali) untuk bulan ini telah tercapai.");
       return;
    }

    setIsResetting(true);
    try {
      const currentMonth = format(new Date(), 'yyyy-MM');
      const batch = writeBatch(db);
      
      // Filter transactions that belong to the current month
      const txToDelete = transactions.filter(t => format(t.timestamp, 'yyyy-MM') === currentMonth);
      
      txToDelete.forEach(t => {
         const docRef = doc(db, `users/${user.uid}/transactions`, t.id!);
         batch.delete(docRef);
      });

      await batch.commit();

      const newCount = resetCount + 1;
      await setDoc(doc(db, 'users', user.uid), {
        resetCount: newCount,
        lastResetMonth: currentMonth,
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      setResetCount(newCount);
      setLastResetMonth(currentMonth);
      setShowResetDialog(false);
      alert("Data saldo bulan ini berhasil diriset.");
    } catch (e) {
      console.error("Failed to reset data", e);
      alert("Gagal meriset data. Silakan coba lagi.");
    } finally {
      setIsResetting(false);
    }
  };

  const getWalletDerivedBalance = (key: string) => {
    return Number(walletBalances[key]) || 0;
  };

  const handleSaveWalletBalances = async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const newBases: Record<string, number> = {};
      const allKeys = ['Uang Cash', 'GoPay', 'DANA', 'OVO', 'ShopeePay', 'LinkAja', 'BCA', 'Mandiri', 'BNI', 'BRI', 'SeaBank', 'BSI', 'Jago', 'Lainnya'];
      
      allKeys.forEach(key => {
        newBases[key] = Number(tempWalletBalances[key]) || 0;
      });

      await setDoc(doc(db, 'users', user.uid), {
        walletBalances: newBases,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setShowWalletModal(false);
      setWalletBalances(newBases);
    } catch(e) {
      console.error("Failed to save wallet balances", e);
    }
  };

  const handleOpenWalletModal = () => {
    const currentDerived: Record<string, number> = {};
    const allKeys = ['Uang Cash', 'GoPay', 'DANA', 'OVO', 'ShopeePay', 'LinkAja', 'BCA', 'Mandiri', 'BNI', 'BRI', 'SeaBank', 'BSI', 'Jago', 'Lainnya'];
    allKeys.forEach(key => {
      currentDerived[key] = getWalletDerivedBalance(key);
    });
    setTempWalletBalances(currentDerived);
    setShowWalletModal(true);
  };

  // Calculate stats based on all transactions (for simplicity, we assume they are for the current month. Real app would filter by month)
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((acc, t) => {
    const val = Number(t.amount);
    return acc + (isNaN(val) ? 0 : val);
  }, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((acc, t) => {
    const val = Number(t.amount);
    return acc + (isNaN(val) ? 0 : val);
  }, 0);

  const totalWallets = Object.values(walletBalances).reduce<number>((acc, val) => acc + (Number(val) || 0), 0);
  
  // Calculate pending balances directly from transactions without wallet
  const pendingIncome = transactions.filter(t => t.type === 'income' && (!t.walletSource || t.walletSource.toLowerCase() === 'unknown')).reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  const pendingExpense = transactions.filter(t => t.type === 'expense' && (!t.walletSource || t.walletSource.toLowerCase() === 'unknown')).reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  
  const currentBalance = totalWallets + pendingIncome - pendingExpense;

  const cashTotal = getWalletDerivedBalance('Uang Cash');
  const ewalletKeys = ['GoPay', 'DANA', 'OVO', 'ShopeePay', 'LinkAja'];
  const ewalletTotal = ewalletKeys.reduce((sum, key) => sum + getWalletDerivedBalance(key), 0);
  const bankKeys = ['BCA', 'Mandiri', 'BNI', 'BRI', 'SeaBank', 'BSI', 'Jago', 'Lainnya'];
  const bankTotal = bankKeys.reduce((sum, key) => sum + getWalletDerivedBalance(key), 0);

  const exportToGoogleSheets = async () => {
    alert("Fitur ini dalam tahap pengembangan dan butuh beberapa hari supaya sempurna, mohon maaf atas ketidakyamanannya yah!");
  };

  const pendingWallets = transactions.filter(t => t.needsWalletAssignment);

  const exportToSpreadsheet = () => {
    // Create detailed and formatted data
    const excelData = transactions.map(t => ({
      Tanggal: format(t.timestamp, 'dd MMM yyyy HH:mm'),
      Tipe: t.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
      Kategori: t.category,
      Nominal: Number(t.amount) || 0,
      Deskripsi: t.description || '-'
    }));
    
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    
    // Format the Nominal column as IDR currency
    const range = XLSX.utils.decode_range(worksheet['!ref'] || "A1:E1");
    for (let row = range.s.r + 1; row <= range.e.r; ++row) {
      const cellAddress = { c: 3, r: row }; // Nominal column (0-indexed = 3)
      const cellRef = XLSX.utils.encode_cell(cellAddress);
      if (worksheet[cellRef]) {
        worksheet[cellRef].z = '"Rp"#,##0;[Red]"-"Rp"#,##0';
      }
    }

    // Adjust column widths for better print/visual layout
    worksheet['!cols'] = [
      { wch: 20 }, // Tanggal
      { wch: 15 }, // Tipe
      { wch: 25 }, // Kategori
      { wch: 20 }, // Nominal
      { wch: 40 }  // Deskripsi
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Keuangan");
    XLSX.writeFile(workbook, `CoinAI_Laporan_${format(new Date(), 'dd_MM_yyyy')}.xlsx`);
  };

  const expensesByCategory = transactions
    .filter(t => t.type === 'expense')
    .reduce((acc, t) => {
      const val = Number(t.amount);
      const amt = isNaN(val) ? 0 : val;
      acc[t.category] = (acc[t.category] || 0) + amt;
      return acc;
    }, {} as Record<string, number>);

  const allCategories = Array.from(new Set([...Object.keys(expensesByCategory), ...Object.keys(categoryBudgets)])).sort();

  const formatIDR = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-slate-100 font-sans relative flex flex-col">
      {/* Mesh Gradient Background Decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 rounded-full blur-[120px]"></div>
      </div>

      <header className="bg-white dark:bg-white/5 backdrop-blur-xl border-b border-slate-200 dark:border-white/10 shadow-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center sm:px-6 lg:px-8">
          <div className="flex items-center space-x-3 text-slate-900 dark:text-white">
             <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
               <Wallet className="w-6 h-6 text-slate-900 dark:text-white" />
             </div>
             <div className="flex flex-col">
               <span className="font-bold text-xl tracking-tight leading-tight dark:text-slate-900 dark:text-white text-slate-900">CoinAI Flow</span>
               <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">by akm</span>
             </div>
          </div>
          <div className="relative flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full dark:text-slate-400 dark:hover:text-white transition-colors relative"
                title="Notifikasi"
              >
                <Bell className="w-5 h-5" />
                {pendingWallets.length > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white dark:border-[#0f172a]"></span>
                )}
              </button>
              
              {isNotificationsOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setIsNotificationsOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-[#1e293b] shadow-xl rounded-2xl border border-slate-200 dark:border-white/10 flex flex-col p-3 gap-2 z-50">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white px-2">Notifikasi</h4>
                    {pendingWallets.length > 0 ? (
                      <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                        {pendingWallets.map(tx => (
                          <button
                            key={tx.id}
                            onClick={() => {
                              setSelectedTxForWallet(tx);
                              setIsNotificationsOpen(false);
                            }}
                            className="text-left bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 p-3 rounded-xl transition-colors border border-slate-200 dark:border-white/5"
                          >
                            <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 mb-1">Tentukan dompet/bank</p>
                            <p className="text-sm text-slate-900 dark:text-white truncate">{tx.description || tx.category}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                              {format(tx.timestamp, 'dd MMM yyyy')} • {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(tx.amount))}
                            </p>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">Belum ada notifikasi baru</p>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full dark:text-slate-400 dark:hover:text-white transition-colors"
                title="Pengaturan"
              >
                <Settings className="w-5 h-5" />
              </button>
            
              {isSettingsOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setIsSettingsOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#1e293b] shadow-xl rounded-2xl border border-slate-200 dark:border-white/10 flex flex-col p-2 gap-1 z-50">
                    <button
                      onClick={() => { setIsSettingsOpen(false); setIsDarkMode(!isDarkMode); }}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10 rounded-xl transition-colors font-medium"
                    >
                      <span>Mode Layar</span>
                      {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => { setIsSettingsOpen(false); handleLogout(); }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors font-medium"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Keluar</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>
      
      <main className="max-w-7xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-6 z-10 flex-1 flex flex-col">
        
        {/* Header / Stats Bar */}
        <header className="flex flex-row justify-between items-end gap-4 mb-2 relative z-50">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Halo!</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Teman Keuangan Cerdas Anda</p>
          </div>
          
          <div className="hidden lg:flex gap-4 items-center">
            <button
              onClick={exportToGoogleSheets}
              className="bg-[#10b981]/10 hover:bg-[#10b981]/20 text-[#10b981] px-4 py-2 rounded-full border border-[#10b981]/20 flex items-center gap-2 text-sm font-medium transition-colors"
            >
              <FileText className="w-4 h-4" /> Google Sheets
            </button>
            <button
              onClick={exportToSpreadsheet}
              className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 px-4 py-2 rounded-full border border-indigo-500/20 flex items-center gap-2 text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" /> Export XLSX
            </button>
            <button
              onClick={() => setShowResetDialog(true)}
              className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 px-4 py-2 rounded-full border border-rose-500/20 flex items-center gap-2 text-sm font-medium transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Riset Data Bln Ini
            </button>
            <div className="bg-[#25D366]/10 text-[#25D366] px-4 py-2 rounded-full border border-[#25D366]/30 flex items-center gap-2 text-sm font-medium">
              <span className="w-2 h-2 bg-[#25D366] rounded-full animate-pulse"></span> WhatsApp Bot Active
            </div>
          </div>

          <div className="lg:hidden relative">
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2.5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors shadow-sm"
            >
              <Menu className="w-5 h-5" />
            </button>
            
            {isMobileMenuOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setIsMobileMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-[#1e293b] shadow-xl rounded-2xl border border-slate-200 dark:border-white/10 flex flex-col p-2 gap-1 z-50">
                  <button
                    onClick={() => { setIsMobileMenuOpen(false); exportToGoogleSheets(); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left text-[#10b981] hover:bg-[#10b981]/10 rounded-xl transition-colors font-medium"
                  >
                    <FileText className="w-4 h-4" /> Google Sheets
                  </button>
                  <button
                    onClick={() => { setIsMobileMenuOpen(false); exportToSpreadsheet(); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 rounded-xl transition-colors font-medium"
                  >
                    <Download className="w-4 h-4" /> Export XLSX
                  </button>
                  <button
                    onClick={() => { setIsMobileMenuOpen(false); setShowResetDialog(true); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors font-medium"
                  >
                    <Trash2 className="w-4 h-4" /> Riset Data Bln Ini
                  </button>
                  <div className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left text-[#25D366] bg-[#25D366]/5 rounded-xl border border-[#25D366]/10 mt-1 font-medium">
                    <span className="w-2 h-2 bg-[#25D366] rounded-full animate-pulse"></span> WhatsApp Bot Active
                  </div>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Reset Confirmation Dialog */}
        {showResetDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-slate-900/40 dark:bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm px-4">
            <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 p-6 rounded-3xl max-w-md w-full flex flex-col relative overflow-hidden">
               <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
                 <Target className="w-24 h-24 text-rose-500" />
               </div>
               <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 relative">Peringatan Riset Data</h3>
               <p className="text-slate-600 dark:text-slate-600 dark:text-slate-600 dark:text-slate-300 text-sm mb-4 relative">
                 Anda yakin ingin menghapus <strong>semua data transaksi bulan ini</strong>? Saldo dan riwayat bulan ini akan kembali menjadi 0.
               </p>
               <div className="bg-rose-500/10 text-rose-400 p-3 rounded-xl border border-rose-500/20 text-sm mb-6 flex items-start gap-2 relative">
                 <Target className="w-5 h-5 flex-shrink-0" />
                 Sisa jatah riset bulan ini: <strong>{3 - resetCount} kali</strong>
               </div>
               
               <div className="flex gap-3 justify-end relative">
                 <button 
                   onClick={() => setShowResetDialog(false)} 
                   className="px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-600 dark:text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:text-white transition-colors"
                   disabled={isResetting}
                 >
                   Batal
                 </button>
                 <button 
                   onClick={handleResetData}
                   disabled={isResetting || resetCount >= 3}
                   className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-slate-900 dark:text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                 >
                   {isResetting ? "Memproses..." : "Ya, Hapus Data Bulan Ini"}
                 </button>
               </div>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-white dark:bg-white/5 p-1 rounded-xl w-fit border border-slate-200 dark:border-white/10 mb-6 flex-wrap">
          <button 
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'overview' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5'}`}
          >
            <LayoutDashboard className="w-4 h-4" /> Ringkasan
          </button>
          <button 
             onClick={() => setActiveTab('monthly')}
             className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'monthly' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5'}`}
           >
             <CalendarIcon className="w-4 h-4" /> Bulanan
           </button>
          <button 
            onClick={() => setActiveTab('debts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'debts' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5'}`}
          >
            <FileText className="w-4 h-4" /> Utang & Piutang
          </button>
          <button 
            onClick={() => setActiveTab('portfolio')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'portfolio' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5'}`}
          >
            <TrendingUp className="w-4 h-4" /> Portofolio
          </button>
          <button 
            onClick={() => setActiveTab('currencies')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'currencies' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5'}`}
          >
            <Globe className="w-4 h-4" /> Pasar Global
          </button>
        </div>

        {activeTab === 'overview' ? (
          <>
            {/* Top Highlights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <div className="bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl p-5 flex flex-col justify-between">
              <div className="flex justify-between items-center mb-1">
                 <p className="text-slate-500 dark:text-slate-400 text-sm">Total Saldo</p>
                 <button onClick={handleOpenWalletModal} title="Kelola Saldo E-Wallet & Bank" className="text-slate-900 dark:text-white hover:text-emerald-400 focus:outline-none bg-white dark:bg-white/5 hover:bg-emerald-400/20 p-1.5 rounded-full transition-colors">
                     <Wallet className="w-4 h-4" />
                 </button>
              </div>
              <div>
                 <div className="flex justify-between items-end">
                    <h2 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatIDR(currentBalance)}</h2>
                 </div>
              </div>
              <div className="flex gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-white/5">
                <div className="flex-1">
                   <p className="text-[10px] text-slate-500">Cash</p>
                   <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{formatIDR(cashTotal)}</p>
                </div>
                <div className="flex-1">
                   <p className="text-[10px] text-slate-500">E-Wallet</p>
                   <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{formatIDR(ewalletTotal)}</p>
                </div>
                <div className="flex-1">
                   <p className="text-[10px] text-slate-500">Bank</p>
                   <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{formatIDR(bankTotal)}</p>
                </div>
              </div>
           </div>
           
           <div className="bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl p-5 flex flex-col justify-between">
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">Pengeluaran Bulan Ini</p>
              <div className="flex justify-between items-end">
                 <h2 className="text-2xl font-bold text-rose-600 dark:text-rose-400">{formatIDR(totalExpense)}</h2>
              </div>
           </div>

           <div className="bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl p-5 flex flex-col justify-between">
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">Target Bulanan</p>
              <div>
                 {isEditingBudget ? (
                   <div className="flex items-center gap-2 mt-1">
                     <input 
                       type="number" 
                       value={budgetInput}
                       onChange={(e) => setBudgetInput(e.target.value)}
                       className="w-32 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm outline-none text-slate-900 dark:text-white focus:border-indigo-500"
                     />
                     <button onClick={handleSaveBudget} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-slate-900 dark:text-white px-3 py-2 rounded-lg font-medium transition-colors">Simpan</button>
                   </div>
                 ) : (
                   <div className="flex justify-between items-end">
                     <h2 className="text-2xl font-bold text-amber-500 dark:text-amber-400 cursor-pointer" onClick={() => setIsEditingBudget(true)}>
                       {formatIDR(budget)} <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-400/10 px-2 py-0.5 rounded-full ml-2 align-middle">Edit</span>
                     </h2>
                   </div>
                 )}
              </div>
           </div>
        </div>

        {/* Budget Progress if budget > 0 */}
        <BudgetOverview 
          budget={budget}
          totalExpense={totalExpense}
          categoryBudgets={categoryBudgets}
          expensesByCategory={expensesByCategory}
          onSaveCategoryBudget={handleSaveCategoryBudget}
        />

        <div className="flex flex-col gap-6 flex-1 mb-20">
           {/* Chart Section */}
           <div className="space-y-6 flex flex-col">
              {/* Charts */}
              <Charts transactions={transactions} walletBalances={walletBalances} />
              
              {/* Transactions List */}
              <div className="bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl flex flex-col h-full">
                <div className="p-5 border-b border-slate-200 dark:border-white/10">
                   <h2 className="font-bold text-slate-900 dark:text-white">Riwayat Terakhir</h2>
                </div>
                <div className="p-5">
                   <TransactionList transactions={transactions} userId={auth.currentUser?.uid || ''} />
                </div>
              </div>
           </div>
        </div>
          </>
        ) : activeTab === 'portfolio' ? (
          <div className="flex-1 mb-20">
            <InvestmentPortfolio />
          </div>
        ) : activeTab === 'monthly' ? (
          <div className="flex-1 mb-20">
            <MonthlyOverview transactions={transactions} />
          </div>
        ) : activeTab === 'currencies' ? (
          <div className="flex-1 mb-20">
            <GlobalCurrencies />
          </div>
        ) : (
          <div className="flex-1">
            <DebtManager />
          </div>
        )}
        
        {/* Wallet Modal */}
        {showWalletModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-[#1e293b] rounded-3xl max-w-md w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">Kelola Saldo Awal</h3>
                  <p className="text-sm text-slate-500">Uang Cash, E-Wallet & Bank</p>
                </div>
                <button 
                  onClick={() => setShowWalletModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>
              
              <div className="flex gap-2 mb-6 bg-slate-100 dark:bg-slate-800/50 p-1 rounded-xl">
                <button
                  onClick={() => setActiveWalletTab('cash')}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${activeWalletTab === 'cash' ? 'bg-white dark:bg-[#1e293b] text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  Cash
                </button>
                <button
                  onClick={() => setActiveWalletTab('ewallet')}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${activeWalletTab === 'ewallet' ? 'bg-white dark:bg-[#1e293b] text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  E-Wallet
                </button>
                <button
                  onClick={() => setActiveWalletTab('bank')}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${activeWalletTab === 'bank' ? 'bg-white dark:bg-[#1e293b] text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  Bank
                </button>
              </div>

              <div className="space-y-6 mb-6">
                {activeWalletTab === 'cash' && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Uang Cash</h4>
                    <div className="space-y-3">
                      {['Uang Cash'].map((walletKey) => (
                        <div key={walletKey} className="flex flex-col gap-1">
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">Rp</span>
                            <input 
                              type="number"
                              value={tempWalletBalances[walletKey] || ''}
                              onChange={(e) => setTempWalletBalances(prev => ({ ...prev, [walletKey]: Number(e.target.value) }))}
                              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl py-2 pl-9 pr-3 text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition-colors"
                              placeholder="0"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeWalletTab === 'ewallet' && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">E-Wallet</h4>
                    <div className="space-y-3">
                      {['GoPay', 'DANA', 'OVO', 'ShopeePay', 'LinkAja'].map((walletKey) => (
                        <div key={walletKey} className="flex flex-col gap-1">
                           <label className="text-xs font-medium text-slate-600 dark:text-slate-400">{walletKey}</label>
                           <div className="relative">
                             <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">Rp</span>
                             <input 
                               type="number"
                               value={tempWalletBalances[walletKey] || ''}
                               onChange={(e) => setTempWalletBalances(prev => ({ ...prev, [walletKey]: Number(e.target.value) }))}
                               className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl py-2 pl-9 pr-3 text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition-colors"
                               placeholder="0"
                             />
                           </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeWalletTab === 'bank' && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Bank</h4>
                    <div className="space-y-3">
                      {['BCA', 'Mandiri', 'BNI', 'BRI', 'SeaBank', 'BSI', 'Jago', 'Lainnya'].map((walletKey) => (
                        <div key={walletKey} className="flex flex-col gap-1">
                           <label className="text-xs font-medium text-slate-600 dark:text-slate-400">{walletKey}</label>
                           <div className="relative">
                             <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">Rp</span>
                             <input 
                               type="number"
                               value={tempWalletBalances[walletKey] || ''}
                               onChange={(e) => setTempWalletBalances(prev => ({ ...prev, [walletKey]: Number(e.target.value) }))}
                               className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl py-2 pl-9 pr-3 text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition-colors"
                               placeholder="0"
                             />
                           </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowWalletModal(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={handleSaveWalletBalances}
                  className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors"
                >
                  Simpan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Wallet Assignment Modal for Unassigned Transactions */}
        {selectedTxForWallet && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-[#1e293b] rounded-3xl max-w-sm w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">Pilih Dompet/Bank</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">Untuk transaksi: {selectedTxForWallet.description || selectedTxForWallet.category}</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Cash</h4>
                  <button onClick={() => handleAssignWalletToTx(selectedTxForWallet.id, 'Uang Cash')} className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 mb-1">Uang Cash</button>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">E-Wallet</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {['GoPay', 'DANA', 'OVO', 'ShopeePay', 'LinkAja'].map(wallet => (
                      <button key={wallet} onClick={() => handleAssignWalletToTx(selectedTxForWallet.id, wallet)} className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 text-center">{wallet}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Bank</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {['BCA', 'Mandiri', 'BNI', 'BRI', 'SeaBank', 'BSI', 'Jago', 'Lainnya'].map(wallet => (
                      <button key={wallet} onClick={() => handleAssignWalletToTx(selectedTxForWallet.id, wallet)} className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 text-center">{wallet}</button>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => setSelectedTxForWallet(null)}
                  className="w-full px-4 py-3 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                >
                  Batal
                </button>
              </div>
            </div>
          </div>
        )}

        <AIChatInput existingTransactions={transactions} onNavigate={(tab) => setActiveTab(tab as any)} />
        
        {/* Footer */}
        <footer className="mt-8 text-center text-xs font-medium text-slate-500 dark:text-slate-400 py-4 border-t border-slate-200 dark:border-white/10 w-full shrink-0">
          copyright by akm 2026
        </footer>
      </main>
    </div>
  );
}
