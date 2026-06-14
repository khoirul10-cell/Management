import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  addDoc, 
  setDoc, 
  deleteDoc, 
  serverTimestamp, 
  increment 
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { RecurringTransaction } from '../types';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { 
  Calendar, 
  Clock, 
  Plus, 
  Trash2, 
  Play, 
  Pause, 
  AlertCircle, 
  Sparkles, 
  CheckCircle2, 
  TrendingUp, 
  TrendingDown, 
  HelpCircle, 
  CreditCard,
  RefreshCw,
  X,
  Info
} from 'lucide-react';

interface Props {
  walletBalances: Record<string, number>;
}

export function advanceInterval(current: Date, interval: 'daily' | 'weekly' | 'monthly' | 'yearly'): Date {
  const d = new Date(current);
  if (interval === 'daily') {
    d.setDate(d.getDate() + 1);
  } else if (interval === 'weekly') {
    d.setDate(d.getDate() + 7);
  } else if (interval === 'monthly') {
    d.setMonth(d.getMonth() + 1);
  } else if (interval === 'yearly') {
    d.setFullYear(d.getFullYear() + 1);
  }
  return d;
}

export function parseFirestoreDate(val: any): Date {
  if (!val) return new Date();
  if (typeof val.toDate === 'function') return val.toDate();
  if (val instanceof Date) return val;
  const parsed = new Date(val);
  if (!isNaN(parsed.getTime())) return parsed;
  return new Date();
}

export default function RecurringManager({ walletBalances }: Props) {
  const [schedules, setSchedules] = useState<RecurringTransaction[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Form states
  const [formType, setFormType] = useState<'income' | 'expense'>('expense');
  const [formAmount, setFormAmount] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formInterval, setFormInterval] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly');
  const [formWallet, setFormWallet] = useState('Uang Cash');
  const [formStartDate, setFormStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Notification state
  const [notifier, setNotifier] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const incomeCategories = ['Gaji', 'Bonus & THR', 'Investasi', 'Penjualan', 'Lainnya'];
  const expenseCategories = [
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

  const walletList = [
    'Uang Cash', 'GoPay', 'DANA', 'OVO', 'ShopeePay', 'LinkAja', 
    'BCA', 'Mandiri', 'BNI', 'BRI', 'SeaBank', 'BSI', 'Jago', 'Lainnya'
  ];

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    setIsLoading(true);
    const q = query(collection(db, `users/${user.uid}/recurring_templates`));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: RecurringTransaction[] = [];
      snapshot.forEach((docSnap) => {
        const item = docSnap.data();
        data.push({
          id: docSnap.id,
          userId: item.userId,
          type: item.type,
          amount: item.amount,
          category: item.category,
          description: item.description,
          interval: item.interval,
          walletSource: item.walletSource,
          startDate: parseFirestoreDate(item.startDate),
          lastTriggeredDate: item.lastTriggeredDate ? parseFirestoreDate(item.lastTriggeredDate) : undefined,
          nextTriggeredDate: parseFirestoreDate(item.nextTriggeredDate),
          status: item.status || 'active',
          createdAt: parseFirestoreDate(item.createdAt),
          updatedAt: parseFirestoreDate(item.updatedAt),
        });
      });
      setSchedules(data);
      setIsLoading(false);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/recurring_templates`);
      } catch (e) {
        setNotifier({ type: 'error', message: 'Gagal memuat daftar jadwal transaksi berulang.' });
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Update Category when type changes
  useEffect(() => {
    if (formType === 'income') {
      setFormCategory(incomeCategories[0]);
    } else {
      setFormCategory(expenseCategories[0]);
    }
  }, [formType]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setNotifier({ type, message });
    setTimeout(() => setNotifier(null), 4000);
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    try {
      const amt = parseFloat(formAmount);
      if (isNaN(amt) || amt <= 0) {
        showToast('error', 'Masukkan jumlah nominal ganda yang valid.');
        return;
      }

      const parsedStartDate = new Date(formStartDate);
      if (isNaN(parsedStartDate.getTime())) {
        showToast('error', 'Tanggal mulai transaksi tidak valid.');
        return;
      }

      // If start date is in the future, nextTriggered is the startDate itself.
      // If it is in the past, nextTriggered is also set to startDate. The automatic processor runs on it.
      const nextTrigger = new Date(parsedStartDate);

      const templatePath = `users/${user.uid}/recurring_templates`;
      await addDoc(collection(db, templatePath), {
        userId: user.uid,
        type: formType,
        amount: amt,
        category: formCategory,
        description: formDescription.trim(),
        interval: formInterval,
        walletSource: formWallet,
        startDate: parsedStartDate,
        nextTriggeredDate: nextTrigger,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      setShowAddModal(false);
      // Reset form variables
      setFormAmount('');
      setFormDescription('');
      setFormInterval('monthly');
      setFormWallet('Uang Cash');
      setFormStartDate(format(new Date(), 'yyyy-MM-dd'));
      showToast('success', 'Jadwal transaksi berulang berhasil dibuat!');
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/recurring_templates`);
      } catch (firestoreErr: any) {
        showToast('error', `Gagal menyimpan jadwal: ${firestoreErr.message || firestoreErr}`);
      }
    }
  };

  const handleToggleStatus = async (item: RecurringTransaction) => {
    const user = auth.currentUser;
    if (!user) return;

    setProcessingId(item.id);
    const newStatus = item.status === 'active' ? 'paused' : 'active';
    try {
      const docRef = doc(db, `users/${user.uid}/recurring_templates`, item.id);
      await setDoc(docRef, {
        status: newStatus,
        updatedAt: new Date()
      }, { merge: true });
      showToast('success', `Jadwal berhasil ${newStatus === 'active' ? 'diaktifkan kembali' : 'ditangguhkan'}.`);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/recurring_templates/${item.id}`);
      } catch (e) {
        showToast('error', 'Gagal mengubah status jadwal.');
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    const user = auth.currentUser;
    if (!user || !window.confirm('Apakah Anda yakin ingin menghapus jadwal transaksi berulang ini?')) return;

    setProcessingId(id);
    try {
      const docRef = doc(db, `users/${user.uid}/recurring_templates`, id);
      await deleteDoc(docRef);
      showToast('success', 'Jadwal berhasil dihapus.');
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/recurring_templates/${id}`);
      } catch (e) {
        showToast('error', 'Gagal menghapus jadwal.');
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleTriggerNow = async (item: RecurringTransaction) => {
    const user = auth.currentUser;
    if (!user) return;

    setProcessingId(item.id);
    try {
      const now = new Date();
      // 1. Create a regular ledger transaction right now
      const txData = {
        userId: user.uid,
        type: item.type,
        amount: item.amount,
        category: item.category,
        description: `(Terjadwal Manual) ${item.description || 'Transaksi Terjadwal'}`,
        timestamp: now,
        walletSource: item.walletSource,
        createdAt: now,
        updatedAt: now
      };

      await addDoc(collection(db, `users/${user.uid}/transactions`), txData);

      // Adjust wallet balance
      if (item.walletSource) {
        const amt = item.amount;
        const diff = item.type === 'income' ? amt : -amt;
        await setDoc(doc(db, 'users', user.uid), {
          [`walletBalances.${item.walletSource}`]: increment(diff)
        }, { merge: true });
      }

      // 2. Advance the timer for next trigger
      const updatedNext = advanceInterval(item.nextTriggeredDate, item.interval);
      const docRef = doc(db, `users/${user.uid}/recurring_templates`, item.id);
      await setDoc(docRef, {
        lastTriggeredDate: now,
        nextTriggeredDate: updatedNext,
        updatedAt: now
      }, { merge: true });

      showToast('success', `Berhasil memicu pencatatan instan untuk ${item.category}!`);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/transactions`);
      } catch (e) {
        showToast('error', 'Gagal memicu pencatatan instan.');
      }
    } finally {
      setProcessingId(null);
    }
  };

  // Calculations for KPI boards
  const activeSchedules = schedules.filter(s => s.status === 'active');
  const scheduledExpenseMonthly = activeSchedules
    .filter(s => s.type === 'expense')
    .reduce((sum, s) => {
      let multiplier = 1;
      if (s.interval === 'daily') multiplier = 30;
      else if (s.interval === 'weekly') multiplier = 4.33;
      else if (s.interval === 'yearly') multiplier = 1 / 12;
      return sum + (s.amount * multiplier);
    }, 0);

  const scheduledIncomeMonthly = activeSchedules
    .filter(s => s.type === 'income')
    .reduce((sum, s) => {
      let multiplier = 1;
      if (s.interval === 'daily') multiplier = 30;
      else if (s.interval === 'weekly') multiplier = 4.33;
      else if (s.interval === 'yearly') multiplier = 1 / 12;
      return sum + (s.amount * multiplier);
    }, 0);

  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', { 
      style: 'currency', 
      currency: 'IDR', 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 0 
    }).format(val);
  };

  return (
    <div className="flex-1 mb-20 flex flex-col gap-6" id="recurring-transactions-manager">
      {/* Toast Notification */}
      {notifier && (
        <div className={`fixed bottom-4 right-4 z-[999] p-4 rounded-xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-300 ${
          notifier.type === 'success' 
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-950/80 dark:border-emerald-500/30 dark:text-emerald-300' 
            : 'bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/80 dark:border-rose-500/30 dark:text-rose-300'
        }`}>
          {notifier.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
          )}
          <span className="text-xs font-semibold leading-relaxed">{notifier.message}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-36 h-36 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-500" />
              Sistem Transaksi Berulang (Recurring System)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
              Jadwalkan pengeluaran rutin (tagihan rent, Netflix, asuransi) atau pemasukan berkala (gaji bulanan) demi otomatisasi pembukuan tanpa lupa catat secara manual.
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md shadow-indigo-500/10 transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-95 shrink-0"
            id="add-recurring-btn"
          >
            <Plus className="w-4 h-4" />
            Buat Jadwal Baru
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl">
          <p className="text-xs font-medium text-slate-400">Total Pengeluaran Bulanan Terjadwal</p>
          <p className="text-xl font-black text-rose-600 dark:text-rose-400 mt-2 font-mono flex items-center gap-2">
            <TrendingDown className="w-5 h-5" />
            {formatIDR(scheduledExpenseMonthly)}
          </p>
        </div>
        <div className="p-5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl">
          <p className="text-xs font-medium text-slate-400">Total Pemasukan Bulanan Terjadwal</p>
          <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-2 font-mono flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            {formatIDR(scheduledIncomeMonthly)}
          </p>
        </div>
        <div className="p-5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl">
          <p className="text-xs font-medium text-slate-400">Status Operasi Asisten Finansial</p>
          <div className="flex items-center gap-2 mt-3.5">
            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Auto-Refresher Aktif</span>
          </div>
        </div>
      </div>

      {/* Main Content Areas */}
      <div className="bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Clock className="w-4.5 h-4.5 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">Kelola Jadwal ({schedules.length})</h3>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
            <p className="text-xs">Memuat data penjadwalan...</p>
          </div>
        ) : schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl bg-slate-50/50 dark:bg-transparent">
            <div className="p-4 bg-indigo-50 dark:bg-white/5 rounded-full text-indigo-500">
              <Calendar className="w-8 h-8" />
            </div>
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">Belum Ada Transaksi Rutin Terjadwal</p>
              <p className="text-xs text-slate-500 max-w-sm mt-1 mx-auto leading-normal">
                Belum ada tagihan berlangganan yang Anda daftarkan. Tombol di atas siap membantu Anda mulai mengotomatisasi pengeluaran rutin Anda!
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {schedules.map((item) => {
              const isInc = item.type === 'income';
              const isPaused = item.status === 'paused';
              const nextDateStr = format(item.nextTriggeredDate, 'dd MMM yyyy, HH:mm', { locale: id });
              const lastDateStr = item.lastTriggeredDate 
                ? format(item.lastTriggeredDate, 'dd MMM yyyy, HH:mm', { locale: id }) 
                : 'Belum pernah';

              return (
                <div 
                  key={item.id} 
                  className={`border rounded-2xl p-4 flex flex-col gap-3 justify-between transition-all relative ${
                    isPaused 
                      ? 'bg-slate-50/50 dark:bg-white/[0.01] border-slate-200 dark:border-white/5 opacity-70' 
                      : 'bg-white dark:bg-[#1a2333]/40 border-slate-200 dark:border-white/10 hover:border-indigo-500/35 hover:shadow-lg hover:shadow-indigo-500/[0.02]'
                  }`}
                >
                  {/* Category & Status Badges */}
                  <div className="flex items-center justify-between gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                      isInc 
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400' 
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-500/10 dark:text-rose-400'
                    }`}>
                      {item.category}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-semibold ${
                        item.interval === 'daily' ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400' :
                        item.interval === 'weekly' ? 'bg-sky-100 text-sky-800 dark:bg-sky-500/10 dark:text-sky-400' :
                        item.interval === 'monthly' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/10 dark:text-indigo-400' :
                        'bg-purple-100 text-purple-800 dark:bg-purple-500/10 dark:text-purple-400'
                      }`}>
                        {item.interval === 'daily' ? 'Harian' :
                         item.interval === 'weekly' ? 'Mingguan' :
                         item.interval === 'monthly' ? 'Bulanan' : 'Tahunan'}
                      </span>
                      {isPaused && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300 text-[9px] font-bold uppercase">
                          Ditangguhkan
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Info Row */}
                  <div>
                    <h4 className="font-extrabold text-base text-slate-900 dark:text-white font-mono">
                      {isInc ? '+' : '-'} {formatIDR(item.amount)}
                    </h4>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1 lines-clamp-1">
                      {item.description || 'Tanpa keterangan tambahan'}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-1">
                      <CreditCard className="w-3 h-3 text-slate-500 shrink-0" />
                      <span>Masuk/Potong: <strong className="text-slate-600 dark:text-slate-300">{item.walletSource || 'Tanpa Dompet'}</strong></span>
                    </div>
                  </div>

                  {/* Trigger Ledger Dates */}
                  <div className="border-t border-slate-100 dark:border-white/5 pt-2.5 space-y-1 text-[10px] text-slate-400">
                    <div className="flex justify-between">
                      <span>Jatuh Tempo:</span>
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">{nextDateStr}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pencatatan Terakhir:</span>
                      <span className="text-slate-600 dark:text-slate-300">{lastDateStr}</span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="border-t border-slate-100 dark:border-white/5 pt-2.5 flex items-center justify-between gap-2 mt-1">
                    <button
                      onClick={() => handleToggleStatus(item)}
                      disabled={processingId === item.id}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold cursor-pointer transition-colors ${
                        isPaused 
                          ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 dark:text-emerald-400' 
                          : 'bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-505/10 dark:hover:bg-amber-500/20 dark:text-amber-400'
                      }`}
                      title={isPaused ? "Aktifkan" : "Tangguhkan sementara"}
                    >
                      {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                      <span>{isPaused ? 'Aktifkan' : 'Pause'}</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      {!isPaused && (
                        <button
                          onClick={() => handleTriggerNow(item)}
                          disabled={processingId === item.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 rounded-xl text-[10px] font-bold transition-all transition-colors active:scale-95 duration-100 cursor-pointer"
                          title="Ledger transaksi kelihatannya belum jalan? Klik di sini untuk mencatat sekarang secara instan"
                        >
                          <RefreshCw className={`w-3 h-3 ${processingId === item.id ? 'animate-spin' : ''}`} />
                          <span>Bayar Sekarang</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleDeleteSchedule(item.id)}
                        disabled={processingId === item.id}
                        className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 rounded-lg transition-colors cursor-pointer"
                        title="Hapus Penjadwalan"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Info Warning Footer card */}
      <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl flex gap-3 text-left items-start">
        <Info className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Bagaimana Mesin Penjadwalan Bekerja?</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mt-1">
            CoinAI memiliki scheduler background engine pintar yang otomatis berjalan setiap kali Anda membuka aplikasi. Sistem akan mendeteksi apakah ada transaksi yang jatuh tempo selama Anda tidak membuka platform, kemudian mencatatkannya secara historis demi saldo dompet yang sinkron 100% dan akurat.
          </p>
        </div>
      </div>

      {/* Modal Creator Popup */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-in fade-in duration-250">
          <div className="bg-white dark:bg-[#1e293b] rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-white/10 relative flex flex-col gap-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto text-left">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-4">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                Jadwalkan Transaksi Rutin Baru
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-slate-350 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateSchedule} className="space-y-5">
              {/* Type Switcher */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Tipe Transaksi</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setFormType('expense')}
                    className={`py-2 text-xs font-bold rounded-lg transition-all ${
                      formType === 'expense' 
                        ? 'bg-rose-500 text-white shadow-md' 
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    📈 Pengeluaran Rutin
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormType('income')}
                    className={`py-2 text-xs font-bold rounded-lg transition-all ${
                      formType === 'income' 
                        ? 'bg-emerald-500 text-white shadow-md' 
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    📈 Pemasukan Berkala
                  </button>
                </div>
              </div>

              {/* Amount & Description */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                    Jumlah Nominal <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 font-bold text-xs">
                      Rp
                    </div>
                    <input
                      type="number"
                      min="1"
                      required
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                      placeholder="cth: 156000"
                      className="w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                    Interval Pengulangan <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formInterval}
                    onChange={(e: any) => setFormInterval(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-xl text-slate-950 dark:text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="daily">Harian (Setiap Hari)</option>
                    <option value="weekly">Mingguan (Setiap 7 Hari)</option>
                    <option value="monthly">Bulanan (Setiap Bulan)</option>
                    <option value="yearly">Tahunan (Setiap Tahun)</option>
                  </select>
                </div>
              </div>

              {/* Wallet & Start Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                    Metode Saldo Dompet <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formWallet}
                    onChange={(e) => setFormWallet(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-xl text-slate-950 dark:text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {walletList.map(w => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                    Mulai Tanggal <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-xl text-slate-950 dark:text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Category selector */}
              <div className="space-y-1.5 text-left">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Kategori Transaksi <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto p-1.5 bg-slate-50 dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-xl">
                  {(formType === 'income' ? incomeCategories : expenseCategories).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setFormCategory(cat)}
                      className={`px-3 py-1.5 text-[11px] font-semibold border rounded-lg transition-all shadow-xs cursor-pointer ${
                        formCategory === cat 
                          ? (formType === 'income'
                              ? 'bg-emerald-600 border-emerald-600 dark:bg-emerald-500 dark:border-emerald-500 text-white font-bold'
                              : 'bg-rose-600 border-rose-600 dark:bg-rose-500 dark:border-rose-500 text-white font-bold') 
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5 text-left">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block font-normal">Keterangan / Nama Jadwal</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="cth: Tagihan BPJS, Gaji Pokok Akbar, etc."
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="border-t border-slate-100 dark:border-white/5 pt-4 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-5 py-2.5 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
                >
                  Simpan Jadwal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
