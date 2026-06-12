import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { Investment } from '../types';
import { TrendingUp, TrendingDown, Plus, Trash2, Activity, Bitcoin, LineChart, RefreshCw } from 'lucide-react';

export default function InvestmentPortfolio() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  
  // Adding modal state
  const [isAdding, setIsAdding] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<'crypto' | 'stock'>('crypto');
  const [quantity, setQuantity] = useState('');
  const [buyPriceIDR, setBuyPriceIDR] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initial price references for simulating traffic realistically
  const [baseMockPrices, setBaseMockPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(collection(db, `users/${user.uid}/investments`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const invs: Investment[] = [];
      snapshot.forEach(d => {
        const data = d.data();
        invs.push({
          id: d.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        } as Investment);
      });
      setInvestments(invs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'investments');
    });

    return () => unsubscribe();
  }, []);

  // Simulate Live Market Traffic and Fetch Real Crypto Prices
  useEffect(() => {
    if (investments.length === 0) return;

    // Ensure we have a base realistic price for new loads
    setBaseMockPrices(prev => {
      const next = { ...prev };
      let changed = false;
      investments.forEach(inv => {
        if (!next[inv.symbol]) {
          next[inv.symbol] = inv.buyPriceIDR;
          changed = true;
        }
      });
      if (changed) {
         setCurrentPrices(curr => {
           const newCurr = { ...curr };
           investments.forEach(inv => {
             if (!newCurr[inv.symbol]) newCurr[inv.symbol] = inv.buyPriceIDR;
           });
           return newCurr;
         });
      }
      return next;
    });

    const fetchCryptoPrices = async () => {
       const cryptos = investments.filter(inv => inv.type === 'crypto');
       if (cryptos.length === 0) return;
       
       try {
         // Assuming USD to IDR is roughly 16200 for now to keep things simple
         const USD_TO_IDR = 16200;
         const symbols = cryptos.map(c => `"${c.symbol.toUpperCase()}USDT"`).join(',');
         const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbols=[${symbols}]`);
         if (response.ok) {
            const data = await response.json();
            setCurrentPrices(prev => {
               const next = { ...prev };
               data.forEach((item: any) => {
                  const sym = item.symbol.replace('USDT', '');
                  next[sym] = parseFloat(item.price) * USD_TO_IDR;
               });
               return next;
            });
         }
       } catch (err) {
         console.error("Failed to fetch crypto prices", err);
       }
    };

    const intervalId = setInterval(() => {
      // First fetch crypto real-time
      fetchCryptoPrices();

      // Simulate stock prices
      setCurrentPrices(prev => {
        const next = { ...prev };
        investments.forEach(inv => {
          if (inv.type === 'stock') {
            const price = next[inv.symbol] || inv.buyPriceIDR;
            const volatility = 0.001; // 0.1% change max for stock simulation
            const changePercent = (Math.random() * 2 - 1) * volatility; 
            const drift = 0.0001; 
            next[inv.symbol] = price * (1 + changePercent + drift);
          }
        });
        return next;
      });
    }, 5000); // 5 seconds loop to avoid too aggressive polling

    fetchCryptoPrices(); // run immediately once

    return () => clearInterval(intervalId);
  }, [investments]);

  const handleAddInvestment = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    if (!symbol || !name || !quantity || !buyPriceIDR) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, `users/${user.uid}/investments`), {
        userId: user.uid,
        type,
        symbol: symbol.toUpperCase(),
        name,
        quantity: Number(quantity),
        buyPriceIDR: Number(buyPriceIDR),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setIsAdding(false);
      setSymbol('');
      setName('');
      setQuantity('');
      setBuyPriceIDR('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'investments');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, sym: string) => {
    if (!confirm(`Hapus investasi ${sym}?`)) return;
    const user = auth.currentUser;
    if (!user) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/investments`, id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `investments/${id}`);
    }
  };

  const formatIDR = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);

  const totalInvested = investments.reduce((acc, inv) => acc + (inv.buyPriceIDR * inv.quantity), 0);
  const currentTotal = investments.reduce((acc, inv) => {
    const price = currentPrices[inv.symbol] || inv.buyPriceIDR;
    return acc + (price * inv.quantity);
  }, 0);

  const totalProfitLoss = currentTotal - totalInvested;
  const isProfit = totalProfitLoss > 0;
  const isEqual = totalInvested === currentTotal;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm overflow-hidden relative">
      <div className="flex justify-between items-center mb-6">
        <div>
           <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
             <Activity className="w-5 h-5 text-indigo-500" />
             Portofolio Global
           </h2>
           <p className="text-sm text-slate-500 dark:text-slate-400">Live Crypto & Global Stocks</p>
        </div>
        {!isAdding && (
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors"
          >
            <Plus className="w-4 h-4" /> Tambah
          </button>
        )}
      </div>

      {investments.length > 0 && (
        <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Total Saldo Portofolio</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              {formatIDR(currentTotal)}
              <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" style={{ animationDuration: '3s' }} />
            </h3>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Return Global</p>
            <div className={`inline-flex items-center gap-1 font-semibold px-2 py-1 rounded-md text-sm ${isEqual ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' : isProfit ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400'}`}>
               {isEqual ? null : isProfit ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
               {isProfit ? '+' : ''}{formatIDR(totalProfitLoss)}
            </div>
          </div>
        </div>
      )}

      {isAdding && (
        <form onSubmit={handleAddInvestment} className="mb-6 bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-slate-200 dark:border-white/10 space-y-4">
          <div className="flex justify-between items-center mb-1">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Tambah Aset Baru</h3>
            <button type="button" onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">Batal</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
             <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Jenis Aset</label>
                <div className="flex bg-slate-200 dark:bg-slate-900 rounded-lg p-1">
                   <button type="button" onClick={() => setType('crypto')} className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${type === 'crypto' ? 'bg-white dark:bg-slate-800 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'}`}>Crypto</button>
                   <button type="button" onClick={() => setType('stock')} className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${type === 'stock' ? 'bg-white dark:bg-slate-800 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'}`}>Stock</button>
                </div>
             </div>
             <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Simbol (e.g. BTC, AAPL)</label>
                <input required value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-500 text-slate-900 dark:text-white" placeholder="BTC" />
             </div>
             <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Nama Aset</label>
                <input required value={name} onChange={e => setName(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-500 text-slate-900 dark:text-white" placeholder="Bitcoin" />
             </div>
             <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Kuantitas</label>
                <input required type="number" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-500 text-slate-900 dark:text-white" placeholder="0.5" />
             </div>
             <div className="col-span-2">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Harga Beli Rata-Rata (IDR / unit)</label>
                <input required type="number" value={buyPriceIDR} onChange={e => setBuyPriceIDR(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-500 text-slate-900 dark:text-white" placeholder="1000000000" />
             </div>
          </div>
          <button type="submit" disabled={isSubmitting} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 mt-2">
             {isSubmitting ? 'Menyimpan...' : 'Simpan Aset'}
          </button>
        </form>
      )}

      {investments.length > 0 ? (
        <div className="space-y-3">
          {investments.map(inv => {
            const currentPrice = currentPrices[inv.symbol] || inv.buyPriceIDR;
            const itemTotalCurrent = currentPrice * inv.quantity;
            const itemTotalInvested = inv.buyPriceIDR * inv.quantity;
            const diff = itemTotalCurrent - itemTotalInvested;
            const isItemProfit = diff > 0;
            const isItemEqual = diff === 0;

            const percentage = ((currentPrice - inv.buyPriceIDR) / inv.buyPriceIDR) * 100;

            return (
              <div key={inv.id} className="group flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 border border-transparent hover:border-slate-100 dark:hover:border-white/5 transition-all">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${inv.type === 'crypto' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'}`}>
                     {inv.type === 'crypto' ? <Bitcoin className="w-5 h-5" /> : <LineChart className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-slate-200 leading-tight">
                      {inv.symbol} <span className="text-xs font-normal text-slate-500 ml-1">{inv.name}</span>
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {inv.quantity} unit • Beli at {formatIDR(inv.buyPriceIDR)}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 text-right">
                   <div>
                     <p className="font-semibold text-slate-900 dark:text-white">
                        {formatIDR(itemTotalCurrent)}
                     </p>
                     <p className={`text-xs mt-0.5 flex items-center justify-end gap-0.5 ${isItemEqual ? 'text-slate-500' : isItemProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {isItemEqual ? null : isItemProfit ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {isItemEqual ? '0%' : `${isItemProfit ? '+' : ''}${percentage.toFixed(2)}%`}
                     </p>
                   </div>
                   <button onClick={() => handleDelete(inv.id, inv.symbol)} className="text-slate-400 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 p-2">
                     <Trash2 className="w-4 h-4" />
                   </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8">
           <Activity className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
           <p className="text-slate-500 dark:text-slate-400 text-sm">Belum ada portofolio investasi.</p>
           <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">Tambahkan aset untuk melacak trafik realtime simulasi.</p>
        </div>
      )}
    </div>
  );
}
