import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, increment } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Debt, DebtInstallment } from '../types';
import { format, differenceInDays, differenceInWeeks, differenceInMonths, differenceInYears, isToday, isTomorrow, isPast, startOfDay } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { Plus, Trash2, CheckCircle, Clock, AlertTriangle, AlertCircle, TrendingUp, HandCoins } from 'lucide-react';

export default function DebtManager() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [personName, setPersonName] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'payable' | 'receivable'>('payable');
  const [description, setDescription] = useState('');
  
  // New Add Debt Fields
  const [dueDate, setDueDate] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [interestPeriod, setInterestPeriod] = useState<'day' | 'week' | 'month' | 'year' | ''>('');

  // Installment state
  const [payingDebtId, setPayingDebtId] = useState<string | null>(null);
  const [installmentAmount, setInstallmentAmount] = useState('');
  const [payingWallet, setPayingWallet] = useState<string>('Uang Cash');
  const [settlingDebtId, setSettlingDebtId] = useState<string | null>(null);
  const [settlingWallet, setSettlingWallet] = useState<string>('Uang Cash');
  const [userWallets, setUserWallets] = useState<Record<string, number>>({});

  const AVAILABLE_WALLETS = [
    'Uang Cash', 'GoPay', 'DANA', 'OVO', 'ShopeePay', 'LinkAja', 
    'BCA', 'Mandiri', 'BNI', 'BRI', 'SeaBank', 'BSI', 'Jago', 'Lainnya'
  ];

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().walletBalances) {
        setUserWallets(docSnap.data().walletBalances);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(
      collection(db, `users/${user.uid}/debts`),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Debt[] = [];
      snapshot.forEach((d) => {
        const docData = d.data();
        data.push({
          id: d.id,
          ...docData,
          dueDate: docData.dueDate ? docData.dueDate.toDate() : undefined,
          createdAt: docData.createdAt?.toDate() || new Date(),
          updatedAt: docData.updatedAt?.toDate() || new Date(),
          installments: (docData.installments || []).map((inst: any) => ({
            ...inst,
            date: inst.date?.toDate() || new Date()
          }))
        } as unknown as Debt);
      });
      setDebts(data);
    }, (error) => {
      try { handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/debts`); } catch(e){}
    });

    return () => unsubscribe();
  }, []);

  const calculateDebtStats = (debt: Debt) => {
    let interest = 0;
    if (debt.interestRate && debt.interestPeriod && debt.status !== 'paid') {
       const now = new Date();
       const startDate = debt.createdAt;
       let timePassed = 0;
       if (debt.interestPeriod === 'day') timePassed = differenceInDays(now, startDate);
       else if (debt.interestPeriod === 'week') timePassed = differenceInWeeks(now, startDate);
       else if (debt.interestPeriod === 'month') timePassed = differenceInMonths(now, startDate);
       else if (debt.interestPeriod === 'year') timePassed = differenceInYears(now, startDate);
       
       interest = debt.amount * (debt.interestRate / 100) * timePassed;
    }
    
    // Fallback static remaining calculation if status is paid
    if (debt.status === 'paid') {
      return {
        interest: 0,
        totalPaid: debt.amount,
        currentTotal: debt.amount,
        currentRemaining: 0
      };
    }
    
    const totalPaid = (debt.installments || []).reduce((acc, inst) => acc + inst.amount, 0);
    const currentTotal = debt.amount + interest;
    let currentRemaining = currentTotal - totalPaid;
    if (currentRemaining < 0) currentRemaining = 0;
    
    return {
      interest,
      totalPaid,
      currentTotal,
      currentRemaining
    };
  };

  const handleAddDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user || !personName || !amount) return;

    try {
      const data: any = {
        userId: user.uid,
        type,
        personName,
        amount: Number(amount),
        remainingAmount: Number(amount),
        description,
        status: 'pending',
        installments: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (dueDate) {
        data.dueDate = new Date(dueDate);
      }
      
      if (interestRate && interestPeriod) {
        data.interestRate = Number(interestRate);
        data.interestPeriod = interestPeriod;
      }

      await addDoc(collection(db, `users/${user.uid}/debts`), data);
      setIsAdding(false);
      
      // Reset forms
      setPersonName('');
      setAmount('');
      setDescription('');
      setDueDate('');
      setInterestRate('');
      setInterestPeriod('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/debts`);
    }
  };

  const handlePayInstallment = async (e: React.FormEvent, debt: Debt) => {
     e.preventDefault();
     const user = auth.currentUser;
     if (!user || !installmentAmount || !payingWallet) return;

     try {
       const payAmount = Number(installmentAmount);
       const stats = calculateDebtStats(debt);
       
       const newInstallment: DebtInstallment = {
         id: Math.random().toString(36).substring(2, 9),
         amount: payAmount,
         date: new Date()
       };

       const updatedInstallments = [...(debt.installments || []), newInstallment];
       const totalPaid = stats.totalPaid + payAmount;
       let newStatus = debt.status;
       let newRemaining = stats.currentTotal - totalPaid;
       
       if (newRemaining <= 0) {
         newStatus = 'paid';
         newRemaining = 0;
       } else {
         newStatus = 'installment';
       }

       await updateDoc(doc(db, `users/${user.uid}/debts`, debt.id), {
         status: newStatus,
         remainingAmount: newRemaining, // We retain this for simple backwards compatibility
         installments: updatedInstallments.map(inst => ({
            ...inst,
            date: inst.date
         })),
         updatedAt: serverTimestamp()
       });

       // Deduct from wallet if type is 'payable' (utang), or add to wallet if 'receivable' (piutang)
       const walletChange = debt.type === 'payable' ? -payAmount : payAmount;
       const userRef = doc(db, 'users', user.uid);
       await updateDoc(userRef, {
         [`walletBalances.${payingWallet}`]: increment(walletChange)
       });
       
       setPayingDebtId(null);
       setInstallmentAmount('');
     } catch(err) {
       handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/debts/${debt.id}`);
     }
  };

  const handleFullSettlement = async (e: React.FormEvent, debt: Debt) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user || !settlingWallet) return;

    try {
      const stats = calculateDebtStats(debt);
      const payAmount = stats.currentRemaining;

      // Add a final installment for historical tracking
      const newInstallment: DebtInstallment = {
        id: Math.random().toString(36).substring(2, 9),
        amount: payAmount,
        date: new Date()
      };

      const updatedInstallments = [...(debt.installments || []), newInstallment];

      await updateDoc(doc(db, `users/${user.uid}/debts`, debt.id), {
        status: 'paid',
        remainingAmount: 0,
        installments: updatedInstallments.map(inst => ({
           ...inst,
           date: inst.date
        })),
        updatedAt: serverTimestamp()
      });

      // Deduct from wallet if type is 'payable' (utang), or add to wallet if 'receivable' (piutang)
      const walletChange = debt.type === 'payable' ? -payAmount : payAmount;
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        [`walletBalances.${settlingWallet}`]: increment(walletChange)
      });

      setSettlingDebtId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/debts/${debt.id}`);
    }
  };
  
  const deleteDebt = async (debtId: string) => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/debts`, debtId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/debts/${debtId}`);
    }
  };

  const formatIDR = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);

  const totalPayable = debts.filter(d => d.type === 'payable' && d.status !== 'paid').reduce((acc, curr) => acc + calculateDebtStats(curr).currentRemaining, 0);
  const totalReceivable = debts.filter(d => d.type === 'receivable' && d.status !== 'paid').reduce((acc, curr) => acc + calculateDebtStats(curr).currentRemaining, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Total Utang Saya</p>
          <p className="text-xl font-bold text-rose-400">{formatIDR(totalPayable)}</p>
        </div>
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Total Piutang (Orang ke Saya)</p>
          <p className="text-xl font-bold text-emerald-400">{formatIDR(totalReceivable)}</p>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-slate-900 dark:text-slate-200">Daftar Catatan</h3>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Tambah
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleAddDebt} className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 p-4 rounded-xl space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Jenis</label>
              <select 
                value={type} 
                onChange={(e) => setType(e.target.value as any)}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="payable">Utang (Saya Pinjam)</option>
                <option value="receivable">Piutang (Orang Pinjam)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Nominal (Rp)</label>
              <input 
                type="number" 
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                placeholder="100000"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Nama Pihak Terkait</label>
              <input 
                type="text" 
                required
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                placeholder="Nama Orang / Instansi"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Keterangan (Opsional)</label>
              <input 
                type="text" 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                placeholder="Misal: Pinjaman dana darurat"
              />
            </div>
            
            <div className="col-span-2 grid grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-white/10">
               <div>
                 <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Jatuh Tempo (Opsional)</label>
                 <input 
                   type="date"
                   value={dueDate}
                   onChange={(e) => setDueDate(e.target.value)}
                   className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                 />
               </div>
               <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Bunga % (Opsional)</label>
                  <div className="flex gap-2">
                    <input 
                      type="number"
                      step="0.1"
                      value={interestRate}
                      onChange={(e) => setInterestRate(e.target.value)}
                      placeholder="0"
                      className="w-1/2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    />
                    <select
                      value={interestPeriod}
                      onChange={(e) => setInterestPeriod(e.target.value as any)}
                      className="w-1/2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">Pilih...</option>
                      <option value="day">/ Hari</option>
                      <option value="week">/ Minggu</option>
                      <option value="month">/ Bulan</option>
                      <option value="year">/ Tahun</option>
                    </select>
                  </div>
               </div>
            </div>
            
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <button type="button" onClick={() => setIsAdding(false)} className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white">Batal</button>
            <button type="submit" className="px-3 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium">Simpan</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {debts.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm italic">
            Belum ada rekam jejak utang / piutang.
          </div>
        ) : (
          debts.map(debt => {
            const stats = calculateDebtStats(debt);
            let notifNode = null;
            
            if (debt.dueDate && debt.status !== 'paid') {
               if (isToday(debt.dueDate) || isPast(debt.dueDate)) {
                  notifNode = (
                    <span className="flex items-center gap-1 text-[10px] bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 px-1.5 py-0.5 rounded-md font-medium mt-1">
                       <AlertCircle className="w-3 h-3" /> Hari ini jatuh tempo!
                    </span>
                  );
               } else if (isTomorrow(debt.dueDate)) {
                  notifNode = (
                    <span className="flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded-md font-medium mt-1">
                       <AlertTriangle className="w-3 h-3" /> Besok jatuh tempo!
                    </span>
                  );
               } else {
                  notifNode = (
                    <span className="flex items-center gap-1 text-[10px] text-slate-500 mt-1">
                       <Clock className="w-3 h-3" /> Jatuh tempo: {format(debt.dueDate, "dd MMM yyyy", { locale: localeId })}
                    </span>
                  );
               }
            }

            return (
            <div key={debt.id} className={`p-4 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl relative ${debt.status === 'paid' ? 'opacity-60' : ''}`}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${debt.type === 'payable' ? 'bg-rose-400/20 text-rose-400' : 'bg-emerald-400/20 text-emerald-400'}`}>
                      {debt.type === 'payable' ? 'Utang' : 'Piutang'}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${debt.status === 'paid' ? 'bg-indigo-400/20 text-indigo-400' : 'bg-amber-400/20 text-amber-400'}`}>
                      {debt.status === 'paid' ? 'Lunas' : (stats.totalPaid > 0 ? 'Nyicil' : 'Belum Lunas')}
                    </span>
                    {debt.interestRate && (
                      <span className="text-xs px-2 py-0.5 rounded font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 flex items-center gap-1">
                         <TrendingUp className="w-3 h-3" /> {debt.interestRate}%/{debt.interestPeriod}
                      </span>
                    )}
                  </div>
                  <h4 className="font-semibold text-slate-900 dark:text-slate-200 mt-2">{debt.personName}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{debt.description}</p>
                  {notifNode}
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-500">Sisa</p>
                  <p className={`font-bold text-lg ${debt.type === 'payable' ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {formatIDR(stats.currentRemaining)}
                  </p>
                </div>
              </div>

              {debt.status !== 'paid' && stats.interest > 0 && (
                <div className="text-xs text-slate-500 text-right mt-1 mb-2">
                   Bunga: <span className="text-amber-500 font-medium">+{formatIDR(stats.interest)}</span>
                </div>
              )}

              {debt.installments && debt.installments.length > 0 && (
                <div className="mt-3 bg-slate-50 dark:bg-black/20 p-2 rounded-lg">
                   <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Riwayat Cicilan ({debt.installments.length}x)</p>
                   <div className="space-y-1">
                     {debt.installments.map((inst, idx) => (
                       <div key={inst.id} className="flex justify-between text-[11px] text-slate-500">
                         <span>{idx + 1}. {format(inst.date, "dd MMM yyyy", { locale: localeId })}</span>
                         <span>{formatIDR(inst.amount)}</span>
                       </div>
                     ))}
                   </div>
                </div>
              )}

              {debt.status !== 'paid' && (
                <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-white/5">
                  <button 
                    onClick={() => {
                      setPayingDebtId(payingDebtId === debt.id ? null : debt.id);
                      setSettlingDebtId(null);
                    }}
                    className="flex items-center gap-1 text-xs bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 px-2 py-1.5 rounded transition-colors font-medium border border-indigo-500/20"
                  >
                    <HandCoins className="w-3 h-3" /> Cicil
                  </button>
                  <button 
                    onClick={() => {
                      setSettlingDebtId(settlingDebtId === debt.id ? null : debt.id);
                      setPayingDebtId(null);
                    }}
                    className="flex items-center gap-1 text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-2 py-1.5 rounded transition-colors border border-emerald-500/20"
                  >
                    <CheckCircle className="w-3 h-3" /> Lunas Full
                  </button>
                  <button 
                    onClick={() => deleteDebt(debt.id)}
                    className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-rose-400 px-2 py-1.5 rounded transition-colors"
                  >
                    <Trash2 className="w-3 h-3" /> Hapus
                  </button>
                </div>
              )}

              {payingDebtId === debt.id && (
                <form onSubmit={(e) => handlePayInstallment(e, debt)} className="mt-4 p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl space-y-3 border border-slate-200/50 dark:border-white/5 animate-in slide-in-from-top-2 duration-250">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Cicil Transaksi</p>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-1 font-sans">Nominal Cicilan (Rp)</label>
                      <input 
                        type="number" 
                        value={installmentAmount}
                        onChange={(e) => setInstallmentAmount(e.target.value)}
                        placeholder="0"
                        className="w-full text-xs px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-705 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-indigo-500 font-medium"
                        required
                        max={stats.currentRemaining}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-1 font-sans">Pilih Dompet / Bank</label>
                      <select
                        value={payingWallet}
                        onChange={(e) => setPayingWallet(e.target.value)}
                        className="w-full text-xs px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-705 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-indigo-500 font-medium"
                      >
                        {AVAILABLE_WALLETS.map(w => {
                          const balance = userWallets[w] || 0;
                          return (
                            <option key={w} value={w}>
                              {w} (Rp {balance.toLocaleString('id-ID')})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setPayingDebtId(null)} className="text-xs px-3 py-1.5 text-slate-500 dark:text-slate-400 font-medium hover:text-slate-700 dark:hover:text-white font-sans">Batal</button>
                    <button type="submit" className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg font-medium transition-colors font-sans">Bayar Cicilan</button>
                  </div>
                </form>
              )}

              {settlingDebtId === debt.id && (
                <form onSubmit={(e) => handleFullSettlement(e, debt)} className="mt-4 p-3 bg-emerald-500/5 dark:bg-emerald-500/10 rounded-xl space-y-3 border border-emerald-500/10 animate-in slide-in-from-top-2 duration-250 font-sans">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Konfirmasi Pelunasan</p>
                  
                  <div className="grid grid-cols-2 gap-2 font-sans">
                    <div>
                      <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-1">Total Pembayaran</label>
                      <div className="w-full text-xs px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-705 bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-bold">
                        {formatIDR(stats.currentRemaining)}
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-1">Pilih Dompet / Bank</label>
                      <select
                        value={settlingWallet}
                        onChange={(e) => setSettlingWallet(e.target.value)}
                        className="w-full text-xs px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-705 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-indigo-500 font-medium"
                      >
                        {AVAILABLE_WALLETS.map(w => {
                          const balance = userWallets[w] || 0;
                          return (
                            <option key={w} value={w}>
                              {w} (Rp {balance.toLocaleString('id-ID')})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end font-sans">
                    <button type="button" onClick={() => setSettlingDebtId(null)} className="text-xs px-3 py-1.5 text-slate-500 dark:text-slate-400 font-medium hover:text-slate-700 dark:hover:text-white">Batal</button>
                    <button type="submit" className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg font-medium transition-colors">Bayar Lunas</button>
                  </div>
                </form>
              )}
            </div>
          );
         })
        )}
      </div>
    </div>
  );
}
