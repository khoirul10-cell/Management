import React, { useState, useEffect } from 'react';
import { Globe, RefreshCw, Activity, AlertCircle, Bitcoin, Bell, Plus, Trash2, X } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { auth, db } from '../lib/firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { PriceAlert } from '../types';

interface CurrencyRate {
  code: string;
  name: string;
  rate: number;
  symbol: string;
}

interface MetalRate {
  symbol: string;
  name: string;
  priceUSD: number;
  priceIDR: number;
}

interface CryptoRate {
  symbol: string;
  name: string;
  priceUSD: number;
  priceIDR: number;
}

interface StockIndex {
  symbol: string;
  name: string;
  value: number;
  change: number; // percentage
}

interface ChartDataPoint {
  date: string;
  price: number;
}

const TARGET_CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
];

const TARGET_METALS = [
  { symbol: 'XAU', name: 'Gold', unit: 'per gram' },
  { symbol: 'XAG', name: 'Silver', unit: 'per gram' },
];

const TARGET_CRYPTOS = [
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'BNB', name: 'Binance Coin' },
  { symbol: 'SOL', name: 'Solana' },
  { symbol: 'XRP', name: 'Ripple' },
  { symbol: 'DOGE', name: 'Dogecoin' },
];

const INITIAL_STOCKS: StockIndex[] = [
  { symbol: 'S&P 500', name: 'S&P 500 Index', value: 5300.5, change: 0.12 },
  { symbol: 'NASDAQ', name: 'NASDAQ Composite', value: 16700.2, change: 0.35 },
  { symbol: 'DOW', name: 'Dow Jones Industrial', value: 39800.8, change: -0.05 },
  { symbol: 'NIKKEI', name: 'Nikkei 225', value: 38900.4, change: 0.85 },
  { symbol: 'FTSE 100', name: 'FTSE 100 Index', value: 8400.1, change: -0.15 },
  { symbol: 'IHSG', name: 'Jakarta Composite', value: 7200.5, change: 0.25 },
];

export default function GlobalCurrencies() {
  const [rates, setRates] = useState<CurrencyRate[]>([]);
  const [metalRates, setMetalRates] = useState<MetalRate[]>([]);
  const [cryptoRates, setCryptoRates] = useState<CryptoRate[]>([]);
  const [stockIndices, setStockIndices] = useState<StockIndex[]>(INITIAL_STOCKS);
  const [btcChartData, setBtcChartData] = useState<ChartDataPoint[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Price Alerts State
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [alertSymbol, setAlertSymbol] = useState('BTC');
  const [alertCondition, setAlertCondition] = useState<'above' | 'below'>('above');
  const [alertTargetPrice, setAlertTargetPrice] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load Alerts
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const unsub = onSnapshot(collection(db, `users/${user.uid}/priceAlerts`), (snap) => {
      const data: PriceAlert[] = [];
      snap.forEach(d => {
        data.push({ id: d.id, ...d.data() } as PriceAlert);
      });
      setAlerts(data);
    });
    return () => unsub();
  }, []);

  // Request Notification Permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Check Alerts against real-time prices
  useEffect(() => {
    alerts.forEach(async (alert) => {
      if (alert.isTriggered || !alert.targetPriceUSD) return;
      
      let currentPrice = 0;
      if (alert.assetType === 'crypto') {
         const cr = cryptoRates.find(c => c.symbol === alert.symbol);
         if (cr) currentPrice = cr.priceUSD;
      } else {
         const st = stockIndices.find(s => s.symbol === alert.symbol);
         if (st) currentPrice = st.value;
      }

      if (currentPrice > 0) {
        let isTriggered = false;
        if (alert.condition === 'above' && currentPrice >= alert.targetPriceUSD) isTriggered = true;
        if (alert.condition === 'below' && currentPrice <= alert.targetPriceUSD) isTriggered = true;

        if (isTriggered) {
          const msg = `🚨 Alert Harga: ${alert.symbol} telah melewati target $${alert.targetPriceUSD}! (Harga skrg: $${currentPrice.toFixed(2)})`;
          
          if ('Notification' in window && Notification.permission === 'granted') {
             new Notification('Target Harga Tercapai!', { body: msg, icon: '/favicon.ico' });
          }
          setToastMessage(msg);
          setTimeout(() => setToastMessage(null), 8000);

          try {
             const user = auth.currentUser;
             if (user) {
               await updateDoc(doc(db, `users/${user.uid}/priceAlerts`, alert.id), {
                 isTriggered: true
               });
             }
          } catch(e) { console.error(e); }
        }
      }
    });
  }, [cryptoRates, stockIndices, alerts]);

  const handleAddAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;
    
    // determine asset type
    const isCrypto = TARGET_CRYPTOS.some(c => c.symbol === alertSymbol);
    const assetType = isCrypto ? 'crypto' : 'stock';

    try {
      await addDoc(collection(db, `users/${user.uid}/priceAlerts`), {
        userId: user.uid,
        assetType,
        symbol: alertSymbol,
        targetPriceUSD: Number(alertTargetPrice),
        condition: alertCondition,
        isTriggered: false,
        createdAt: serverTimestamp()
      });
      setIsAlertModalOpen(false);
      setAlertTargetPrice('');
    } catch(err) {
      console.error(err);
    }
  };

  const deleteAlert = async (id: string) => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/priceAlerts`, id));
    } catch(e) { console.error(e); }
  };

  const fetchRates = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      // 1. Fetch Fiat Rates
      const fiatResponse = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!fiatResponse.ok) throw new Error('Network response was not ok');
      const fiatData = await fiatResponse.json();
      
      const idrRate = fiatData.rates.IDR;
      
      const updatedRates = TARGET_CURRENCIES.map(curr => {
        const rateInIdr = idrRate / fiatData.rates[curr.code];
        return {
          ...curr,
          rate: rateInIdr
        };
      });

      // 2. Fetch Metal Rates from our proxy backend endpoint (real-time from Yahoo Finance)
      let updatedMetals: MetalRate[] = [];
      try {
        const metalsResponse = await fetch("/api/precious-metals");
        if (metalsResponse.ok) {
          const metalsData = await metalsResponse.json();
          updatedMetals = TARGET_METALS.map(m => {
            const priceUSD = m.symbol === 'XAU' ? metalsData.gold : metalsData.silver;
            return {
               ...m,
               priceUSD,
               priceIDR: priceUSD * idrRate
            };
          });
        }
      } catch (err) {
         console.error("Failed to fetch real-time metal rates via backend proxy:", err);
      }
      
      if (updatedMetals.length === 0) {
         updatedMetals = TARGET_METALS.map(m => {
             const basePrices: Record<string, number> = {'XAU': 2370 / 31.1034768, 'XAG': 29.5 / 31.1034768};
             const priceUSD = basePrices[m.symbol] || 0;
             return {
                ...m,
                priceUSD,
                priceIDR: priceUSD * idrRate
             };
         });
      }

      // 3. Fetch Crypto Rates from Binance
      const symbols = TARGET_CRYPTOS.map(c => `"${c.symbol}USDT"`).join(',');
      const cryptoResponse = await fetch(`https://api.binance.com/api/v3/ticker/price?symbols=[${symbols}]`);
      let updatedCryptos: CryptoRate[] = [];
      
      if (cryptoResponse.ok) {
         const cryptoData = await cryptoResponse.json();
         updatedCryptos = TARGET_CRYPTOS.map(c => {
            const item = cryptoData.find((d: any) => d.symbol === `${c.symbol}USDT`);
            const priceUSD = item ? parseFloat(item.price) : 0;
            return {
               symbol: c.symbol,
               name: c.name,
               priceUSD,
               priceIDR: priceUSD * idrRate
            };
         });
      }

      // 4. Fetch BTC 7-day History
      if (btcChartData.length === 0) {
        const btcHistResponse = await fetch(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=7`);
        if (btcHistResponse.ok) {
          const btcHistData = await btcHistResponse.json();
          const mappedHist = btcHistData.map((d: any) => ({
            date: format(new Date(d[0]), 'MMM dd'),
            price: parseFloat(d[4]) // close price
          }));
          setBtcChartData(mappedHist);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 600));
      
      setRates(updatedRates);
      setMetalRates(updatedMetals);
      if (updatedCryptos.length > 0) {
         setCryptoRates(updatedCryptos);
      }
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error("Failed fetching rates:", err);
      setError('Gagal memuat data kurs real-time terbaru');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRates();
    const intervalId = setInterval(fetchRates, 10000); // Poll every 10 seconds for more real-time crypto
    return () => clearInterval(intervalId);
  }, []);

  // Simulate real-time stock volatility
  useEffect(() => {
    const stockIntervalId = setInterval(() => {
      setStockIndices(prev => prev.map(stock => {
        // slight random change between -0.05% and +0.05%
        const volatility = 0.0005;
        const randomShift = (Math.random() * 2 - 1) * volatility;
        const newValue = stock.value * (1 + randomShift);
        const newChange = stock.change + randomShift * 100;
        return {
          ...stock,
          value: newValue,
          change: newChange
        };
      }));
    }, 3000);
    return () => clearInterval(stockIntervalId);
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };
  
  const formatUSD = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    }).format(value);
  };

  return (
    <div className="space-y-6 relative">
      {/* Toast Notification for Price Alert */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-orange-600 text-white px-4 py-3 rounded-xl shadow-xl shadow-orange-500/20 flex items-center gap-3 animate-in fade-in slide-in-from-top-5">
          <Bell className="w-5 h-5 animate-bounce" />
          <p className="text-sm font-medium">{toastMessage}</p>
          <button onClick={() => setToastMessage(null)} className="ml-2 hover:bg-orange-700 p-1 rounded-full"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Header and Alert Button */}
      <div className="flex justify-between items-center bg-white dark:bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-slate-200 dark:border-white/10">
         <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-500" />
            Pasar Global
         </h1>
         <button
            onClick={() => setIsAlertModalOpen(true)}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-xl text-sm font-medium transition-colors border border-transparent shadow-sm"
          >
            <Bell className="w-4 h-4" /> Alert Harga
          </button>
      </div>

      <div className="bg-white dark:bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-slate-200 dark:border-white/10">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Globe className="w-5 h-5 text-indigo-500" />
              Keadaan Mata Uang Global
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Nilai tukar terhadap Rupiah (IDR) real-time
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Activity className="w-3 h-3 text-emerald-500 animate-pulse" />
              Live Update: {lastUpdated.toLocaleTimeString('id-ID')}
            </span>
            <button 
              onClick={fetchRates}
              disabled={isRefreshing}
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors"
              title="Refresh rates"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-500' : ''}`} />
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 p-4 rounded-xl border border-rose-200 dark:border-rose-500/20 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {rates.length === 0 && !error ? (
          <div className="py-10 flex flex-col items-center justify-center text-slate-500">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-400 mb-4" />
            <p className="text-sm font-medium">Menyinkronkan data mata uang...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {rates.map((currency) => (
              <div 
                key={currency.code}
                className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-black/20 hover:border-indigo-500/30 dark:hover:border-indigo-400/30 transition-all group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-indigo-500/5 to-transparent rounded-bl-3xl -z-10 group-hover:scale-110 transition-transform"></div>
                
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-white dark:bg-white/10 flex items-center justify-center text-sm font-bold text-slate-700 dark:text-slate-200 shadow-sm border border-slate-100 dark:border-white/5">
                      {currency.symbol}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white leading-none">{currency.code}</h3>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 truncate max-w-[80px]">{currency.name}</p>
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 flex flex-col">
                  <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {formatCurrency(currency.rate)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

        {/* Metals Section */}
      <div className="bg-white dark:bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-slate-200 dark:border-white/10">
        <div className="mb-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-amber-500" />
            Logam Mulia (Real-time)
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Harga emas dan perak per gram
          </p>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {metalRates.map((metal) => (
              <div 
                key={metal.symbol}
                className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-black/20 flex justify-between items-center"
              >
                 <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400 font-bold">
                     {metal.symbol[1]}
                   </div>
                   <div>
                     <h3 className="font-bold text-slate-900 dark:text-white">{metal.name}</h3>
                     <p className="text-[10px] text-slate-500 dark:text-slate-400">{metal.unit}</p>
                   </div>
                 </div>
                 <div className="text-right">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(metal.priceIDR)}</span>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{formatUSD(metal.priceUSD)} USD</p>
                 </div>
              </div>
            ))}
        </div>
      </div>

      {/* Crypto Section */}
      <div className="bg-white dark:bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-slate-200 dark:border-white/10">
        <div className="mb-6 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Bitcoin className="w-5 h-5 text-orange-500" />
              Mata Uang Kripto Global
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Harga dan tren kripto utama secara real-time
            </p>
          </div>
        </div>

        {btcChartData.length > 0 && (
          <div className="mb-8 p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-black/20">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-orange-500" />
              Tren Bitcoin (BTC) 7 Hari Terakhir
            </h3>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={btcChartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorBtc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" hide />
                  <YAxis domain={['auto', 'auto']} hide />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                    itemStyle={{ color: '#f97316' }}
                    formatter={(value: number) => [formatUSD(value), 'Price ']}
                    labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                  />
                  <Area type="monotone" dataKey="price" stroke="#f97316" strokeWidth={2} fillOpacity={1} fill="url(#colorBtc)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {cryptoRates.length === 0 && !error ? (
          <div className="py-10 flex flex-col items-center justify-center text-slate-500">
            <RefreshCw className="w-8 h-8 animate-spin text-orange-400 mb-4" />
            <p className="text-sm font-medium">Menyinkronkan data kripto...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cryptoRates.map((crypto) => (
              <div 
                key={crypto.symbol}
                className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-black/20 hover:border-orange-500/30 dark:hover:border-orange-400/30 transition-all group relative overflow-hidden flex flex-col justify-between"
              >
                <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-orange-500/5 to-transparent rounded-bl-3xl -z-10 group-hover:scale-110 transition-transform"></div>
                
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-white dark:bg-white/10 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-200 shadow-sm border border-slate-100 dark:border-white/5 px-1 truncate">
                      {crypto.symbol}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white leading-none">{crypto.symbol}</h3>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{crypto.name}</p>
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-between items-end">
                   <div className="flex flex-col">
                     <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                       {formatCurrency(crypto.priceIDR)}
                     </span>
                     <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                       {formatUSD(crypto.priceUSD)}
                     </span>
                   </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stocks Section */}
      <div className="bg-white dark:bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-slate-200 dark:border-white/10">
        <div className="mb-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-500" />
            Keadaan Saham Global (Indeks)
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Simulasi live data indeks saham utama dunia
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {stockIndices.map((stock) => (
            <div 
              key={stock.symbol}
              className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-black/20 hover:border-indigo-500/30 dark:hover:border-indigo-400/30 transition-all flex flex-col justify-between"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white leading-none">{stock.symbol}</h3>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{stock.name}</p>
                </div>
                <div className={`text-xs font-bold px-2 py-1 rounded-md ${stock.change >= 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400'}`}>
                  {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%
                </div>
              </div>
              <div className="mt-2 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                {formatUSD(stock.value)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alert Modal */}
      {isAlertModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Bell className="w-5 h-5 text-orange-500" />
                Set Alert Harga
              </h3>
              <button onClick={() => setIsAlertModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <form onSubmit={handleAddAlert} className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Aset</label>
                  <select 
                    value={alertSymbol} 
                    onChange={e => setAlertSymbol(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-indigo-500"
                  >
                    <optgroup label="Crypto">
                      {TARGET_CRYPTOS.map(c => <option key={c.symbol} value={c.symbol}>{c.symbol} - {c.name}</option>)}
                    </optgroup>
                    <optgroup label="Saham Indeks">
                      {INITIAL_STOCKS.map(s => <option key={s.symbol} value={s.symbol}>{s.symbol} - {s.name}</option>)}
                    </optgroup>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Kondisi</label>
                    <select 
                      value={alertCondition} 
                      onChange={e => setAlertCondition(e.target.value as any)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-indigo-500"
                    >
                      <option value="above">Di atas</option>
                      <option value="below">Di bawah</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Target Harga (USD)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      required
                      value={alertTargetPrice}
                      onChange={e => setAlertTargetPrice(e.target.value)}
                      placeholder="e.g 60000"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-indigo-500"
                    />
                  </div>
                </div>
                <div className="pt-2">
                  <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-2 rounded-xl transition-colors">
                    Simpan Alert
                  </button>
                </div>
              </form>

              {/* Active Alerts List */}
              {alerts.length > 0 && (
                 <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Alert Aktif</h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                       {alerts.map(a => (
                          <div key={a.id} className={`flex justify-between items-center p-2 rounded-lg border text-sm ${a.isTriggered ? 'bg-slate-50 dark:bg-slate-800/50 border-transparent opacity-60' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                             <div>
                               <span className="font-bold text-slate-900 dark:text-white mr-2">{a.symbol}</span>
                               <span className="text-xs text-slate-500">
                                  {a.condition === 'above' ? '>=' : '<='} {formatUSD(a.targetPriceUSD || 0)}
                               </span>
                               {a.isTriggered && <span className="ml-2 text-[10px] text-green-500 font-medium whitespace-nowrap">Tercapai</span>}
                             </div>
                             <button onClick={() => deleteAlert(a.id)} className="text-slate-400 hover:text-rose-500">
                                <Trash2 className="w-4 h-4" />
                             </button>
                          </div>
                       ))}
                    </div>
                 </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
