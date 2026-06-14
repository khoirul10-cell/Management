import React, { useState, useEffect } from 'react';
import { collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Shield, Sparkles, UserCheck, Trash2, Mail, Plus, CheckCircle, AlertTriangle, Check, X, Clock, UserX } from 'lucide-react';

interface PremiumEmail {
  email: string;
  displayName?: string;
  grantedBy: string;
  grantedAt?: any;
}

interface PremiumRequest {
  id: string;
  email: string;
  displayName?: string;
  requestedAt?: any;
  status: 'pending' | 'approved' | 'rejected';
  reasonText?: string;
  updatedAt?: any;
}

export default function AdminPanel() {
  const [premiumEmails, setPremiumEmails] = useState<PremiumEmail[]>([]);
  const [premiumRequests, setPremiumRequests] = useState<PremiumRequest[]>([]);
  const [inviteCodes, setInviteCodes] = useState<any[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Hardcoded VIP emails
  const HARDCODED_VIP = ['ahmadkhoirulmuna136@gmail.com', 'admin@coinai.com'];

  // Sync premium emails list and requests from Firestore
  useEffect(() => {
    const isAdmin = auth.currentUser?.email?.toLowerCase() === 'ahmadkhoirulmuna136@gmail.com';
    if (!isAdmin) return;

    const premiumRef = collection(db, 'premium_emails');
    const unsub = onSnapshot(
      premiumRef,
      (snapshot) => {
        const list: PremiumEmail[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as PremiumEmail);
        });

        // Inject hardcoded VIPs if they are not in the database
        HARDCODED_VIP.forEach(vip => {
          if (!list.find(p => p.email === vip)) {
            list.push({
              email: vip,
              displayName: 'Administer App',
              grantedBy: 'Founder / System',
            });
          }
        });

        // Remove duplicates and sort
        let unique = Array.from(new Map(list.map(item => [item.email, item])).values());
        setPremiumEmails(unique);
      },
      (err) => {
        console.error('Gagal mengambil daftar premium:', err);
      }
    );

    const requestsRef = collection(db, 'premium_requests');
    const unsubRequests = onSnapshot(
      requestsRef,
      (snapshot) => {
        const list: PremiumRequest[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as PremiumRequest);
        });
        setPremiumRequests(list);
        
        // Also auto-inject approved requests into premiumEmails if missing
        setPremiumEmails(prev => {
          const combined = [...prev];
          list.filter(r => r.status === 'approved').forEach(req => {
            if (!combined.find(p => p.email === req.email)) {
               combined.push({
                 email: req.email,
                 displayName: req.displayName || 'Akun Member',
                 grantedBy: req.reasonText || 'Approved Request / Invite Code',
                 grantedAt: req.updatedAt || req.requestedAt
               });
            }
          });
          return Array.from(new Map(combined.map(item => [item.email, item])).values());
        });
      },
      (err) => {
        console.error('Gagal mengambil daftar pengajuan:', err);
      }
    );

    const codesRef = collection(db, 'invite_codes');
    const unsubCodes = onSnapshot(
      codesRef,
      (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        setInviteCodes(list);
      },
      (err) => {
        console.error('Gagal mengambil daftar kode undangan:', err);
      }
    );

    const usersRef = collection(db, 'users');
    const unsubUsers = onSnapshot(
      usersRef,
      (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        
        setPremiumEmails(prev => {
          const combined = [...prev];
          list.filter(u => u.isInvited || u.isPremium).forEach(u => {
            if (u.email && !combined.find(p => p.email === u.email.toLowerCase())) {
               combined.push({
                 email: u.email.toLowerCase(),
                 displayName: u.displayName || 'Akun Member',
                 grantedBy: u.isInvited ? 'Kode Invite / Legacy' : 'Aktivasi Internal',
                 grantedAt: u.updatedAt || new Date()
               });
            }
          });
          return Array.from(new Map(combined.map(item => [item.email, item])).values());
        });
      },
      (err) => {}
    );

    return () => {
      unsub();
      unsubRequests();
      unsubCodes();
      unsubUsers();
    };
  }, []);

  const handleGrantPremium = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailToGrant = newEmail.trim().toLowerCase();
    
    if (!emailToGrant) return;
    if (!emailToGrant.includes('@')) {
      setFeedback({ type: 'error', message: 'Tuliskan format email yang valid!' });
      return;
    }

    const adminEmail = auth.currentUser?.email;
    if (adminEmail?.toLowerCase() !== 'ahmadkhoirulmuna136@gmail.com') {
      setFeedback({ type: 'error', message: 'Hanya Admin Utama yang berhak memberikan akses!' });
      return;
    }

    setIsLoading(true);
    setFeedback(null);

    try {
      // 1. Write to premium_emails collection mapping
      const docRef = doc(db, 'premium_emails', emailToGrant);
      await setDoc(docRef, {
        email: emailToGrant,
        displayName: 'Ditambahkan via Admin',
        grantedBy: adminEmail.toLowerCase(),
        grantedAt: serverTimestamp()
      });

      // 2. Also back-update any existing request status for this email to approved
      const reqRef = doc(db, 'premium_requests', emailToGrant);
      await setDoc(reqRef, {
        displayName: 'Ditambahkan via Admin',
        status: 'approved',
        updatedAt: serverTimestamp()
      }, { merge: true });

      setFeedback({ type: 'success', message: `Berhasil menambahkan ${emailToGrant} ke dalam anggota Premium! 👑` });
      setNewEmail('');
    } catch (err: any) {
      console.error(err);
      setFeedback({ type: 'error', message: `Gagal memberikan akses: ${err.message || err}` });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveRequest = async (email: string) => {
    const adminEmail = auth.currentUser?.email;
    if (adminEmail?.toLowerCase() !== 'ahmadkhoirulmuna136@gmail.com') return;

    try {
      const emailLower = email.toLowerCase().trim();
      const targetReq = premiumRequests.find(r => r.email === emailLower);
      
      // 1. Grant premium
      const docRef = doc(db, 'premium_emails', emailLower);
      await setDoc(docRef, {
        email: emailLower,
        displayName: targetReq?.displayName || 'Akun Member',
        grantedBy: adminEmail.toLowerCase(),
        grantedAt: serverTimestamp()
      });

      // 2. Update request status
      const reqRef = doc(db, 'premium_requests', emailLower);
      await setDoc(reqRef, {
        status: 'approved',
        updatedAt: serverTimestamp()
      }, { merge: true });

      setFeedback({ type: 'success', message: `Permintaan ${emailLower} disetujui! Pengguna kini Premium 👑` });
    } catch (err: any) {
      console.error(err);
      setFeedback({ type: 'error', message: `Gagal menyetujui permintaan: ${err.message || err}` });
    }
  };

  const handleRejectRequest = async (email: string) => {
    const adminEmail = auth.currentUser?.email;
    if (adminEmail?.toLowerCase() !== 'ahmadkhoirulmuna136@gmail.com') return;

    try {
      const emailLower = email.toLowerCase().trim();
      
      // 1. Update request status to rejected
      const reqRef = doc(db, 'premium_requests', emailLower);
      await setDoc(reqRef, {
        status: 'rejected',
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 2. Revoke premium if granted
      const docRef = doc(db, 'premium_emails', emailLower);
      await deleteDoc(docRef);

      setFeedback({ type: 'success', message: `Permintaan ${emailLower} ditolak!` });
    } catch (err: any) {
      console.error(err);
      setFeedback({ type: 'error', message: `Gagal menolak permintaan: ${err.message || err}` });
    }
  };

  const handleDeleteRequest = async (email: string) => {
    const adminEmail = auth.currentUser?.email;
    if (adminEmail?.toLowerCase() !== 'ahmadkhoirulmuna136@gmail.com') return;

    if (!window.confirm(`Hapus tiket pengajuan dari ${email}?`)) return;

    try {
      const reqRef = doc(db, 'premium_requests', email.toLowerCase().trim());
      await deleteDoc(reqRef);
      setFeedback({ type: 'success', message: `Berhasil menghapus tiket pengajuan ${email}` });
    } catch (err: any) {
      console.error(err);
      setFeedback({ type: 'error', message: `Gagal menghapus tiket: ${err.message || err}` });
    }
  };

  const handleRevokePremium = async (emailToRevoke: string) => {
    const adminEmail = auth.currentUser?.email;
    if (adminEmail?.toLowerCase() !== 'ahmadkhoirulmuna136@gmail.com') {
      setFeedback({ type: 'error', message: 'Hanya Admin Utama yang berhak mencabut akses!' });
      return;
    }

    if (!window.confirm(`Apakah Anda yakin ingin mencabut status Premium dari ${emailToRevoke}?`)) {
      return;
    }

    try {
      const docRef = doc(db, 'premium_emails', emailToRevoke.toLowerCase());
      await deleteDoc(docRef);

      // Also reset status in request to rejected or none
      const reqRef = doc(db, 'premium_requests', emailToRevoke.toLowerCase());
      await setDoc(reqRef, {
        status: 'rejected',
        updatedAt: serverTimestamp()
      }, { merge: true });

      setFeedback({ type: 'success', message: `Berhasil mencabut akses Premium untuk ${emailToRevoke}. ❌` });
    } catch (err: any) {
      console.error(err);
      setFeedback({ type: 'error', message: `Gagal mencabut akses: ${err.message || err}` });
    }
  };

  const handleGenerateCode = async () => {
    setIsLoading(true);
    try {
      // Generate a random 5-character string
      const randomChars = Math.random().toString(36).substring(2, 7).toUpperCase();
      const newCode = `COINAI-${randomChars}`;

      // Date logic
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days

      const docRef = doc(db, 'invite_codes', newCode);
      await setDoc(docRef, {
        code: newCode,
        generatedBy: auth.currentUser?.email,
        generatedAt: serverTimestamp(),
        expiresAt: expiresAt,
        used: false,
        usedBy: null,
        usedAt: null
      });

      setFeedback({ type: 'success', message: `Berhasil membuat kode undangan baru: ${newCode}` });
    } catch (err: any) {
      console.error(err);
      setFeedback({ type: 'error', message: `Gagal membuat kode undangan: ${err.message || err}` });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCode = async (codeId: string) => {
    if (!window.confirm(`Hapus kode undangan ${codeId}?`)) return;
    try {
      await deleteDoc(doc(db, 'invite_codes', codeId));
      setFeedback({ type: 'success', message: `Kode ${codeId} dihapus.` });
    } catch (err: any) {
      console.error(err);
      setFeedback({ type: 'error', message: `Gagal menghapus kode: ${err.message}` });
    }
  };

  return (
    <div className="flex-1 mb-20 space-y-6">
      {/* Admin Disclaimer Hero */}
      <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl p-6 relative overflow-hidden shadow-xl">
        <div className="absolute right-0 top-0 -mr-6 -mt-6 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl shrink-0" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-400" />
              <span className="text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">Super Administrator</span>
            </div>
            <h2 className="text-2xl font-bold font-sans">Panel Manajemen Premium CoinAI</h2>
            <p className="text-sm text-slate-400 leading-relaxed font-sans">
              Selamat datang kembali, <strong className="text-indigo-300 font-mono">ahmadkhoirulmuna136@gmail.com</strong>. Gunakan panel ini untuk menunjuk dan memverifikasi anggota yang mendapatkan seluruh hak istimewa fitur premium (Akses Ekspor PDF Laporan Formal).
            </p>
          </div>
          <div className="flex items-center gap-2 bg-slate-800/65 px-4 py-2 rounded-2xl border border-slate-700/55 text-xs font-semibold">
            <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
            <span>{premiumEmails.length} Pengguna Premium Terdaftar</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Form: Add members */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="space-y-1">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-indigo-500" />
              Beri Akses Anggota
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Verifikasi email di bawah untuk dijadikan pengguna premium premium selamanya.</p>
          </div>

          <form onSubmit={handleGrantPremium} className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="rekan@gmail.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium font-mono"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !newEmail.trim()}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              {isLoading ? 'Sedang Memproses...' : 'Berikan Akses Premium'}
            </button>
          </form>

          {feedback && (
            <div className={`p-3.5 rounded-2xl flex items-start gap-2.5 border text-xs leading-relaxed ${feedback.type === 'success' ? 'bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/10' : 'bg-rose-500/5 text-rose-600 dark:text-rose-400 border-rose-500/10'}`}>
              {feedback.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
              <span>{feedback.message}</span>
            </div>
          )}
        </div>

        {/* Right Table: Premium list */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="space-y-1">
            <h3 className="font-bold text-slate-900 dark:text-white">Daftar Hak Istimewa Premium</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Daftar pengguna terverifikasi yang saat ini menikmati akses tanpa batas di aplikasi.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/5 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-2">No</th>
                  <th className="py-3 px-2">Data Pengguna</th>
                  <th className="py-3 px-2">Jalur Akses</th>
                  <th className="py-3 px-2">Tanggal Aktif</th>
                  <th className="py-3 px-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {premiumEmails.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                      Belum ada email premium yang didaftarkan lewat panel ini.
                    </td>
                  </tr>
                ) : (
                  premiumEmails.map((pem, idx) => {
                    const grantedDate = pem.grantedAt?.toDate ? pem.grantedAt.toDate().toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' }) : (pem.grantedAt ? new Date(pem.grantedAt).toLocaleDateString('id-ID') : '-');
                    return (
                    <tr key={pem.email} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors font-medium">
                      <td className="py-3 px-2 text-slate-400">{idx + 1}</td>
                      <td className="py-3 px-2">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">{pem.displayName || 'Akun Member'}</div>
                        <div className="font-mono text-[10px] text-slate-500">{pem.email}</div>
                      </td>
                      <td className="py-3 px-2 text-slate-500 font-mono text-[10px]">{pem.grantedBy}</td>
                      <td className="py-3 px-2 text-slate-500 text-[10px]">{grantedDate}</td>
                      <td className="py-3 px-2 text-right">
                        <button
                          onClick={() => handleRevokePremium(pem.email)}
                          className="p-1.5 hover:bg-rose-500/10 text-rose-500 hover:text-rose-600 rounded-lg transition-colors inline-flex"
                          title="Cabut Akses Premium"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* NEW SECTION: Pending Premium Requests */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="space-y-1">
          <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500 animate-spin-slow" />
            Antrean Pengajuan Akses Premium Web
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Daftar pengguna yang mengajukan status PREMIUM langsung melalui antarmuka web mereka. Setujui atau Tolak permintaan di bawah ini.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/5 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-2">Nama Pengguna</th>
                <th className="py-3 px-2">Email</th>
                <th className="py-3 px-2">Catatan Pengajuan</th>
                <th className="py-3 px-2 text-center">Status</th>
                <th className="py-3 px-2 text-right">Tindakan Admin</th>
              </tr>
            </thead>
            <tbody>
              {premiumRequests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                    Belum ada pengajuan akses premium dari pengguna saat ini.
                  </td>
                </tr>
              ) : (
                [...premiumRequests].sort((a,b) => b.requestedAt?.seconds - a.requestedAt?.seconds).map((req) => (
                  <tr key={req.id} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors font-medium">
                    <td className="py-3 px-2 text-slate-800 dark:text-slate-200 font-semibold">{req.displayName || 'Akun Member'}</td>
                    <td className="py-3 px-2 font-mono text-xs">{req.email}</td>
                    <td className="py-3 px-2 text-slate-500 italic max-w-xs truncate" title={req.reasonText}>
                      {req.reasonText || 'Tanpa catatan tertulis.'}
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                        req.status === 'approved' 
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25'
                          : req.status === 'rejected'
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/25'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25 animate-pulse'
                      }`}>
                        {req.status === 'approved' ? '✓ Disetujui' : req.status === 'rejected' ? '✗ Ditolak' : '⏱ Pending'}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right flex items-center justify-end gap-1.5">
                      {req.status !== 'approved' && (
                        <button
                          onClick={() => handleApproveRequest(req.email)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors font-semibold flex items-center gap-1 shrink-0"
                          title="Setujui Premium"
                        >
                          <Check className="w-3 h-3" /> Setujui
                        </button>
                      )}
                      {req.status !== 'rejected' && (
                        <button
                          onClick={() => handleRejectRequest(req.email)}
                          className="px-2.5 py-1 bg-rose-600 hover:bg-rose-505 text-white rounded-lg transition-colors font-semibold flex items-center gap-1 shrink-0"
                          title="Tolak Premium"
                        >
                          <X className="w-3 h-3" /> Tolak
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteRequest(req.email)}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors shrink-0"
                        title="Hapus Tiket"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NEW SECTION: Invite Codes Generation & List */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              Kode Undangan Sekali Pakai (Berlaku 7 Hari)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Buat kode unik untuk dibagikan kepada pengguna. Pengguna dapat menggunakannya satu kali untuk mendapatkan akses premium.
            </p>
          </div>
          <button
            onClick={handleGenerateCode}
            disabled={isLoading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Generate Kode Baru
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/5 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-2">Kode Undangan</th>
                <th className="py-3 px-2">Status</th>
                <th className="py-3 px-2">Tgl Dibuat</th>
                <th className="py-3 px-2">Berlaku Sampai</th>
                <th className="py-3 px-2">Digunakan Oleh</th>
                <th className="py-3 px-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {inviteCodes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                    Belum ada kode undangan yang dibuat.
                  </td>
                </tr>
              ) : (
                [...inviteCodes].sort((a,b) => (b.generatedAt?.seconds || 0) - (a.generatedAt?.seconds || 0)).map((item) => {
                  const now = new Date();
                  const expiresAt = item.expiresAt?.toDate ? item.expiresAt.toDate() : (item.expiresAt ? new Date(item.expiresAt) : null);
                  const isExpired = expiresAt && now > expiresAt;
                  const isUsed = item.used === true;

                  let statusText = 'Aktif (Siap Dipakai)';
                  let statusColor = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25';

                  if (isUsed) {
                    statusText = 'Terpakai';
                    statusColor = 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/25';
                  } else if (isExpired) {
                    statusText = 'Hangus/Expired';
                    statusColor = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/25';
                  }

                  return (
                    <tr key={item.id} className={`border-b border-slate-100 dark:border-white/5 hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors font-medium ${isUsed || isExpired ? 'opacity-70' : ''}`}>
                      <td className="py-3 px-2 font-mono text-slate-800 dark:text-slate-200 font-bold">{item.code}</td>
                      <td className="py-3 px-2">
                         <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${statusColor}`}>
                           {statusText}
                         </span>
                      </td>
                      <td className="py-3 px-2 text-slate-500 text-[10px]">
                        {item.generatedAt?.toDate ? item.generatedAt.toDate().toLocaleDateString() : '-'}
                      </td>
                      <td className="py-3 px-2 text-slate-500 text-[10px]">
                        {expiresAt ? expiresAt.toLocaleDateString() : '-'}
                      </td>
                      <td className="py-3 px-2 text-slate-500 text-[10px] font-mono">
                         {item.usedBy || '-'}
                      </td>
                      <td className="py-3 px-2 text-right">
                         <button
                            onClick={() => handleDeleteCode(item.id)}
                            className="p-1.5 hover:bg-rose-500/10 text-rose-500 hover:text-rose-600 rounded-lg transition-colors inline-flex"
                            title="Hapus Kode"
                         >
                            <Trash2 className="w-3.5 h-3.5" />
                         </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
