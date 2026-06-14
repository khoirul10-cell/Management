import React, { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import { collection, query, orderBy, onSnapshot, doc, getDoc, setDoc, updateDoc, serverTimestamp, addDoc, writeBatch, increment } from 'firebase/firestore';
import { signOut, signInWithPopup, GoogleAuthProvider, updateProfile } from 'firebase/auth';
import { db, auth, googleProvider, cachedAccessToken, setCachedAccessToken, handleFirestoreError, OperationType } from '../lib/firebase';
import { Transaction } from '../types';
import AIChatInput from './AIChatInput';
import TransactionList from './TransactionList';
import Charts from './Charts';
import SpendingChart from './SpendingChart';
import DebtManager from './DebtManager';
import MonthlyOverview from './MonthlyOverview';
import BudgetOverview from './BudgetOverview';
import InvestmentPortfolio from './InvestmentPortfolio';
import GlobalCurrencies from './GlobalCurrencies';
import SupportChat from './SupportChat';
import AIChatLogger from './AIChatLogger';
import DonationModal from './DonationModal';
import BudgetSettingsModal from './BudgetSettingsModal';
import ExportPdfModal from './ExportPdfModal';
import AdminPanel from './AdminPanel';
import RecurringManager, { advanceInterval, parseFirestoreDate } from './RecurringManager';
import { LogOut, Wallet, Target, TrendingDown, TrendingUp, ChevronDown, ChevronUp, LayoutDashboard, FileText, Calendar as CalendarIcon, Plus, Download, FileDown, Sun, Moon, Globe, Menu, Trash2, Settings, Bell, List, Headset, MessageCircle, Instagram, User, ShieldCheck, HelpCircle, X, Check, Pencil, Camera, Sparkles, PlusCircle, MinusCircle, Info, AlertCircle, Heart, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

interface SystemUpdate {
  id: string;
  title: string;
  type: 'addition' | 'reduction' | 'improvement' | 'announcement';
  description: string;
  timestamp: string;
}

const SYSTEM_UPDATES: SystemUpdate[] = [
  {
    id: 'update-6',
    title: 'Perbaikan Grafik Pengeluaran Bulanan',
    type: 'improvement',
    description: 'Kami telah memperbaiki masalah visibilitas teks dan tooltip pada mode malam di grafik pengeluaran bulanan, sehingga data Anda sekarang dapat terbaca dengan sangat jelas di segala tema warna.',
    timestamp: '13 Juni 2026'
  },
  {
    id: 'update-1',
    title: 'Custom Scrollbar Premium & Halus',
    type: 'improvement',
    description: 'Seluruh scrollbar di tab dan halaman yang panjang kini dimodifikasi lebih ramping (6px) dengan sentuhan gradien ungu-indigo modern saat di-hover, menggantikan scrollbar default peramban yang tebal.',
    timestamp: '13 Juni 2026'
  },
  {
    id: 'update-2',
    title: 'Unggah Foto Profil secara Mandiri',
    type: 'addition',
    description: 'Kini Anda dapat langsung mengunggah foto profil kustom dari disk lokal/galeri Handphone Anda di dalam menu Edit Profil dengan batasan aman sebesar 5MB.',
    timestamp: '12 Juni 2026'
  },
  {
    id: 'update-3',
    title: 'Pembaruan Teks Ketentuan Layanan & FAQ',
    type: 'improvement',
    description: 'Membaca rincian privasi dan FAQ kini jauh lebih nyaman dengan kontras warna yang ditingkatkan, bekerja sangat cerdas baik dalam tema gelap (Mode Malam) maupun terang.',
    timestamp: '12 Juni 2026'
  },
  {
    id: 'update-4',
    title: 'Asisten Suara & Obrolan Copilot AI',
    type: 'addition',
    description: 'Kami meluncurkan tab "Chat Logger AI" pendukung audio/suara natural. Menyalin otomatis detail seperti "Gaji masuk GoPay 40rb kemarin" langsung ke kas Anda.',
    timestamp: '12 Juni 2026'
  },
  {
    id: 'update-5',
    title: 'Pemberitahuan: Pemeliharaan Laporan Lama',
    type: 'reduction',
    description: 'Laporan visual v1 dengan performa lama dinonaktifkan sepenuhnya. Pengurangan ini dilakukan untuk menjamin kelancaran, menghemat memori browser, dan menjaga kecepatan render.',
    timestamp: '10 Juni 2026'
  }
];

export default function Dashboard() {
  const [activeTab, setActiveTab ] = useState<'overview' | 'monthly' | 'all_transactions' | 'debts' | 'recurring' | 'portfolio' | 'currencies' | 'live_chat' | 'ai_chat' | 'admin' | 'export_pdf'>('overview');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budget, setBudget] = useState<number>(0);
  const [categoryBudgets, setCategoryBudgets] = useState<Record<string, number>>({});
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  
  const [savingsTarget, setSavingsTarget] = useState<number>(0);
  const [savingsInput, setSavingsInput] = useState('');
  const [leftoverTarget, setLeftoverTarget] = useState<number>(0);
  const [leftoverInput, setLeftoverInput] = useState('');
  const [activeTargetTab, setActiveTargetTab] = useState<'expense' | 'leftover' | 'savings'>('expense');

  const [isAddingBalance, setIsAddingBalance] = useState(false);
  const [balanceAddAmount, setBalanceAddAmount] = useState('');
  
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>({});
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [activeWalletTab, setActiveWalletTab] = useState<'cash' | 'ewallet' | 'bank'>('cash');
  const [isCSMenuOpen, setIsCSMenuOpen] = useState(false);
  const [tempWalletBalances, setTempWalletBalances] = useState<Record<string, number>>({
    'Uang Cash': 0, 'GoPay': 0, 'DANA': 0, 'OVO': 0, 'ShopeePay': 0, 'LinkAja': 0, 'BCA': 0, 'Mandiri': 0, 'BNI': 0, 'BRI': 0, 'SeaBank': 0, 'BSI': 0, 'Jago': 0, 'Lainnya': 0
  });

  // Reset Data Feature States
  const [resetCount, setResetCount] = useState(0);
  const [lastResetMonth, setLastResetMonth] = useState('');
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Premium & Invited Features States
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [isInvited, setIsInvited] = useState<boolean>(false);
  const [showPremiumModal, setShowPremiumModal] = useState<boolean>(false);
  const [premiumModalTab, setPremiumModalTab] = useState<'benefits' | 'activation'>('benefits');
  const [inviteCodeInput, setInviteCodeInput] = useState<string>('');
  const [inviteFeedback, setInviteFeedback] = useState<string>('');
  const [premiumRequest, setPremiumRequest] = useState<any>(null);
  const [isSubmittingPremiumRequest, setIsSubmittingPremiumRequest] = useState<boolean>(false);
  const [premiumRequestReason, setPremiumRequestReason] = useState<string>('');

  // Quick Action States
  const [showQuickLogModal, setShowQuickLogModal] = useState<boolean>(false);
  const [quickLogType, setQuickLogType] = useState<'income' | 'expense'>('expense');
  const [quickLogAmount, setQuickLogAmount] = useState<string>('');
  const [quickLogCategory, setQuickLogCategory] = useState<string>('');
  const [quickLogDescription, setQuickLogDescription] = useState<string>('');
  const [quickLogWallet, setQuickLogWallet] = useState<string>('Uang Cash');
  const [quickLogTags, setQuickLogTags] = useState<string>('');
  const [isQuickLogSaving, setIsQuickLogSaving] = useState<boolean>(false);
  const [quickLogMsg, setQuickLogMsg] = useState<string>('');

  const HARDCODED_INVITED_EMAILS = [
    'ahmadkhoirulmuna136@gmail.com',
    'admin@coinai.com'
  ];

  const isUserPremium = isPremium || isInvited || (auth.currentUser?.email?.toLowerCase() === 'ahmadkhoirulmuna136@gmail.com') || (auth.currentUser?.email ? HARDCODED_INVITED_EMAILS.map(e => e.toLowerCase()).includes(auth.currentUser.email.toLowerCase()) : false);

  const isUserPremiumOrInvited = isUserPremium;
  
  function checkIfPremiumOrInvitedSelf() {
    return isUserPremium;
  }
  const [isTabMenuOpen, setIsTabMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [activeNotifTab, setActiveNotifTab] = useState<'updates' | 'wallets'>('updates');
  const [readUpdateIds, setReadUpdateIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('coinai_read_updates');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [deletedUpdateIds, setDeletedUpdateIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('coinai_deleted_updates');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editPhotoURL, setEditPhotoURL] = useState('');
  const [profileUpdateLoading, setProfileUpdateLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileTrigger, setProfileTrigger] = useState(0);

  useEffect(() => {
    if (showAccountModal && auth.currentUser) {
      setEditDisplayName(auth.currentUser.displayName || '');
      setEditPhotoURL(auth.currentUser.photoURL || '');
      setIsEditingProfile(false);
      setProfileError('');
      setProfileSuccess('');
    }
  }, [showAccountModal, profileTrigger]);
  const [showToSModal, setShowToSModal] = useState(false);
  const [showFAQModal, setShowFAQModal] = useState(false);
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [showBudgetSettingsModal, setShowBudgetSettingsModal] = useState(false);
  const [showExportPdfModal, setShowExportPdfModal] = useState(false);
  const [faqOpenIndex, setFaqOpenIndex] = useState<number | null>(null);
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
          
          setSavingsTarget(docSnap.data().savingsTarget || 0);
          setSavingsInput(String(docSnap.data().savingsTarget || 0));
          
          setLeftoverTarget(docSnap.data().leftoverTarget || 0);
          setLeftoverInput(String(docSnap.data().leftoverTarget || 0));

          setCategoryBudgets(docSnap.data().categoryBudgets || {});
          
          setIsPremium(docSnap.data().isPremium || false);
          setIsInvited(docSnap.data().isInvited || false);

          // Background auto-sync for old invited users
          if (docSnap.data().isInvited && user.email) {
            try {
              const reqRef = doc(db, 'premium_requests', user.email.toLowerCase());
              getDoc(reqRef).then((reqSnap) => {
                if (!reqSnap.exists() || reqSnap.data().status !== 'approved') {
                  setDoc(reqRef, {
                    email: user.email!.toLowerCase(),
                    displayName: user.displayName || 'Akun Member',
                    status: 'approved',
                    reasonText: 'Auto-sync: Aktivasi Premium (Legacy)',
                    updatedAt: serverTimestamp()
                  }, { merge: true });

                  const pemRef = doc(db, 'premium_emails', user.email!.toLowerCase());
                  setDoc(pemRef, {
                    email: user.email!.toLowerCase(),
                    displayName: user.displayName || 'Akun Member',
                    grantedBy: 'Auto-sync: Legacy User',
                    grantedAt: serverTimestamp()
                  }, { merge: true });
                }
              }).catch(() => {});
            } catch (err) {}
          }

          const initialBals = docSnap.data().walletBalances || {};
          setWalletBalances(initialBals);
          setTempWalletBalances((prev) => ({
            ...prev,
            ...initialBals
          }));

          // Background Auto-Trigger Executor for Recurring Schedulers
          const processRecurringBackground = async (userId: string, currentBalancesSnapshot: Record<string, number>) => {
            try {
              const { getDocs, collection, query, addDoc, setDoc, doc } = await import('firebase/firestore');
              const templatesSnap = await getDocs(query(collection(db, `users/${userId}/recurring_templates`)));
              
              const now = new Date();
              let updatedBalances = { ...currentBalancesSnapshot };
              let hasChanges = false;
              
              for (const docSnap of templatesSnap.docs) {
                const item = docSnap.data();
                if (item.status !== 'active') continue;
                
                let nextTrigger = parseFirestoreDate(item.nextTriggeredDate);
                if (!nextTrigger) continue;
                
                let lastTrigger = item.lastTriggeredDate ? parseFirestoreDate(item.lastTriggeredDate) : null;
                let currentNext = new Date(nextTrigger);
                let wasTriggered = false;
                
                if (isNaN(currentNext.getTime())) continue;
                
                while (currentNext <= now) {
                  wasTriggered = true;
                  hasChanges = true;
                  
                  const txData = {
                    userId: userId,
                    type: item.type,
                    amount: item.amount,
                    category: item.category,
                    description: `(Otomatis) ${item.description || 'Transaksi Terjadwal'}`,
                    timestamp: new Date(currentNext),
                    walletSource: item.walletSource || 'Uang Cash',
                    createdAt: new Date(),
                    updatedAt: new Date()
                  };
                  
                  await addDoc(collection(db, `users/${userId}/transactions`), txData);
                  
                  if (item.walletSource) {
                    const amt = item.amount;
                    const diff = item.type === 'income' ? amt : -amt;
                    updatedBalances[item.walletSource] = (updatedBalances[item.walletSource] || 0) + diff;
                  }
                  
                  lastTrigger = new Date(currentNext);
                  currentNext = advanceInterval(currentNext, item.interval || 'monthly');
                }
                
                if (wasTriggered) {
                  await setDoc(doc(db, `users/${userId}/recurring_templates`, docSnap.id), {
                    lastTriggeredDate: lastTrigger,
                    nextTriggeredDate: currentNext,
                    updatedAt: new Date()
                  }, { merge: true });
                }
              }
              
              if (hasChanges) {
                await setDoc(doc(db, 'users', userId), {
                  walletBalances: updatedBalances,
                  updatedAt: new Date()
                }, { merge: true });
                
                setWalletBalances(updatedBalances);
                setTempWalletBalances((p) => ({ ...p, ...updatedBalances }));
              }
            } catch (err) {
              console.error('Failed to process recurring automatic triggers:', err);
            }
          };
          processRecurringBackground(user.uid, initialBals);
          
          const currentMonthStr = format(new Date(), 'yyyy-MM');
          if (docSnap.data().lastResetMonth === currentMonthStr) {
            setResetCount(docSnap.data().resetCount || 0);
          } else {
            setResetCount(0);
          }
          setLastResetMonth(docSnap.data().lastResetMonth || '');
        } else {
          // Initialize user doc if not exists
          await setDoc(userRef, {
            monthlyBudget: 0,
            isPremium: false,
            isInvited: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          setIsPremium(false);
          setIsInvited(false);
        }
      } catch (err: any) {
        if(err?.message?.includes('the client is offline')) {
          console.error("Firestore Error (offline):", err);
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
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        txData.push({
          id: docSnap.id,
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

    // Listen to real-time premium granting for this email
    const unsubPremium = user.email ? onSnapshot(doc(db, 'premium_emails', user.email.toLowerCase()), (snap) => {
      if (snap.exists()) {
        setIsPremium(true);
      } else {
        setIsPremium(false);
      }
    }, (err) => {
      // Ignore initial/offline permission errors before auth token syncs up
    }) : () => {};

    // Listen to real-time premium requests for this email
    const unsubReq = user.email ? onSnapshot(doc(db, 'premium_requests', user.email.toLowerCase()), (snap) => {
      if (snap.exists()) {
        setPremiumRequest(snap.data());
      } else {
        setPremiumRequest(null);
      }
    }, (err) => {
      // Ignore
    }) : () => {};

    return () => {
      unsubscribe();
      unsubPremium();
      unsubReq();
    };
  }, []);

  const handleSaveBudget = async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const dbDocRef = doc(db, 'users', user.uid);
      if (activeTargetTab === 'expense') {
        const val = Number(budgetInput);
        await setDoc(dbDocRef, { monthlyBudget: val, updatedAt: serverTimestamp() }, { merge: true });
        setBudget(val);
      } else if (activeTargetTab === 'savings') {
        const val = Number(savingsInput);
        await setDoc(dbDocRef, { savingsTarget: val, updatedAt: serverTimestamp() }, { merge: true });
        setSavingsTarget(val);
      } else if (activeTargetTab === 'leftover') {
        const val = Number(leftoverInput);
        await setDoc(dbDocRef, { leftoverTarget: val, updatedAt: serverTimestamp() }, { merge: true });
        setLeftoverTarget(val);
      }
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

  const handleSaveAllCategoryBudgets = async (newBudgets: Record<string, number>) => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), {
        categoryBudgets: newBudgets,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setCategoryBudgets(newBudgets);
    } catch (e) {
      try { handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`); } catch(err){}
    }
  };

  const handleSaveTotalBudget = async (amount: number) => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), {
        monthlyBudget: amount,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setBudget(amount);
      setBudgetInput(String(amount));
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
      await setDoc(userRef, {
        walletBalances: {
          [walletName]: increment(diff)
        }
      }, { merge: true });

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

  const AVATAR_PRESETS = [
    { name: 'Gradient Violet', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=150&q=80' },
    { name: 'Gold Abstract', url: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?auto=format&fit=crop&w=150&q=80' },
    { name: 'Cosmic Mesh', url: 'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?auto=format&fit=crop&w=150&q=80' },
    { name: 'Neon Pattern', url: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=150&q=80' },
    { name: 'Minimal Lines', url: 'https://images.unsplash.com/photo-1604871000636-074fa5117945?auto=format&fit=crop&w=150&q=80' },
    { name: 'Dark Pastel', url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=150&q=80' }
  ];

  const maskEmail = (email: string | null | undefined): string => {
    if (!email) return 'email@coinai.app';
    const parts = email.split('@');
    if (parts.length !== 2) return email;
    const username = parts[0];
    const domain = parts[1];
    if (username.length <= 2) {
      return `${username.charAt(0)}*@${domain}`;
    }
    const firstTwo = username.slice(0, 2);
    const lastOne = username.slice(-1);
    const maskedLength = username.length - 3;
    const stars = '*'.repeat(maskedLength > 0 ? maskedLength : 4);
    return `${firstTwo}${stars}${lastOne}@${domain}`;
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setProfileError('Ukuran gambar terlalu besar. Maksimal 5MB.');
        return;
      }
      
      setProfileError('');
      setProfileSuccess('Sedang memproses foto...');
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new window.Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          // Compress smoothly to 150x150px
          const canvas = document.createElement('canvas');
          canvas.width = 150;
          canvas.height = 150;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const minDim = Math.min(img.width, img.height);
            const sx = (img.width - minDim) / 2;
            const sy = (img.height - minDim) / 2;
            ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, 150, 150);
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.82);
            setEditPhotoURL(compressedBase64);
            setProfileSuccess('Foto berhasil dimuat!');
            setTimeout(() => setProfileSuccess(''), 2000);
          } else {
            setEditPhotoURL(event.target?.result as string);
            setProfileSuccess('Foto berhasil dimuat!');
            setTimeout(() => setProfileSuccess(''), 2000);
          }
        };
        img.onerror = () => {
          setProfileError('Gagal memuat file gambar.');
        };
      };
      reader.onerror = () => {
        setProfileError('Gagal membaca file gambar.');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    setProfileUpdateLoading(true);
    setProfileError('');
    setProfileSuccess('');

    try {
      await updateProfile(user, {
        displayName: editDisplayName.trim(),
        photoURL: editPhotoURL.trim()
      });

      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        displayName: editDisplayName.trim(),
        photoURL: editPhotoURL.trim()
      }, { merge: true });

      setProfileSuccess('Profil Anda berhasil diperperbaharui!');
      setTimeout(() => {
        setIsEditingProfile(false);
        setProfileTrigger(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Gagal memperbarui profil: ", err);
      setProfileError(err.message || 'Terjadi kesalahan saat menyimpan profil.');
    } finally {
      setProfileUpdateLoading(false);
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

  const handleUpgradeToPremiumSimulated = async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        isPremium: true
      }, { merge: true });
      setIsPremium(true);
      setInviteFeedback("Berhasil meningkatkan ke Premium! 🎉");
      setTimeout(() => {
        setShowPremiumModal(false);
        setInviteFeedback('');
      }, 2000);
    } catch (e: any) {
      console.error(e);
      setInviteFeedback("Gagal memperbarui database. Coba lagi.");
    }
  };

  const handleApplyInviteCode = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const code = inviteCodeInput.trim().toUpperCase();
    if (!code) {
      setInviteFeedback("Masukkan kode undangan terlebih dahulu.");
      return;
    }
    
    // Valid invite codes
    const VALID_CODES = ['COINAI-PREMIUM', 'COINAI-2026', 'COINAI-INVITE', 'SPESIAL-PREMIUM-2026'];
    
    let isValid = false;
    let isSingleUse = false;

    if (VALID_CODES.includes(code)) {
      isValid = true;
    } else {
      try {
        const codeRef = doc(db, 'invite_codes', code);
        const codeSnap = await getDoc(codeRef);
        if (codeSnap.exists()) {
          const codeData = codeSnap.data();
          if (!codeData.used) {
            const now = new Date();
            const expiresAt = codeData.expiresAt?.toDate ? codeData.expiresAt.toDate() : (codeData.expiresAt ? new Date(codeData.expiresAt) : null);
            if (expiresAt && now <= expiresAt) {
              isValid = true;
              isSingleUse = true;
            } else {
              setInviteFeedback("Kode undangan sudah kedaluwarsa! ❌");
              return;
            }
          } else {
            setInviteFeedback("Kode undangan sudah pernah digunakan! ❌");
            return;
          }
        } else {
          setInviteFeedback("Kode undangan tidak valid! ❌");
          return;
        }
      } catch (err: any) {
        console.error(err);
        setInviteFeedback("Gagal memverifikasi kode undangan.");
        return;
      }
    }

    if (isValid) {
      try {
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, {
          isInvited: true,
          email: user.email || '',
          displayName: user.displayName || 'Akun Member',
          updatedAt: serverTimestamp()
        }, { merge: true });
        
        if (isSingleUse) {
          const codeRef = doc(db, 'invite_codes', code);
          await setDoc(codeRef, {
            used: true,
            usedBy: user.email || user.uid,
            usedAt: new Date()
          }, { merge: true });
        }

        if (user.email) {
          const reqRef = doc(db, 'premium_requests', user.email.toLowerCase());
          await setDoc(reqRef, {
            email: user.email.toLowerCase(),
            displayName: user.displayName || 'Akun Member',
            status: 'approved',
            reasonText: `Self-Activation via Invite Code: ${code}`,
            updatedAt: serverTimestamp()
          }, { merge: true });

          const pemRef = doc(db, 'premium_emails', user.email.toLowerCase());
          await setDoc(pemRef, {
            email: user.email.toLowerCase(),
            displayName: user.displayName || 'Akun Member',
            grantedBy: `Invite Code: ${code}`,
            grantedAt: serverTimestamp()
          }, { merge: true });
        }

        setIsInvited(true);
        setInviteFeedback("Disetujui! Kode undangan terverifikasi. 🎉");
        setTimeout(() => {
          setShowPremiumModal(false);
          setInviteFeedback('');
          setInviteCodeInput('');
        }, 1500);
      } catch (e: any) {
        console.error(e);
        setInviteFeedback("Terjadi kesalahan sistem.");
      }
    }
  };


  const handleSubmitPremiumRequest = async (reasonText: string) => {
    const user = auth.currentUser;
    if (!user || !user.email) return;

    setIsSubmittingPremiumRequest(true);
    setInviteFeedback('');
    try {
      await setDoc(doc(db, 'premium_requests', user.email.toLowerCase()), {
        email: user.email.toLowerCase(),
        displayName: user.displayName || user.email.split('@')[0],
        requestedAt: serverTimestamp(),
        status: 'pending',
        reasonText: reasonText || 'Pengajuan akses premium dari aplikasi',
        updatedAt: serverTimestamp()
      });
      setInviteFeedback('Pengajuan Premium Berhasil Dikirimkan! Tim Admin kami sedang meninjau permintaan Anda.');
      setPremiumRequestReason('');
    } catch (err: any) {
      console.error(err);
      setInviteFeedback(`Gagal mengirim pengajuan: ${err.message || err}`);
    } finally {
      setIsSubmittingPremiumRequest(false);
    }
  };

  const handleOpenPdfModal = () => {
    if (isUserPremium) {
      setActiveTab('export_pdf');
    } else {
      setInviteFeedback('Fitur Ekspor PDF Berdesain Formal & Segel Digital Khusus untuk Anggota Premium.');
      setShowPremiumModal(true);
    }
  };

  const handleOpenQuickLog = (type: 'income' | 'expense') => {
    setQuickLogType(type);
    setQuickLogAmount('');
    setQuickLogCategory('');
    setQuickLogDescription('');
    setQuickLogWallet('Uang Cash');
    setQuickLogTags('');
    setQuickLogMsg('');
    setShowQuickLogModal(true);
  };

  const handleSaveQuickLog = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const amt = Number(quickLogAmount);
    if (!quickLogAmount || isNaN(amt) || amt <= 0) {
      setQuickLogMsg("Jumlah nominal harus valid & lebih dari 0!");
      return;
    }

    if (!quickLogCategory) {
      setQuickLogMsg("Silakan tentukan kategori transaksi!");
      return;
    }

    setIsQuickLogSaving(true);
    setQuickLogMsg("");

    try {
      const isUnknownWallet = quickLogWallet === 'unknown';
      const tagArray = quickLogTags
        ? quickLogTags.split(',').map(tag => tag.trim()).filter(Boolean)
        : [];

      const txData = {
        userId: user.uid,
        type: quickLogType,
        amount: amt,
        category: quickLogCategory,
        description: quickLogDescription.trim(),
        timestamp: new Date(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        tags: tagArray,
        ...(isUnknownWallet ? { needsWalletAssignment: true } : { walletSource: quickLogWallet })
      };

      await addDoc(collection(db, `users/${user.uid}/transactions`), txData);

      if (!isUnknownWallet) {
        const diff = quickLogType === 'income' ? amt : -amt;
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, {
          walletBalances: {
            [quickLogWallet]: increment(diff)
          }
        }, { merge: true });
      }

      setShowQuickLogModal(false);
      setQuickLogAmount('');
      setQuickLogCategory('');
      setQuickLogDescription('');
      setQuickLogTags('');
    } catch (err: any) {
      console.error("Error logging transaction via Quick Actions:", err);
      setQuickLogMsg("Gagal menyimpan transaksi: " + (err.message || String(err)));
    } finally {
      setIsQuickLogSaving(false);
    }
  };

  const pendingWallets = transactions.filter(t => t.needsWalletAssignment);
  const visibleSystemUpdates = SYSTEM_UPDATES.filter(update => !deletedUpdateIds.includes(update.id));
  const unreadSystemUpdates = visibleSystemUpdates.filter(update => !readUpdateIds.includes(update.id));
  const hasUnreadNotifications = pendingWallets.length > 0 || unreadSystemUpdates.length > 0;

  const handleMarkAllUpdatesRead = () => {
    const allIds = visibleSystemUpdates.map(u => u.id);
    const updated = Array.from(new Set([...readUpdateIds, ...allIds]));
    setReadUpdateIds(updated);
    try {
      localStorage.setItem('coinai_read_updates', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteAllReadUpdates = () => {
    const readIds = visibleSystemUpdates.filter(u => readUpdateIds.includes(u.id)).map(u => u.id);
    const updated = Array.from(new Set([...deletedUpdateIds, ...readIds]));
    setDeletedUpdateIds(updated);
    try {
      localStorage.setItem('coinai_deleted_updates', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteSingleUpdate = (id: string) => {
    const updated = Array.from(new Set([...deletedUpdateIds, id]));
    setDeletedUpdateIds(updated);
    try {
      localStorage.setItem('coinai_deleted_updates', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

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

  if (activeTab === 'export_pdf') {
    return (
      <ExportPdfModal
        isOpen={true}
        onClose={() => setActiveTab('overview')}
        transactions={transactions}
        userEmail={auth.currentUser?.email}
        userDisplayName={auth.currentUser?.displayName}
        isFullScreenMode={true}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-slate-100 font-sans relative flex flex-col">
      {/* Mesh Gradient Background Decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 rounded-full blur-[120px]"></div>
      </div>

      {isTabMenuOpen && (
        <div className="fixed inset-0 z-[100] flex">
          <div 
            className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" 
            onClick={() => setIsTabMenuOpen(false)}
          />
          <div className="relative w-[280px] sm:w-[320px] bg-white dark:bg-[#0f172a] shadow-2xl border-r border-slate-200 dark:border-white/10 flex flex-col animate-in slide-in-from-left duration-300">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <Wallet className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-lg tracking-tight dark:text-white text-slate-900">CoinAI Flow</span>
              </div>
              <button onClick={() => setIsTabMenuOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-1">
              <p className="text-[10px] font-bold text-slate-400 px-3 pb-2 uppercase tracking-wider">Navigasi Utama</p>
              
              <button 
                onClick={() => { setActiveTab('overview'); setIsTabMenuOpen(false); }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${activeTab === 'overview' ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'}`}
              >
                <LayoutDashboard className="w-4 h-4" /> Ringkasan
              </button>
              <button 
                onClick={() => { setActiveTab('ai_chat'); setIsTabMenuOpen(false); }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${activeTab === 'ai_chat' ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'}`}
              >
                <Sparkles className={`w-4 h-4 ${activeTab === 'ai_chat' ? 'text-amber-500 animate-pulse' : 'text-indigo-500'}`} /> Chat Logger AI
              </button>
              <button 
                onClick={() => { setActiveTab('monthly'); setIsTabMenuOpen(false); }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${activeTab === 'monthly' ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'}`}
              >
                <CalendarIcon className="w-4 h-4" /> Bulanan
              </button>
              <button 
                onClick={() => { setActiveTab('all_transactions'); setIsTabMenuOpen(false); }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${activeTab === 'all_transactions' ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'}`}
              >
                <List className="w-4 h-4" /> Riwayat
              </button>
              <button 
                onClick={() => { setActiveTab('debts'); setIsTabMenuOpen(false); }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${activeTab === 'debts' ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'}`}
              >
                <FileText className="w-4 h-4" /> Utang & Piutang
              </button>
              <button 
                onClick={() => { setActiveTab('recurring'); setIsTabMenuOpen(false); }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${activeTab === 'recurring' ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'}`}
              >
                <CalendarIcon className="w-4 h-4" /> Transaksi Berulang
              </button>
              <button 
                onClick={() => { setActiveTab('portfolio'); setIsTabMenuOpen(false); }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${activeTab === 'portfolio' ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'}`}
              >
                <TrendingUp className="w-4 h-4" /> Portofolio
              </button>
              <button 
                onClick={() => { setActiveTab('currencies'); setIsTabMenuOpen(false); }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${activeTab === 'currencies' ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'}`}
              >
                <Globe className="w-4 h-4" /> Pasar Global
              </button>

              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5 space-y-1">
                <p className="text-[10px] font-bold text-slate-400 px-3 pb-2 uppercase tracking-wider">Akses Cepat</p>
                {isUserPremiumOrInvited ? (
                  <button
                    onClick={() => { setIsTabMenuOpen(false); setShowPremiumModal(true); }}
                    className="w-full flex items-center justify-between px-3 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl transition-colors font-semibold text-sm border border-amber-500/20"
                  >
                    <span className="flex items-center gap-3"><Sparkles className="w-4 h-4" /> Premium Aktif</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider">Kelola</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setIsTabMenuOpen(false);
                      setInviteFeedback('');
                      setInviteCodeInput('');
                      setShowPremiumModal(true);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 rounded-xl text-sm font-bold transition-all shadow-sm"
                  >
                    <span className="w-4 h-4 flex items-center justify-center">👑</span> Upgrade ke Premium
                  </button>
                )}

                <button
                  onClick={() => { setIsTabMenuOpen(false); setShowFAQModal(true); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors mt-2"
                >
                  <HelpCircle className="w-4 h-4 text-emerald-500" /> FAQ & Cara Kerja
                </button>
              </div>

              {auth.currentUser?.email?.toLowerCase() === 'ahmadkhoirulmuna136@gmail.com' && (
                <button 
                  onClick={() => { setActiveTab('admin'); setIsTabMenuOpen(false); }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors mt-2 border-t border-slate-100 dark:border-white/5 pt-3 ${activeTab === 'admin' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'}`}
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-500" /> Admin Panel
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <header className="bg-white dark:bg-white/5 backdrop-blur-xl border-b border-slate-200 dark:border-white/10 shadow-sm sticky top-0 z-[60]">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4 flex justify-between items-center sm:px-6 lg:px-8 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 text-slate-900 dark:text-white relative shrink-0">
            <button
               onClick={() => setIsTabMenuOpen(!isTabMenuOpen)}
               className="p-1 sm:p-2 -ml-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl dark:text-slate-400 dark:hover:text-white transition-colors"
               title="Menu"
             >
               <Menu className="w-5 h-5" />
             </button>
             
             <div className="w-8 h-8 sm:w-10 sm:h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
               <Wallet className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
             </div>
             <div className="flex flex-col">
               <span className="font-bold text-base sm:text-xl tracking-tight leading-tight dark:text-slate-900 dark:text-white text-slate-900">CoinAI Flow</span>
               <span className="text-[9px] sm:text-[10px] font-medium text-slate-500 dark:text-slate-400">by akm</span>
             </div>
          </div>
          <div className="relative flex items-center gap-1 sm:gap-2">
            {/* Upgrade to Premium CTA Button / Active Premium Badge */}
            {isUserPremiumOrInvited ? (
              <button
                onClick={() => setShowPremiumModal(true)}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-xl text-[10px] sm:text-xs font-bold transition-all shrink-0"
                title="Lihat Detail Paket Premium Anda"
                id="header-premium-active-badge"
              >
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-amber-500 rounded-full animate-pulse"></span>
                <span>👑 <span className="hidden sm:inline">Premium </span>Aktif</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setInviteFeedback('');
                  setInviteCodeInput('');
                  setShowPremiumModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 rounded-xl text-[10px] sm:text-xs font-extrabold transition-all shadow-md active:scale-95 duration-200 shrink-0"
                title="Tingkatkan ke Premium"
                id="header-upgrade-premium-cta"
              >
                <span>👑 <span className="hidden sm:inline">Upgrade ke </span>Premium</span>
              </button>
            )}

            <div className="relative">
              <button
                onClick={() => setIsCSMenuOpen(!isCSMenuOpen)}
                className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full dark:text-slate-400 dark:hover:text-white transition-colors relative"
                title="Customer Service"
              >
                <Headset className="w-5 h-5" />
              </button>

              {isCSMenuOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setIsCSMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#1e293b] shadow-xl rounded-2xl border border-slate-200 dark:border-white/10 flex flex-col p-2 gap-1 z-50">
                    <a 
                      href="https://wa.me/628971477555" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 rounded-xl transition-colors"
                      onClick={() => setIsCSMenuOpen(false)}
                    >
                       <MessageCircle className="w-4 h-4 text-emerald-500" />
                       WhatsApp
                    </a>
                    <a 
                      href="https://www.instagram.com/akm_official.013/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 rounded-xl transition-colors"
                      onClick={() => setIsCSMenuOpen(false)}
                    >
                       <Instagram className="w-4 h-4 text-pink-500" />
                       Instagram
                    </a>
                    <button
                      onClick={() => {
                        setIsCSMenuOpen(false);
                        setActiveTab('live_chat');
                      }}
                      className="flex items-center gap-3 px-3 py-2.5 text-sm w-full text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 rounded-xl transition-colors"
                    >
                       <Headset className="w-4 h-4 text-indigo-500" />
                       Live Chat
                    </button>
                    <button
                      onClick={() => {
                        setIsCSMenuOpen(false);
                        setShowDonationModal(true);
                      }}
                      className="flex items-center gap-3 px-3 py-2.5 text-sm w-full text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 rounded-xl transition-colors"
                    >
                       <Heart className="w-4 h-4 text-rose-500 animate-pulse" />
                       Donasi Maker
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full dark:text-slate-400 dark:hover:text-white transition-colors relative"
                title="Notifikasi"
              >
                <Bell className="w-5 h-5" />
                {hasUnreadNotifications && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-indigo-500 rounded-full border-2 border-white dark:border-[#0f172a] animate-pulse"></span>
                )}
              </button>
              
              {isNotificationsOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setIsNotificationsOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-[340px] bg-white dark:bg-[#1e293b] shadow-2xl rounded-2xl border border-slate-200 dark:border-white/10 flex flex-col p-3 z-50">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-2 mb-2">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white px-1">Notifikasi</h4>
                      {activeNotifTab === 'updates' && (
                        <div className="flex items-center gap-2">
                          {unreadSystemUpdates.length > 0 && (
                            <button 
                              onClick={handleMarkAllUpdatesRead}
                              className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                            >
                              Tandai Semua Terbaca
                            </button>
                          )}
                          {visibleSystemUpdates.some(u => readUpdateIds.includes(u.id)) && (
                            <button 
                              onClick={handleDeleteAllReadUpdates}
                              className="text-[10px] text-rose-500 font-bold hover:underline"
                              title="Hapus pembaruan yang sudah dibaca"
                            >
                              Hapus yg Dibaca
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Tabs bar */}
                    <div className="grid grid-cols-2 bg-slate-100 dark:bg-white/5 p-1 rounded-xl mb-3">
                      <button
                        onClick={() => setActiveNotifTab('updates')}
                        className={`text-xs font-semibold py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 relative ${activeNotifTab === 'updates' ? 'bg-white dark:bg-slate-800 text-indigo-655 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-355'}`}
                      >
                        Pembaruan Web
                        {unreadSystemUpdates.length > 0 && (
                          <span className="px-1.5 py-0.5 text-[8px] font-extrabold bg-indigo-600 text-white rounded-full">
                            {unreadSystemUpdates.length}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => setActiveNotifTab('wallets')}
                        className={`text-xs font-semibold py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 relative ${activeNotifTab === 'wallets' ? 'bg-white dark:bg-slate-800 text-indigo-655 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-355'}`}
                      >
                        Transaksi
                        {pendingWallets.length > 0 && (
                          <span className="px-1.5 py-0.5 text-[8px] font-extrabold bg-rose-600 text-white rounded-full">
                            {pendingWallets.length}
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Tab contents */}
                    {activeNotifTab === 'updates' ? (
                      <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                        {visibleSystemUpdates.length > 0 ? (
                          visibleSystemUpdates.map((update) => {
                            const isUnread = !readUpdateIds.includes(update.id);
                            return (
                              <div
                                key={update.id}
                                onClick={() => {
                                  if (isUnread) {
                                    const updated = [...readUpdateIds, update.id];
                                    setReadUpdateIds(updated);
                                    localStorage.setItem('coinai_read_updates', JSON.stringify(updated));
                                  }
                                }}
                                className={`text-left p-2.5 rounded-xl border transition-all relative flex gap-2.5 items-start cursor-pointer group ${isUnread ? 'bg-indigo-50/20 dark:bg-indigo-500/5 border-indigo-150 dark:border-indigo-500/20 shadow-sm' : 'bg-slate-50/50 dark:bg-white/0 border-slate-150 dark:border-white/5 opacity-80'}`}
                              >
                                <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${update.type === 'addition' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : update.type === 'reduction' ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600' : update.type === 'improvement' ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'bg-blue-50 dark:bg-blue-500/10 text-blue-600'}`}>
                                  {update.type === 'addition' ? <PlusCircle className="w-3.5 h-3.5" /> : update.type === 'reduction' ? <MinusCircle className="w-3.5 h-3.5" /> : update.type === 'improvement' ? <Sparkles className="w-3.5 h-3.5" /> : <Info className="w-3.5 h-3.5" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-1">
                                    <h5 className="text-[11px] font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 truncate">
                                      {update.title}
                                      {isUnread && <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full shrink-0"></span>}
                                    </h5>
                                    <span className="text-[9px] text-slate-400 shrink-0">{update.timestamp}</span>
                                  </div>
                                  <p className="text-[10px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                                    {update.description}
                                  </p>
                                </div>

                                {/* Individual Delete button for read update */}
                                {!isUnread && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteSingleUpdate(update.id);
                                    }}
                                    className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-md transition-colors shrink-0 self-center md:opacity-0 group-hover:opacity-100 focus:opacity-100"
                                    title="Hapus pemberitahuan ini"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-center py-8 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                            <Check className="w-8 h-8 text-emerald-500 bg-emerald-500/10 p-1.5 rounded-full mb-2" />
                            <p className="text-xs font-semibold">Semua pembaruan bersih!</p>
                            <p className="text-[10px]">Anda selalu up-to-date.</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                        {pendingWallets.length > 0 ? (
                          pendingWallets.map(tx => (
                            <button
                              key={tx.id}
                              onClick={() => {
                                setSelectedTxForWallet(tx);
                                setIsNotificationsOpen(false);
                              }}
                              className="text-left bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 p-3 rounded-xl transition-colors border border-slate-200 dark:border-white/5"
                            >
                              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 mb-1 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                Tentukan dompet/bank
                              </p>
                              <p className="text-sm text-slate-900 dark:text-white truncate">{tx.description || tx.category}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                {format(tx.timestamp, 'dd MMM yyyy')} • {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(tx.amount))}
                              </p>
                            </button>
                          ))
                        ) : (
                          <div className="text-center py-6 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                            <Check className="w-8 h-8 text-emerald-500 bg-emerald-500/10 p-1.5 rounded-full mb-2" />
                            <p className="text-xs font-medium">Semua transaksi aman!</p>
                            <p className="text-[10px]">Tidak ada transaksi bermasalah/perlu dompet.</p>
                          </div>
                        )}
                      </div>
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
                  <div className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-[#1e293b] shadow-xl rounded-2xl border border-slate-200 dark:border-white/10 flex flex-col p-2 gap-1 z-50">
                    <button
                      onClick={() => { setIsSettingsOpen(false); setShowAccountModal(true); }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10 rounded-xl transition-colors font-medium border-b border-slate-100 dark:border-white/5 pb-2"
                    >
                      <User className="w-4 h-4 text-indigo-500" />
                      <span>Akun Saya</span>
                    </button>
                    <button
                      onClick={() => { setIsSettingsOpen(false); setShowToSModal(true); }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10 rounded-xl transition-colors font-medium"
                    >
                      <ShieldCheck className="w-4 h-4 text-[#10b981]" />
                      <span>Ketentuan Layanan</span>
                    </button>
                    <button
                      onClick={() => { setIsSettingsOpen(false); setShowFAQModal(true); }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10 rounded-xl transition-colors font-medium border-b border-slate-100 dark:border-white/5 pb-2"
                    >
                      <HelpCircle className="w-4 h-4 text-amber-500" />
                      <span>FAQ & Cara Kerja</span>
                    </button>
                    <button
                      onClick={() => { setIsSettingsOpen(false); setIsDarkMode(!isDarkMode); }}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10 rounded-xl transition-colors font-medium"
                    >
                      <span className="flex items-center gap-3">
                        {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-500" />}
                        <span>Mode Layar</span>
                      </span>
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
      
      <main className="max-w-7xl w-full mx-auto px-4 py-4 sm:py-8 sm:px-6 lg:px-8 space-y-4 sm:space-y-6 flex-1 flex flex-col relative text-[inherit]">
        
        {/* Header / Stats Bar */}
        <header className="flex flex-row justify-between items-end gap-4 mb-2 sm:mb-4 relative z-50">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">Halo!</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Teman Keuangan Cerdas Anda</p>
          </div>
          
          <div className="hidden lg:flex gap-4 items-center">
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

        {/* Reset Confirmation Dialog is rendered at global layer down below */}

        {/* Tab Navigation moved to hamburger menu in header */}

        {activeTab === 'overview' ? (
          <>
            {/* Simple Export Banner */}
            <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-3 sm:p-4 mb-4 sm:mb-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl text-indigo-600 dark:text-indigo-400 shrink-0">
                  <FileDown className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-white text-sm">Laporan Keuangan</h3>
                  <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">Cetak laporan PDF/Excel kustom.</p>
                </div>
              </div>
              <button
                onClick={handleOpenPdfModal}
                className="w-full sm:w-auto px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-bold rounded-xl transition-colors text-xs sm:text-sm flex items-center justify-center gap-2 shrink-0"
                id="overview-top-export-pdf-banner-btn"
              >
                Buat Laporan
              </button>
            </div>

            {/* Top Highlights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
           <div className="bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
              <div className="flex justify-between items-center mb-1">
                 <p className="text-slate-500 dark:text-slate-400 text-sm">Total Saldo</p>
                 <button onClick={handleOpenWalletModal} title="Kelola Saldo E-Wallet & Bank" className="text-slate-900 dark:text-white hover:text-emerald-400 focus:outline-none bg-white dark:bg-white/5 hover:bg-emerald-400/20 p-1.5 rounded-full transition-colors">
                     <Wallet className="w-4 h-4" />
                 </button>
              </div>
              <div>
                 <div className="flex justify-between items-end">
                    <h2 className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatIDR(currentBalance)}</h2>
                 </div>
              </div>
              <div className="flex gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-white/5">
                <div className="flex-1">
                   <p className="text-[9px] sm:text-[10px] text-slate-500">Cash</p>
                   <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{formatIDR(cashTotal)}</p>
                </div>
                <div className="flex-1">
                   <p className="text-[9px] sm:text-[10px] text-slate-500">E-Wallet</p>
                   <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{formatIDR(ewalletTotal)}</p>
                </div>
                <div className="flex-1">
                   <p className="text-[9px] sm:text-[10px] text-slate-500">Bank</p>
                   <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{formatIDR(bankTotal)}</p>
                </div>
              </div>
           </div>
           
           <div className="bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-sm">
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">Pengeluaran Bulan Ini</p>
              <div className="flex justify-between items-end">
                 <h2 className="text-xl sm:text-2xl font-bold text-rose-600 dark:text-rose-400">{formatIDR(totalExpense)}</h2>
              </div>
           </div>

           <div className="bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-sm overflow-hidden">
              <div className="flex justify-between items-center mb-2">
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Target Bulanan</p>
                <button 
                  onClick={() => setShowBudgetSettingsModal(true)} 
                  title="Atur Batas Anggaran Kategori" 
                  className="text-indigo-600 dark:text-indigo-400 hover:bg-slate-100 dark:hover:bg-white/10 p-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold shrink-0"
                >
                  <Settings className="w-3.5 h-3.5" />
                  Atur Limit
                </button>
              </div>
              <div className="flex space-x-2 mb-3">
                <button
                  onClick={() => setActiveTargetTab('expense')}
                  className={`text-xs px-2 py-1 rounded transition-colors ${activeTargetTab === 'expense' ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-medium' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                >
                  Pengeluaran
                </button>
                <button
                  onClick={() => setActiveTargetTab('leftover')}
                  className={`text-xs px-2 py-1 rounded transition-colors ${activeTargetTab === 'leftover' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                >
                  Sisa
                </button>
                <button
                  onClick={() => setActiveTargetTab('savings')}
                  className={`text-xs px-2 py-1 rounded transition-colors ${activeTargetTab === 'savings' ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-medium' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                >
                  Tabungan
                </button>
              </div>
              
              <div>
                 {isEditingBudget ? (
                   <div className="flex items-center gap-2">
                     <input 
                       type="number" 
                       value={activeTargetTab === 'expense' ? budgetInput : activeTargetTab === 'leftover' ? leftoverInput : savingsInput}
                       onChange={(e) => {
                         if (activeTargetTab === 'expense') setBudgetInput(e.target.value);
                         else if (activeTargetTab === 'leftover') setLeftoverInput(e.target.value);
                         else setSavingsInput(e.target.value);
                       }}
                       className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm outline-none text-slate-900 dark:text-white focus:border-indigo-500"
                     />
                     <button onClick={handleSaveBudget} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-slate-900 dark:text-white px-3 py-2 rounded-lg font-medium transition-colors">Simpan</button>
                   </div>
                 ) : (
                   <div className="flex justify-between items-end">
                     <h2 className={`text-xl md:text-2xl font-bold cursor-pointer ${
                       activeTargetTab === 'expense' ? 'text-rose-500 dark:text-rose-400' :
                       activeTargetTab === 'leftover' ? 'text-emerald-500 dark:text-emerald-400' :
                       'text-blue-500 dark:text-blue-400'
                     }`} onClick={() => setIsEditingBudget(true)}>
                       {formatIDR(activeTargetTab === 'expense' ? budget : activeTargetTab === 'leftover' ? leftoverTarget : savingsTarget)} 
                       <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-400/10 px-2 py-0.5 rounded-full ml-2 align-middle">Edit</span>
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
          onOpenSettings={() => setShowBudgetSettingsModal(true)}
        />

        {/* Quick Actions Panel */}
        <div className="bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-5 bg-gradient-to-b from-indigo-500 to-purple-600 rounded-full" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">⚡ Aksi Cepat / Quick Actions</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Log Income Button */}
            <button
               onClick={() => handleOpenQuickLog('income')}
               className="p-4 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 hover:from-emerald-500/15 hover:to-teal-500/10 border border-emerald-500/20 hover:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded-2xl flex flex-col items-center justify-center gap-2 text-center transition-all group active:scale-[0.98]"
               id="quick-log-income-btn"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-lg border border-emerald-500/20 group-hover:scale-110 transition-transform">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-sm sm:text-base">Catat Pemasukan</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Log Income secara Instan</p>
              </div>
            </button>

            {/* Log Expense Button */}
            <button
              onClick={() => handleOpenQuickLog('expense')}
              className="p-4 bg-gradient-to-br from-rose-500/10 to-pink-500/5 hover:from-rose-500/15 hover:to-pink-500/10 border border-rose-500/20 hover:border-rose-500/30 text-rose-600 dark:text-rose-400 rounded-2xl flex flex-col items-center justify-center gap-2 text-center transition-all group active:scale-[0.98]"
              id="quick-log-expense-btn"
            >
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold text-lg border border-rose-500/20 group-hover:scale-110 transition-transform">
                <TrendingDown className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-sm sm:text-base">Catat Pengeluaran</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Log Expense secara Instan</p>
              </div>
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-6 flex-1 mb-20">
           {/* Chart Section */}
           <div className="space-y-6 flex flex-col">
              {/* Spending Chart */}
              <SpendingChart transactions={transactions} />

              {/* Charts */}
              <Charts transactions={transactions} walletBalances={walletBalances} />
              
              {/* Transactions List */}
              <div className="bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl flex flex-col h-full">
                <div className="p-5 border-b border-slate-200 dark:border-white/10 flex justify-between items-center">
                   <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                     Riwayat Terakhir <span className="text-xs font-normal text-slate-500 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-full">10 Transaksi</span>
                   </h2>
                   <button 
                     onClick={() => setActiveTab('all_transactions')}
                     className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                   >
                     Lihat Riwayat
                   </button>
                </div>
                <div className="p-5">
                   <TransactionList transactions={transactions.slice(0, 10)} userId={auth.currentUser?.uid || ''} />
                </div>
              </div>
           </div>
        </div>
          </>
        ) : activeTab === 'all_transactions' ? (
          <div className="flex-1 mb-20 bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
              <List className="w-5 h-5 text-indigo-500" />
              Riwayat Transaksi
            </h2>
            <TransactionList transactions={transactions} userId={auth.currentUser?.uid || ''} />
          </div>
        ) : activeTab === 'ai_chat' ? (
          <AIChatLogger onNavigate={(tab) => setActiveTab(tab as any)} transactions={transactions} />
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
        ) : activeTab === 'recurring' ? (
          <RecurringManager walletBalances={walletBalances} />
        ) : activeTab === 'admin' ? (
          <AdminPanel />
        ) : activeTab === 'live_chat' ? (
          <div className="flex-1 mb-20">
            <SupportChat />
          </div>
        ) : (
          <div className="flex-1">
            <DebtManager />
          </div>
        )}
               {(activeTab === 'overview' || activeTab === 'debts') && 
         !showResetDialog && 
         !showWalletModal && 
         !selectedTxForWallet && 
         !showAccountModal && 
         !showToSModal && 
         !showFAQModal && (
          <AIChatInput existingTransactions={transactions} onNavigate={(tab) => setActiveTab(tab as any)} />
        )}
        
        {/* Footer */}
        <footer className="mt-8 text-center text-xs font-medium text-slate-500 dark:text-slate-400 py-4 border-t border-slate-200 dark:border-white/10 w-full shrink-0 animate-none z-10 relative">
          copyright by akm 2026
        </footer>
      </main>

      {/* Global Modals overlaying on top of both header and main (z-[100] with backdrop blur) */}
      {showResetDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 p-6 rounded-3xl max-w-md w-full flex flex-col relative overflow-hidden">
             <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
               <Target className="w-24 h-24 text-rose-500" />
             </div>
             <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 relative">Peringatan Riset Data</h3>
             <p className="text-slate-600 dark:text-slate-300 text-sm mb-4 relative">
               Anda yakin ingin menghapus <strong>semua data transaksi bulan ini</strong>? Saldo dan riwayat bulan ini akan kembali menjadi 0.
             </p>
             <div className="bg-rose-500/10 text-rose-400 p-3 rounded-xl border border-rose-500/20 text-sm mb-6 flex items-start gap-2 relative">
               <Target className="w-5 h-5 flex-shrink-0" />
               Sisa jatah riset bulan ini: <strong>{3 - resetCount} kali</strong>
             </div>
             
             <div className="flex gap-3 justify-end relative">
               <button 
                 onClick={() => setShowResetDialog(false)} 
                 className="px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-330 hover:text-slate-900 dark:text-white transition-colors"
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

      {showWalletModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
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
                type="button"
                onClick={() => setActiveWalletTab('cash')}
                className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${activeWalletTab === 'cash' ? 'bg-white dark:bg-[#1e293b] text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              >
                Cash
              </button>
              <button
                type="button"
                onClick={() => setActiveWalletTab('ewallet')}
                className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${activeWalletTab === 'ewallet' ? 'bg-white dark:bg-[#1e293b] text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              >
                E-Wallet
              </button>
              <button
                type="button"
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
                type="button"
                onClick={() => setShowWalletModal(false)}
                className="flex-1 px-4 py-3 bg-slate-100 dark:bg-white/5 text-slate-705 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveWalletBalances}
                className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedTxForWallet && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
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
                <button type="button" onClick={() => handleAssignWalletToTx(selectedTxForWallet.id, 'Uang Cash')} className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 mb-1 font-medium">Uang Cash</button>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2 font-medium">E-Wallet</h4>
                <div className="grid grid-cols-2 gap-2">
                  {['GoPay', 'DANA', 'OVO', 'ShopeePay', 'LinkAja'].map(wallet => (
                    <button type="button" key={wallet} onClick={() => handleAssignWalletToTx(selectedTxForWallet.id, wallet)} className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 text-center font-medium">{wallet}</button>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2 font-medium">Bank</h4>
                <div className="grid grid-cols-2 gap-2">
                  {['BCA', 'Mandiri', 'BNI', 'BRI', 'SeaBank', 'BSI', 'Jago', 'Lainnya'].map(wallet => (
                    <button type="button" key={wallet} onClick={() => handleAssignWalletToTx(selectedTxForWallet.id, wallet)} className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 text-center font-medium">{wallet}</button>
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

      {showAccountModal && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#1e293b] rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-white/10 relative flex flex-col gap-5 animate-in zoom-in-95 duration-250">
            <button
              onClick={() => setShowAccountModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors z-[110]"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>

            {isEditingProfile ? (
              <form onSubmit={handleUpdateProfile} className="flex flex-col gap-4 pt-4 dark:text-white">
                <div className="text-center">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Ubah Profil Saya</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Atur nama tampilan dan foto profil kustom Anda</p>
                </div>

                {profileSuccess && (
                  <div className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-xs px-3 py-2 rounded-xl text-center font-medium animate-in fade-in duration-200">
                    {profileSuccess}
                  </div>
                )}
                {profileError && (
                  <div className="bg-rose-500/10 text-rose-500 border border-rose-500/20 text-xs px-3 py-2 rounded-xl text-center font-medium animate-in fade-in duration-200">
                    {profileError}
                  </div>
                )}

                <div className="flex flex-col items-center gap-3">
                  <div 
                    className="relative group cursor-pointer" 
                    title="Klik untuk mengubah foto profil"
                    onClick={() => document.getElementById('avatar-file-upload')?.click()}
                  >
                    {editPhotoURL ? (
                      <img
                        src={editPhotoURL}
                        alt="Pratinjau Foto"
                        referrerPolicy="no-referrer"
                        className="w-20 h-20 rounded-full border-4 border-indigo-500 shadow-md object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-indigo-500 flex items-center justify-center text-white text-3xl font-extrabold shadow-md transition-transform group-hover:scale-105">
                        {(editDisplayName || 'U')[0].toUpperCase()}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/45 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center text-white text-[10px] font-bold gap-1">
                      <Camera className="w-4 h-4 text-white" />
                      <span>Unggah</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-center">
                    <label 
                      htmlFor="avatar-file-upload" 
                      className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-white/5 dark:hover:bg-white/10 rounded-xl text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 transition-colors border border-indigo-550/10 dark:border-white/5 shadow-sm"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Unggah Foto Sendiri
                    </label>
                    <input
                      id="avatar-file-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarFileChange}
                    />
                  </div>

                  <div className="w-full">
                    <span className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-center mb-2">Pilih Preset Avatar</span>
                    <div className="grid grid-cols-6 gap-2 justify-center">
                      {AVATAR_PRESETS.map((avatar, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setEditPhotoURL(avatar.url)}
                          className={`w-10 h-10 rounded-full overflow-hidden border-2 transition-all ${
                            editPhotoURL === avatar.url 
                              ? 'border-indigo-500 scale-110 ring-2 ring-indigo-500/30' 
                              : 'border-slate-200 dark:border-white/10 opacity-70 hover:opacity-100 hover:scale-105'
                          }`}
                          title={avatar.name}
                        >
                          <img src={avatar.url} className="w-full h-full object-cover" alt={avatar.name} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Nama Tampilan</label>
                    <input
                      type="text"
                      required
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                      placeholder="Masukkan nama tampilan..."
                      className="w-full text-sm px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-705 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-indigo-500 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Link Foto Profil kustom (Opsional)</label>
                    <input
                      type="url"
                      value={editPhotoURL}
                      onChange={(e) => setEditPhotoURL(e.target.value)}
                      placeholder="https://contoh.com/gambar.jpg"
                      className="w-full text-sm px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-705 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-indigo-500 font-medium"
                    />
                  </div>
                </div>

                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(false)}
                    disabled={profileUpdateLoading}
                    className="flex-1 py-3 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-white/10 transition-colors text-sm disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={profileUpdateLoading}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition-colors text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                  >
                    {profileUpdateLoading ? (
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    ) : (
                      'Simpan Perubahan'
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex flex-col items-center text-center gap-3 pt-4">
                  {auth.currentUser?.photoURL ? (
                    <img
                      src={auth.currentUser.photoURL}
                      alt={auth.currentUser.displayName || 'Avatar'}
                      referrerPolicy="no-referrer"
                      className="w-20 h-20 rounded-full border-4 border-indigo-500/20 shadow-md ring-4 ring-indigo-500/10 object-cover"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-rose-500 flex items-center justify-center text-white text-3xl font-extrabold shadow-md shadow-indigo-500/20">
                      {(auth.currentUser?.displayName || auth.currentUser?.email || 'U')[0].toUpperCase()}
                    </div>
                  )}
                  
                  <div className="mt-1">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center justify-center gap-2">
                      <span>{auth.currentUser?.displayName || 'Pengguna Setia CoinAI'}</span>
                      <button
                        type="button"
                        onClick={() => setIsEditingProfile(true)}
                        className="p-1 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-indigo-500 transition-colors"
                        title="Edit Profil"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                      {maskEmail(auth.currentUser?.email)}
                    </p>
                    {isUserPremiumOrInvited ? (
                      <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-full text-xs font-black shadow-sm" id="profile-premium-badge">
                        <span>👑 Premium Member</span>
                      </div>
                    ) : (
                      <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 rounded-full text-[11px] font-bold" id="profile-standard-badge">
                        <span>Standard Member</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-b border-slate-100 dark:border-white/5 py-4 flex flex-col gap-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">ID Pengguna (UID)</span>
                    <span className="font-mono text-slate-800 dark:text-slate-300 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded-md text-[10px] select-all cursor-pointer truncate max-w-[200px]" title={auth.currentUser?.uid}>
                      {auth.currentUser?.uid}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 dark:text-slate-400 font-medium font-sans">Metode Autentikasi</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">
                      {auth.currentUser?.providerData[0]?.providerId === 'google.com' ? 'Google Account' : 'Email & Password'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 dark:text-slate-400 font-medium font-sans">Status Fitur Suara</span>
                    <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                      Aktif (Web Speech API)
                    </span>
                  </div>
                </div>

                {/* Badges and summary info */}
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-3 bg-indigo-500/5 hover:bg-indigo-500/10 transition-colors border border-indigo-500/10 rounded-2xl flex flex-col gap-1 items-center">
                    <Check className="w-5 h-5 text-indigo-500" />
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Pencatatan Ganda</span>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Proteksi Cerdas</span>
                  </div>
                  <div className="p-3 bg-[#10b981]/5 hover:bg-[#10b981]/10 transition-colors border border-[#10b981]/10 rounded-2xl flex flex-col gap-1 items-center">
                    <Check className="w-5 h-5 text-[#10b981]" />
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Perekaman Suara</span>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Auto-Koreksi Aktif</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(true)}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition-all shadow-md shadow-indigo-605/15 flex items-center justify-center gap-2"
                  >
                    <User className="w-4 h-4" /> Edit Profil Saya
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAccountModal(false)}
                    className="w-full py-2.5 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                  >
                    Tutup Profil
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showToSModal && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#1e293b] rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-white/10 relative flex flex-col gap-4 animate-in zoom-in-95 duration-250">
            <button
              onClick={() => setShowToSModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors z-[110]"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-100 dark:border-white/5 pb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white font-sans">Ketentuan Layanan</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Pemberitahuan privasi, operasional, & cara kerja web</p>
              </div>
            </div>

            <div className="max-h-[300px] overflow-y-auto pr-2 space-y-4 text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-sans">
              <div>
                <h4 className="font-bold text-slate-900 dark:text-slate-50 mb-1 text-sm">1. Ruang Lingkup Layanan</h4>
                <p className="text-slate-600 dark:text-slate-300">CoinAI merupakan platform asisten dan manajemen keuangan personal pintar. Seluruh fitur utama seperti pencatatan transaksi manual, voice transactions logger, pembuatan anggaran bulanan, kelola portofolio investasi, pelacak utang piutang, serta asisten AI chat disediakan untuk membantu mempermudah finansial harian Anda.</p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 dark:text-slate-50 mb-1 text-sm">2. Perekaman Suara & Web Speech API</h4>
                <p className="text-slate-600 dark:text-slate-300">Aplikasi ini memanfaatkan teknologi **Web Speech API** yang didukung secara bawaan oleh peramban (browser) Anda guna menangkap perintah suara. Kami berkomitmen menjaga keamanan privasi pribadi Anda:</p>
                <ul className="list-disc pl-4 mt-1 space-y-1 text-slate-605 dark:text-slate-300">
                  <li>Izin mikrofon ("microphone") hanya dipicu saat Anda mengeklik ikon mikrofon secara mandiri di form obrolan.</li>
                  <li>Kami tidak menyimpan rekaman suara mentah (.mp3/.wav) Anda di server kami. Konversi suara ke teks dilakukan transparant dan lokal di browser Anda.</li>
                  <li>Teks hasil perekamanan ditransfer aman via API terenkripsi untuk diekstrak jadi detail transaksi yang valid.</li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 dark:text-slate-50 mb-1 text-sm">3. Keamanan Penyimpanan Data (Firestore DB)</h4>
                <p className="text-slate-600 dark:text-slate-300">Semua informasi keuangan, daftar pengeluaran/pemasukan, tabungan, tagihan, dan sisa dompet digital Anda disimpan dengan aman dan tahan lama di database cloud Firebase Firestore. Informasi tersebut hanya dapat diakses melalui verifikasi autentikasi user Anda dan dilindungi oleh protokol keamanan ketat (Firestore Security Rules).</p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 dark:text-slate-50 mb-1 text-sm">4. Kustomisasi & Ekspor Premium</h4>
                <p className="text-slate-600 dark:text-slate-300">Pengguna Layanan Premium mendapatkan kebebasan mengunggah PDF Template kustom mereka guna menyelaraskan branding layout pribadi. Seluruh file PDF yang diunggah diproses semata-mata untuk mengkonfigurasi dokumen laporan yang akan di-export.</p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 dark:text-slate-50 mb-1 text-sm">5. Penafian Tanggung Jawab (Disclaimer)</h4>
                <p className="text-slate-600 dark:text-slate-300">Data keuangan di dalam CoinAI sepenuhnya bersifat informatif untuk memonitor anggaran Anda pribadi. Kami tidak memberikan rekomendasi investasi profesional. Pengguna bertanggung jawab penuh atas kebenaran input data transaksi saat konfirmasi.</p>
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-white/5 pt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setShowToSModal(false)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition-colors shadow-lg shadow-indigo-600/20 text-sm"
              >
                Saya Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      {showFAQModal && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#1e293b] rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-white/10 relative flex flex-col gap-4 animate-in zoom-in-95 duration-250 max-h-[90vh]">
            <button
              onClick={() => setShowFAQModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors z-[110]"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-100 dark:border-white/5 pb-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white font-sans">FAQ & Cara Kerja CoinAI</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">Pertanyaan umum mengenai asisten logger & fitur sistem</p>
              </div>
            </div>

            {/* Accordions Container */}
            <div className="flex-1 overflow-y-auto pr-2 space-y-2.5 font-sans">
              {[
                {
                  q: "Bagaimana cara mencatat keuangan otomatis dengan suara?",
                  a: "Sangat mudah! Anda hanya perlu mengeklik ikon mikrofon 🎤 di sebelah kanan kotak ketik chat. Berikan izin mikrofon lalu mulailah berbicara secara alami. Misalnya: 'beli bakso lima belas ribu dari cash' atau 'tambah uang seabank seratus ribu'. Klik tombol 'Kirim ke Chat' jika selesai berbicara, atau 'Edit Dulu' jika ingin memodifikasi teks transkrip manual. Asisten AI akan otomatis memproses dan mencatatnya ke dalam database."
                },
                {
                  q: "Apakah asisten suara bisa mengoreksi ucapan yang mirip (Auto-Koreksi)?",
                  a: "Ya! Kami memperkuat sistem pencatatan suara dengan filter auto-koreksi fonetik pintar bahasa Indonesia. Jika ucapan Anda kurang jelas atau memicu salah ketik pada asisten bawaan browser, kami otomatis memperbaiki kata-kata populer: 'jibank', 'sea bank', 'seabenk' -> SeaBank; 'becah', 'beca' -> BCA; 'gopes', 'gopay' -> GoPay; 'danah' -> DANA; 'kes', 'kesh' -> Uang Cash; 'rebu' -> ribu; dan 'jt' -> juta. Ini meminimalisir kesalahan pelacakan finansial Anda secara signifikan!"
                },
                {
                  q: "Bagaimana jika sistem mendeteksi pencatatan ganda (Double)?",
                  a: "CoinAI memproteksi Anda dari ketidaksengajaan klik ganda atau input double audio. Saat asisten AI mendeteksi ada transaksi sejenis (nominal, kategori, & tipe sama di hari yang sama), modul peringatan kami akan membandingkan detail transaksi baru dengan transaksi yang sudah ada, lengkap dengan informasi JARAK JAM DAN MENIT pencatatannya. Jika barangnya sama tetapi dibeli lagi di jam berbeda, Anda cukup mengeklik 'Tetap Catat (Tumpuk)'. Namun jika itu kesalahan catat, ketuk 'Abaikan (Batal Double)'."
                },
                {
                  q: "Bagaimana mengelola dompet digital dan target keuangan?",
                  a: "Anda bisa melacak saldo cash/dompet secara mendalam di menu anggaran Dashboard, set batas limit nominal budget per kategori agar pengeluaran terkendali, dan set target 'savings' (tabungan) bulanan impian Anda."
                },
                {
                  q: "Bagaimana cara mencetak laporan dengan Custom Template saya sendiri?",
                  a: "Apabila Anda adalah pengguna Premium, masuk ke menu 'Riwayat' lalu klik 'Export PDF', Anda dapat memilih opsi 'Upload Template'. Dari situ, Anda bisa mengunggah file template PDF base Anda, lalu CoinAI akan menyiapkan struktur di atas template visual Anda dan meng-exportnya siap pakai beserta data transaksi bulan berjalan."
                },
                {
                  q: "Masa aktif Kode Undangan?",
                  a: "Kode undangan Premium yang diberikan khusus oleh admin kini bersifat sekali pakai ('Single-Use') dan hanya memiliki masa kedaluwarsa maksimal 7 Hari sejak dibuat."
                },
                {
                  q: "Apakah pencatatan WhatsApp bot juga tersinkronisasi?",
                  a: "Tentu saja! Bot pesan WhatsApp aktif bekerja di latar belakang. Semua log transaksi yang Anda kirimkan ke WhatsApp Bot resmi kami otomatis diuraikan oleh asisten AI dan tersimpan secara instan di database aman Firestore Anda."
                }
              ].map((item, idx) => {
                const isOpen = faqOpenIndex === idx;
                return (
                  <div 
                    key={idx} 
                    className="bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-2xl overflow-hidden transition-all duration-300"
                  >
                    <button
                      type="button"
                      onClick={() => setFaqOpenIndex(isOpen ? null : idx)}
                      className="w-full flex items-center justify-between p-4 text-left font-semibold text-slate-800 dark:text-slate-200 text-xs sm:text-sm hover:bg-slate-100 dark:hover:bg-white/5 transition-colors gap-3 focus:outline-none"
                    >
                      <span>{item.q}</span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180 text-amber-500' : ''}`} />
                    </button>
                    
                    {isOpen && (
                      <div className="p-4 pt-1 border-t border-slate-100 dark:border-white/5 text-slate-700 dark:text-slate-200 text-xs leading-relaxed font-normal animate-in slide-in-from-top-1 duration-200">
                        {item.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-100 dark:border-white/5 pt-4">
              <button
                type="button"
                onClick={() => setShowFAQModal(false)}
                className="w-full py-3 bg-indigo-650 hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-xl font-semibold transition-colors text-sm"
              >
                Selesai Membaca
              </button>
            </div>
          </div>
        </div>
      )}

      <DonationModal isOpen={showDonationModal} onClose={() => setShowDonationModal(false)} />

      <ExportPdfModal 
        isOpen={showExportPdfModal} 
        onClose={() => setShowExportPdfModal(false)} 
        transactions={transactions}
        userEmail={auth.currentUser?.email}
        userDisplayName={auth.currentUser?.displayName}
      />

      {showQuickLogModal && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#1e293b] rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-white/10 relative flex flex-col gap-5 animate-in zoom-in-95 duration-250 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowQuickLogModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors z-[110]"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-100 dark:border-white/5 pb-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-bold border ${
                quickLogType === 'income' 
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                  : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
              }`}>
                {quickLogType === 'income' ? '📈' : '📉'}
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white font-sans">
                  {quickLogType === 'income' ? 'Catat Pemasukan Baru' : 'Catat Pengeluaran Baru'}
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Secara manual tanpa melalui parsed AI
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveQuickLog} className="space-y-4">
              {/* Type Switcher */}
              <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setQuickLogType('income');
                    setQuickLogCategory('');
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                    quickLogType === 'income'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  📈 Pemasukan (Income)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuickLogType('expense');
                    setQuickLogCategory('');
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                    quickLogType === 'expense'
                      ? 'bg-rose-600 text-white shadow-md'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  📉 Pengeluaran (Expense)
                </button>
              </div>

              {/* Amount */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Nominal (Rupiah) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 font-bold text-sm">
                    Rp
                  </div>
                  <input
                    type="number"
                    min="1"
                    required
                    value={quickLogAmount}
                    onChange={(e) => setQuickLogAmount(e.target.value)}
                    placeholder="cth: 50000"
                    className="w-full pl-10 pr-3 py-3 bg-slate-50 dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Kategori <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(quickLogType === 'income' 
                    ? ['Gaji', 'Bonus & THR', 'Investasi', 'Penjualan', 'Lainnya']
                    : ['Makanan & Minuman', 'Transportasi', 'Belanja', 'Tagihan & Utilitas', 'Hiburan & Hiburan', 'Kesehatan', 'Pendidikan', 'Investasi & Tabungan', 'Lainnya']
                  ).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setQuickLogCategory(cat)}
                      className={`py-2.5 px-2 text-[11px] sm:text-xs font-semibold border rounded-xl transition-all truncate text-center cursor-pointer shadow-sm ${
                        quickLogCategory === cat
                          ? (quickLogType === 'income'
                              ? 'bg-emerald-600 border-emerald-600 text-white dark:bg-emerald-500 dark:border-emerald-500 font-bold shadow-md'
                              : 'bg-rose-600 border-rose-600 text-white dark:bg-rose-500 dark:border-rose-500 font-bold shadow-md')
                          : 'bg-white hover:bg-slate-50 border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-white/10 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Wallet Select */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Metode Pembayaran / Tempat Penyimpanan <span className="text-rose-500">*</span>
                </label>
                <select
                  value={quickLogWallet}
                  onChange={(e) => setQuickLogWallet(e.target.value)}
                  className="w-full p-3 bg-slate-55 dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="unknown">Belum Ditentukan (unknown)</option>
                  {['Uang Cash', 'GoPay', 'DANA', 'OVO', 'ShopeePay', 'LinkAja', 'BCA', 'Mandiri', 'BNI', 'BRI', 'SeaBank', 'BSI', 'Jago', 'Lainnya'].map((w) => (
                    <option key={w} value={w}>
                      {w === 'Uang Cash' ? 'Uang Cash (Tunai)' : w}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Deskripsi (Opsional)
                </label>
                <input
                  type="text"
                  value={quickLogDescription}
                  onChange={(e) => setQuickLogDescription(e.target.value)}
                  placeholder="cth: Makan ayam bakar di warung atau THR dari paman"
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Tags */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block flex justify-between items-center">
                  <span>Tag Transaksi (Opsional)</span>
                  <span className="text-[10px] text-slate-400 font-normal">Pisahkan dengan koma</span>
                </label>
                <input
                  type="text"
                  value={quickLogTags}
                  onChange={(e) => setQuickLogTags(e.target.value)}
                  placeholder="cth: Personal, Bisnis, Penting"
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              {quickLogMsg && (
                <p className="p-3 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-xl text-center">
                  {quickLogMsg}
                </p>
              )}

              <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex gap-3">
                <button
                  type="button"
                  disabled={isQuickLogSaving}
                  onClick={() => setShowQuickLogModal(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-xl font-semibold transition-colors text-xs sm:text-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isQuickLogSaving || !quickLogCategory}
                  className={`flex-1 py-3 text-white rounded-xl font-bold transition-all transform hover:translate-y-[-1px] text-xs sm:text-sm shadow-md flex items-center justify-center gap-1.5 group ${
                    quickLogType === 'income'
                      ? 'bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-500/40'
                      : 'bg-rose-600 hover:bg-rose-500 disabled:bg-rose-500/40'
                  }`}
                >
                  {isQuickLogSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Meyimpan...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Simpan Transaksi
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <BudgetSettingsModal 
        isOpen={showBudgetSettingsModal} 
        onClose={() => setShowBudgetSettingsModal(false)}
        monthlyBudget={budget}
        categoryBudgets={categoryBudgets}
        expensesByCategory={expensesByCategory}
        onSaveTotalBudget={handleSaveTotalBudget}
        onSaveCategoryBudget={handleSaveCategoryBudget}
        onSaveAllCategoryBudgets={handleSaveAllCategoryBudgets}
      />

      {/* Premium vs Standard Feature Comparison Modal */}
      {showPremiumModal && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#1e293b] rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-white/10 relative flex flex-col gap-6 animate-in zoom-in-95 duration-250 max-h-[95vh] overflow-y-auto">
            <button
              onClick={() => setShowPremiumModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors z-[110]"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto text-2xl font-bold border border-amber-500/20">
                👑
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white font-sans tracking-tight">Upgrade ke CoinAI Premium</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-sans max-w-md mx-autoText">
                Buka akses penuh fitur tag tak terbatas, pengelolaan budget lanjutan, dan analisis keuangan cerdas.
              </p>
            </div>

            {/* Elegant Premium Tabs Navigation */}
            <div className="flex border-b border-slate-200 dark:border-white/10" id="premium-tabs-nav">
              <button
                type="button"
                onClick={() => setPremiumModalTab('benefits')}
                className={`flex-1 pb-3 text-sm font-bold border-b-2 transition-all flex items-center justify-center gap-2 ${
                  premiumModalTab === 'benefits'
                    ? 'border-indigo-505 border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                }`}
                id="tab-benefits-btn"
              >
                <span>👑 Perbandingan Fitur</span>
              </button>
              <button
                type="button"
                onClick={() => setPremiumModalTab('activation')}
                className={`flex-1 pb-3 text-sm font-bold border-b-2 transition-all flex items-center justify-center gap-2 ${
                  premiumModalTab === 'activation'
                    ? 'border-indigo-505 border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                }`}
                id="tab-activation-btn"
              >
                <span>⚡ Ajukan Akses & Kode</span>
              </button>
            </div>

            {premiumModalTab === 'benefits' ? (
              <div className="space-y-4 animate-in fade-in duration-200" id="premium-benefits-content">
                {/* Comparison Table */}
                <div className="border border-slate-100 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm bg-slate-50/50 dark:bg-white/0 overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm font-sans min-w-[500px]">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                        <th className="p-4 font-semibold text-slate-700 dark:text-slate-300">Fitur Sistem</th>
                        <th className="p-4 font-semibold text-slate-500 dark:text-slate-400">Standard (Free)</th>
                        <th className="p-4 font-semibold text-amber-500 dark:text-amber-400 flex items-center gap-1">👑 Premium</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                      <tr>
                        <td className="p-4 font-medium text-slate-800 dark:text-slate-200">
                          <div className="font-semibold text-slate-900 dark:text-white">Ekspor Laporan PDF & Custom Template</div>
                          <div className="text-[10px] text-slate-400 leading-normal">File PDF format resmi dan upload template sendiri</div>
                        </td>
                        <td className="p-4 text-slate-500 text-xs">
                          Tidak Tersedia ❌<br/>
                          <span className="text-[10px] text-slate-400">(Tombol terkunci)</span>
                        </td>
                        <td className="p-4 text-xs font-semibold text-emerald-600 dark:text-emerald-400 leading-normal">
                          <span className="bg-emerald-500/10 px-2 py-0.5 rounded-full text-[10px] font-bold">AKSES FULL</span>
                          <div className="mt-1">Unduh laporan resmi & Bebas upload template PDF kustom untuk layout Anda sendiri 📄👑</div>
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 font-medium text-slate-800 dark:text-slate-200">
                          <div className="font-semibold text-slate-900 dark:text-white">Format Ekspor Lainnya</div>
                          <div className="text-[10px] text-slate-400 leading-normal">Format cadangan pengarsipan offline</div>
                        </td>
                        <td className="p-4 text-slate-500 text-xs">
                          Hanya Excel (.xlsx) Manual 📄
                        </td>
                        <td className="p-4 text-xs text-slate-700 dark:text-slate-300">
                          <span className="text-emerald-500 dark:text-emerald-400 font-bold">Lengkap 📊</span><br/>
                          Excel, CSV, dan Laporan Ringkasan Terintegrasi.
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 font-medium text-slate-800 dark:text-slate-200">
                          <div className="font-semibold text-slate-900 dark:text-white">Kustomisasi Tag & Kategori</div>
                          <div className="text-[10px] text-slate-400 leading-normal">Personalisasi pengelompokan transaksi keuangan</div>
                        </td>
                        <td className="p-4 text-slate-400 text-xs">
                          Hanya bisa menggunakan kategori bawaan standar sistem saja.
                        </td>
                        <td className="p-4 text-xs text-emerald-600 dark:text-emerald-400 font-semibold leading-normal">
                          Bebas membuat kategori kustom baru & modifikasi tag tanpa ada batasan kuantitas 🏷️🎨
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 font-medium text-slate-800 dark:text-slate-200">
                          <div className="font-semibold text-slate-900 dark:text-white">Asisten Keuangan Pintar AI</div>
                          <div className="text-[10px] text-slate-400 leading-normal">Chat asisten Gemini AI untuk solusi finansial</div>
                        </td>
                        <td className="p-4 text-slate-400 text-xs leading-normal">
                          Perhitungan anggaran dasar per bulan dengan antrean normal.
                        </td>
                        <td className="p-4 text-xs text-emerald-600 dark:text-emerald-400 font-semibold leading-normal text-left">
                          Prioritas AI Tanpa Batas! Analisis deteksi pemborosan otomatis, saran investasi kustom, ramalan inflasi, & voice cepat ⚡🤖
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 font-medium text-slate-800 dark:text-slate-200">
                          <div className="font-semibold text-slate-900 dark:text-white">Jumlah Dompet & Akun Aktif</div>
                          <div className="text-[10px] text-slate-400 leading-normal">Rincian tempat penyimpanan saldo multi-platform</div>
                        </td>
                        <td className="p-4 text-slate-400 text-xs">
                          Terbatas hanya maksimal 3 dompet aktif.
                        </td>
                        <td className="p-4 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                          Bebas tambahkan puluhan rekening/dompet (Cash, GoPay, BCA, Mandiri, dll) tanpa batas 🏦🎯
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 font-medium text-slate-800 dark:text-slate-200">
                          <div className="font-semibold text-slate-900 dark:text-white">Pelacakan Hutang-Piutang</div>
                          <div className="text-[10px] text-slate-400 leading-normal">Modul debt tracker otomatis</div>
                        </td>
                        <td className="p-4 text-slate-400 text-xs">
                          Catatan hutang & piutang sederhana saja.
                        </td>
                        <td className="p-4 text-xs text-emerald-600 dark:text-emerald-400 font-semibold leading-normal">
                          Pelacakan tempo pembayaran, riwayat cicilan, & indikator warning keterlambatan otomatis 🔔
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setPremiumModalTab('activation')}
                    className="w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-amber-500 hover:from-indigo-605 hover:to-amber-605 text-white rounded-xl text-xs sm:text-sm font-extrabold uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 active:scale-[0.98]"
                  >
                    <span>Ajukan Akses Premium Sekarang</span>
                    <span>👑</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in duration-200" id="premium-activation-content">
                {/* Contact Owner to Request Premium Block */}
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-4">
                  <div className="text-left space-y-1">
                    <p className="text-sm font-bold text-slate-850 dark:text-amber-400 flex items-center gap-2">
                      <span>👑</span> Ajukan Akses Premium Lewat Web Instan
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-300 leading-relaxed font-sans">
                      Aktivasi dilakukan secara aman oleh Admin super kami (Ahmad Khoirul Muna) langsung setelah meninjau data pengajuan Anda. Masukkan catatan atau nama instansi Anda di bawah untuk mengajukan akses premium.
                    </p>
                  </div>

                  {premiumRequest ? (
                    <div className="p-3 bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-xl space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-405">Status Pengajuan Anda:</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          premiumRequest.status === 'pending'
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 animate-pulse border border-amber-500/25'
                            : premiumRequest.status === 'approved'
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25'
                            : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/25'
                        }`}>
                          {premiumRequest.status === 'pending' ? '⏱ Menunggu Persetujuan Admin' : premiumRequest.status === 'approved' ? '✓ Disetujui' : '✗ Pengajuan Ditolak'}
                        </span>
                      </div>
                      <p className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                        <span className="text-slate-400">Catatan Pengajuan: </span> 
                        &ldquo;{premiumRequest.reasonText || 'Tanpa catatan.'}&rdquo;
                      </p>
                      {premiumRequest.status === 'pending' && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-normal bg-amber-500/5 p-2 rounded-lg font-medium">
                          ⏱ Pengajuan ini terkirim secara real-time. Admin Ahmad Khoirul Muna akan menyetujui langsung melalui panel adminnya.
                        </p>
                      )}
                      {premiumRequest.status === 'rejected' && (
                        <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-white/5">
                          <p className="text-[10px] text-rose-500 dark:text-rose-404 font-medium">Anda dapat mengirimkan pengajuan baru dengan catatan yang direvisi jika ada salah pemformatan:</p>
                          <div className="flex flex-col gap-2">
                            <textarea
                              value={premiumRequestReason}
                              onChange={(e) => setPremiumRequestReason(e.target.value)}
                              placeholder="Tuliskan tujuan revisi pengajuan baru (misal: Sesuai petunjuk WhatsApp / Kebutuhan Laporan PT...)"
                              className="bg-slate-50 dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 min-h-[60px]"
                            />
                            <button
                              type="button"
                              onClick={() => handleSubmitPremiumRequest(premiumRequestReason)}
                              disabled={isSubmittingPremiumRequest}
                              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all"
                            >
                              {isSubmittingPremiumRequest ? 'Mengirim Ulang...' : 'Kirim Ulang Pengajuan'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <textarea
                        value={premiumRequestReason}
                        onChange={(e) => setPremiumRequestReason(e.target.value)}
                        placeholder="Contoh: Pengajuan Laporan Keuangan PT Sinar Jaya Utama, divisi Keuangan Korporat."
                        className="w-full bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-white placeholder-slate-450 focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[70px]"
                      />
                      <button
                        type="button"
                        onClick={() => handleSubmitPremiumRequest(premiumRequestReason)}
                        disabled={isSubmittingPremiumRequest}
                        className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-600 hover:to-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-[0.98]"
                      >
                        {isSubmittingPremiumRequest ? 'Mengirim Pengajuan...' : 'Kirim Pengajuan Premium Web'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-2xl space-y-3">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Punya Kode Undangan Khusus?</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inviteCodeInput}
                      onChange={(e) => setInviteCodeInput(e.target.value)}
                      placeholder="Contoh: COINAI-2026"
                      className="flex-1 bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-center font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleApplyInviteCode}
                      className="px-5 py-2.5 bg-slate-805 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 border border-transparent dark:hover:bg-slate-600 text-white rounded-xl font-semibold text-sm transition-colors"
                    >
                      Verifikasi
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">Masukkan kode akses khusus yang diberikan secara pribadi oleh pengembang untuk mengaktifkan akun penguji Anda secara instan.</p>
                </div>

                {inviteFeedback && (
                  <p className="text-center text-sm font-semibold text-amber-500 animate-pulse">
                    {inviteFeedback}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
