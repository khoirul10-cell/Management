import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, Camera, Plus, FileText, Mic, MicOff, X } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, getDocs, query, where, orderBy, limit, updateDoc, doc, increment } from 'firebase/firestore';

const autocorrectVoiceText = (text: string): string => {
  if (!text) return '';
  
  const mappings = [
    // SeaBank: jibank, jibenk, sea bank, seabenk, dsb.
    { pattern: /\b(jibank|jibenk|sea bank|seabenk|seabang|si bank|si benk|sheabank|shea bank)\b/gi, replacement: 'SeaBank' },
    
    // BCA: beca, becah, beceah, becea
    { pattern: /\b(beca|becah|beceah|becea)\b/gi, replacement: 'BCA' },
    
    // GoPay: gopay, gopes, gopet, gopet, gopai, gope, go pay
    { pattern: /\b(gopay|gopes|gopet|gopet|gopai|gope|go pay)\b/gi, replacement: 'GoPay' },
    
    // DANA: dana, danah, danna
    { pattern: /\b(danah|danna)\b/gi, replacement: 'DANA' },
    
    // OVO: opo, obo, ovoo
    { pattern: /\b(opo|obo|ovoo)\b/gi, replacement: 'OVO' },
    
    // ShopeePay: sopipay, shope pay, shopee pay, shoppee pay, shopepey, sopi pe, sopi pei, shoppepay, supepey, sope pay, sopepay
    { pattern: /\b(sopipay|shope pay|shopee pay|shoppee pay|shopepey|sopi pe|sopi pei|shoppepay|supepey|sope pay|sopepay)\b/gi, replacement: 'ShopeePay' },
    
    // LinkAja: link aja, ling aja, linggaja, lingk aja, linkaja
    { pattern: /\b(link aja|ling aja|linggaja|lingk aja|linkaja)\b/gi, replacement: 'LinkAja' },
    
    // BSI: besei, beesi, b s i
    { pattern: /\b(besei|beesi|b s i)\b/gi, replacement: 'BSI' },
    
    // BNI: beeni, benei, b n i
    { pattern: /\b(beeni|benei|b n i)\b/gi, replacement: 'BNI' },
    
    // BRI: berei, berii, b r i
    { pattern: /\b(berei|berii|b r i)\b/gi, replacement: 'BRI' },
    
    // Mandiri: manderi
    { pattern: /\b(manderi)\b/gi, replacement: 'Mandiri' },
    
    // Jago: jaku
    { pattern: /\b(jaku)\b/gi, replacement: 'Jago' },
    
    // Cash: kes, kesh, uang kes, uang kesh, uang kas, kash
    { pattern: /\b(uang kes|uang kesh|uang kas|uang kash)\b/gi, replacement: 'Uang Cash' },
    { pattern: /\b(kes|kesh|cash|kash)\b/gi, replacement: 'Uang Cash' },
    
    // Ribu: rebu, rebuh, rb
    { pattern: /\b(rebu|rebuh|rb)\b/gi, replacement: 'ribu' },
    
    // Juta: jutah, jt
    { pattern: /\b(jutah|jt)\b/gi, replacement: 'juta' }
  ];

  let corrected = text;
  for (const map of mappings) {
    corrected = corrected.replace(map.pattern, map.replacement);
  }
  return corrected;
};

const formatRecordTime = (date: any): string => {
  if (!date) return '-';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '-';
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${hours}:${minutes} (${day}/${month}/${year})`;
};

export default function AIChatInput({ existingTransactions = [], onNavigate }: { existingTransactions?: any[], onNavigate?: (tab: string) => void }) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [pendingDuplicates, setPendingDuplicates] = useState<{txs: any[], userText: string} | null>(null);
  const [showConfirmTumpuk, setShowConfirmTumpuk] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const isListeningRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const startListening = async () => {
    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      setLastAction("Browser Anda tidak mendukung Web Speech API.");
      return;
    }

    setVoiceTranscript('');
    setIsListening(true);
    isListeningRef.current = true;
    setLastAction("🎤 Meminta izin mikrofon...");

    try {
      // Explicitly request browser microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Release stream immediately since we only wanted to prompt/verify permissions
      stream.getTracks().forEach(track => track.stop());
    } catch (err: any) {
      console.error("Microphone permission error:", err);
      setLastAction("❌ Izin mikrofon ditolak atau tidak tersedia.");
      setIsListening(false);
      isListeningRef.current = false;
      return;
    }

    setLastAction("🎤 Mulai perekaman suara...");

    try {
      const rec = new SpeechRecognitionClass();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'id-ID';

      rec.onstart = () => {
        setLastAction("🎤 Mendengarkan... silakan bicara sepuasnya");
      };

      rec.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === 'not-allowed') {
          setLastAction("❌ Izin mikrofon ditolak.");
          stopListeningAndCleanup();
        } else if (event.error === 'no-speech') {
          console.log("No speech detected.");
        } else {
          setLastAction(`❌ Masalah perekaman: ${event.error}`);
        }
      };

      rec.onend = () => {
        if (isListeningRef.current) {
          try {
            rec.start();
          } catch (e) {
            console.log("Failed to auto-restart recognition:", e);
          }
        }
      };

      rec.onresult = (event: any) => {
        let accumulated = '';
        for (let i = 0; i < event.results.length; i++) {
          accumulated += event.results[i][0].transcript + ' ';
        }
        const corrected = autocorrectVoiceText(accumulated);
        setVoiceTranscript(corrected);
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (err) {
      console.error("Speech init failure:", err);
      setIsListening(false);
      isListeningRef.current = false;
    }
  };

  const stopListeningAndCleanup = () => {
    setIsListening(false);
    isListeningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch (e) {
        console.error(e);
      }
      recognitionRef.current = null;
    }
  };

  const handleVoiceSubmit = async () => {
    const finalVal = voiceTranscript.trim();
    stopListeningAndCleanup();
    if (!finalVal) {
      setLastAction("Perekaman kosong, tidak ada suara terdeteksi.");
      return;
    }

    setInput('');
    setIsLoading(true);
    setLastAction("🎤 Mengirim transaksi suara Anda...");

    try {
      const response = await fetch('/api/parse-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: finalVal })
      });
      
      const data = await response.json();
      if (!response.ok || data.error) {
         setLastAction(data.error || 'Oops, I could not process that.');
         return;
      }
      
      let transactions = Array.isArray(data) ? data : [data];
      await processTransactions(transactions, finalVal);
      
    } catch (error: any) {
      console.error(error);
      setLastAction("Terjadi kesalahan saat menyimpan transaksi Anda.");
    } finally {
      setIsLoading(false);
      setVoiceTranscript('');
    }
  };

  const handleVoiceTransfer = () => {
    stopListeningAndCleanup();
    if (voiceTranscript.trim()) {
      setInput(prev => prev ? `${prev}\n${voiceTranscript.trim()}` : voiceTranscript.trim());
      setLastAction("✏️ Salinan suara dimasukkan ke form input.");
    }
    setVoiceTranscript('');
  };

  const handleVoiceCancel = () => {
    stopListeningAndCleanup();
    setVoiceTranscript('');
    setLastAction("❌ Perekaman dibatalkan.");
  };

  const toggleListening = () => {
    if (isListening) {
      handleVoiceCancel();
    } else {
      startListening();
    }
  };

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
        tags: Array.isArray(t.tags) ? t.tags : [],
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
      let matchedDbTx: any = null;
      for (const ext of existingTransactions) {
         const tDate = extractDate(t);
         const extDateObj = ext.timestamp;
         let extDateStr = '';
         let extDateVal: Date | null = null;
         
         if (extDateObj) {
           if (extDateObj instanceof Date) {
             extDateVal = extDateObj;
           } else if (typeof extDateObj.toDate === 'function') {
             extDateVal = extDateObj.toDate();
           } else if (extDateObj.seconds !== undefined) {
             extDateVal = new Date(extDateObj.seconds * 1000);
           } else {
             extDateVal = new Date(extDateObj);
           }
           
           if (extDateVal && !isNaN(extDateVal.getTime())) {
             extDateStr = `${extDateVal.getFullYear()}-${String(extDateVal.getMonth() + 1).padStart(2,'0')}-${String(extDateVal.getDate()).padStart(2,'0')}`;
           }
         }
         
         if (ext.amount === Number(t.amount) && ext.type === t.type && ext.category === t.category && extDateStr === tDate) {
           matchedDbTx = {
             description: ext.description || ext.category,
             amount: ext.amount,
             category: ext.category,
             type: ext.type,
             timestamp: extDateVal,
             isDb: true
           };
           break;
         }
      }

      let matchedSelfTx: any = null;
      for (const ut of uniques) {
         if (ut.amount === Number(t.amount) && ut.type === t.type && ut.category === t.category && extractDate(ut) === extractDate(t)) {
           matchedSelfTx = {
             description: ut.description || ut.category,
             amount: ut.amount,
             category: ut.category,
             type: ut.type,
             timestamp: new Date(),
             isDb: false
           };
           break;
          }
      }

      if (matchedDbTx || matchedSelfTx) {
        duplicates.push({
          ...t,
          matchedWith: matchedDbTx || matchedSelfTx
        });
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
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-800 dark:bg-white/10 text-white dark:text-slate-200 backdrop-blur-md px-4 py-2 rounded-full text-sm shadow-lg whitespace-nowrap transition-all border border-slate-700 dark:border-white/10 z-50">
          {lastAction}
        </div>
      )}
      
      {/* Quick Chips */}
      <div className="flex overflow-x-auto gap-2 mb-2 pb-1 px-1 scrollbar-hide w-full" style={{ scrollbarWidth: 'none' }}>
        <style>{`.scrollbar-hide::-webkit-scrollbar { display: none; }`}</style>
        {['Makan', 'Transport', 'Hiburan', 'Belanja', 'Kesehatan', 'Listrik & Air'].map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => {
              setInput((prev) => prev ? `${prev} ${category} ` : `${category} `);
              inputRef.current?.focus();
            }}
            className="whitespace-nowrap px-3 py-1 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-full text-[11px] sm:text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-all shadow-sm shrink-0"
          >
            {category}
          </button>
        ))}
      </div>

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
          ref={inputRef}
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
          placeholder="masukan transaksi anda di sini."
          className="flex-1 bg-transparent border-none px-2 py-2 outline-none text-slate-900 dark:text-white placeholder-slate-500 text-xs sm:text-sm md:text-base resize-none"
          rows={Math.min(4, input.split('\n').length)}
          disabled={isLoading}
        />
        <button
          type="button"
          onClick={toggleListening}
          disabled={isLoading}
          className={`p-2.5 rounded-xl transition-all duration-300 flex items-center justify-center flex-shrink-0 relative ${
            isListening 
              ? 'bg-rose-500 text-white hover:bg-rose-600 animate-pulse ring-4 ring-rose-500/30' 
              : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10'
          }`}
          title={isListening ? "Hentikan merekam suara" : "Catat transaksi dengan suara"}
        >
          {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>
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
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-250">
          <div className="bg-white dark:bg-[#1e293b] rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-white/10 flex flex-col gap-4 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center gap-3 text-amber-500 dark:text-amber-400">
              <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center">
                <Sparkles className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Deteksi Transaksi Ganda (Double)</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium font-sans">Sistem mendeteksi transaksi serupa sudah tercatat</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Ditemukan <span className="font-semibold text-indigo-600 dark:text-indigo-400">{pendingDuplicates.txs.length} transaksi</span> yang mirip dengan data Anda. Silakan tinjau perbandingan waktu di bawah ini untuk memastikan apakah ini <strong>pembelian baru di jam berbeda</strong> atau tidak sengaja tercatat dua kali.
            </p>

            {/* List of Duplicates with detailed comparison */}
            <div className="flex flex-col gap-3 my-1 max-h-[280px] overflow-y-auto pr-1">
              {pendingDuplicates.txs.map((tx: any, idx: number) => {
                const matched = tx.matchedWith || {};
                const matchedTime = matched.timestamp ? formatRecordTime(matched.timestamp) : '-';
                
                return (
                  <div key={idx} className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex flex-col gap-3">
                    <div className="flex items-start justify-between">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-sans">
                        Pengecekan #{idx + 1}
                      </span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 font-mono">
                        {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(tx.amount)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                      {/* Left: Input yang Baru */}
                      <div className="bg-amber-500/5 rounded-xl p-3 border border-amber-500/10">
                        <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1 font-sans">
                          Baru Mau Dimasukkan
                        </div>
                        <div className="text-xs font-semibold text-slate-900 dark:text-white truncate font-sans">
                          {tx.description || tx.category}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1 font-sans">
                          <span>Waktu input:</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">Baru (Sekarang)</span>
                        </div>
                      </div>

                      {/* Right: Sudah Tercatat */}
                      <div className="bg-emerald-500/5 rounded-xl p-3 border border-emerald-500/10">
                        <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1 font-sans">
                          Sudah Ada di Sistem
                        </div>
                        <div className="text-xs font-semibold text-slate-900 dark:text-white truncate font-sans">
                          {matched.description || matched.category}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1 font-sans">
                          <span>Waktu catat:</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                            {matchedTime}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Decision and Help text */}
            <div className="bg-indigo-50/50 dark:bg-indigo-500/5 rounded-2xl p-3 border border-indigo-500/10 text-[11px] text-indigo-700 dark:text-indigo-300 flex flex-col gap-1 font-sans">
              <span className="font-bold">💡 Tips Keputusan:</span>
              <span>• Jika Anda membeli produk yang sama lagi di jam berbeda, klik <strong>"Tetap Catat (Tumpuk)"</strong>.</span>
              <span>• Jika tidak sengaja ter-submit dua kali (tidak ingin double), klik <strong>"Abaikan (Batal Double)"</strong>.</span>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 mt-1">
              <button
                onClick={() => setPendingDuplicates(null)}
                className="flex-1 px-4 py-3 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-200 dark:hover:bg-white/10 transition-colors border border-slate-200 dark:border-white/5 text-sm font-sans"
              >
                Abaikan (Batal Double)
              </button>
              <button
                onClick={() => setShowConfirmTumpuk(true)}
                className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/25 text-sm font-sans"
              >
                Tetap Catat (Tumpuk)
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

      {/* Voice Assistant Modal Overlay */}
      {isListening && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#1e293b] rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-white/10 flex flex-col gap-5 animate-in slide-in-from-bottom-5 duration-300">
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-500/15 flex items-center justify-center text-rose-500 animate-pulse">
                  <Mic className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Perekaman Suara Aktif</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Silakan berbicara langsung</p>
                </div>
              </div>
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-500/10 text-rose-500 animate-pulse">
                REC
              </span>
            </div>

            {/* Live Transcript Panel */}
            <div className="bg-slate-50 dark:bg-black/20 rounded-2xl p-4 border border-slate-100 dark:border-white/5 min-h-[140px] max-h-[220px] overflow-y-auto flex flex-col">
              {voiceTranscript.trim() ? (
                <p className="text-slate-800 dark:text-slate-200 text-sm leading-relaxed first-letter:capitalize">
                  "{voiceTranscript}"
                </p>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-sm gap-2 py-4">
                  <Mic className="w-8 h-8 opacity-40 animate-bounce text-rose-500" />
                  <p className="text-center">Sedang mendengarkan... katakan sesuatu seperti:<br/>"Makan siang 25 ribu pakai Dompet"</p>
                </div>
              )}
            </div>

            {/* Warning guidelines */}
            <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
              Perekaman berjalan tanpa henti. Ketuk tombol di bawah jika selesai atau ingin membatalkan.
            </p>

            {/* Controls */}
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={handleVoiceCancel}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-200 dark:hover:bg-white/10 transition-colors border border-slate-200 dark:border-white/5"
              >
                <X className="w-4 h-4" /> Batal Voice
              </button>
              
              <button
                type="button"
                onClick={handleVoiceTransfer}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl font-medium hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors"
                disabled={!voiceTranscript.trim()}
              >
                ✏️ Edit Dulu
              </button>

              <button
                type="button"
                onClick={handleVoiceSubmit}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold transition-colors shadow-lg shadow-emerald-600/25 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!voiceTranscript.trim()}
              >
                <Send className="w-4 h-4" /> Kirim ke Chat
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
