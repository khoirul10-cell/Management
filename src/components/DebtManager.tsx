import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Debt } from '../types';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Plus, Trash2, CheckCircle, Clock } from 'lucide-react';

export default function DebtManager() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [personName, setPersonName] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'payable' | 'receivable'>('payable');
  const [description, setDescription] = useState('');

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(
      collection(db, `users/${user.uid}/debts`),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Debt[] = [];
      snapshot.forEach((doc) => {
        const docData = doc.data();
        data.push({
          id: doc.id,
          ...docData,
          timestamp: docData.timestamp?.toDate() || new Date(),
          createdAt: docData.createdAt?.toDate() || new Date(),
          updatedAt: docData.updatedAt?.toDate() || new Date(),
        } as Debt);
      });
      setDebts(data);
    }, (error) => {
      try { handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/debts`); } catch(e){}
    });

    return () => unsubscribe();
  }, []);

  const handleAddDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user || !personName || !amount) return;

    try {
      await addDoc(collection(db, `users/${user.uid}/debts`), {
        userId: user.uid,
        type,
        personName,
        amount: Number(amount),
        remainingAmount: Number(amount),
        description,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setIsAdding(false);
      setPersonName('');
      setAmount('');
      setDescription('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/debts`);
    }
  };

  const markAsPaid = async (debtId: string) => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/debts`, debtId), {
        status: 'paid',
        remainingAmount: 0,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/debts/${debtId}`);
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

  const formatIDR = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(val);

  const totalPayable = debts.filter(d => d.type === 'payable' && d.status !== 'paid').reduce((acc, curr) => acc + curr.remainingAmount, 0);
  const totalReceivable = debts.filter(d => d.type === 'receivable' && d.status !== 'paid').reduce((acc, curr) => acc + curr.remainingAmount, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <p className="text-sm text-slate-400 mb-1">Total Utang Saya</p>
          <p className="text-xl font-bold text-rose-400">{formatIDR(totalPayable)}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <p className="text-sm text-slate-400 mb-1">Total Piutang (Orang ke Saya)</p>
          <p className="text-xl font-bold text-emerald-400">{formatIDR(totalReceivable)}</p>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-slate-200">Daftar Catatan</h3>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Tambah
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleAddDebt} className="bg-white/5 border border-white/10 p-4 rounded-xl space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Jenis</label>
              <select 
                value={type} 
                onChange={(e) => setType(e.target.value as any)}
                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="payable">Utang (Saya Pinjam)</option>
                <option value="receivable">Piutang (Orang Pinjam)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nominal (Rp)</label>
              <input 
                type="number" 
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                placeholder="100000"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Nama Pihak Terkait</label>
              <input 
                type="text" 
                required
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                placeholder="Nama Orang / Instansi"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Keterangan (Opsional)</label>
              <input 
                type="text" 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                placeholder="Misal: Pinjaman dana darurat"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setIsAdding(false)} className="px-3 py-2 text-sm text-slate-400 hover:text-white">Batal</button>
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
          debts.map(debt => (
            <div key={debt.id} className={`p-4 bg-white/5 border border-white/10 rounded-xl relative ${debt.status === 'paid' ? 'opacity-60' : ''}`}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${debt.type === 'payable' ? 'bg-rose-400/20 text-rose-400' : 'bg-emerald-400/20 text-emerald-400'}`}>
                      {debt.type === 'payable' ? 'Utang' : 'Piutang'}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${debt.status === 'paid' ? 'bg-indigo-400/20 text-indigo-400' : 'bg-amber-400/20 text-amber-400'}`}>
                      {debt.status === 'paid' ? 'Lunas' : 'Belum Lunas'}
                    </span>
                  </div>
                  <h4 className="font-semibold text-slate-200 mt-2">{debt.personName}</h4>
                  <p className="text-xs text-slate-400">{debt.description}</p>
                </div>
                <div className="text-right">
                  <p className={`font-bold text-lg ${debt.type === 'payable' ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {formatIDR(debt.amount)}
                  </p>
                  <p className="text-[10px] text-slate-500">{format(debt.createdAt, "dd MMM yyyy", { locale: id })}</p>
                </div>
              </div>

              {debt.status !== 'paid' && (
                <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-white/5">
                  <button 
                    onClick={() => markAsPaid(debt.id)}
                    className="flex items-center gap-1 text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-2 py-1.5 rounded transition-colors"
                  >
                    <CheckCircle className="w-3 h-3" /> Tandai Lunas
                  </button>
                  <button 
                    onClick={() => deleteDebt(debt.id)}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-rose-400 px-2 py-1.5 rounded transition-colors"
                  >
                    <Trash2 className="w-3 h-3" /> Hapus
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
