import React, { useState, useMemo, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { X, FileText, CheckCircle2, FileDown, Calendar, AlertCircle, Layout, Sparkles, Sliders, Palette, Check, FileSpreadsheet, ArrowLeft, Upload } from 'lucide-react';
import { Transaction } from '../types';
import * as XLSX from 'xlsx';

interface ExportPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  userEmail?: string | null;
  userDisplayName?: string | null;
  isFullScreenMode?: boolean;
}

const ACCENT_COLORS = [
  { name: 'Indigo Corporate', hex: '#4f46e5' },
  { name: 'Emerald Trust', hex: '#10b981' },
  { name: 'Slate Modern', hex: '#3b82f6' },
  { name: 'Wine Elegant', hex: '#9f1239' },
  { name: 'Golden Prestige', hex: '#b45309' },
  { name: 'Vintage Sepia', hex: '#7c2d12' }
];

export default function ExportPdfModal({ isOpen, onClose, transactions, userEmail, userDisplayName, isFullScreenMode }: ExportPdfModalProps) {
  // Extract all unique months from current transactions list, sorted descending
  const uniqueMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    transactions.forEach(tx => {
      if (tx.timestamp) {
        monthsSet.add(format(tx.timestamp, 'yyyy-MM'));
      }
    });

    // If empty list, put current month
    if (monthsSet.size === 0) {
      monthsSet.add(format(new Date(), 'yyyy-MM'));
    }

    return Array.from(monthsSet).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const [selectedMonth, setSelectedMonth] = useState<string>(uniqueMonths[0] || format(new Date(), 'yyyy-MM'));
  const [includeDetails, setIncludeDetails] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);

  // Corporate Customizable Fields (PREMIUM)
  const [templateType, setTemplateType] = useState<string>('corporate');
  const [customTemplates, setCustomTemplates] = useState<{id: string, name: string, type: 'pdf'|'xlsx', addedAt: Date}[]>([]);
  const [companyName, setCompanyName] = useState<string>('PT COINAI KORPORAT GLOBAL');
  const [departmentName, setDepartmentName] = useState<string>('DIVISI FINANCE & AUDIT STRATEGIS');
  const [docRefNo, setDocRefNo] = useState<string>('');
  const [signatoryName, setSignatoryName] = useState<string>('');
  const [signatoryRole, setSignatoryRole] = useState<string>('Chief Financial Officer (CFO)');
  const [verificationNote, setVerificationNote] = useState<string>(
    'Laporan arus kas bulanan ini dijamin valid, bebas dari bias material, dan telah disetujui untuk sirkulasi internal dewan direksi.'
  );
  const [themeColor, setThemeColor] = useState<string>('#4f46e5');
  const [showEditFields, setShowEditFields] = useState<boolean>(false);

  // Sync default values when inputs or auth loads
  useEffect(() => {
    if (isOpen) {
      setDocRefNo(`REF/CAI-CORP/${selectedMonth.replace('-', '')}/098A`);
      setSignatoryName(
        userDisplayName || (userEmail ? userEmail.split('@')[0].toUpperCase() : 'AHMAD KHOIRUL MUNA')
      );
    }
  }, [selectedMonth, isOpen, userDisplayName, userEmail]);

  // Selected Month Totals for Real-time Preview in Modal
  const stats = useMemo(() => {
    const filtered = transactions.filter(tx => format(tx.timestamp, 'yyyy-MM') === selectedMonth);
    let income = 0;
    let expense = 0;
    filtered.forEach(tx => {
      if (tx.type === 'income') {
        income += tx.amount;
      } else {
        expense += tx.amount;
      }
    });
    return {
      income,
      expense,
      balance: income - expense,
      count: filtered.length
    };
  }, [transactions, selectedMonth]);

  if (!isFullScreenMode && !isOpen) return null;

  const formatIDR = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  };

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 79, g: 70, b: 229 };
  };

  const handleExportExcel = async () => {
    setIsExportingExcel(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    try {
      const filteredTxs = transactions.filter(tx => format(tx.timestamp, 'yyyy-MM') === selectedMonth);
      
      const excelData = filteredTxs.map((t, idx) => ({
        'No': idx + 1,
        'Tanggal': format(new Date(t.timestamp), 'dd MMMM yyyy HH:mm', { locale: id }),
        'Kategori': (t.category || 'General').toUpperCase(),
        'Tipe': t.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
        'Nominal': Number(t.amount) || 0,
        'Deskripsi': t.description || '-'
      }));
      
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      
      const range = XLSX.utils.decode_range(worksheet['!ref'] || "A1:F1");
      for (let row = range.s.r + 1; row <= range.e.r; ++row) {
        const cellRef = XLSX.utils.encode_cell({ c: 4, r: row });
        if (worksheet[cellRef]) {
          worksheet[cellRef].z = '"Rp"#,##0;[Red]"-"Rp"#,##0';
        }
      }
      
      worksheet['!cols'] = [
        { wch: 6 },
        { wch: 25 },
        { wch: 20 },
        { wch: 15 },
        { wch: 20 },
        { wch: 45 }
      ];
      
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Jurnal Arus Kas");
      
      XLSX.writeFile(workbook, `CoinAI_Spreadsheet_${companyName.replace(/\s+/g, '_')}_${selectedMonth.replace('-', '_')}.xlsx`);
    } catch (err) {
      console.error("Gagal mendownload Excel:", err);
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const filteredTxs = transactions.filter(tx => format(tx.timestamp, 'yyyy-MM') === selectedMonth);
      let totalIncome = 0;
      let totalExpense = 0;
      filteredTxs.forEach(tx => {
        if (tx.type === 'income') {
          totalIncome += tx.amount;
        } else {
          totalExpense += tx.amount;
        }
      });
      const balance = totalIncome - totalExpense;
      const isPositive = balance >= 0;

      const dateParts = selectedMonth.split('-');
      const yearStr = dateParts[0];
      const monthStr = dateParts[1];
      const dateObj = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
      const monthLabel = format(dateObj, 'MMMM yyyy', { locale: id });

      const formatCurrencyPDF = (val: number) => {
        return new Intl.NumberFormat('id-ID', {
          style: 'currency',
          currency: 'IDR',
          minimumFractionDigits: 0
        }).format(val);
      };

      const primaryRgb = hexToRgb(themeColor);

      // ==========================================
      // TEMPLATE 1: CORPORATE BLACK-TIE
      // ==========================================
      if (templateType === 'corporate' || templateType.startsWith('custom_')) {
        doc.setFont('Times', 'bold');
        doc.setFontSize(22);
        doc.setTextColor(15, 23, 42); 
        doc.text(companyName.toUpperCase(), 15, 20);

        doc.setFont('Times', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(71, 85, 105);
        doc.text(`${departmentName}  |  Doc Ref: ${docRefNo}`, 15, 25);

        // Decorative double lines
        doc.setDrawColor(30, 41, 59);
        doc.setLineWidth(0.8);
        doc.line(15, 28, 195, 28);
        doc.setLineWidth(0.2);
        doc.line(15, 29.2, 195, 29.2);

        // Document title
        doc.setFont('Times', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(15, 23, 42);
        doc.text(`LAPORAN ARUS KAS CORPORATE: PERIODE ${monthLabel.toUpperCase()}`, 15, 39);

        // Metadata
        doc.setFont('Times', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text(`Tanggal Cetak: ${format(new Date(), 'dd MMMM yyyy HH:mm', { locale: id })}`, 15, 44);
        doc.text(`Akun Sistem: ${userEmail || 'member@coinai.com'}`, 15, 49);

        // Boxes
        doc.setFillColor(250, 250, 250);
        doc.setDrawColor(220, 225, 230);
        doc.setLineWidth(0.2);
        
        // Income box
        doc.roundedRect(15, 55, 55, 20, 1, 1, 'FD');
        doc.setFont('Times', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(21, 128, 61);
        doc.text('A. REKAP PEMASUKAN', 19, 61);
        doc.setFontSize(11.5);
        doc.setTextColor(15, 23, 42);
        doc.text(formatCurrencyPDF(totalIncome), 19, 71);

        // Expense box
        doc.setFillColor(250, 250, 250);
        doc.roundedRect(75, 55, 55, 20, 1, 1, 'FD');
        doc.setFont('Times', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(185, 28, 28);
        doc.text('B. REKAP PENGELUARAN', 79, 61);
        doc.setFontSize(11.5);
        doc.setTextColor(15, 23, 42);
        doc.text(formatCurrencyPDF(totalExpense), 79, 71);

        // Balance box
        doc.setFillColor(250, 250, 250);
        doc.roundedRect(135, 55, 60, 20, 1, 1, 'FD');
        doc.setFont('Times', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(30, 41, 59);
        doc.text('C. SALDO NETTO (A - B)', 139, 61);
        doc.setFontSize(11.5);
        doc.setTextColor(isPositive ? 21 : 185, isPositive ? 128 : 28, isPositive ? 61 : 28);
        doc.text(formatCurrencyPDF(balance), 139, 71);

        let y = 88;

        if (includeDetails) {
          doc.setFont('Times', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(15, 23, 42);
          doc.text('BUKU JURNAL ARUS KAS CORPORATE', 15, y);

          doc.setFont('Times', 'italic');
          doc.setFontSize(8.5);
          doc.setTextColor(100, 116, 139);
          doc.text(`Tercatat ${filteredTxs.length} pos transaksi finansial komprehensif`, 15, y + 4);

          y += 9;

          const drawTableHeader = (startY: number) => {
            doc.setFillColor(30, 41, 59);
            doc.rect(15, startY, 180, 8, 'F');
            doc.setFont('Times', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(255, 255, 255);
            doc.text('No', 17, startY + 5.5);
            doc.text('Tanggal & Jam', 24, startY + 5.5);
            doc.text('Kode / Kategori', 54, startY + 5.5);
            doc.text('Deskripsi / Referensi', 83, startY + 5.5);
            doc.text('Jenis', 142, startY + 5.5);
            doc.text('Nominal (Rupiah)', 193, startY + 5.5, { align: 'right' });
          };

          drawTableHeader(y);
          y += 8;

          const sorted = [...filteredTxs].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          sorted.forEach((tx, idx) => {
            if (y > 250) {
              doc.addPage();
              doc.setFont('Times', 'italic');
              doc.setFontSize(8);
              doc.setTextColor(148, 163, 184);
              doc.text(`Laporan Arus Kas - ${companyName} - Hal Sambungan`, 15, 12);
              doc.line(15, 14, 195, 14);

              y = 18;
              drawTableHeader(y);
              y += 8;
            }

            if (idx % 2 === 1) {
              doc.setFillColor(248, 250, 252);
              doc.rect(15, y, 180, 7, 'F');
            }

            doc.setDrawColor(241, 245, 249);
            doc.line(15, y + 7, 195, y + 7);

            doc.setFont('Times', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(51, 65, 85);
            
            doc.text((idx + 1).toString(), 17, y + 4.5);
            doc.text(format(new Date(tx.timestamp), 'dd/MM/yyyy HH:mm'), 24, y + 4.5);
            doc.text(tx.category || 'LAIN-LAIN', 54, y + 4.5);

            let desc = tx.description || '-';
            if (desc.length > 35) desc = desc.substring(0, 33) + '...';
            doc.text(desc, 83, y + 4.5);

            const isInc = tx.type === 'income';
            doc.setFont('Times', 'bold');
            doc.setTextColor(isInc ? 21 : 185, isInc ? 128 : 28, isInc ? 61 : 28);
            doc.text(isInc ? 'PEMASUKAN' : 'PENGELUARAN', 142, y + 4.5);

            const amt = (isInc ? '+ ' : '- ') + formatCurrencyPDF(tx.amount);
            doc.text(amt, 193, y + 4.5, { align: 'right' });

            doc.setTextColor(51, 65, 85);
            y += 7;
          });
        } else {
          // Summary
          doc.setFont('Times', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(15, 23, 42);
          doc.text('STATEMENT REKAPITULASI NERACA BULANAN', 15, y);

          doc.setFont('Times', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(100, 116, 139);
          doc.text('Data rekapitulasi tersimpan secara tersertifikasi di cloud server aman.', 15, y + 4.5);

          y += 12;
          doc.setFillColor(248, 250, 252);
          doc.roundedRect(15, y, 180, 25, 1, 1, 'FD');
          doc.setDrawColor(226, 232, 240);
          
          doc.setFont('Times', 'bold');
          doc.setFontSize(9.5);
          doc.setTextColor(15, 23, 42);
          doc.text('Informasi Konsolidasi Kas:', 20, y + 7);

          doc.setFont('Times', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(71, 85, 105);
          doc.text(`Pencatatan Berhasil: ${filteredTxs.length} transaksi diintegrasikan`, 20, y + 13);
          doc.text(`Status Kelayakan Dana: ${isPositive ? 'SURPLUS DATA (LIKUID)' : 'DEFISIT DATA (PERKETAT ANGGARAN)'}`, 20, y + 19);
          y += 30;
        }

        // Signature
        if (y > 230) {
          doc.addPage();
          y = 20;
        }

        y += 10;
        doc.setDrawColor(226, 232, 240);
        doc.line(15, y, 195, y);

        y += 8;
        doc.setFont('Times', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text('VERIFIKASI INTEGRITAS SISTEM', 15, y);
        
        doc.setFont('Times', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(verificationNote, 15, y + 5, { maxWidth: 110 });

        doc.setFont('Times', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text('Disahkan Oleh CFO,', 140, y);

        doc.setFont('Times', 'italic');
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text('TANDA TANGAN ELEKTRONIK DIREKSI', 140, y + 12);
        doc.text('[ VERIFIED BY COINAI SECURE ENGINE ]', 140, y + 15);

        doc.line(140, y + 17, 185, y + 17);
        doc.setFont('Times', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        doc.text(signatoryName.toUpperCase(), 140, y + 21);
        doc.setFont('Times', 'normal');
        doc.setFontSize(8);
        doc.text(signatoryRole, 140, y + 25);
      }

      // ==========================================
      // TEMPLATE 2: STARTUP MODERN
      // ==========================================
      else if (templateType === 'modern') {
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(24);
        doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
        doc.text(companyName.toUpperCase(), 15, 21);

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        doc.text(departmentName.toUpperCase(), 15, 26);

        // Sidebar color marker strip
        doc.setFillColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
        doc.rect(15, 29, 180, 2, 'F');

        // Document Title
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(15, 23, 42);
        doc.text(`STARTUP INCOME STATEMENT: ${monthLabel.toUpperCase()}`, 15, 38);

        // Metadata block on right side
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Ref ID: ${docRefNo}`, 195, 38, { align: 'right' });
        doc.text(`Generated at: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 195, 42, { align: 'right' });

        // Cool modern grid boxes
        doc.setFillColor(243, 244, 246);
        
        // Income box
        doc.rect(15, 49, 56, 18, 'F');
        doc.setDrawColor(209, 213, 219);
        doc.rect(15, 49, 56, 18, 'D');
        // Left accent block
        doc.setFillColor(16, 185, 129); // emerald
        doc.rect(15, 49, 2, 18, 'F');
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text('TOTAL REVENUE', 20, 54);
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text(formatCurrencyPDF(totalIncome), 20, 62);

        // Expense box
        doc.setFillColor(243, 244, 246);
        doc.rect(77, 49, 56, 18, 'F');
        doc.rect(77, 49, 56, 18, 'D');
        doc.setFillColor(239, 68, 68); // Red
        doc.rect(77, 49, 2, 18, 'F');
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text('TOTAL OPEX', 82, 54);
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text(formatCurrencyPDF(totalExpense), 82, 62);

        // Net Operating Income box
        doc.setFillColor(243, 244, 246);
        doc.rect(139, 49, 56, 18, 'F');
        doc.rect(139, 49, 56, 18, 'D');
        doc.setFillColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
        doc.rect(139, 49, 2, 18, 'F');
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text('NET REVENUE', 144, 54);
        doc.setFontSize(11);
        doc.setTextColor(isPositive ? 16 : 239, isPositive ? 185 : 68, isPositive ? 129 : 68);
        doc.text(formatCurrencyPDF(balance), 144, 62);

        let y = 78;

        if (includeDetails) {
          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(10.5);
          doc.setTextColor(15, 23, 42);
          doc.text('TRANSACTION LEDGER INDEX', 15, y);
          y += 6;

          const drawTableHeader = (startY: number) => {
            doc.setFillColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
            doc.rect(15, startY, 180, 7.5, 'F');
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(255, 255, 255);
            doc.text('DATE', 17, startY + 5);
            doc.text('CATEGORY', 53, startY + 5);
            doc.text('MEMO / NOTE', 85, startY + 5);
            doc.text('TYPE', 140, startY + 5);
            doc.text('AMOUNT', 193, startY + 5, { align: 'right' });
          };

          drawTableHeader(y);
          y += 7.5;

          const sorted = [...filteredTxs].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          sorted.forEach((tx, idx) => {
            if (y > 250) {
              doc.addPage();
              doc.setFont('Helvetica', 'bold');
              doc.setFontSize(7);
              doc.setTextColor(148, 163, 184);
              doc.text(`MODERN STARTUP ACCRUAL BALANCE - ${monthLabel.toUpperCase()}`, 15, 11);
              y = 16;
              drawTableHeader(y);
              y += 7.5;
            }

            if (idx % 2 === 1) {
              doc.setFillColor(249, 250, 251);
              doc.rect(15, y, 180, 7, 'F');
            }

            doc.setDrawColor(243, 244, 246);
            doc.line(15, y + 7, 195, y + 7);

            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(75, 85, 99);
            
            doc.text(format(new Date(tx.timestamp), 'dd MMM yyyy, HH:mm'), 17, y + 4.5);
            doc.text((tx.category || 'General').toUpperCase(), 53, y + 4.5);

            let desc = tx.description || '-';
            if (desc.length > 36) desc = desc.substring(0, 34) + '...';
            doc.text(desc, 85, y + 4.5);

            const isInc = tx.type === 'income';
            doc.setFont('Helvetica', 'bold');
            doc.setTextColor(isInc ? 16 : 239, isInc ? 185 : 68, isInc ? 129 : 68);
            doc.text(isInc ? 'CREDIT' : 'DEBIT', 140, y + 4.5);

            const amt = (isInc ? '+ ' : '- ') + formatCurrencyPDF(tx.amount);
            doc.text(amt, 193, y + 4.5, { align: 'right' });

            doc.setTextColor(75, 85, 99);
            y += 7;
          });
        } else {
          // Summary
          y += 10;
          doc.setFillColor(249, 250, 251);
          doc.rect(15, y, 180, 25, 'F');
          doc.setDrawColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
          doc.setLineWidth(0.5);
          doc.line(15, y, 15, y + 25);

          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(15, 23, 42);
          doc.text('ACCUMULATIVE REVENUE REPORT SUMMARY', 20, y + 6);
          
          doc.setFont('Helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(107, 114, 128);
          doc.text(`- Consolidated transactional points calculated: ${filteredTxs.length} logs`, 20, y + 12);
          doc.text(`- Monthly financial liquidity scale status: ${isPositive ? 'HEALTHY OPERATING CASHFLOW' : 'DEFICIT LEVEL IDENTIFIED'}`, 20, y + 18);
          y += 35;
        }

        // Sign
        if (y > 230) {
          doc.addPage();
          y = 20;
        }

        y += 10;
        doc.setDrawColor(243, 244, 246);
        doc.setLineWidth(0.3);
        doc.line(15, y, 195, y);

        y += 6;
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text('DATA AUTHENTICITY NOTE', 15, y);
        
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(107, 114, 128);
        doc.text(verificationNote, 15, y + 4, { maxWidth: 110 });

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
        doc.text('AUTHORIZED SIGNATORY,', 140, y);

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(156, 163, 175);
        doc.text('E-STAMP / CRYPTO SEALED', 140, y + 11);
        doc.text('SYS: SECURE NODE VERIFIED', 140, y + 14);

        doc.setDrawColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
        doc.line(140, y + 16, 185, y + 16);

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text(signatoryName.toUpperCase(), 140, y + 20);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(107, 114, 128);
        doc.text(signatoryRole, 140, y + 24);
      }

      // ==========================================
      // TEMPLATE 3: AUDITED TAX & REPORT BORDER STYLE (THEMED!)
      // ==========================================
      else if (templateType === 'certified') {
        // Page borders themed around chosen corporate identity color
        const addCertifiedBorder = (d: any) => {
          d.setDrawColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
          d.setLineWidth(0.4);
          d.rect(8, 8, 194, 281, 'D');
          d.setLineWidth(0.1);
          d.rect(9.2, 9.2, 191.6, 278.6, 'D');
        };

        // Add borders to the first page
        addCertifiedBorder(doc);

        doc.setFont('Times', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
        doc.text('INTERNAL REVENUE STATUS & BALANCE REPORT', 15, 20);

        doc.setFont('Times', 'bold');
        doc.setFontSize(10);
        doc.text(`REGISTRATION REF: ${docRefNo}`, 15, 25);
        doc.text(`ENTITY: ${companyName.toUpperCase()}`, 15, 29);

        doc.setDrawColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
        doc.setLineWidth(0.45);
        doc.line(15, 32, 195, 32);

        doc.setFont('Times', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        doc.text(`Audit Period: ${monthLabel.toUpperCase()}`, 15, 38);
        doc.text(`Reporting Office: ${departmentName}`, 15, 42);
        doc.text(`Audit Date: ${format(new Date(), 'dd MMMM yyyy HH:mm', { locale: id })}`, 15, 46);

        // Huge grid totals with corporate branding
        doc.setDrawColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
        doc.setLineWidth(0.2);
        doc.rect(15, 52, 180, 22, 'D');
        doc.line(75, 52, 75, 74);
        doc.line(135, 52, 135, 74);

        doc.setFont('Times', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
        doc.text('I. TOTAL INCOMING TAX ACCRUAL', 18, 57);
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text(formatCurrencyPDF(totalIncome), 18, 67);

        doc.setFont('Times', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
        doc.text('II. TOTAL OUTGOING LEVY EXPENSES', 78, 57);
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text(formatCurrencyPDF(totalExpense), 78, 67);

        doc.setFont('Times', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
        doc.text('III. CERTIFIED NET REMITTANCE', 138, 57);
        doc.setFontSize(11);
        doc.setTextColor(isPositive ? 21 : 185, isPositive ? 128 : 28, isPositive ? 61 : 28);
        doc.text(formatCurrencyPDF(balance), 138, 67);

        let y = 85;

        if (includeDetails) {
          doc.setFont('Times', 'bold');
          doc.setFontSize(10.5);
          doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
          doc.text('DETAILED ARDUOUS ARUS KAS AUDIT RECORD', 15, y);
          y += 6;

          const drawTableHeader = (startY: number) => {
            doc.setFillColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
            doc.rect(15, startY, 180, 8, 'F');
            doc.setFont('Times', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(255, 255, 255);
            doc.text('NO', 17, startY + 5.5);
            doc.text('TIMESTAMP', 24, startY + 5.5);
            doc.text('AUDIT CATEGORY', 52, startY + 5.5);
            doc.text('TRANSACTION REF', 82, startY + 5.5);
            doc.text('TAX SCALE', 140, startY + 5.5);
            doc.text('ACCUMULATIVE', 193, startY + 5.5, { align: 'right' });
          };

          drawTableHeader(y);
          y += 8;

          const sorted = [...filteredTxs].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          sorted.forEach((tx, idx) => {
            if (y > 245) {
              doc.addPage();
              addCertifiedBorder(doc);
              doc.setFont('Times', 'italic');
              doc.setFontSize(8);
              doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
              doc.text(`AUDITED LEDGER BORDER SHEETS - ${companyName}`, 15, 12);
              doc.line(15, 14, 195, 14);

              y = 18;
              drawTableHeader(y);
              y += 8;
            }

            // Draw full grid lines in theme colors for premium audit aesthetics
            doc.setDrawColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
            doc.setLineWidth(0.05);
            doc.line(15, y + 7, 195, y + 7);
            doc.line(15, y, 15, y + 7);
            doc.line(22, y, 22, y + 7);
            doc.line(50, y, 50, y + 7);
            doc.line(80, y, 80, y + 7);
            doc.line(138, y, 138, y + 7);
            doc.line(195, y, 195, y + 7);

            doc.setFont('Times', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(15, 23, 42);
            
            doc.text((idx + 1).toString(), 17, y + 4.5);
            doc.text(format(new Date(tx.timestamp), 'dd/MM/yyyy HH:mm'), 24, y + 4.5);
            doc.text((tx.category || 'GENERAL').toUpperCase(), 52, y + 4.5);

            let desc = tx.description || 'No sub-data provided.';
            if (desc.length > 32) desc = desc.substring(0, 30) + '..';
            doc.text(desc, 82, y + 4.5);

            const isInc = tx.type === 'income';
            doc.setFont('Times', 'bold');
            doc.setTextColor(isInc ? 21 : 185, isInc ? 128 : 28, isInc ? 61 : 28);
            doc.text(isInc ? 'INBOUND' : 'OUTBOUND', 140, y + 4.5);

            const amt = (isInc ? '+ ' : '- ') + formatCurrencyPDF(tx.amount);
            doc.text(amt, 193, y + 4.5, { align: 'right' });

            y += 7;
          });
        } else {
          // Summary
          y += 10;
          doc.setFillColor(250, 250, 250);
          doc.rect(15, y, 180, 20, 'FD');
          doc.setFont('Times', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
          doc.text('OFFICIAL CERTIFICATION BALANCE SUMMARY STATEMENT', 19, y + 6);
          doc.setFont('Times', 'normal');
          doc.setTextColor(15, 23, 42);
          doc.text(`A total of ${filteredTxs.length} entries have been fully examined under active audit guidelines.`, 19, y + 13);
          y += 28;
        }

        // Signature inside borders
        if (y > 220) {
          doc.addPage();
          addCertifiedBorder(doc);
          y = 20;
        }

        y += 10;
        doc.setDrawColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
        doc.setLineWidth(0.3);
        doc.line(15, y, 195, y);

        y += 6;
        doc.setFont('Times', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
        doc.text('STATEMENT OF STATUTORY COMPLIANCE', 15, y);

        doc.setFont('Times', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(51, 65, 85);
        doc.text(verificationNote, 15, y + 4.5, { maxWidth: 110 });

        doc.setFont('Times', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
        doc.text('OFFICIAL LAND DEED / AUDITOR SEAL,', 140, y);

        doc.setFont('Times', 'italic');
        doc.setFontSize(7);
        doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
        doc.text('AFFIX SEAL COINAI TRUST AUTHORITY', 140, y + 11);
        doc.text('[ LICENSED COMPLIANCE NODE #442B ]', 140, y + 14);

        doc.setDrawColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
        doc.line(140, y + 16, 185, y + 16);

        doc.setFont('Times', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text(signatoryName.toUpperCase(), 140, y + 20);
        doc.setFont('Times', 'normal');
        doc.setTextColor(51, 65, 85);
        doc.text(signatoryRole, 140, y + 24);
      }
      // ==========================================
      // TEMPLATE 4: VINTAGE SEPIA TRADITIONAL LEDGER
      // ==========================================
      else if (templateType === 'vintage') {
        const addVintageBorder = (d: any) => {
          d.setDrawColor(124, 45, 18);
          d.setLineWidth(1.0);
          d.rect(10, 10, 190, 277, 'D');
          d.setLineWidth(0.3);
          d.rect(11.5, 11.5, 187, 274, 'D');
        };

        addVintageBorder(doc);

        doc.setFont('Times', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(124, 45, 18);
        doc.text(companyName.toUpperCase(), 15, 23);

        doc.setFont('Times', 'italic');
        doc.setFontSize(9.5);
        doc.text(`Divisi Ledger: ${departmentName}`, 15, 28);
        doc.text(`Ref No: ${docRefNo}`, 15, 32);

        doc.setDrawColor(124, 45, 18);
        doc.setLineWidth(0.7);
        doc.line(15, 35, 195, 35);
        doc.setLineWidth(0.2);
        doc.line(15, 36.5, 195, 36.5);

        doc.setFont('Times', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(60, 30, 10);
        doc.text(`Periode Laporan Pajak Ledger: ${monthLabel}`, 15, 42);
        doc.text(`Dicetak Pada: ${format(new Date(), 'dd MMMM yyyy HH:mm', { locale: id })}`, 15, 47);

        doc.setDrawColor(124, 45, 18);
        doc.setLineWidth(0.4);
        doc.rect(15, 52, 180, 20, 'D');
        doc.line(75, 52, 75, 72);
        doc.line(135, 52, 135, 72);

        doc.setFont('Times', 'bold');
        doc.setFontSize(7.5);
        doc.text('I. NOMINAL PENYETORAN (INFLOW)', 18, 57);
        doc.setFontSize(11);
        doc.text(formatCurrencyPDF(totalIncome), 18, 66);

        doc.setFont('Times', 'bold');
        doc.setFontSize(7.5);
        doc.text('II. PENARIKAN & BEBAN (OUTFLOW)', 78, 57);
        doc.setFontSize(11);
        doc.text(formatCurrencyPDF(totalExpense), 78, 66);

        doc.setFont('Times', 'bold');
        doc.setFontSize(7.5);
        doc.text('III. SALDO BERSIH (NET ASSET)', 138, 57);
        doc.setFontSize(11);
        doc.text(formatCurrencyPDF(balance), 138, 66);

        let y = 82;

        if (includeDetails) {
          doc.setFont('Times', 'bold');
          doc.setFontSize(10);
          doc.text('CATATAN ARUS BUKU BESAR TRADISIONAL', 15, y);
          y += 6;

          const drawTableHeader = (startY: number) => {
            doc.setFillColor(124, 45, 18);
            doc.rect(15, startY, 180, 7.5, 'F');
            doc.setFont('Times', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(255, 255, 255);
            doc.text('NO', 17, startY + 5);
            doc.text('TANGGAL', 24, startY + 5);
            doc.text('REKENING / KATEGORI', 52, startY + 5);
            doc.text('KETERANGAN TRANSAKSI', 92, startY + 5);
            doc.text('NOMINAL', 193, startY + 5, { align: 'right' });
          };

          drawTableHeader(y);
          y += 7.5;

          const sorted = [...filteredTxs].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          sorted.forEach((tx, idx) => {
            if (y > 240) {
              doc.addPage();
              addVintageBorder(doc);
              doc.setFont('Times', 'italic');
              doc.setFontSize(8);
              doc.text(`LEDGER TRADISIONAL HILIR - ${companyName}`, 15, 15);
              y = 20;
              drawTableHeader(y);
              y += 7.5;
            }

            doc.setDrawColor(124, 45, 18);
            doc.setLineWidth(0.15);
            doc.line(15, y + 6.5, 195, y + 6.5);

            doc.setFont('Times', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(50, 25, 5);
            
            doc.text((idx + 1).toString(), 17, y + 4.5);
            doc.text(format(new Date(tx.timestamp), 'dd/MM/yyyy HH:mm'), 24, y + 4.5);
            doc.text((tx.category || 'Gelar').toUpperCase(), 52, y + 4.5);

            let desc = tx.description || '-';
            if (desc.length > 40) desc = desc.substring(0, 38) + '..';
            doc.text(desc, 92, y + 4.5);

            const isInc = tx.type === 'income';
            doc.setFont('Times', 'bold');
            const amt = (isInc ? '(+) ' : '(-) ') + formatCurrencyPDF(tx.amount);
            doc.text(amt, 193, y + 4.5, { align: 'right' });

            y += 6.5;
          });
        } else {
          y += 10;
          doc.setDrawColor(124, 45, 18);
          doc.rect(15, y, 180, 18, 'D');
          doc.setFont('Times', 'bold');
          doc.setFontSize(9);
          doc.text('RINGKASAN REKAPITULASI BUKU BESAR', 19, y + 6);
          doc.setFont('Times', 'italic');
          doc.setFontSize(8);
          doc.text(`Telah diperiksa segenap ${filteredTxs.length} catatan debet & kredit secara manual tanpa bias material.`, 19, y + 12);
          y += 25;
        }

        if (y > 220) {
          doc.addPage();
          addVintageBorder(doc);
          y = 20;
        }

        y += 10;
        doc.setDrawColor(124, 45, 18);
        doc.setLineWidth(0.4);
        doc.line(15, y, 195, y);

        y += 6;
        doc.setFont('Times', 'bold');
        doc.setFontSize(8.5);
        doc.text('PERNYATAAN KEABSAHAN LEDGER TRADISIONAL', 15, y);

        doc.setFont('Times', 'normal');
        doc.setFontSize(8);
        doc.text(verificationNote, 15, y + 5, { maxWidth: 110 });

        doc.setFont('Times', 'bold');
        doc.setFontSize(8.5);
        doc.text('PENANDATANGAN UTAMA,', 140, y);

        doc.setFont('Times', 'italic');
        doc.setFontSize(7.5);
        doc.text('TERSEGEL SECARA MANUAL & VERIFIKASI', 140, y + 11);

        doc.setDrawColor(124, 45, 18);
        doc.line(140, y + 15, 185, y + 15);

        doc.setFont('Times', 'bold');
        doc.setFontSize(9);
        doc.text(signatoryName.toUpperCase(), 140, y + 19);
        doc.setFont('Times', 'normal');
        doc.text(signatoryRole, 140, y + 23);
      }
      // ==========================================
      // TEMPLATE 5: MINIMALIST EXECUTIVE JOURNAL
      // ==========================================
      else if (templateType === 'minimal') {
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(15);
        doc.setTextColor(30, 41, 59);
        doc.text(companyName.toUpperCase(), 15, 22);

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        doc.text(`Department: ${departmentName}   |   Ref: ${docRefNo}`, 15, 27);

        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.line(15, 30, 195, 30);

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        doc.text(`Period: ${monthLabel}`, 15, 36);
        doc.text(`Date of Release: ${format(new Date(), 'dd MMM yyyy HH:mm', { locale: id })}`, 15, 41);

        doc.setDrawColor(241, 245, 249);
        doc.setFillColor(248, 250, 252);
        doc.rect(15, 46, 180, 15, 'F');

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text('INCOME', 20, 51);
        doc.text('EXPENSE', 80, 51);
        doc.text('NET REVENUE', 140, 51);

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(30, 41, 59);
        doc.text(formatCurrencyPDF(totalIncome), 20, 57);
        doc.text(formatCurrencyPDF(totalExpense), 80, 57);
        doc.setTextColor(isPositive ? 16 : 225, isPositive ? 185 : 29, isPositive ? 129 : 72);
        doc.text(formatCurrencyPDF(balance), 140, 57);

        let y = 72;

        if (includeDetails) {
          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(9.5);
          doc.setTextColor(30, 41, 59);
          doc.text('TRANSACTIONAL LEDGER', 15, y);
          y += 5;

          const drawTableHeader = (startY: number) => {
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.3);
            doc.line(15, startY + 6, 195, startY + 6);
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(100, 116, 139);
            doc.text('NO', 15, startY + 4);
            doc.text('DATE & TIME', 22, startY + 4);
            doc.text('CATEGORY', 55, startY + 4);
            doc.text('MEMO / DESCRIPTION', 88, startY + 4);
            doc.text('SCALE', 140, startY + 4);
            doc.text('NET AMOUNT', 195, startY + 4, { align: 'right' });
          };

          drawTableHeader(y);
          y += 6;

          const sorted = [...filteredTxs].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          sorted.forEach((tx, idx) => {
            if (y > 255) {
              doc.addPage();
              y = 20;
              drawTableHeader(y);
              y += 6;
            }

            doc.setDrawColor(241, 245, 249);
            doc.setLineWidth(0.1);
            doc.line(15, y + 6, 195, y + 6);

            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(71, 85, 105);
            
            doc.text((idx + 1).toString(), 15, y + 4.5);
            doc.text(format(new Date(tx.timestamp), 'dd MMM yyyy HH:mm'), 22, y + 4.5);
            doc.text((tx.category || '').toUpperCase(), 55, y + 4.5);

            let desc = tx.description || '-';
            if (desc.length > 42) desc = desc.substring(0, 40) + '..';
            doc.text(desc, 88, y + 4.5);

            const isInc = tx.type === 'income';
            doc.text(isInc ? 'CREDIT' : 'DEBIT', 140, y + 4.5);

            doc.setFont('Helvetica', 'bold');
            doc.setTextColor(isInc ? 16 : 225, isInc ? 185 : 29, isInc ? 129 : 72);
            const amt = (isInc ? '+ ' : '- ') + formatCurrencyPDF(tx.amount);
            doc.text(amt, 195, y + 4.5, { align: 'right' });

            doc.setTextColor(71, 85, 105);
            y += 6;
          });
        } else {
          y += 10;
          doc.setFont('Helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(148, 163, 184);
          doc.text(`- Manual summary calculated: ${filteredTxs.length} journals`, 15, y);
          doc.text(`- Financial health verification clearance: PASSED`, 15, y + 5);
          y += 15;
        }

        if (y > 230) {
          doc.addPage();
          y = 20;
        }

        y += 15;
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.line(15, y, 195, y);

        y += 6;
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text('STATEMENT OF DISCLOSURE', 15, y);

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(verificationNote, 15, y + 4.5, { maxWidth: 110 });

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text('ISSUED BY,', 140, y);

        doc.setDrawColor(226, 232, 240);
        doc.line(140, y + 14, 185, y + 14);

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(30, 41, 59);
        doc.text(signatoryName.toUpperCase(), 140, y + 18);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(signatoryRole, 140, y + 22);
      }

      // Add page numbering details and save
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFont('Times', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(148, 163, 184);

        // Bottom border decorative lines
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(15, 283, 195, 283);

        doc.text(
          'Laporan ini diterbitkan otomatis oleh asisten keuangan pribadi digital CoinAI. Rahasia & Terlindung.',
          15,
          288
        );
        doc.text(`Halaman ${i} dari ${totalPages}`, 195, 288, { align: 'right' });
      }

      doc.save(`CoinAI_Laporan_Formal_${selectedMonth.replace('-', '_')}.pdf`);
      onClose();
    } catch (err) {
      console.error("Gagal mendownload PDF:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const currentMonthLabel = format(new Date(selectedMonth + '-01'), 'MMMM yyyy', { locale: id });

  if (isFullScreenMode) {
    return (
      <div className="w-full min-h-screen bg-slate-50 dark:bg-[#0b101f] text-slate-800 dark:text-slate-100 flex flex-col p-4 md:p-8 font-sans relative z-[70] overflow-y-auto" id="export-pdf-fullscreen-container">
        {/* Decorative Grid Patterns */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px] pointer-events-none" />

        <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col relative z-10">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-white/10 pb-5 mb-8">
            <div className="flex items-center gap-4">
              <button
                onClick={onClose}
                className="p-3 rounded-2xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-all shadow-sm flex items-center justify-center group"
                title="Kembali ke Beranda"
              >
                <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
              </button>
              <div>
                <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5 tracking-tight">
                  Pusat Laporan & Ekspor Jurnal
                  <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold px-3 py-0.5 rounded-full border border-amber-500/20 uppercase tracking-widest animate-pulse">👑 Korporat Premium</span>
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Konfigurasi formal, pembukuan digital, ekspor PDF bergaya akuntan publik, serta download spreadsheet XLSX.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 items-start">
            
            {/* Left Panel: Configurations & Customization */}
            <div className="lg:col-span-5 bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-sm space-y-6">
              
              <div className="flex items-center gap-3 border-b border-slate-100 dark:border-white/10 pb-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center border border-indigo-500/20">
                  <Sliders className="w-5 h-5 text-indigo-500" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">Konfigurasi Dokumen</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Silakan ubah rincian informasi dan gaya visual laporan Anda</p>
                </div>
              </div>

              {/* Template Picker */}
              <div className="space-y-2.5">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <Layout className="w-3.5 h-3.5 text-indigo-500" /> Pilih Desain Template Dokumen:
                </span>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setTemplateType('corporate')}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      templateType === 'corporate'
                        ? 'border-indigo-500 bg-indigo-500/5 ring-1 ring-indigo-500'
                        : 'border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10'
                    }`}
                  >
                    <p className="font-bold text-xs text-slate-800 dark:text-white">Corporate Black-Tie</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Sangat formal, font Times Serif klasik korporat besar.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTemplateType('modern')}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      templateType === 'modern'
                        ? 'border-indigo-500 bg-indigo-500/5 ring-1 ring-indigo-500'
                        : 'border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10'
                    }`}
                  >
                    <p className="font-bold text-xs text-slate-800 dark:text-white">Modern Startup</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Header tebal minimalis, warna aksen kustom.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTemplateType('certified')}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      templateType === 'certified'
                        ? 'border-indigo-500 bg-indigo-500/5 ring-1 ring-indigo-500'
                        : 'border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10'
                    }`}
                  >
                    <p className="font-bold text-xs text-slate-800 dark:text-white">Audited Tax Sheet</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Grid penuh sertifikat pajak, garis border penuh formal.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTemplateType('vintage')}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      templateType === 'vintage'
                        ? 'border-indigo-500 bg-indigo-500/5 ring-1 ring-indigo-500'
                        : 'border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10'
                    }`}
                  >
                    <p className="font-bold text-xs text-slate-800 dark:text-white">Vintage Sepia Ledger</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Gaya arsip kuno/klasik, garis ganda dengan warna sepia.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTemplateType('minimal')}
                    className={`p-3 rounded-2xl border text-left transition-all col-span-2 ${
                      templateType === 'minimal'
                        ? 'border-indigo-500 bg-indigo-500/5 ring-1 ring-indigo-500'
                        : 'border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10'
                    }`}
                  >
                    <p className="font-bold text-xs text-slate-800 dark:text-white">Minimalist Executive</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Super bersih, minim dekorasi garis tebal, bernuansa abu klan modern yang elegan.</p>
                  </button>
                </div>
              </div>

              {/* Accent Color Palettes */}
              {(templateType === 'modern' || templateType === 'certified') && (
                <div className="p-4 bg-slate-50 dark:bg-[#1e293b]/50 border border-slate-200 dark:border-white/10 rounded-2xl space-y-2.5">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-indigo-400" /> Warna Identitas Laporan (Aksen):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {ACCENT_COLORS.map(color => (
                      <button
                        key={color.hex}
                        type="button"
                        onClick={() => setThemeColor(color.hex)}
                        className={`px-3 py-1.5 rounded-xl border text-[10px] font-bold flex items-center gap-1.5 transition-all ${
                          themeColor === color.hex
                            ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-500/30'
                            : 'border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-355'
                        }`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: color.hex }} />
                        {color.name}
                        {themeColor === color.hex && <Check className="w-3 h-3 text-indigo-500" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Form Custom fields fully expanded */}
              <div className="space-y-4 pt-1 border-t border-slate-100 dark:border-white/10">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  ✏️ Rincian Informasi yang Dapat Digubah:
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-300 uppercase">Nama Perusahaan / Organisasi</label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-white focus:ring-1 focus:ring-indigo-500 font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-300 uppercase">Departemen / Divisi Penerbit</label>
                    <input
                      type="text"
                      value={departmentName}
                      onChange={(e) => setDepartmentName(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-white focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-300 uppercase">Nomor Referensi Dokumen</label>
                    <input
                      type="text"
                      value={docRefNo}
                      onChange={(e) => setDocRefNo(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-white font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-300 uppercase">Nama Penandatangan Resmi</label>
                    <input
                      type="text"
                      value={signatoryName}
                      onChange={(e) => setSignatoryName(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-white font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-300 uppercase">Jabatan Penandatangan</label>
                    <input
                      type="text"
                      value={signatoryRole}
                      onChange={(e) => setSignatoryRole(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-300 uppercase">Pilih Sektor Laporan (Periode)</label>
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-white font-semibold"
                    >
                      {uniqueMonths.map(m => {
                        const [y, mm] = m.split('-');
                        const dObj = new Date(parseInt(y, 10), parseInt(mm, 10) - 1, 1);
                        return (
                          <option key={m} value={m} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-xs">
                            {format(dObj, 'MMMM yyyy', { locale: id })}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-300 uppercase">Catatan Pernyataan Integritas Data (Sanksi / Legal / Legalitas)</label>
                  <textarea
                    value={verificationNote}
                    onChange={(e) => setVerificationNote(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-white min-h-[70px] leading-relaxed"
                  />
                </div>
              </div>

            </div>

            {/* Right Panel: Previews, Statistics & PDF Details */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Stat Card Row */}
              <div className="p-6 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-3xl space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-6 bg-indigo-500 rounded-full" />
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">Hasil Kalkulasi Arus Kas ({currentMonthLabel})</h3>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="flex flex-col p-4 bg-emerald-500/5 border border-emerald-500/10 dark:border-emerald-500/20 rounded-2xl">
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-sans">Kredit (Inflow)</span>
                    <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1 font-mono">{formatIDR(stats.income)}</span>
                  </div>
                  <div className="flex flex-col p-4 bg-rose-500/5 border border-rose-500/10 dark:border-rose-500/20 rounded-2xl">
                    <span className="text-xs text-rose-600 dark:text-rose-400 font-sans">Debet (Outflow)</span>
                    <span className="text-lg font-bold text-rose-600 dark:text-rose-400 mt-1 font-mono">{formatIDR(stats.expense)}</span>
                  </div>
                  <div className="flex flex-col p-4 bg-indigo-500/5 border border-indigo-500/10 dark:border-indigo-500/20 rounded-2xl justify-center">
                    <span className="text-xs text-indigo-600 dark:text-indigo-400 font-sans">Saldo Netto</span>
                    <span className={`text-lg font-bold font-mono mt-1 ${stats.balance >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {formatIDR(stats.balance)}
                    </span>
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs text-slate-500 border-t border-slate-100 dark:border-white/5 pt-4">
                  <span>Sektor Periode: <strong className="text-slate-700 dark:text-slate-350">{currentMonthLabel}</strong></span>
                  <span>Jumlah Data Terhitung: <strong className="text-slate-700 dark:text-slate-350">{stats.count} Baris Transaksi</strong></span>
                </div>
              </div>

              {/* Action Buttons for PDF + EXCEL */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={handleExportPDF}
                  className="py-4 px-6 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-2xl font-bold transition-all flex flex-col items-center justify-center gap-2 shadow-lg shadow-rose-600/10 active:scale-98 cursor-pointer"
                  id="pdf-main-download-btn"
                >
                  {isExporting ? (
                    <span className="flex items-center gap-2 justify-center">
                      <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Membuat PDF...
                    </span>
                  ) : (
                    <>
                      <FileDown className="w-6 h-6 text-white" />
                      <span>Unduh Laporan Formal (PDF)</span>
                      <span className="text-[10px] text-white/70 font-normal">Sertifikasi & Segel Digital Siap Print</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={isExportingExcel}
                  onClick={handleExportExcel}
                  className="py-4 px-6 bg-emerald-600 hover:bg-emerald-550 disabled:opacity-50 text-white rounded-2xl font-bold transition-all flex flex-col items-center justify-center gap-2 shadow-lg shadow-emerald-600/10 active:scale-98 cursor-pointer"
                  id="excel-main-download-btn"
                >
                  {isExportingExcel ? (
                    <span className="flex items-center gap-2 justify-center">
                      <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Membuat Excel...
                    </span>
                  ) : (
                    <>
                      <FileSpreadsheet className="w-6 h-6 text-white" />
                      <span>Unduh Jurnal Offline (.XLSX)</span>
                      <span className="text-[10px] text-white/70 font-normal">Spreadsheet Modifikasi Offline</span>
                    </>
                  )}
                </button>
              </div>

              {/* Include Details Options */}
              <div className="flex items-center justify-between p-5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl">
                <div className="text-left">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Sertakan detail tabel transaksi buku jurnal</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Jika dinonaktifkan, halaman PDF/Excel hanya mencakup rincian neraca kas utama.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIncludeDetails(!includeDetails)}
                  className={`w-11 h-6 rounded-full p-0.5 transition-colors focus:outline-none shrink-0 ${includeDetails ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-white/10'}`}
                  id="pdf-details-toggle-fullscreen"
                >
                  <div className={`w-5 h-5 rounded-full bg-white transition-transform ${includeDetails ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Quick Table Preview (Live View Draf Jurnal) */}
              {includeDetails && (
                <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-3xl overflow-hidden p-6 space-y-4">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                    <FileText className="w-4 h-4 text-indigo-500" /> Draf Transaksi Yang Akan Diekspor (Pertama 5 Baris)
                  </span>
                  <div className="overflow-x-auto border border-slate-100 dark:border-white/5 rounded-2xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-white/5 text-slate-500 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="p-3">Tanggal</th>
                          <th className="p-3">Kategori</th>
                          <th className="p-3">Keterangan</th>
                          <th className="p-3 text-right">Nominal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                        {transactions.filter(tx => format(tx.timestamp, 'yyyy-MM') === selectedMonth).slice(0, 5).map((tx, idx) => {
                          const isInc = tx.type === 'income';
                          return (
                            <tr key={tx.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                              <td className="p-3 text-slate-500 font-mono">{format(new Date(tx.timestamp), 'dd/MM HH:mm')}</td>
                              <td className="p-3 font-semibold uppercase text-slate-700 dark:text-slate-300">{tx.category}</td>
                              <td className="p-3 text-slate-500 max-w-[150px] truncate">{tx.description || '-'}</td>
                              <td className={`p-3 text-right font-bold font-mono ${isInc ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {isInc ? '+' : '-'} {formatIDR(Number(tx.amount))}
                              </td>
                            </tr>
                          );
                        })}
                        {transactions.filter(tx => format(tx.timestamp, 'yyyy-MM') === selectedMonth).length === 0 && (
                          <tr>
                            <td colSpan={4} className="p-4 text-center text-slate-400">Tidak ada transaksi ditemukan untuk bulan ini</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Seal details message */}
              <div className="p-4 bg-gradient-to-r from-amber-500/5 to-indigo-500/5 border border-amber-500/10 rounded-2xl text-xs leading-relaxed space-y-1">
                <p className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  Sertifikat Validitas Kriptografis Finansial:
                </p>
                <p className="text-slate-505 dark:text-slate-400 pl-5">
                  Setiap dokumen PDF yang diekspor disematkan sistem tanda tangan digital dari asisten CoinAI Anda. Laporan dilindungi secara legal, bebas dari modifikasi eksternal, dan langsung diakui sebagai berkas lampiran sirkulasi perpajakan atau bank secara formal.
                </p>
              </div>

            </div>

          </div>

        </div>
      </div>
    );
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200 animate-out fade-out" id="export-pdf-modal-container">
      <div className="bg-white dark:bg-[#1e293b] rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-white/10 relative flex flex-col gap-4 animate-in zoom-in-95 duration-250 max-h-[92vh] overflow-y-auto text-slate-800 dark:text-slate-100">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors z-[110]"
          title="Tutup"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-white/10 pb-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center text-lg font-bold border border-indigo-500/20">
            <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white font-sans flex items-center gap-2">
              Laporan PDF Premium
              <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/20 uppercase tracking-widest">👑 Premium Only</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Desain Laporan Tingkat Korporat yang Dapat Dikustomisasi Bebas</p>
          </div>
        </div>

        {/* Daftar Template & Upload */}
        <div className="space-y-4 text-left">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
               <Layout className="w-4 h-4 text-indigo-500" />
               Daftar Template Laporan
            </h4>
            <div>
              <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-bold rounded-xl transition-colors shrink-0">
                <Upload className="w-4 h-4" />
                Upload File (.pdf / .xlsx)
                <input 
                  type="file" 
                  className="hidden" 
                  accept=".pdf,.xlsx" 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const isExcel = file.name.endsWith('.xlsx');
                    const newTemplate = {
                      id: `custom_${Date.now()}`,
                      name: file.name,
                      type: isExcel ? 'xlsx' as const : 'pdf' as const,
                      addedAt: new Date()
                    };
                    setCustomTemplates(prev => [...prev, newTemplate]);
                    setTemplateType(newTemplate.id);
                  }} 
                />
              </label>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto pr-1">
             <div onClick={() => setTemplateType('corporate')} className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all w-full ${templateType === 'corporate' ? 'border-indigo-500 bg-indigo-500/5 ring-1 ring-indigo-500' : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'}`}>
                <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
                     <FileText className="w-4 h-4" />
                   </div>
                   <div className="text-left">
                     <p className="text-xs font-bold text-slate-800 dark:text-white">Template Laporan Standar</p>
                     <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Bawaan CoinAI</p>
                   </div>
                </div>
                {templateType === 'corporate' && <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />}
             </div>
             
             {customTemplates.map(t => (
               <div key={t.id} onClick={() => setTemplateType(t.id)} className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all w-full ${templateType === t.id ? 'border-indigo-500 bg-indigo-500/5 ring-1 ring-indigo-500' : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'}`}>
                 <div className="flex items-center gap-3">
                   <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${t.type === 'pdf' ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-500' : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500'}`}>
                     {t.type === 'pdf' ? <FileText className="w-4 h-4" /> : <FileSpreadsheet className="w-4 h-4" />}
                   </div>
                   <div className="text-left w-full overflow-hidden">
                     <p className="text-xs font-bold text-slate-800 dark:text-white truncate" title={t.name}>{t.name}</p>
                     <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Diunggah: {t.addedAt.toLocaleDateString('id-ID')}</p>
                   </div>
                 </div>
                 {templateType === t.id && <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />}
               </div>
             ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-indigo-500" /> Pilih Periode Laporan:</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full bg-slate-50 dark:bg-[#1e293b]/70 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-xs text-slate-800 dark:text-white font-bold cursor-pointer transition-colors focus:ring-1 focus:ring-indigo-500"
          >
            {uniqueMonths.map(m => {
              const [y, mm] = m.split('-');
              const dObj = new Date(parseInt(y, 10), parseInt(mm, 10) - 1, 1);
              return (
                <option key={m} value={m} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-xs">
                  {format(dObj, 'MMMM yyyy', { locale: id })}
                </option>
              );
            })}
          </select>
        </div>

        {/* Quick Statistics Box preview */}
        <div className="p-3.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl space-y-1.5 text-xs">
          <p className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 mb-1">
            <AlertCircle className="w-3.5 h-3.5 text-indigo-400" /> Estimasi Komposisi Finansial ({currentMonthLabel}):
          </p>
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            <div className="flex flex-col p-2 bg-emerald-500/5 border border-emerald-500/10 dark:border-emerald-500/20 rounded-lg">
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-sans">Kredit (Inflow)</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">{formatIDR(stats.income)}</span>
            </div>
            <div className="flex flex-col p-2 bg-rose-500/5 border border-rose-500/10 dark:border-rose-500/20 rounded-lg">
              <span className="text-[10px] text-rose-600 dark:text-rose-400 font-sans">Debet (Outflow)</span>
              <span className="text-rose-600 dark:text-rose-400 font-bold">{formatIDR(stats.expense)}</span>
            </div>
          </div>
          <div className="pt-2 flex justify-between items-center text-slate-600 dark:text-slate-300 border-t border-slate-200/50 dark:border-white/10">
            <span>Sisa Saldo Netto:</span>
            <span className={`font-bold font-mono ${stats.balance >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {formatIDR(stats.balance)}
            </span>
          </div>
          <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
            <span>Jumlah Item Transaksi:</span>
            <span className="font-bold text-slate-800 dark:text-white">{stats.count} Baris Data</span>
          </div>
        </div>

        {/* Detail Table Toggle */}
        <div className="flex items-center justify-between px-1">
          <div className="text-left">
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Sertakan detail tabel transaksi buku jurnal</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">Jika dimatikan, halaman PDF hanya mencakup ringkasan eksekutif kas.</p>
          </div>
          <button
            type="button"
            onClick={() => setIncludeDetails(!includeDetails)}
            className={`w-9 h-5 rounded-full p-0.5 transition-colors focus:outline-none shrink-0 ${includeDetails ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-white/10'}`}
            id="pdf-details-toggle"
          >
            <div className={`w-4 h-4 rounded-full bg-white transition-transform ${includeDetails ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </div>

        {/* Benefits text summary block */}
        <div className="space-y-1 bg-indigo-500/5 p-3 rounded-2xl border border-indigo-500/10 text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed">
          <p className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 text-[11px] mb-0.5">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500 animate-pulse" /> Jaminan Keaslian Dokumen Premium:
          </p>
          <ul className="list-disc list-inside space-y-0.5 pl-0.5 text-slate-600 dark:text-slate-300">
            <li>Menyertakan tanda tangan digital kriptografis dari asisten CoinAI Anda.</li>
            <li>Siap dikirimkan langsung ke dewan direksi, divisi perpajakan, atau pihak bank.</li>
            <li>Secara otomatis mendeteksi status likuiditas keuangan korporat Anda secara rapi.</li>
          </ul>
        </div>

        {/* Actions Button container */}
        <div className="flex gap-2.5 pt-1.5 border-t border-slate-100 dark:border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-xl font-semibold transition-colors text-xs"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={isExporting}
            onClick={handleExportPDF}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 text-xs shadow-md shadow-indigo-600/10 active:scale-98"
            id="pdf-download-btn-trigger"
          >
            {isExporting ? (
              <span className="flex items-center gap-1.5">
                <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Memproses Ekspor...
              </span>
            ) : (
              <>
                <FileDown className="w-4 h-4" />
                Ekspor Laporan PDF
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
