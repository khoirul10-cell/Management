import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, getDoc, setDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Transaction } from '../types';
import ChatInterface from './ChatInterface';
import TransactionList from './TransactionList';
import Charts from './Charts';
import { LogOut, Wallet, Target, TrendingDown, TrendingUp } from 'lucide-react';

export default function Dashboard() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budget, setBudget] = useState<number>(0);
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    // Fetch user settings (budget)
    const fetchUser = async () => {
      try {
        const userRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
          setBudget(docSnap.data().monthlyBudget || 0);
          setBudgetInput(String(docSnap.data().monthlyBudget || 0));
        } else {
          // Initialize user doc if not exists
          await setDoc(userRef, {
            monthlyBudget: 0,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      } catch (err: any) {
        if(err?.message?.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
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
        updatedAt: new Date()
      }, { merge: true });
      setBudget(val);
      setIsEditingBudget(false);
    } catch (e) {
      try { handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`); } catch(err){}
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  // Calculate stats based on all transactions (for simplicity, we assume they are for the current month. Real app would filter by month)
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
  const currentBalance = totalIncome - totalExpense;

  const formatIDR = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(val);

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 font-sans relative overflow-x-hidden flex flex-col">
      {/* Mesh Gradient Background Decoration */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none"></div>

      <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 shadow-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center sm:px-6 lg:px-8">
          <div className="flex items-center space-x-3 text-white">
             <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
               <Wallet className="w-6 h-6 text-white" />
             </div>
             <span className="font-bold text-xl tracking-tight">CoinAI Flow</span>
          </div>
          <button 
            onClick={handleLogout}
            className="text-slate-400 hover:text-white flex items-center space-x-2 font-medium transition-colors"
          >
            <span className="hidden sm:inline text-sm">Logout</span>
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>
      
      <main className="max-w-7xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-6 z-10 flex-1 flex flex-col">
        
        {/* Header / Stats Bar */}
        <header className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-2">
          <div>
            <h1 className="text-3xl font-bold text-white">Halo!</h1>
            <p className="text-slate-400 text-sm">Rekap keuangan Anda hari ini</p>
          </div>
          <div className="flex gap-4">
            <div className="bg-[#25D366]/10 text-[#25D366] px-4 py-2 rounded-full border border-[#25D366]/30 flex items-center gap-2 text-sm font-medium">
              <span className="w-2 h-2 bg-[#25D366] rounded-full animate-pulse"></span> WhatsApp Bot Active
            </div>
          </div>
        </header>

        {/* Top Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 flex flex-col justify-between">
              <p className="text-slate-400 text-sm mb-1">Total Saldo (Bulan Ini)</p>
              <div className="flex justify-between items-end">
                 <h2 className="text-2xl font-bold text-emerald-400">{formatIDR(currentBalance)}</h2>
              </div>
           </div>
           
           <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 flex flex-col justify-between">
              <p className="text-slate-400 text-sm mb-1">Pengeluaran Bulan Ini</p>
              <div className="flex justify-between items-end">
                 <h2 className="text-2xl font-bold text-rose-400">{formatIDR(totalExpense)}</h2>
              </div>
           </div>

           <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 flex flex-col justify-between">
              <p className="text-slate-400 text-sm mb-1">Target Bulanan</p>
              <div>
                 {isEditingBudget ? (
                   <div className="flex items-center gap-2 mt-1">
                     <input 
                       type="number" 
                       value={budgetInput}
                       onChange={(e) => setBudgetInput(e.target.value)}
                       className="w-32 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm outline-none text-white focus:border-indigo-500"
                     />
                     <button onClick={handleSaveBudget} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg font-medium transition-colors">Simpan</button>
                   </div>
                 ) : (
                   <div className="flex justify-between items-end">
                     <h2 className="text-2xl font-bold text-amber-400 cursor-pointer" onClick={() => setIsEditingBudget(true)}>
                       {formatIDR(budget)} <span className="text-[10px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full ml-2 align-middle">Edit</span>
                     </h2>
                   </div>
                 )}
              </div>
           </div>
        </div>

        {/* Budget Progress if budget > 0 */}
        {budget > 0 && (
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5">
             <div className="flex justify-between items-end mb-3">
               <div>
                  <h3 className="font-semibold text-slate-200">Sisa Budget Bulan Ini</h3>
                  <p className="text-xs text-slate-400 mt-1">Pengeluaran: {formatIDR(totalExpense)} dari {formatIDR(budget)}</p>
               </div>
               <div className="text-right">
                  <p className={`text-xl font-bold ${totalExpense > budget ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {formatIDR(budget - totalExpense)}
                  </p>
               </div>
             </div>
             <div className="w-full bg-white/10 rounded-full h-2">
                <div 
                  className={`h-full rounded-full ${totalExpense > budget ? 'bg-rose-500' : 'bg-emerald-500'}`} 
                  style={{ width: `${Math.min((totalExpense / budget) * 100, 100)}%` }}
                ></div>
             </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
           {/* Chart Section */}
           <div className="lg:col-span-8 space-y-6 flex flex-col">
              {/* Charts */}
              <Charts transactions={transactions} />
              
              {/* Transactions List */}
              <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl flex flex-col min-h-[400px]">
                <div className="p-5 border-b border-white/10">
                   <h2 className="font-bold text-white">Riwayat Terakhir</h2>
                </div>
                <div className="p-5 flex-1 overflow-y-auto">
                   <TransactionList transactions={transactions} />
                </div>
              </div>
           </div>

           {/* AI Chat Insights Section */}
           <div className="lg:col-span-4 h-[600px] lg:h-auto flex flex-col">
              <ChatInterface />
           </div>
        </div>
      </main>
    </div>
  );
}
