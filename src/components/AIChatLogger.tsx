import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Loader2, Bot, User, Mic, MicOff, Camera, Plus, FileText, CheckCircle2, Wallet, ArrowUpRight, ArrowDownLeft, X, MessageSquare, ArrowRightSquare } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, getDocs, query, where, updateDoc, doc, increment } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  status?: 'sending' | 'success' | 'error';
  parsedTransactions?: any[];
}

const SUGGESTIONS = [
  "Makan bakso gopay 25 rebu",
  "Gaji masuk Seabank 5 juta",
  "Bayar kosan cash 800rb kemarin",
  "Ngasih pinjem duit bca 50rb ke Budi",
  "Bayar utang cash 20rb ke Joni"
];

const CATEGORY_ICONS: Record<string, string> = {
  food: "🍔",
  transport: "🚲",
  salary: "💰",
  utilities: "💡",
  entertainment: "🎮",
  health: "🏥",
  utang: "🤝",
  piutang: "👥",
  shopping: "🛒",
  personal: "🧑",
  travel: "✈️",
  bank: "🏦",
  'e-wallet': "📱",
  cash: "💵",
  other: "⚡"
};

const autocorrectVoiceText = (text: string): string => {
  if (!text) return '';
  const mappings = [
    { pattern: /\b(jibank|jibenk|sea bank|seabenk|seabang|si bank|si benk|sheabank|shea bank)\b/gi, replacement: 'SeaBank' },
    { pattern: /\b(beca|becah|beceah|becea)\b/gi, replacement: 'BCA' },
    { pattern: /\b(gopay|gopes|gopet|gopet|gopai|gope|go pay)\b/gi, replacement: 'GoPay' },
    { pattern: /\b(danah|danna)\b/gi, replacement: 'DANA' },
    { pattern: /\b(opo|obo|ovoo)\b/gi, replacement: 'OVO' },
    { pattern: /\b(sopipay|shope pay|shopee pay|shoppee pay|shopepey|sopi pe|sopi pei|shoppepay|supepey|sope pay|sopepay)\b/gi, replacement: 'ShopeePay' },
    { pattern: /\b(link aja|ling aja|linggaja|lingk aja|linkaja)\b/gi, replacement: 'LinkAja' },
    { pattern: /\b(besei|beesi|b s i)\b/gi, replacement: 'BSI' },
    { pattern: /\b(beeni|benei|b n i)\b/gi, replacement: 'BNI' },
    { pattern: /\b(berei|berii|b r i)\b/gi, replacement: 'BRI' },
    { pattern: /\b(manderi)\b/gi, replacement: 'Mandiri' },
    { pattern: /\b(jaku)\b/gi, replacement: 'Jago' },
    { pattern: /\b(uang kes|uang kesh|uang kas|uang kash)\b/gi, replacement: 'Uang Cash' },
    { pattern: /\b(kes|kesh|cash|kash)\b/gi, replacement: 'Uang Cash' },
    { pattern: /\b(rebu|rebuh|rb)\b/gi, replacement: 'ribu' },
    { pattern: /\b(jutah|jt)\b/gi, replacement: 'juta' }
  ];
  let corrected = text;
  for (const map of mappings) {
    corrected = corrected.replace(map.pattern, map.replacement);
  }
  return corrected;
};

export default function AIChatLogger({ onNavigate, transactions = [] }: { onNavigate?: (tab: string) => void; transactions?: any[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);

  useEffect(() => {
    // Add default initial greeting from AI
    const username = auth.currentUser?.displayName || 'Bos';
    setMessages([
      {
        id: 'init',
        role: 'assistant',
        content: `Halo ${username}! Saya **CoinAI Copilot**. Di sini Anda bisa mencatat pengeluaran, pemasukan, utang, atau piutang menggunakan bahasa santai seolah sedang chatting.

Contoh ketikan atau gunakan ikon mikrofon di bawah:
• *"makan siang gopay 45rb"*
• *"terima gaji bca 5 juta"*
• *"bayar kosan cash 800rb kemarin"*
• *"ngasih pinjem bca 50rb ke joni"*

Saya akan otomatis mencatatkan transaksinya dan menyelaraskannya dengan dompet/saldo Anda secara realtime!`,
        timestamp: new Date()
      }
    ]);

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Firebase transaction saving engine (replicates original to maintain consistency)
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
         const targetDebtType = t.type === 'expense' ? 'payable' : 'receivable'; 
         const debtsRef = collection(db, `users/${user.uid}/debts`);
         const q = query(debtsRef, where('type', '==', targetDebtType), where('status', '==', 'pending'));
         const snapshot = await getDocs(q);
         
         let targetDebtId = null;
         let targetDebtData = null;
         const normalizedSearchName = t.personName.toLowerCase().replace(/[^a-z0-9]/g, '');

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

  const handleSend = async (textToSend?: string) => {
    const finalVal = (textToSend || input).trim();
    if (!finalVal || isLoading) return;

    if (!textToSend) setInput('');
    setIsLoading(true);

    const userMsgId = 'user-' + Date.now();
    const newUserMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: finalVal,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newUserMessage]);

    try {
      const response = await fetch('/api/chat-logger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: finalVal })
      });

      if (!response.ok) {
        throw new Error('Gagal memproses pesan');
      }

      const data = await response.json();
      
      const parsedTransactions = data.transactions || [];
      
      // Save parsed transactions directly to Firebase DB
      if (parsedTransactions.length > 0) {
        await saveTransactionsToDB(parsedTransactions, finalVal);
        setFeedbackMsg("✅ Berhasil menyimpan transaksi ke sistem!");
        setTimeout(() => setFeedbackMsg(null), 3500);

        // If any debt is created, auto-nav to debts page after a brief moment
        const hasDebt = parsedTransactions.some((t: any) => t.isDebt);
        if (hasDebt && onNavigate) {
          setTimeout(() => onNavigate('debts'), 2000);
        }
      }

      setMessages(prev => [
        ...prev,
        {
          id: 'ai-' + Date.now(),
          role: 'assistant',
          content: data.reply || 'Transaksi Anda telah diproses.',
          timestamp: new Date(),
          parsedTransactions: parsedTransactions
        }
      ]);

    } catch (error) {
      console.error(error);
      setMessages(prev => [
        ...prev,
        {
          id: 'ai-err-' + Date.now(),
          role: 'assistant',
          content: "Maaf, server mengalami gangguan dalam memahami transaksi Anda. Mohon dicoba kembali sebentar lagi.",
          timestamp: new Date(),
          status: 'error'
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSmartInsights = async () => {
    if (isLoading) return;
    setIsLoading(true);

    const userMsgId = 'user-' + Date.now();
    const newUserMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: "Tolong analisis pengeluaran saya bulan ini dan berikan Smart Insights tentang area yang bisa dihemat.",
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newUserMessage]);

    try {
      const response = await fetch('/api/smart-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions })
      });

      if (!response.ok) {
        throw new Error('Gagal mendapatkan insights');
      }

      const data = await response.json();

      setMessages(prev => [
        ...prev,
        {
          id: 'ai-' + Date.now(),
          role: 'assistant',
          content: data.reply || 'Berikut adalah analisis pengeluaran Anda.',
          timestamp: new Date()
        }
      ]);

    } catch (error) {
      console.error(error);
      setMessages(prev => [
        ...prev,
        {
          id: 'ai-err-' + Date.now(),
          role: 'assistant',
          content: "Maaf, gagal menganalisis pengeluaran Anda saat ini. Mohon coba lagi nanti.",
          timestamp: new Date(),
          status: 'error'
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setFeedbackMsg(`📄 Memindai Strukk/Dokumen: ${file.name}...`);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        
        let targetMime = file.type || 'image/jpeg';
        let uploadPayload = base64Data;

        if (file.type.startsWith('image/')) {
          const img = new Image();
          img.onload = async () => {
            const canvas = document.createElement('canvas');
            const maxDim = 800;
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
            if (ctx) ctx.drawImage(img, 0, 0, width, height);
            
            const resizedBase64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
            await triggerReceiptParser(resizedBase64, 'image/jpeg', file.name);
          };
          img.src = reader.result as string;
        } else {
          await triggerReceiptParser(uploadPayload, targetMime, file.name);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setFeedbackMsg("Gagal membaca file.");
      setIsLoading(false);
    }
  };

  const triggerReceiptParser = async (base64: string, mime: string, name: string) => {
    try {
      const response = await fetch('/api/parse-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType: mime })
      });
      
      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Gagal memindai setruk');
      }

      const transactions = Array.isArray(data) ? data : [data];
      await saveTransactionsToDB(transactions, `Unggah Setruk: ${name}`);

      setMessages(prev => [
        ...prev,
        {
          id: 'user-doc-' + Date.now(),
          role: 'user',
          content: `📂 Mengunggah struk/dokumen: ${name}`,
          timestamp: new Date()
        },
        {
          id: 'ai-doc-' + Date.now(),
          role: 'assistant',
          content: `Saya berhasil memindai dokumen **"${name}"** dan berhasil menginputkan data transaksinya ke dalam buku kas Anda secara otomatis.`,
          timestamp: new Date(),
          parsedTransactions: transactions
        }
      ]);
      setFeedbackMsg("✅ Struk ter-input sukses!");
    } catch (error: any) {
      console.error(error);
      setFeedbackMsg("Oops, gagal memindai struk ini.");
    } finally {
      setIsLoading(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
      if (docInputRef.current) docInputRef.current.value = '';
      setTimeout(() => setFeedbackMsg(null), 3500);
    }
  };

  // Speech Recognition Implementation
  const startListening = async () => {
    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      setFeedbackMsg("Browser Anda tidak mendukung Web Speech API.");
      return;
    }

    setVoiceTranscript('');
    setIsListening(true);
    isListeningRef.current = true;
    setFeedbackMsg("🎤 Meminta izin mikrofon...");

    try {
      // Explicitly request browser microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Release stream immediately since we only wanted to prompt/verify permissions
      stream.getTracks().forEach(track => track.stop());
    } catch (err: any) {
      console.error("Microphone permission error:", err);
      setFeedbackMsg("❌ Akses mikrofon ditolak atau tidak tersedia.");
      setIsListening(false);
      isListeningRef.current = false;
      return;
    }

    setFeedbackMsg("🎤 Mulai perekaman suara...");

    try {
      const rec = new SpeechRecognitionClass();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'id-ID';

      rec.onstart = () => {
        setFeedbackMsg("🎤 Silakan bicara gampang, saya mendengarkan...");
      };

      rec.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === 'not-allowed') {
          setFeedbackMsg("❌ Akses mikrofon ditolak.");
          stopListeningAndCleanup();
        } else {
          setFeedbackMsg(`Perekaman bermasalah: ${event.error}`);
        }
      };

      rec.onend = () => {
        if (isListeningRef.current) {
          try {
            rec.start();
          } catch (e) {
            console.log("Speech restart error:", e);
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
    const speechResult = voiceTranscript.trim();
    stopListeningAndCleanup();
    setVoiceTranscript('');
    setFeedbackMsg(null);
    if (!speechResult) return;
    await handleSend(speechResult);
  };

  const toggleListening = () => {
    if (isListening) {
      stopListeningAndCleanup();
      setVoiceTranscript('');
      setFeedbackMsg(null);
    } else {
      startListening();
    }
  };

  return (
    <div className="flex-1 bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-3xl flex flex-col h-[650px] shadow-xl relative overflow-hidden mb-20">
      {/* Header of Chat */}
      <div className="p-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              CoinAI Copilot 
              <span className="text-[10px] bg-indigo-500/10 text-indigo-500 px-2 py-0.5 rounded-full font-semibold">Aktif</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Pencatatan keuangan cerdas berbasis AI</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {feedbackMsg && (
            <div className="text-xs bg-slate-800 dark:bg-indigo-500/10 text-white dark:text-indigo-400 px-3 py-1.5 rounded-full shadow border border-indigo-500/20 animate-bounce max-w-[200px] md:max-w-xs truncate">
              {feedbackMsg}
            </div>
          )}
          <button
            onClick={handleSmartInsights}
            disabled={isLoading}
            className="flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-3 py-1.5 rounded-xl transition-all cursor-pointer shadow-sm disabled:opacity-50"
            title="Analisis Pengeluaran Pintar"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold">Smart Insights</span>
          </button>
        </div>
      </div>

      {/* Messages Sandbox Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            const isAI = msg.role === 'assistant';
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                className={`flex gap-3 max-w-[85%] ${!isAI ? 'ml-auto flex-row-reverse' : ''}`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isAI ? 'bg-indigo-500 text-white' : 'bg-slate-200 dark:bg-slate-700'}`}>
                  {isAI ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4 text-slate-600 dark:text-slate-300" />}
                </div>

                <div className="flex flex-col gap-2">
                  <div className={`p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${!isAI ? 'bg-indigo-600 text-white rounded-tr-none shadow-md shadow-indigo-600/15' : 'bg-slate-100 dark:bg-white/5 text-slate-800 dark:text-slate-200 rounded-tl-none border border-slate-250 dark:border-white/5'}`}>
                    {msg.content}
                  </div>

                  {/* Render Visual Cards inside chat bubble for transactions parsing! */}
                  {isAI && msg.parsedTransactions && msg.parsedTransactions.length > 0 && (
                    <div className="flex flex-col gap-2 mt-1">
                      {msg.parsedTransactions.map((tx: any, idx: number) => {
                        const isIncome = tx.type === 'income';
                        const emoji = CATEGORY_ICONS[tx.category] || "💵";
                        return (
                          <div key={idx} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl p-3 shadow-md flex items-center justify-between gap-4 max-w-sm">
                            <div className="flex items-center gap-3 truncate">
                              <span className="text-xl p-1 bg-slate-100 dark:bg-white/5 rounded-lg shrink-0">{emoji}</span>
                              <div className="truncate">
                                <p className="text-xs font-bold text-slate-800 dark:text-white capitalize truncate">{tx.description || tx.category}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold ${isIncome ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10' : 'bg-rose-50 text-rose-600 dark:bg-rose-500/10'}`}>
                                    {isIncome ? 'Pemasukan' : 'Pengeluaran'}
                                  </span>
                                  <span className="text-[10px] text-slate-500 font-medium font-sans">
                                    {tx.walletSource || 'Uang Cash'}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <span className={`text-xs font-bold shrink-0 ${isIncome ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {isIncome ? '+' : '-'} {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(tx.amount)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}

          {isLoading && (
            <div className="flex gap-3 max-w-[85%]">
              <div className="w-8 h-8 rounded-xl bg-indigo-500 text-white flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 animate-spin" />
              </div>
              <div className="p-4 rounded-2xl rounded-tl-none bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompts Section */}
      {messages.length <= 2 && (
        <div className="px-4 py-2 border-t border-slate-150 dark:border-white/5 overflow-x-auto bg-slate-50/50 dark:bg-transparent flex gap-2 scrollbar-none shrink-0">
          {SUGGESTIONS.map((str, i) => (
            <button
              key={i}
              onClick={() => handleSend(str)}
              className="text-xs bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-full border border-slate-200 dark:border-white/15 transition-all whitespace-nowrap scrollbar-none shrink-0"
            >
              {str}
            </button>
          ))}
        </div>
      )}

      {/* Input Chat Section with attachments & voice & submit */}
      <div className="p-4 bg-white dark:bg-[#0f172a] border-t border-slate-200 dark:border-white/10 shrink-0">
        <form 
          onSubmit={(e) => { e.preventDefault(); handleSend(); }} 
          className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 p-1 rounded-2xl border border-slate-200 dark:border-white/10 transition-colors focus-within:border-indigo-500"
        >
          {/* File input attachment hidden elements */}
          <input 
            type="file" 
            accept="image/*" 
            ref={imageInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
          />
          <input 
            type="file" 
            accept="image/*,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
            ref={docInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
          />

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsAttachMenuOpen(!isAttachMenuOpen)}
              disabled={isLoading || isListening}
              className={`p-2.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-white/10 transition-transform ${isAttachMenuOpen ? 'rotate-45' : ''}`}
            >
              <Plus className="w-5 h-5" />
            </button>

            {isAttachMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsAttachMenuOpen(false)} />
                <div className="absolute bottom-full left-0 mb-3 bg-white dark:bg-[#1e293b] shadow-2xl rounded-2xl border border-slate-200 dark:border-white/10 flex flex-col p-2 gap-1 z-50 w-48 animate-in slide-in-from-bottom-2 duration-200">
                  <button
                    type="button"
                    onClick={() => { setIsAttachMenuOpen(false); imageInputRef.current?.click(); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10 rounded-xl transition-colors font-medium"
                  >
                    <Camera className="w-4 h-4 text-indigo-500" />
                    <span>Scan Struk</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsAttachMenuOpen(false); docInputRef.current?.click(); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10 rounded-xl transition-colors font-medium"
                  >
                    <FileText className="w-4 h-4 text-indigo-500" />
                    <span>Impor Kas</span>
                  </button>
                </div>
              </>
            )}
          </div>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading || isListening}
            placeholder={isListening ? "Tutup perekaman suara untuk mengetik..." : "Ketik transaksi..."}
            className="flex-1 bg-transparent border-none px-3 py-2 outline-none text-slate-950 dark:text-white placeholder-slate-500 text-sm"
          />

          {/* Speech Recording Trigger */}
          <button
            type="button"
            onClick={toggleListening}
            disabled={isLoading}
            className={`p-2.5 rounded-xl transition-all duration-300 ${isListening ? 'bg-rose-500 text-white animate-pulse' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'}`}
          >
            {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <button
            type="submit"
            disabled={isLoading || isListening || !input.trim()}
            className="p-2.5 rounded-xl bg-indigo-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors shrink-0"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>

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
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Asisten Suara Copilot</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Perekaman kas via suara aktif</p>
                </div>
              </div>
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-500/10 text-rose-500 animate-pulse">
                REC
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-black/20 rounded-2xl p-4 border border-slate-100 dark:border-white/5 min-h-[140px] max-h-[220px] overflow-y-auto flex flex-col">
              {voiceTranscript.trim() ? (
                <p className="text-slate-800 dark:text-slate-200 text-sm leading-relaxed first-letter:capitalize font-medium">
                  "{voiceTranscript}"
                </p>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-sm gap-2 py-4">
                  <Mic className="w-8 h-8 opacity-40 animate-bounce text-rose-500" />
                  <p className="text-center font-sans">Mendengarkan ucapan kas Anda...<br/>e.g. "Gaji masuk go pay 50 rebu"</p>
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center font-sans col-span-2">
              Dukung aksen lisan Indonesia dengan penuh kecerdasan.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { stopListeningAndCleanup(); setVoiceTranscript(''); }}
                className="flex-1 py-3 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleVoiceSubmit}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition-colors shadow-lg disabled:opacity-50"
                disabled={!voiceTranscript.trim()}
              >
                Selesai & Kirim
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
