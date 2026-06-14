import React, { useState } from 'react';
import { X, Heart, Sparkles, ClipboardCheck, Copy, Download, Coffee } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface DonationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Helper to calculate exact CRC-16 CCITT (false) checksum as required by the QRIS specification.
function computeCRC16(str: string): string {
  let crc = 0xFFFF;
  for (let c = 0; c < str.length; c++) {
    const code = str.charCodeAt(c);
    crc ^= (code << 8);
    for (let i = 0; i < 8; i++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  let hex = crc.toString(16).toUpperCase();
  return hex.padStart(4, '0');
}

export default function DonationModal({ isOpen, onClose }: DonationModalProps) {
  const [copiedNmid, setCopiedNmid] = useState(false);
  const [imageError, setImageError] = useState(false);

  if (!isOpen) return null;

  const handleCopyNmid = () => {
    navigator.clipboard.writeText("ID202221296747");
    setCopiedNmid(true);
    setTimeout(() => setCopiedNmid(false), 2000);
  };

  const downloadQR = () => {
    if (!imageError) {
      // If the static QRIS poster has loaded successfully, download that file directly
      const downloadLink = document.createElement("a");
      downloadLink.href = "/qris.png";
      downloadLink.download = "qris-akm-store-donation.png";
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      return;
    }

    const svgElement = document.getElementById("qris-modal-svg");
    if (!svgElement) return;

    try {
      const svgString = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const blobURL = window.URL.createObjectURL(svgBlob);
      
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        // 600x600 for high resolution details
        canvas.width = 600;
        canvas.height = 600;
        const context = canvas.getContext("2d");
        if (context) {
          context.fillStyle = "#FFFFFF";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 50, 50, 500, 500);
          
          const pngURL = canvas.toDataURL("image/png");
          const downloadLink = document.createElement("a");
          downloadLink.href = pngURL;
          downloadLink.download = "qris-akm-store-donation.png";
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
          window.URL.revokeObjectURL(blobURL);
        }
      };
      image.src = blobURL;
    } catch (error) {
      console.error("Gagal mendownload QR", error);
    }
  };

  // Generate authentic QRIS String
  const qrisBase = "00020101021126670016ID.CO.QRIS.WWW0215ID2022212967470303A0151440014ID.CO.QRIS.WWW0215ID2022212967470303A015204000053033605802ID5909AKM STORE6015BANDUNG/JAKARTA61054011562210717202307180936005036304";
  const qrisPayload = qrisBase + computeCRC16(qrisBase);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      {/* Background click handler */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal Box */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl relative z-10 flex flex-col lg:flex-row gap-8 p-6 md:p-8">
        
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-650 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-colors cursor-pointer"
          title="Tutup"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Left: Authentic QRIS Ticket/Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-5 w-full max-w-[320px] mx-auto lg:mx-0 flex flex-col items-center relative overflow-hidden select-none shrink-0 border-t-8 border-indigo-600 bg-white">
          {/* National logos bar */}
          <div className="w-full flex items-center justify-between mb-4 px-1">
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-0.5">
                <span className="text-xs font-black tracking-tighter text-slate-950 bg-slate-100 px-1 py-0.5 rounded border border-slate-350">QRIS</span>
                <span className="text-[7px] leading-tight font-semibold text-slate-550 max-w-[65px]">QR Code Standar Pembayaran Nasional</span>
              </div>
            </div>
            
            {/* Eagle GPN logo */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-black text-rose-600 font-sans tracking-tight">GPN</span>
              <span className="w-3.5 h-3.5 bg-rose-500 rounded-full flex items-center justify-center text-[7px] text-white font-bold">🇮🇩</span>
            </div>
          </div>

          {/* Merchant Identity block */}
          <div className="text-center mb-3">
            <h4 className="text-base font-extrabold text-slate-900 tracking-wide font-sans">AKM STORE</h4>
            <div className="flex items-center justify-center gap-1.5 mt-0.5">
              <p className="text-[11px] text-slate-600 bg-slate-150 px-1.5 py-0.5 rounded font-mono">NMID : ID202221296747</p>
              <button
                onClick={handleCopyNmid}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-650 transition-colors cursor-pointer"
                title="Salin NMID"
              >
                {copiedNmid ? <ClipboardCheck className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
            <p className="text-[9px] text-slate-400 font-mono mt-0.5">A01</p>
          </div>

          {/* QR Code Graphic Frame Container */}
          <div className="bg-slate-50 border-4 border-slate-100 p-4 rounded-xl shadow-inner relative flex items-center justify-center min-h-[212px] min-w-[212px]">
            <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-indigo-600"></div>
            <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-indigo-600"></div>
            <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-indigo-600"></div>
            <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-indigo-600"></div>

            {!imageError ? (
              <img
                src="/qris.png"
                onError={() => setImageError(true)}
                className="w-[180px] h-[180px] object-contain block select-none rounded"
                alt="QRIS AKM STORE"
              />
            ) : (
              <QRCodeSVG
                id="qris-modal-svg"
                value={qrisPayload}
                size={180}
                level="M"
                includeMargin={false}
                className="mix-blend-multiply"
              />
            )}
          </div>

          {/* Interactive Download Button */}
          <button
            onClick={downloadQR}
            className="mt-4 flex items-center justify-center gap-2 w-full bg-slate-900 border border-slate-800 hover:bg-slate-850 dark:bg-indigo-600 dark:border-indigo-500 dark:hover:bg-indigo-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs transition-colors shadow-md cursor-pointer shrink-0"
            title="Unduh QR Code agar mudah di-scan dari Galeri HP Anda"
          >
            <Download className="w-3.5 h-3.5" />
            Unduh QR Gambar (PNG)
          </button>

          {/* Sub-labeling standard banner */}
          <div className="text-center mt-4 w-full">
            <p className="text-[9px] font-black tracking-widest text-[#1e293b] font-sans">
              SATU QRIS UNTUK SEMUA
            </p>
            <p className="text-[7px] text-slate-500 font-sans tracking-wide">
              Cek aplikasi penyelenggara di: <span className="underline font-semibold">www.aspi-qris.id</span>
            </p>
          </div>

          {/* Footer printed specs */}
          <div className="w-full flex items-center justify-between mt-4 pt-2 border-t border-slate-100 font-mono text-[7px] text-slate-400 px-1">
            <span>Dicetak oleh : 93600503</span>
            <span>Versi Cetak : 2022.09.29</span>
          </div>
        </div>

        {/* Right: Descriptive features & benefits layout */}
        <div className="flex-1 space-y-5 text-left flex flex-col justify-center">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-500/10 text-rose-500 dark:text-rose-400 text-xs font-bold rounded-full mb-3">
              <Coffee className="w-3.5 h-3.5 animate-bounce" /> Hub Dukungan Kreator
            </span>
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              Dukung Pengembang CoinAI Flow <Sparkles className="w-5 h-5 text-amber-500 animate-pulse shrink-0" />
            </h3>
            <p className="text-sm text-slate-650 dark:text-slate-300 mt-2 leading-relaxed">
              Aplikasi <b>CoinAI Flow</b> dibangun mandiri secara penuh cinta dan dedikasi tinggi. 
              Sumbangsih berbentuk donasi seikhlasnya sangat berarti membantu kami membiayai server cloud berkecepatan tinggi, 
              asisten cerdas kecerdasan buatan, serta pemeliharaan fitur berkelanjutan.
            </p>
          </div>

          {/* Interactive Steps box */}
          <div className="bg-slate-50 dark:bg-white/5 border border-slate-150 dark:border-white/5 rounded-2xl p-4.5 space-y-3.5 shadow-sm">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Langkah Mudah Pembayaran:</h4>
            
            <div className="flex gap-3.5 items-start">
              <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-black flex items-center justify-center shrink-0 mt-0.5">1</span>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Unduh & Simpan Kode QR</p>
                <p className="text-xs text-slate-550 dark:text-slate-400 mt-0.5">Tekan tombol <b>"Unduh QR Gambar (PNG)"</b> di sebelah kiri untuk menyimpannya di ponsel Anda.</p>
              </div>
            </div>

            <div className="flex gap-3.5 items-start">
              <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-black flex items-center justify-center shrink-0 mt-0.5">2</span>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Buka E-Wallet / Mobile Banking</p>
                <p className="text-xs text-slate-550 dark:text-slate-400 mt-0.5">Mendukung semua aplikasi keuangan: GoPay, OVO, Dana, LinkAja, Sakuku, ShopeePay, Bank Jago, BCA, Mandiri, BRI dll.</p>
              </div>
            </div>

            <div className="flex gap-3.5 items-start">
              <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-black flex items-center justify-center shrink-0 mt-0.5">3</span>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Unggah Gambar QR atau Pindai</p>
                <p className="text-xs text-slate-550 dark:text-slate-400 mt-0.5">Gunakan menu 'Scan' atau 'Bayar' di aplikasi keuangan Anda, lalu pilih opsi unggah dari Galeri Foto untuk memilih kode QR tadi.</p>
              </div>
            </div>
          </div>

          {/* Warm closing card */}
          <div className="p-3 bg-amber-500/5 dark:bg-amber-500/10 rounded-xl border border-amber-500/10 text-xs text-amber-800 dark:text-amber-400 leading-relaxed font-sans flex items-center gap-2.5">
            <span className="text-lg">🙏</span>
            <p>Setiap nominal donasi Anda sangat berharga bagi kami. Semoga kebaikan Anda dibalas dengan kesehatan prima dan kesuksesan finansial berlimpah!</p>
          </div>
        </div>

      </div>
    </div>
  );
}
