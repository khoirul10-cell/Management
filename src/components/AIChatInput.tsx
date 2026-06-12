import React, { useState, useRef } from 'react';
import { Send, Loader2, Sparkles, Camera, Plus, FileText } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, getDocs, query, where, orderBy, limit, updateDoc, doc, increment } from 'firebase/firestore';

export default function AIChatInput({ existingTransactions = [], onNavigate }: { existingTransactions?: any[], onNavigate?: (tab: string) => void }) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [pendingDuplicates, setPendingDuplicates] = useState<{txs: any[], userText: string} | null>(null);
  const [showConfirmTumpuk, setShowConfirmTumpuk] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const saveTransactionsToDB = async (txs: any[], userText: string) => {
    const user = auth.currentUser;
    if (!user) return;
    for (const t of txs) {
      let txDate: any = serverTimestamp();
      let isLateEntry = false;
      if (t.isPastDate && t.dateString) {
        const parsedDate = new Date(t.dateString);
        if (!isNaN(parsedDate.getTime())) {
          txDate = parsedDate;
          isLateEntry = true;
        }
      }

      let needsWalletAssignment = false;
      if (t.walletSource && t.walletSource.toLowerCase() === 'unknown') {
        needsWalletAssignment = true;
      }

      await addDoc(collection(db, `users/${user.uid}/transactions`), {
        userId: user.uid,
        type: t.type,
        amount: Number(t.amount),
        category: t.isDebt ? (t.debtType === 'payable' ? 'utang' : 'piutang') : t.category,
        description: t.description || userText,
        timestamp: txDate,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(isLateEntry ? { isLateEntry: true } : {}),
        ...(t.walletSource && t.walletSource.toLowerCase() !== 'unknown' ? { walletSource: t.walletSource } : {}),
        ...(needsWalletAssignment ? { needsWalletAssignment: true } : {})
      });

      if (t.walletSource && t.walletSource.toLowerCase() !== 'unknown') {
        const amt = Number(t.amount) || 0;
        const diff = t.type === 'income' ? amt : -amt;
        const userRef = doc(db, 'users', user.uid);
        try {
          await updateDoc(userRef, {
            [`walletBalances.${t.walletSource}`]: increment(diff)
          });
        } catch (err) {
          console.error("Failed to atomic update wallet balance:", err);
        }
      }

      if (t.isDebt && t.debtType && !t.isDebtPayment) {
        await addDoc(collection(db, `users/${user.uid}/debts`), {
          userId: user.uid,
          type: t.debtType,
          personName: t.personName || "Hamba Allah",
          amount: Number(t.amount),
          remainingAmount: Number(t.amount),
          description: t.description || userText,
          status: 'pending',
          installments: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      // Handle debt payment logic
      if (t.isDebtPayment && t.personName) {
         // Determine we're paying or receiving pay for a debt
         const targetDebtType = t.type === 'expense' ? 'payable' : 'receivable'; 
         // Find actively pending debt for this person
         const debtsRef = collection(db, `users/${user.uid}/debts`);
         const q = query(debtsRef, where('type', '==', targetDebtType), where('status', '==', 'pending'));
         const snapshot = await getDocs(q);
         
         let targetDebtId = null;
         let targetDebtData = null;
         const normalizedSearchName = t.personName.toLowerCase().replace(/[^a-z0-9]/g, '');

         // try fuzzy matching
         snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const normalizedDbName = (data.personName || "").toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normalizedSearchName.includes(normalizedDbName) || normalizedDbName.includes(normalizedSearchName) || normalizedDbName === 'hambaallah') {
               if (!targetDebtId) {
                 targetDebtId = docSnap.id;
                 targetDebtData = data;
               }
            }
         });

         if (targetDebtId && targetDebtData) {
            const installmentAmount = Number(t.amount);
            const newRemaining = Math.max(0, targetDebtData.remainingAmount - installmentAmount);
            const newStatus = newRemaining <= 0 ? 'paid' : 'pending';
            
            const newInstallments = [...(targetDebtData.installments || []), {
               id: Date.now().toString(),
               amount: installmentAmount,
               date: new Date()
            }];

            await updateDoc(doc(db, `users/${user.uid}/debts`, targetDebtId), {
               remainingAmount: newRemaining,
               status: newStatus,
               installments: newInstallments,
               updatedAt: serverTimestamp()
            });
         }
      }
    }
  };

  const processTransactions = async (transactions: any[], userText: string) => {
    const user = auth.currentUser;
    if (!user) {
      setLastAction("You must be logged in to record transactions.");
      return;
    }

    const validTransactions = transactions.filter(t => !t.error && t.type && t.amount);
    
    if (validTransactions.length === 0) {
      setLastAction('Tidak dapat menemukan transaksi yang valid.');
      return;
    }

    const uniques: any[] = [];
    const duplicates: any[] = [];

    // Helper to extract date easily
    const extractDate = (t: any) => {
      if (t.isPastDate && t.dateString) {
        return t.dateString;
      }
      const today = new Date();
      return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    };

    for (const t of validTransactions) {
      const matchDb = existingTransactions.some(ext => {
         const tDate = extractDate(t);
         const extDateObj = ext.timestamp;
         const extDate = extDateObj ? `${extDateObj.getFullYear()}-${String(extDateObj.getMonth() + 1).padStart(2,'0')}-${String(extDateObj.getDate()).padStart(2,'0')}` : '';
         return ext.amount === Number(t.amount) && ext.type === t.type && ext.category === t.category && extDate === tDate;
      });

      const matchSelf = uniques.some(ut => {
         return ut.amount === Number(t.amount) && ut.type === t.type && ut.category === t.category && extractDate(ut) === extractDate(t);
      });

      if (matchDb || matchSelf) {
        duplicates.push(t);
      } else {
        uniques.push(t);
      }
    }

    await saveTransactionsToDB(uniques, userText);

    // AI Sync Logging Mechanism
    uniques.forEach((t: any) => {
      if (t.walletSource && t.walletSource.toLowerCase() !== 'unknown') {
        const syncType = t.type === 'income' ? 'inflow (+)' : 'outflow (-)';
        console.log(`[AI Sync Trace] -> Detected ${syncType} of amount ${t.amount}`);
        console.log(`[AI Sync Trace] -> Target Wallet/Bank: ${t.walletSource}`);
        console.log(`[AI Sync Trace] -> The state will automatically synchronize this sub-balance with the main total balance.`);
      }
    });

    if (uniques.length > 0) {
      if (uniques.length === 1) {
        const t = uniques[0];
        let typeIndo = t.type === 'expense' ? 'Pengeluaran' : 'Pemasukan';
        if (t.isDebt) typeIndo = t.debtType === 'payable' ? 'Utang' : 'Piutang';
        const formattedAmount = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(t.amount);
        setLastAction(`✅ ${typeIndo}: ${formattedAmount} (${t.isDebt ? t.personName : t.category})`);
      } else {
        const totalAmount = uniques.reduce((sum, t) => sum + Number(t.amount), 0);
        const formattedAmount = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalAmount);
        setLastAction(`✅ Berhasil menambahkan ${uniques.length} transaksi (${formattedAmount})`);
      }
      
      const hasDebt = uniques.some(t => t.isDebt);
      if (hasDebt && onNavigate) {
         setTimeout(() => onNavigate('debts'), 1500);
      }
    }

    if (duplicates.length > 0) {
      setPendingDuplicates({ txs: duplicates, userText });
    } else {
      setTimeout(() => setLastAction(null), 4000);
    }
  };

  const overrideDuplicates = async () => {
    if (!pendingDuplicates) return;
    setIsLoading(true);
    await saveTransactionsToDB(pendingDuplicates.txs, pendingDuplicates.userText);
    setLastAction(`✅ Tertumpuk ${pendingDuplicates.txs.length} transaksi.`);
    
    const hasDebt = pendingDuplicates.txs.some((t: any) => t.isDebt);
    if (hasDebt && onNavigate) {
       setTimeout(() => onNavigate('debts'), 1500);
    }
    
    setPendingDuplicates(null);
    setShowConfirmTumpuk(false);
    setIsLoading(false);
    setTimeout(() => setLastAction(null), 4000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput('');
    setIsLoading(true);
    setLastAction(null);

    try {
      const response = await fetch('/api/parse-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userText })
      });
      
      const data = await response.json();
      if (!response.ok || data.error) {
         setLastAction(data.error || 'Oops, I could not process that.');
         return;
      }
      
      let transactions = Array.isArray(data) ? data : [data];
      await processTransactions(transactions, userText);
      
    } catch (error: any) {
      console.error(error);
      setLastAction("Sorry, there was an error saving your transaction.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLastAction(`📄 Memproses: ${file.name}...`);
    setIsLoading(true);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        
        if (file.type.startsWith('image/')) {
          const img = new Image();
          img.onload = async () => {
            const canvas = document.createElement('canvas');
            const maxDim = 800; // max width/height
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > maxDim) {
                height *= maxDim / width;
                width = maxDim;
              }
            } else {
              if (height > maxDim) {
                width *= maxDim / height;
                height = maxDim;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
            }
            
            const resizedBase64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
            
            try {
              const response = await fetch('/api/parse-receipt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  imageBase64: resizedBase64,
                  mimeType: 'image/jpeg' 
                })
              });
              
              const data = await response.json();
              if (!response.ok || data.error) {
                 setLastAction(data.error || 'Oops, I could not process that receipt.');
                 setIsLoading(false);
                 return;
              }
              let transactions = Array.isArray(data) ? data : [data];
              await processTransactions(transactions, `Scan struk: ${file.name}`);
            } catch (error: any) {
              console.error(error);
              setLastAction("Sorry, there was an error parsing your receipt.");
            } finally {
              setIsLoading(false);
              if (imageInputRef.current) imageInputRef.current.value = '';
              if (docInputRef.current) docInputRef.current.value = '';
            }
          };
          img.src = reader.result as string;
        } else {
          // Send non-image files directly (e.g. PDF, CSV)
          try {
            const response = await fetch('/api/parse-receipt', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                imageBase64: base64Data,
                mimeType: file.type || 'application/pdf'
              })
            });
            const data = await response.json();
            if (!response.ok || data.error) {
               setLastAction(data.error || 'Oops, I could not process that file.');
               setIsLoading(false);
               return;
            }
            let transactions = Array.isArray(data) ? data : [data];
            await processTransactions(transactions, `Impor dokumen: ${file.name}`);
          } catch (error: any) {
             console.error(error);
             setLastAction("Sorry, there was an error parsing your file.");
          } finally {
             setIsLoading(false);
             if (imageInputRef.current) imageInputRef.current.value = '';
             if (docInputRef.current) docInputRef.current.value = '';
          }
        }
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      console.error(error);
      setLastAction("Sorry, there was an error reading your file.");
      setIsLoading(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
      if (docInputRef.current) docInputRef.current.value = '';
    }
  };

  return (
    <div className="sticky bottom-6 mx-auto w-full max-w-2xl z-50">
      {lastAction && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-800 dark:bg-white/10 text-white dark:text-slate-200 backdrop-blur-md px-4 py-2 rounded-full text-sm shadow-lg whitespace-nowrap transition-all border border-slate-700 dark:border-white/10">
          {lastAction}
        </div>
      )}
      <form 
        onSubmit={handleSubmit} 
        className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200 dark:border-white/10 shadow-2xl p-2 rounded-2xl flex items-center gap-3 transition-all focus-within:ring-2 focus-within:ring-indigo-500/50"
      >
        <div className="pl-3 text-indigo-500">
          <Sparkles className="w-5 h-5" />
        </div>
        <input 
          type="file" 
          accept="image/*" 
          capture="environment"
          ref={imageInputRef} 
          onChange={(e) => { setIsAttachMenuOpen(false); handleFileUpload(e); }} 
          className="hidden" 
        />
        <input 
          type="file" 
          accept="image/*,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
          ref={docInputRef} 
          onChange={(e) => { setIsAttachMenuOpen(false); handleFileUpload(e); }} 
          className="hidden" 
        />
        <div className="relative flex items-center justify-center">
          <button
            type="button"
            onClick={() => setIsAttachMenuOpen(!isAttachMenuOpen)}
            disabled={isLoading}
            className={`p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-50 transition-all duration-300 ${isAttachMenuOpen ? 'rotate-45' : 'rotate-0'}`}
            title="Tambah Lampiran"
          >
            <Plus className="w-5 h-5" />
          </button>
          
          {isAttachMenuOpen && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setIsAttachMenuOpen(false)}
              />
              <div className="absolute bottom-full left-0 mb-3 bg-white dark:bg-[#1e293b] shadow-xl rounded-2xl border border-slate-200 dark:border-white/10 flex flex-col p-2 gap-1 z-50 w-48 animate-in slide-in-from-bottom-2 fade-in">
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10 rounded-xl transition-colors font-medium"
                >
                  <Camera className="w-4 h-4 text-indigo-500" />
                  <span>Scan Struk</span>
                </button>
                <button
                  type="button"
                  onClick={() => docInputRef.current?.click()}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10 rounded-xl transition-colors font-medium"
                >
                  <FileText className="w-4 h-4 text-indigo-500" />
                  <span>Impor Transaksi</span>
                </button>
              </div>
            </>
          )}
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              // Jika di layar desktop (>=768px), enter langsung kirim. Di HP, biarkan enter buat baris baru.
              if (typeof window !== 'undefined' && window.innerWidth >= 768) {
                e.preventDefault();
                handleSubmit(e as any);
              }
            }
          }}
          placeholder="Ketik 'Makan 50k, ojek 15k' (Shift+Enter untuk baris baru)"
          className="flex-1 bg-transparent border-none px-2 py-2 outline-none text-slate-900 dark:text-white placeholder-slate-500 text-sm md:text-base resize-none"
          rows={Math.min(4, input.split('\n').length)}
          disabled={isLoading}
        />
        <button 
          type="submit"
          disabled={!input.trim() || isLoading}
          className="p-3 rounded-xl bg-indigo-600 shadow-md shadow-indigo-600/20 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-900 flex-shrink-0"
        >
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-0.5" />}
        </button>
      </form>

      {/* Duplicate Warning Modal */}
      {pendingDuplicates && !showConfirmTumpuk && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-[#1e293b] rounded-3xl max-w-sm w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Transaksi Sudah Tercatat</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
              Ditemukan {pendingDuplicates.txs.length} transaksi yang sepertinya sudah pernah dicatat sebelumnya (double). Ingin diabaikan atau tetap ditumpuk?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingDuplicates(null)}
                className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
              >
                Catat 1 Aja
              </button>
              <button
                onClick={() => setShowConfirmTumpuk(true)}
                className="flex-1 px-4 py-2.5 bg-rose-600 text-white rounded-xl font-medium hover:bg-rose-700 transition-colors shadow-sm"
              >
                Tumpuk
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Second Confirmation Modal for Tumpuk */}
      {showConfirmTumpuk && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-[#1e293b] rounded-3xl max-w-sm w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
             <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Yakin Ingin Menumpuk?</h3>
             <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
               Apakah Anda yakin transaksi double ini akan tetap dicatat dua kali?
             </p>
             <div className="flex gap-3">
               <button
                 onClick={() => { setShowConfirmTumpuk(false); setPendingDuplicates(null); }}
                 className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
               >
                 Batal
               </button>
               <button
                 onClick={overrideDuplicates}
                 disabled={isLoading}
                 className="flex-1 flex justify-center items-center px-4 py-2.5 bg-amber-600 text-white rounded-xl font-medium hover:bg-amber-700 transition-colors shadow-sm disabled:opacity-50"
               >
                 {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Tetap Catat"}
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
