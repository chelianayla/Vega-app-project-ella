import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  ArrowRight, 
  ArrowLeft, 
  Download, 
  FileText, 
  RefreshCw, 
  AlertOctagon, 
  Check, 
  X,
  ShieldAlert,
  ShieldCheck,
  Edit3,
  Trash2,
  Hash,
  Search,
  Sparkles,
  Layers,
  Database,
  Filter,
  ChevronDown,
  Info,
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import * as XLSX from 'xlsx';
import confetti from 'canvas-confetti';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { UploadType, FiscalMonth, FISCAL_MONTHS, CoaCategory, CoaItem } from '../../types';
import { formatCurrencyUSD } from '../../lib/calculations';

interface ParsedRow {
  rowNum: number;
  coaCode: string;
  accountPattern?: string;
  accountName: string;
  category?: string;
  department?: string;
  sectionCode?: string;
  currency?: string;
  amount: number;
  vendor?: string;
  postingDate?: string;
  reference?: string;
  description?: string;
  docNo?: string;
  monthly?: Record<FiscalMonth, number>;
  isValid: boolean;
  isAutoDetected?: boolean;
  errors: string[];
}

interface FilteredRowInfo {
  rowNum: number;
  reason: string;
  snippet: string;
}

export const UploadView: React.FC<{ onNavigateToMatrix: () => void; onNavigateToAudit: () => void }> = ({
  onNavigateToMatrix,
  onNavigateToAudit
}) => {
  const { 
    coaList, 
    checkPeriodCollision, 
    commitUpload 
  } = useData();

  const { t, isAdmin } = useAuth();

  // Wizard state
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [uploadType, setUploadType] = useState<UploadType>('Monthly GL');
  const [fiscalYear, setFiscalYear] = useState<string>('FY2026/2027');
  const [targetMonth, setTargetMonth] = useState<FiscalMonth>('Aug');

  // File & Parsing state
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [uploadedFileSize, setUploadedFileSize] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [detectedNewCoas, setDetectedNewCoas] = useState<CoaItem[]>([]);
  const [filteredOutRows, setFilteredOutRows] = useState<FilteredRowInfo[]>([]);
  const [showFilteredDrawer, setShowFilteredDrawer] = useState<boolean>(false);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [rawFileBuffer, setRawFileBuffer] = useState<ArrayBuffer | null>(null);
  const [autoDetectionNotice, setAutoDetectionNotice] = useState<string | null>(null);
  const [previewSearch, setPreviewSearch] = useState<string>('');
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'detected' | 'error'>('all');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState<boolean>(false);

  // Replacement (GANTI DATA) state
  const [existingBatch, setExistingBatch] = useState<any | null>(null);
  const [replaceReason, setReplaceReason] = useState<string>('');
  const [gantiDataConfirmed, setGantiDataConfirmed] = useState<boolean>(false);

  // Commit result state with full budget status details (Req 10)
  const [commitResult, setCommitResult] = useState<ReturnType<typeof commitUpload> | null>(null);

  // Inline row correction state for 100% accuracy enforcement
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState<{
    coaCode: string;
    amount: number;
    description: string;
    docNo: string;
  }>({
    coaCode: '',
    amount: 0,
    description: '',
    docNo: ''
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // If not admin, access is restricted
  if (!isAdmin) {
    return (
      <div className="bg-white rounded-3xl p-10 border border-slate-200 text-center max-w-lg mx-auto shadow-xs">
        <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-100">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-1">
          Administrator Privileges Required
        </h3>
        <p className="text-xs text-slate-500 leading-relaxed mb-4">
          Financial uploads directly modify approved budgets and general ledger records. According to internal IT governance and Supabase RLS policies, only Administrators may commit data batches.
        </p>
      </div>
    );
  }

  // Key normalizer helper for case-insensitive and punctuation-free column matching
  const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Strict list of words that indicate a column is a DESCRIPTION or other attribute, NOT a COA code
  const EXCLUDED_COA_KEYWORDS = [
    'description', 'deskripsi', 'name', 'nama', 'uraian', 'keterangan', 'comment',
    'section', 'department', 'departemen', 'divisi', 'category', 'kategori',
    'currency', 'mata uang', 'vendor', 'amount', 'nominal', 'budget', 'actual',
    'date', 'tanggal', 'doc', 'document', 'ref', 'reference'
  ];

  // Primary aliases for COA / Account number columns (English, Indonesian, SAP standards)
  const COA_PRIMARY_ALIASES = [
    'account number', 'account no', 'account no.', 'account code', 'account_code',
    'coa code', 'coa_code', 'coa no', 'coa no.', 'coa number', 'coa',
    'kode coa', 'no coa', 'no. coa', 'nomor coa', 'no.coa',
    'kode akun', 'no akun', 'no. akun', 'nomor akun', 'no.akun',
    'gl account', 'gl account no', 'gl account number', 'gl account code',
    'g/l account', 'g/l account no', 'gl acct', 'gl_acc', 'gl no', 'kode gl',
    'kode rekening', 'no rekening', 'no. rekening', 'nomor rekening', 'rekening',
    'kode perkiraan', 'no perkiraan', 'no. perkiraan', 'nomor perkiraan',
    'chart of account', 'chart of accounts', 'cost center / coa',
    'acc no', 'acc number', 'acc code', 'account'
  ];

  // Helper to identify the COA column key from a row's keys with high precision
  const findCoaKey = (row: Record<string, any>, sampleRows?: Record<string, any>[]): string | undefined => {
    if (!row) return undefined;
    const rowKeys = Object.keys(row);
    const normalizedPossibles = COA_PRIMARY_ALIASES.map(normalizeKey);

    // 1. Exact normalized match with primary aliases
    for (const rk of rowKeys) {
      const nRk = normalizeKey(rk);
      if (normalizedPossibles.includes(nRk)) {
        return rk;
      }
    }

    // 2. Contains coa/account/akun/rekening/perkiraan WITHOUT any excluded descriptive keywords
    for (const rk of rowKeys) {
      const lowKey = rk.toLowerCase();
      const hasCoaWord = ['coa', 'akun', 'rekening', 'perkiraan', 'account'].some(w => lowKey.includes(w));
      const hasExcludedWord = EXCLUDED_COA_KEYWORDS.some(w => lowKey.includes(w));
      if (hasCoaWord && !hasExcludedWord) {
        return rk;
      }
    }

    // 3. Content-based detection: check values across sample rows
    if (sampleRows && sampleRows.length > 0) {
      for (const rk of rowKeys) {
        const lowKey = rk.toLowerCase();
        if (EXCLUDED_COA_KEYWORDS.some(w => lowKey.includes(w))) continue;
        
        let matchCount = 0;
        let nonBlankCount = 0;
        for (const sr of sampleRows) {
          const val = String(sr[rk] ?? '').trim();
          if (!val) continue;
          nonBlankCount++;
          // Checks if value matches SAP 9-digit (\b\d{9}\b) or IT code (IT-\d{5}) or known COA
          if (/^(\d{9}|\d{5}|IT-\d{5}|\d{9}-.*)$/i.test(val) || coaList.some(c => c.code === val)) {
            matchCount++;
          }
        }
        if (nonBlankCount > 0 && matchCount / nonBlankCount >= 0.5) {
          return rk;
        }
      }
    }

    return undefined;
  };

  // Flexible column finder: searches for aliases safely without false-positive cross matching
  const getField = (row: Record<string, any>, possibleKeys: string[]): any => {
    if (!row) return undefined;
    const rowKeys = Object.keys(row);
    const normalizedPossibles = possibleKeys.map(normalizeKey);
    
    // 1. Exact normalized key match (highest priority)
    for (const rk of rowKeys) {
      const nRk = normalizeKey(rk);
      if (normalizedPossibles.includes(nRk)) {
        if (row[rk] !== undefined && row[rk] !== null && row[rk] !== '') {
          return row[rk];
        }
      }
    }

    // 2. Substring match (ensure matching token is at least 3 characters to prevent tiny partial false positives)
    for (const rk of rowKeys) {
      const nRk = normalizeKey(rk);
      for (const p of normalizedPossibles) {
        if (p.length >= 3 && (nRk.includes(p) || p.includes(nRk))) {
          if (row[rk] !== undefined && row[rk] !== null && row[rk] !== '') {
            return row[rk];
          }
        }
      }
    }

    return undefined;
  };

  // Helper to parse numbers safely (handles IDR dots, commas, currency strings, scientific notation)
  const parseCleanNumber = (val: any): number => {
    if (val === null || val === undefined || val === '') return NaN;
    if (typeof val === 'number') return val;
    let str = String(val).trim().replace(/[Rp\s]/gi, '');
    
    // Scientific notation e.g. -1.13986E-06 or 2.5E4
    if (/^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/.test(str)) {
      return Number(str);
    }

    // Indonesian thousands dots with comma decimal (e.g. 1.250.000,50)
    if (/^[+-]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(str)) {
      str = str.replace(/\./g, '').replace(',', '.');
    } 
    // US format with comma thousands (e.g. 1,250,000.50)
    else if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(str)) {
      str = str.replace(/,/g, '');
    } 
    // Simple comma decimal (e.g. 125,50)
    else if (/^[+-]?\d+,\d+$/.test(str)) {
      str = str.replace(',', '.');
    }

    return Number(str);
  };

  // Helper to parse Excel dates (serial numbers or strings)
  const parseExcelDate = (val: any): string => {
    if (!val) return '2026-08-28';
    if (typeof val === 'number') {
      try {
        const date = new Date(Math.round((val - 25569) * 86400 * 1000));
        if (!isNaN(date.getTime())) {
          return date.toISOString().slice(0, 10);
        }
      } catch {}
    }
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      return str.slice(0, 10);
    }
    const parts = str.split(/[-/.]/);
    if (parts.length === 3) {
      if (parts[2].length === 4) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    return str;
  };

  // Month-name lookup (EN + ID aliases) used to parse a "Period/Month" cell or column
  const MONTH_ALIASES: Record<string, FiscalMonth> = {
    jan: 'Jan', january: 'Jan', januari: 'Jan',
    feb: 'Feb', february: 'Feb', februari: 'Feb',
    mar: 'Mar', march: 'Mar', maret: 'Mar',
    apr: 'Apr', april: 'Apr',
    may: 'May', mei: 'May',
    jun: 'Jun', june: 'Jun', juni: 'Jun',
    jul: 'Jul', july: 'Jul', juli: 'Jul',
    aug: 'Aug', august: 'Aug', agustus: 'Aug', agu: 'Aug', ags: 'Aug', agt: 'Aug',
    sep: 'Sep', sept: 'Sep', september: 'Sep',
    oct: 'Oct', october: 'Oct', okt: 'Oct', oktober: 'Oct',
    nov: 'Nov', november: 'Nov',
    dec: 'Dec', december: 'Dec', des: 'Dec', desember: 'Dec'
  };

  // Parses a single "Period/Month" cell (e.g. "Apr 2026", "04/2026", "Mei", etc.)
  const parseFiscalPeriod = (val: any): FiscalMonth | undefined => {
    if (val === null || val === undefined || val === '') return undefined;

    if (typeof val === 'number') {
      try {
        const date = new Date(Math.round((val - 25569) * 86400 * 1000));
        if (!isNaN(date.getTime())) {
          const key = date.toLocaleString('en-US', { month: 'short' }).toLowerCase();
          if (MONTH_ALIASES[key]) return MONTH_ALIASES[key];
        }
      } catch {}
    }

    const str = String(val).trim().toLowerCase();

    const nameMatch = str.match(/[a-z]{3,}/);
    if (nameMatch) {
      const token = nameMatch[0];
      if (MONTH_ALIASES[token]) return MONTH_ALIASES[token];
      const prefix3 = token.slice(0, 3);
      if (MONTH_ALIASES[prefix3]) return MONTH_ALIASES[prefix3];
    }

    // Numeric month, e.g. "04/2026", "2026-04", or a bare "4"
    const numMatch = str.match(/(?:^|[^0-9])(0?[1-9]|1[0-2])(?:[^0-9]|$)/);
    if (numMatch) {
      const monthNamesByNum: FiscalMonth[] = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return monthNamesByNum[parseInt(numMatch[1], 10) - 1];
    }

    return undefined;
  };

  // Check if a row is a non-data row (subtotal, category header, blank, footnote, etc.)
  // This satisfies the critical requirement: administrators do not need to manually clean/filter Excel.
  const classifyNonDataRow = (
    row: Record<string, any>, 
    coaKey?: string
  ): { isData: boolean; reason?: string; snippet?: string } => {
    const values = Object.values(row).filter(v => v !== null && v !== undefined && String(v).trim() !== '');
    
    // 1. Completely blank row
    if (values.length === 0) {
      return { isData: false, reason: 'Baris Kosong (Blank Row)', snippet: '(semua sel kosong)' };
    }

    const allText = values.map(v => String(v)).join(' ').toLowerCase();
    const coaVal = coaKey ? String(row[coaKey] || '').trim() : '';

    // 2. Subtotal or Total row (e.g. "Subtotal Belanja Hardware", "Total Anggaran", "Grand Total")
    const totalKeywords = [
      'subtotal', 'sub total', 'sub-total', 'total budget', 'total anggaran',
      'total belanja', 'grand total', 'total keseluruhan', 'total capex', 'total opex',
      'jumlah anggaran', 'jumlah keseluruhan', 'rekapitulasi', 'summary'
    ];
    for (const kw of totalKeywords) {
      if (allText.includes(kw)) {
        return { 
          isData: false, 
          reason: `Baris Ringkasan / Subtotal (${kw})`, 
          snippet: values.slice(0, 3).map(String).join(' | ') 
        };
      }
    }

    // Bare "total" or "jumlah" in text when COA is not a standard account code
    if ((allText.includes('total') || allText.includes('jumlah')) && (!coaVal || !/^\d{5,9}$|^IT-\d{5}$/i.test(coaVal))) {
      return { 
        isData: false, 
        reason: 'Baris Total / Ringkasan', 
        snippet: values.slice(0, 3).map(String).join(' | ') 
      };
    }

    // 3. Signature block or Footnotes / Notes
    const footnoteKeywords = [
      'disetujui oleh', 'dibuat oleh', 'mengetahui', 'approved by', 'prepared by', 
      'checked by', 'catatan:', 'note:', 'keterangan:', 'page ', 'halaman '
    ];
    for (const kw of footnoteKeywords) {
      if (allText.includes(kw)) {
        return { 
          isData: false, 
          reason: 'Catatan Kaki / Kolom Persetujuan', 
          snippet: values.slice(0, 2).map(String).join(' | ') 
        };
      }
    }

    // 4. Section Divider / Category Banner Header (only 1 or 2 text cells populated, no amounts, no COA)
    if (values.length <= 2 && !coaVal) {
      const isHeaderBanner = ['belanja', 'hardware', 'software', 'network', 'capex', 'opex', 'anggaran', 'it', 'mis', 'biaya', 'operasional', 'daftar', 'tabel'].some(w => allText.includes(w));
      if (isHeaderBanner) {
        return { 
          isData: false, 
          reason: 'Judul Seksi / Banner Kategori', 
          snippet: values.join(' | ') 
        };
      }
    }

    // 5. Explicitly Out-of-Scope Non-IT Department (if raw export contains multiple corporate departments)
    const deptVal = String(getField(row, ['department', 'departemen', 'divisi']) || '').toLowerCase();
    if (deptVal && (deptVal.includes('production') || deptVal.includes('general affair') || deptVal.includes('human resource') || deptVal.includes('ga dept'))) {
      return { 
        isData: false, 
        reason: `Di Luar Scope MIS / IT (${deptVal})`, 
        snippet: values.slice(0, 3).map(String).join(' | ') 
      };
    }

    return { isData: true };
  };

  // Normalizes COA candidate string and matches against Master COAs with maximum resilience
  const normalizeAndMatchCoa = (
    rawAccountStr: string,
    rawAccountName: string,
    validCoaMap: Map<string, CoaItem>,
    coaByNameMap: Map<string, CoaItem>
  ): { 
    cleanCode: string; 
    accountPattern?: string; 
    sectionCode?: string; 
    matchedCoa?: CoaItem;
    matchedByName?: boolean;
  } => {
    let cleanCode = String(rawAccountStr || '').trim();
    let accountPattern: string | undefined = undefined;
    let sectionCode: string | undefined = undefined;

    // 1. Clean Excel numeric artifacts (e.g. 752201001.0 -> 752201001)
    if (cleanCode.endsWith('.0')) {
      cleanCode = cleanCode.slice(0, -2);
    }
    cleanCode = cleanCode.replace(/^['"`\s]+|['"`\s]+$/g, '');

    // 2. Check if COA cell contains both code and description (e.g. "752201001 - Communication Line" or "[752201001] Line")
    const combinedMatch = cleanCode.match(/\b(IT-\d{5}|\d{9}|\d{5})\b/i);
    if (combinedMatch && cleanCode.length > combinedMatch[0].length + 2) {
      cleanCode = combinedMatch[0];
    }

    // 3. Handle hyphenated / SAP ledger format (e.g. 752201001-A7744-ME0000 or IT-60101)
    if (cleanCode.includes('-')) {
      if (/^IT-\d{5}/i.test(cleanCode)) {
        cleanCode = cleanCode.toUpperCase();
      } else {
        const parts = cleanCode.split('-');
        cleanCode = parts[0].trim();
        accountPattern = rawAccountStr.trim();
        if (parts.length >= 3) {
          sectionCode = parts[2].trim();
        }
      }
    } 
    // 4. Handle formatted 9-digit codes with dots or spaces (e.g. "7522.01.001" or "7522 01 001")
    else if (/^\d{4}[\.\s]\d{2}[\.\s]\d{3}$/.test(cleanCode)) {
      cleanCode = cleanCode.replace(/[\.\s]/g, '');
    }
    // 5. Handle bare 5-digit number that maps to IT-60xxx (e.g. "60101" -> "IT-60101")
    else if (/^\d{5}$/.test(cleanCode)) {
      const itCandidate = `IT-${cleanCode}`;
      if (validCoaMap.has(itCandidate.toUpperCase())) {
        cleanCode = itCandidate;
      }
    }
    // 6. Handle "IT60101" or "IT 60101"
    else if (/^IT\s*\d{5}$/i.test(cleanCode)) {
      cleanCode = `IT-${cleanCode.replace(/[^0-9]/g, '')}`;
    }

    if (cleanCode && !accountPattern) {
      accountPattern = `${cleanCode}-A7744-*`;
    }

    // Lookup in Master COAs
    let matchedCoa: CoaItem | undefined = undefined;
    if (cleanCode) {
      matchedCoa = validCoaMap.get(cleanCode.toUpperCase()) || 
        (accountPattern ? validCoaMap.get(accountPattern.toUpperCase()) : undefined);
    }

    // Fallback: match by Account Name if COA code was empty or not recognized
    let matchedByName = false;
    if (!matchedCoa && rawAccountName) {
      const normName = rawAccountName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normName) {
        matchedCoa = coaByNameMap.get(normName);
        if (matchedCoa) {
          matchedByName = true;
          cleanCode = matchedCoa.code;
          accountPattern = matchedCoa.accountPattern;
        }
      }
    }

    return {
      cleanCode,
      accountPattern,
      sectionCode,
      matchedCoa,
      matchedByName
    };
  };

  // Detects and consolidates "long format" Budget uploads
  const consolidateLongFormatBudget = (rawJson: any[]): any[] | null => {
    if (!rawJson.length) return null;

    // Scan first 15 rows to find a valid sample with non-empty fields
    let sample: any = null;
    for (let i = 0; i < Math.min(rawJson.length, 15); i++) {
      if (rawJson[i] && Object.keys(rawJson[i]).length >= 3) {
        sample = rawJson[i];
        break;
      }
    }
    if (!sample) return null;

    const hasPeriodCol = getField(sample, ['period/month', 'period', 'periode', 'bulan', 'month', 'waktu']) !== undefined;
    const hasAmountCol = getField(sample, ['budget amount', 'budget_amount', 'nominal', 'amount', 'anggaran', 'nilai']) !== undefined;
    
    // Check if wide month columns already exist
    const hasWideMonthCols = FISCAL_MONTHS.some((m) => getField(sample, [m, m.toLowerCase(), `month_${m}`]) !== undefined);

    if (!hasPeriodCol || !hasAmountCol || hasWideMonthCols) return null;

    type Group = {
      coa: string;
      accountName: string;
      category: string;
      department: string;
      monthly: Partial<Record<FiscalMonth, number>>;
      periodErrors: string[];
    };
    const grouped = new Map<string, Group>();

    rawJson.forEach((row) => {
      const coaKey = findCoaKey(row);
      const rawCoa = coaKey ? String(row[coaKey] || '') : String(getField(row, COA_PRIMARY_ALIASES) || '');
      const coa = rawCoa.trim();
      if (!coa) return;

      // Skip subtotal or non-data rows inside long format
      const nonDataCheck = classifyNonDataRow(row, coaKey);
      if (!nonDataCheck.isData) return;

      const coaKeyUpper = coa.toUpperCase();
      if (!grouped.has(coaKeyUpper)) {
        grouped.set(coaKeyUpper, {
          coa,
          accountName: String(getField(row, ['account description', 'description', 'nama akun', 'account name']) || ''),
          category: String(getField(row, ['category', 'kategori']) || ''),
          department: String(getField(row, ['department', 'departemen', 'divisi']) || ''),
          monthly: {},
          periodErrors: []
        });
      }
      const g = grouped.get(coaKeyUpper)!;

      const periodRaw = getField(row, ['period/month', 'period', 'periode', 'bulan', 'month', 'waktu']);
      const fm = parseFiscalPeriod(periodRaw);
      const amtRaw = getField(row, ['budget amount', 'budget_amount', 'nominal', 'amount', 'anggaran', 'nilai']);
      const amt = parseCleanNumber(amtRaw);

      if (!fm) {
        g.periodErrors.push(String(periodRaw ?? '(kosong)'));
        return;
      }
      g.monthly[fm] = (g.monthly[fm] || 0) + (isNaN(amt) ? 0 : amt);
    });

    if (grouped.size === 0) return null;

    return Array.from(grouped.values()).map((g) => {
      const out: any = {
        'Account Number': g.coa,
        'Account Description': g.accountName,
        'Category': g.category,
        'Department': g.department
      };
      FISCAL_MONTHS.forEach((m) => {
        out[m] = g.monthly[m] ?? 0;
      });
      if (g.periodErrors.length) {
        out.__PeriodParseErrors = g.periodErrors;
      }
      return out;
    });
  };

  // Infer category from text or account description
  const inferCategory = (rawCat: string, accountName: string): CoaCategory => {
    const c = (rawCat || '').toLowerCase().trim();
    const n = (accountName || '').toLowerCase();
    
    if (c.includes('software') || n.includes('license') || n.includes('software') || n.includes('saas') || n.includes('cloud') || n.includes('subscription')) return 'Software';
    if (c.includes('hardware') || n.includes('hardware') || n.includes('laptop') || n.includes('server') || n.includes('rental expense') || n.includes('office equipment') || n.includes('supply')) return 'Hardware';
    if (c.includes('network') || n.includes('communication') || n.includes('internet') || n.includes('bandwidth') || n.includes('telecom') || n.includes('telkom')) return 'Network';
    if (c.includes('consulting') || n.includes('subcontract') || n.includes('consulting') || n.includes('professional') || n.includes('audit')) return 'Consulting';
    if (c.includes('maintenance') || n.includes('repair') || n.includes('maintenance') || n.includes('service') || n.includes('utility')) return 'Maintenance';
    if (c.includes('training') || n.includes('training') || n.includes('certification') || n.includes('travel')) return 'Training';
    if (c.includes('sga') || n.includes('sga')) return 'SGA';
    if (c.includes('direct') && !c.includes('indirect')) return 'Direct';
    if (c.includes('indirect') || n.includes('indirect') || n.includes('salary') || n.includes('bonus') || n.includes('thr')) return 'Indirect';
    if (n.includes('fx') || n.includes('foreign exchange') || n.includes('reval')) return 'Finance & FX';
    return 'Operational';
  };

  // Generate and download sample template with active COAs
  const handleDownloadTemplate = () => {
    let sheetData: any[] = [];
    if (uploadType === 'Monthly GL') {
      sheetData = coaList.map((c, i) => ({
        'Account Number': c.accountPattern || `${c.code}-A7744-ME0000`,
        'COA_CODE': c.code,
        'Account Description': c.accountName,
        'Nominal (Actual Amount)': 120_000_000 + i * 15_000_000,
        'Doc. Number': `DOC-020292-${String(i + 101).padStart(5, '0')}`,
        'Posting Date': '2026-08-28',
        'Vendor': i % 3 === 0 ? 'PT. INDOSAT TBK' : i % 2 === 0 ? 'PT. TELKOM INDONESIA' : 'Direct Vendor',
        'Reference': `SAP-BATCH-${i + 101}`,
        'Section Code': c.sectionCode || 'ME0000',
        'Category': c.category,
        'Comment': `Reconciled actuals for ${c.accountName}`
      }));
    } else {
      // Annual Budget: All registered COAs
      sheetData = coaList.map((c) => {
        const item: any = {
          'Account Number': c.code,
          'Account Description': c.accountName,
          'Category': c.category
        };
        FISCAL_MONTHS.forEach((m) => {
          item[m] = 125_000_000;
        });
        return item;
      });
    }

    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Actual_GL_Data');
    XLSX.writeFile(wb, `SAP_Actual_GL_${uploadType.replace(' ', '_')}.xlsx`);
  };

  // Validate raw data rows with automatic filtering of non-data rows and resilient COA matching
  const validateUploadedData = (
    rawJson: any[]
  ): { 
    rows: ParsedRow[]; 
    newCoas: CoaItem[];
    filteredRows: FilteredRowInfo[];
  } => {
    // Build quick lookup map for existing Master COAs (by code, pattern, and name)
    const validCoaMap = new Map<string, CoaItem>();
    const coaByNameMap = new Map<string, CoaItem>();

    coaList.forEach(c => {
      validCoaMap.set(c.code.toUpperCase(), c);
      if (c.accountPattern) {
        validCoaMap.set(c.accountPattern.toUpperCase(), c);
      }
      const normName = c.accountName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normName) {
        coaByNameMap.set(normName, c);
      }
    });

    const localNewCoasMap = new Map<string, CoaItem>();
    const seenBudgetCodes = new Set<string>();
    const detectedFilteredRows: FilteredRowInfo[] = [];

    // Check if long format budget consolidation applies
    const consolidated = uploadType === 'Budget' ? consolidateLongFormatBudget(rawJson) : null;
    const effectiveRawJson = consolidated ?? rawJson;

    // Detect primary COA column from the dataset
    const primaryCoaKey = findCoaKey(effectiveRawJson[0] || {}, effectiveRawJson.slice(0, 10));

    const rows: ParsedRow[] = [];

    effectiveRawJson.forEach((row, index) => {
      const rowNum = index + 2; // account for 1-based index and header

      // Filter non-data rows automatically (subtotals, grand totals, category banners, blank lines)
      const classification = classifyNonDataRow(row, primaryCoaKey);
      if (!classification.isData) {
        detectedFilteredRows.push({
          rowNum,
          reason: classification.reason || 'Baris Non-Data Dikecualikan',
          snippet: classification.snippet || ''
        });
        return; // Skip non-data row automatically!
      }

      const errors: string[] = [];

      // Extract account number / COA code
      const coaKeyToUse = primaryCoaKey || findCoaKey(row);
      const rawAccountStr = String(
        (coaKeyToUse ? row[coaKeyToUse] : undefined) ||
        getField(row, COA_PRIMARY_ALIASES) || ''
      ).trim();

      // Extract account name/description
      const rawAccountName = String(
        getField(row, [
          'account description', 'account_name', 'account name', 'nama akun',
          'deskripsi', 'deskripsi akun', 'nama perkiraan', 'uraian', 'uraian akun',
          'description', 'comment', 'comment 2', 'keterangan'
        ]) || ''
      ).trim();

      // Normalize and match COA
      const coaMatch = normalizeAndMatchCoa(rawAccountStr, rawAccountName, validCoaMap, coaByNameMap);
      const cleanCode = coaMatch.cleanCode;
      const accountNumberPattern = coaMatch.accountPattern;
      const sectionCode = coaMatch.sectionCode;
      let matchedCoa = coaMatch.matchedCoa;

      // Extract document number
      const docNo = String(
        getField(row, [
          'doc number', 'doc. number', 'doc no', 'gl_document_no', 'gl document no',
          'document number', 'reference', 'batch entry', 'fp number', 'no dokumen'
        ]) || `DOC-SAP-${rowNum}`
      ).trim();

      // Extract vendor
      const vendor = String(
        getField(row, ['vendor', 'vendor name', 'supplier', 'party', 'entity', 'rekanan']) || ''
      ).trim();

      // Extract reference
      const reference = String(
        getField(row, ['reference', 'ref', 'batch-entry', 'fp number', 'no ref']) || ''
      ).trim();

      // Extract date
      const rawDate = getField(row, ['date', 'posting date', 'posting_date', 'tanggal']);
      const postingDate = parseExcelDate(rawDate);

      // Extract category & department
      const rowCategory = String(getField(row, ['category', 'kategori', 'pd']) || '').trim();
      const rowDepartment = String(getField(row, ['department', 'departemen', 'divisi']) || '').trim();
      const currency = String(getField(row, ['curr', 'currency', 'mata uang']) || 'USD').trim();

      let amount = 0;
      let monthlyRecord: Record<FiscalMonth, number> | undefined;

      if (uploadType === 'Monthly GL') {
        const explicitAmountRaw = getField(row, [
          'nominal actual amount', 'nominal', 'actual amount', 'actual_amount',
          'amount', 'nilai', 'actual', 'total'
        ]);

        if (explicitAmountRaw !== undefined && explicitAmountRaw !== '') {
          amount = parseCleanNumber(explicitAmountRaw);
        } else {
          // Check Debits & Credits columns from SAP reports
          const debitVal = getField(row, ['debits', 'debit', 'dr']);
          const creditVal = getField(row, ['credits', 'credit', 'cr']);
          if (debitVal !== undefined || creditVal !== undefined) {
            const deb = parseCleanNumber(debitVal) || 0;
            const cred = parseCleanNumber(creditVal) || 0;
            amount = deb - cred;
          }
        }

        if (isNaN(amount)) {
          errors.push(`Nilai nominal tidak dapat dibaca dari baris`);
        }

        if (rowDepartment && /needs confirmation/i.test(rowDepartment)) {
          errors.push(`Baris di luar scope MIS/IT (${rowDepartment}) — tidak dimasukkan sebagai Actual GL`);
        }
      } else {
        // Budget template: check for 12 monthly columns (Indonesian and English variations)
        monthlyRecord = {} as any;
        let sum = 0;
        let foundAnyMonth = false;

        FISCAL_MONTHS.forEach((m) => {
          // Check variations: e.g. "Apr", "April", "May", "Mei", "Aug", "Agu", "Ags", "Oct", "Okt", "Dec", "Des"
          const variations = [m, m.toLowerCase(), `month_${m}`];
          if (m === 'May') variations.push('mei', 'Mei');
          if (m === 'Aug') variations.push('agu', 'Agu', 'ags', 'Ags', 'agustus', 'Agustus', 'August');
          if (m === 'Oct') variations.push('okt', 'Okt', 'oktober', 'Oktober', 'October');
          if (m === 'Dec') variations.push('des', 'Des', 'desember', 'Desember', 'December');
          if (m === 'Mar') variations.push('maret', 'Maret', 'March');
          if (m === 'Apr') variations.push('april', 'April');
          if (m === 'Jun') variations.push('juni', 'Juni', 'June');
          if (m === 'Jul') variations.push('juli', 'Juli', 'July');
          if (m === 'Jan') variations.push('januari', 'Januari', 'January');
          if (m === 'Feb') variations.push('februari', 'Februari', 'February');

          const mValRaw = getField(row, variations);
          if (mValRaw !== undefined) {
            foundAnyMonth = true;
            const mVal = parseCleanNumber(mValRaw);
            if (isNaN(mVal)) {
              errors.push(`Nominal bulan ${m} tidak valid: "${mValRaw}"`);
            } else {
              (monthlyRecord as any)[m] = mVal;
              sum += mVal;
            }
          } else {
            (monthlyRecord as any)[m] = 0;
          }
        });

        // Single-column annual budget fallback (e.g. "Total Anggaran", "Budget", "Nominal")
        if (!foundAnyMonth) {
          const annualRaw = getField(row, [
            'annual', 'annual budget', 'budget', 'budget amount', 'anggaran', 
            'total anggaran', 'nilai anggaran', 'pagu', 'rencana', 'amount', 'total', 'nominal'
          ]);
          const annualVal = parseCleanNumber(annualRaw);
          if (!isNaN(annualVal) && annualVal > 0) {
            const perMonth = Math.round(annualVal / 12);
            FISCAL_MONTHS.forEach((m) => {
              (monthlyRecord as any)[m] = perMonth;
            });
            sum = annualVal;
            foundAnyMonth = true;
          } else {
            errors.push('Kolom alokasi bulan anggaran (Apr - Mar) atau total anggaran tidak ditemukan');
          }
        }

        amount = sum;

        if (Array.isArray((row as any).__PeriodParseErrors) && (row as any).__PeriodParseErrors.length) {
          errors.push(
            `Nilai "Period/Month" tidak dikenali untuk ${(row as any).__PeriodParseErrors.length} baris sumber (COA ${cleanCode}): ${(row as any).__PeriodParseErrors.slice(0, 3).join(', ')}${(row as any).__PeriodParseErrors.length > 3 ? ', ...' : ''}`
          );
        }

        if (cleanCode) {
          if (seenBudgetCodes.has(cleanCode.toUpperCase())) {
            errors.push(`Duplikasi kode COA "${cleanCode}" dalam template budget`);
          } else {
            seenBudgetCodes.add(cleanCode.toUpperCase());
          }
        }
      }

      if (!cleanCode) {
        errors.push('Kode COA / Account Number tidak terdeteksi');
      }

      let isAutoDetected = false;

      // Auto-detection for genuine new SAP accounts
      if (!matchedCoa && cleanCode) {
        if (localNewCoasMap.has(cleanCode.toUpperCase())) {
          matchedCoa = localNewCoasMap.get(cleanCode.toUpperCase());
          isAutoDetected = true;
        } else {
          const cat = inferCategory(rowCategory, rawAccountName);
          const newCoa: CoaItem = {
            code: cleanCode,
            accountPattern: accountNumberPattern || `${cleanCode}-A7744-*`,
            accountName: rawAccountName || `SAP Account ${cleanCode}`,
            category: cat,
            department: rowDepartment || 'MIS Department',
            registerSystem: 'SAP Core GL',
            status: 'Active',
            description: `Auto-detected from SAP GL actual file: ${rawAccountName || cleanCode}`,
            sectionCode: sectionCode || 'ME0000',
            inScope: true,
            scopeStatus: 'Active (In-Scope)'
          };
          localNewCoasMap.set(cleanCode.toUpperCase(), newCoa);
          matchedCoa = newCoa;
          isAutoDetected = true;
        }
      }

      rows.push({
        rowNum,
        coaCode: matchedCoa?.code || cleanCode,
        accountPattern: accountNumberPattern || matchedCoa?.accountPattern,
        accountName: matchedCoa?.accountName || rawAccountName || 'Account Tidak Terdaftar',
        category: matchedCoa?.category || inferCategory(rowCategory, rawAccountName),
        department: matchedCoa?.department || rowDepartment || 'MIS Department',
        sectionCode: sectionCode || matchedCoa?.sectionCode,
        currency,
        amount,
        vendor: vendor || undefined,
        postingDate,
        reference: reference || undefined,
        description: rawAccountName || `GL Posting ${cleanCode}`,
        docNo: docNo || `GL-${rowNum}`,
        monthly: monthlyRecord,
        isValid: errors.length === 0,
        isAutoDetected,
        errors
      });
    });

    return {
      rows,
      newCoas: Array.from(localNewCoasMap.values()),
      filteredRows: detectedFilteredRows
    };
  };

  // Open inline edit modal for a specific row
  const handleStartEditRow = (row: ParsedRow) => {
    setEditingRowIndex(row.rowNum);
    setEditFormData({
      coaCode: row.coaCode,
      amount: row.amount,
      description: row.description || '',
      docNo: row.docNo || ''
    });
  };

  // Save inline row edit and re-validate
  const handleSaveEditedRow = () => {
    if (!editingRowIndex) return;

    const updatedRaw = parsedRows.map((r) => {
      if (r.rowNum === editingRowIndex) {
        return {
          'Account Number': editFormData.coaCode.trim(),
          'Nominal (Actual Amount)': editFormData.amount,
          'Doc. Number': editFormData.docNo,
          'Account Description': editFormData.description,
          ...(r.monthly || {})
        };
      }
      return {
        'Account Number': r.accountPattern || r.coaCode,
        'Account Description': r.accountName,
        'Nominal (Actual Amount)': r.amount,
        'Doc. Number': r.docNo,
        'Vendor': r.vendor,
        'Posting Date': r.postingDate,
        'Reference': r.reference,
        'Section Code': r.sectionCode,
        ...(r.monthly || {})
      };
    });

    const validated = validateUploadedData(updatedRaw);
    setParsedRows(validated.rows);
    setDetectedNewCoas(validated.newCoas);
    setEditingRowIndex(null);
  };

  // Delete a faulty row
  const handleDeleteRow = (rowNum: number) => {
    const filtered = parsedRows.filter((r) => r.rowNum !== rowNum);
    const updatedRaw = filtered.map((r) => ({
      'Account Number': r.accountPattern || r.coaCode,
      'Account Description': r.accountName,
      'Nominal (Actual Amount)': r.amount,
      'Doc. Number': r.docNo,
      'Vendor': r.vendor,
      'Posting Date': r.postingDate,
      'Reference': r.reference,
      'Section Code': r.sectionCode,
      ...(r.monthly || {})
    }));
    const validated = validateUploadedData(updatedRaw);
    setParsedRows(validated.rows);
    setDetectedNewCoas(validated.newCoas);
    setFilteredOutRows(validated.filteredRows);
  };

  // Switch sheet from available sheets in the uploaded workbook
  const handleSwitchSheet = (newSheetName: string) => {
    if (!rawFileBuffer) return;
    try {
      setIsProcessing(true);
      setSelectedSheet(newSheetName);
      const workbook = XLSX.read(rawFileBuffer, { type: 'array' });
      const worksheet = workbook.Sheets[newSheetName];
      if (!worksheet) {
        alert(`Sheet "${newSheetName}" tidak ditemukan.`);
        setIsProcessing(false);
        return;
      }
      parseWorksheetData(worksheet, newSheetName);
    } catch (err: any) {
      alert(`Gagal membaca sheet: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Parses worksheet with multi-row scoring and header detection
  const parseWorksheetData = (worksheet: XLSX.WorkSheet, sheetName: string) => {
    const rawMatrix: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (rawMatrix.length === 0) {
      alert('Worksheet tampak kosong atau tidak memiliki baris data.');
      return;
    }

    // Intelligent Header Detection: scan rows 0 to 35 and score candidate rows
    let bestHeaderRowIndex = -1;
    let highestScore = -1;
    let detectedHeaders: string[] = [];

    const coaHeaderTokens = [
      'account number', 'account no', 'account code', 'coa', 'kode coa', 'no coa', 
      'kode akun', 'no akun', 'gl account', 'gl acct', 'kode rekening', 'rekening',
      'kode perkiraan', 'acc no', 'account'
    ];
    const descHeaderTokens = ['account description', 'nama akun', 'deskripsi', 'description', 'uraian', 'keterangan'];
    const amountHeaderTokens = [
      'nominal', 'actual amount', 'budget amount', 'anggaran', 'nilai anggaran', 
      'total', 'amount', 'apr', 'may', 'mei', 'jun', 'jul', 'aug', 'agu', 'sep', 'oct', 'okt', 'nov', 'dec', 'des'
    ];

    for (let r = 0; r < Math.min(rawMatrix.length, 35); r++) {
      const row = rawMatrix[r];
      if (!Array.isArray(row)) continue;
      
      const nonBlankCells = row.filter(c => c !== null && c !== undefined && String(c).trim() !== '');
      if (nonBlankCells.length < 2) continue; // Skip title banner lines

      let score = 0;
      const rowStrings = row.map(c => String(c || '').toLowerCase().trim());
      const rowJoined = rowStrings.join(' ');

      // Score for COA keywords (+20)
      if (coaHeaderTokens.some(tok => rowStrings.some(s => s === tok || s.includes(tok)))) {
        score += 20;
      }

      // Score for Description keywords (+10)
      if (descHeaderTokens.some(tok => rowStrings.some(s => s === tok || s.includes(tok)))) {
        score += 10;
      }

      // Score for Amount / Month keywords (+15)
      const monthMatches = amountHeaderTokens.filter(tok => rowStrings.some(s => s === tok || s.includes(tok))).length;
      score += Math.min(monthMatches * 3, 25);

      // Penalize metadata / header info rows with colons (e.g. "Departemen: MIS", "Status: Approved")
      if (rowJoined.includes(':')) {
        score -= 10;
      }

      // Penalize rows where almost all cells are numeric
      const numericCount = nonBlankCells.filter(c => typeof c === 'number' || (!isNaN(Number(c)) && Number(c) > 1000)).length;
      if (numericCount > nonBlankCells.length * 0.6) {
        score -= 25; // Likely an actual data row, not a header!
      }

      if (score > highestScore && score >= 15) {
        highestScore = score;
        bestHeaderRowIndex = r;
        detectedHeaders = row.map(cell => String(cell || '').trim());
      }
    }

    // Check if the row directly below has sub-headers (e.g. wide months under "Period" / "Alokasi")
    if (bestHeaderRowIndex !== -1 && bestHeaderRowIndex + 1 < rawMatrix.length) {
      const nextRow = rawMatrix[bestHeaderRowIndex + 1];
      if (Array.isArray(nextRow)) {
        const nextMonthMatches = nextRow.filter(c => {
          const s = String(c || '').toLowerCase().trim();
          return MONTH_ALIASES[s] !== undefined;
        }).length;

        if (nextMonthMatches >= 3) {
          // Merge sub-headers with primary headers
          detectedHeaders = detectedHeaders.map((h, colIdx) => {
            const sub = String(nextRow[colIdx] || '').trim();
            if (sub && MONTH_ALIASES[sub.toLowerCase()]) {
              return sub;
            }
            return h || sub;
          });
          bestHeaderRowIndex = bestHeaderRowIndex + 1; // Move past sub-header row
        }
      }
    }

    let jsonRows: any[] = [];
    if (bestHeaderRowIndex !== -1 && detectedHeaders.length > 0) {
      for (let r = bestHeaderRowIndex + 1; r < rawMatrix.length; r++) {
        const row = rawMatrix[r];
        if (!Array.isArray(row) || row.every(c => c === '' || c === null || c === undefined)) continue;
        const obj: Record<string, any> = {};
        detectedHeaders.forEach((h, colIdx) => {
          if (h) {
            const key = obj[h] !== undefined ? `${h}_${colIdx}` : h;
            obj[key] = row[colIdx];
          } else {
            obj[`COL_${colIdx}`] = row[colIdx];
          }
        });
        jsonRows.push(obj);
      }
    } else {
      // Fallback to standard sheet_to_json
      jsonRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    }

    if (jsonRows.length === 0) {
      alert('File spreadsheet tampak kosong atau tidak memiliki baris data yang dapat dibaca.');
      return;
    }

    // Auto-detect upload type (Budget vs Monthly GL) based on columns
    const firstRowKeys = Object.keys(jsonRows[0] || {}).map(k => k.toLowerCase());
    const hasMonthCols = FISCAL_MONTHS.some(m => firstRowKeys.some(k => k === m.toLowerCase() || k.includes(m.toLowerCase())));
    const hasBudgetKeywords = firstRowKeys.some(k => k.includes('budget') || k.includes('anggaran') || k.includes('pagu'));

    let activeType = uploadType;
    if ((hasMonthCols || hasBudgetKeywords) && uploadType === 'Monthly GL') {
      activeType = 'Budget';
      setUploadType('Budget');
      setAutoDetectionNotice('Tipe upload otomatis disesuaikan ke "Budget" berdasarkan struktur kolom file Excel.');
    } else if (firstRowKeys.some(k => k.includes('nominal') || k.includes('actual') || k.includes('debit')) && uploadType === 'Budget') {
      activeType = 'Monthly GL';
      setUploadType('Monthly GL');
      setAutoDetectionNotice('Tipe upload otomatis disesuaikan ke "Monthly GL (Actuals)" berdasarkan format file.');
    } else {
      setAutoDetectionNotice(null);
    }

    const validated = validateUploadedData(jsonRows);
    setParsedRows(validated.rows);
    setDetectedNewCoas(validated.newCoas);
    setFilteredOutRows(validated.filteredRows);
    setCurrentStep(2);
  };

  // Process File ingestion with auto-detection of sheets and headers
  const processFile = async (file: File) => {
    setIsProcessing(true);
    setUploadedFileName(file.name);
    setUploadedFileSize(`${(file.size / 1024).toFixed(1)} KB`);

    try {
      const arrayBuffer = await file.arrayBuffer();
      setRawFileBuffer(arrayBuffer);
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });

      setAvailableSheets(workbook.SheetNames);

      // Intelligent sheet selection: prioritize budget/gl/actual/data sheets
      let targetSheetName = workbook.SheetNames[0];
      const preferredSheet = workbook.SheetNames.find(s => {
        const lower = s.toLowerCase().trim();
        return lower.includes('budget') || lower.includes('anggaran') || lower.includes('gl') || 
               lower.includes('actual') || lower.includes('core') || lower.includes('data') || lower.includes('sap');
      });

      if (preferredSheet) {
        targetSheetName = preferredSheet;
      } else if (workbook.SheetNames.length > 1) {
        // Pick sheet with largest row count
        let maxRows = 0;
        workbook.SheetNames.forEach(sName => {
          const ws = workbook.Sheets[sName];
          if (ws && ws['!ref']) {
            const r = XLSX.utils.decode_range(ws['!ref']);
            const count = r.e.r - r.s.r;
            if (count > maxRows) {
              maxRows = count;
              targetSheetName = sName;
            }
          }
        });
      }

      setSelectedSheet(targetSheetName);
      const worksheet = workbook.Sheets[targetSheetName];
      if (!worksheet) {
        alert('Worksheet tidak dapat dibaca dari file Excel.');
        setIsProcessing(false);
        return;
      }

      parseWorksheetData(worksheet, targetSheetName);
    } catch (err: any) {
      alert(`Gagal memproses file: ${err.message || 'Format tidak dikenali'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Drag & drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  // Quick Demo Fill: Standard clean sample
  const handleLoadSample = (withErrors: boolean = false) => {
    let sampleData: any[] = [];
    if (uploadType === 'Monthly GL') {
      sampleData = coaList.map((c, idx) => ({
        'Account Number': withErrors && idx === 3 ? 'INVALID-999' : (c.accountPattern || `${c.code}-A7744-COMM00`),
        'Account Description': c.accountName,
        'Nominal (Actual Amount)': withErrors && idx === 5 ? 'NOT_A_NUMBER' : Math.round(180_000_000 + idx * 15_000_000),
        'Doc. Number': `DOC-020292-${String(idx + 101).padStart(5, '0')}`,
        'Posting Date': '2026-08-28',
        'Vendor': idx % 3 === 0 ? 'PT. INDOSAT TBK' : idx % 2 === 0 ? 'PT. TELKOM INDONESIA' : 'Direct Core Vendor',
        'Reference': `SAP-640260${idx + 100}`,
        'Section Code': c.sectionCode || 'COMM00',
        'Category': c.category
      }));
    } else {
      sampleData = coaList.map((c, idx) => {
        const row: any = {
          'Account Number': withErrors && idx === 2 ? 'IT-UNKNOWN' : c.code,
          'Account Description': c.accountName,
          'Category': c.category
        };
        FISCAL_MONTHS.forEach((m) => {
          row[m] = Math.round(150_000_000 + idx * 10_000_000);
        });
        return row;
      });
    }

    setUploadedFileName(`SAP_${uploadType.replace(' ', '_')}_${fiscalYear.slice(0, 6)}_${withErrors ? 'WithErrors' : 'Valid'}.xlsx`);
    setUploadedFileSize('380 KB');
    setAutoDetectionNotice(null);
    const validated = validateUploadedData(sampleData);
    setParsedRows(validated.rows);
    setDetectedNewCoas(validated.newCoas);
    setFilteredOutRows(validated.filteredRows);
    setCurrentStep(2);
  };

  // Quick Demo Fill: Real-World Messy Budget Excel (With Subtotals, Blank Rows, Indonesian Month Headers, and Notes)
  // This directly verifies that administrators do not need to manually clean the Excel file!
  const handleLoadMessyBudgetSample = () => {
    setUploadType('Budget');

    // Create a realistic messy dataset with top banners, section headers, subtotals, blank rows, and notes
    const messyRows: any[] = [
      // Top section: Hardware
      {
        'Kode COA': '752201001',
        'Nama Akun': 'Communication Line Expense Indirect',
        'Kategori': 'Network',
        'Apr': 15000000, 'Mei': 15000000, 'Jun': 15000000, 'Jul': 15000000,
        'Agu': 15000000, 'Sep': 15000000, 'Okt': 15000000, 'Nov': 15000000,
        'Des': 15000000, 'Jan': 15000000, 'Feb': 15000000, 'Mar': 15000000
      },
      {
        'Kode COA': '750701001',
        'Nama Akun': 'Subcontract Expense(IT)-G Indirect',
        'Kategori': 'Consulting',
        'Apr': 25000000, 'Mei': 25000000, 'Jun': 25000000, 'Jul': 25000000,
        'Agu': 25000000, 'Sep': 25000000, 'Okt': 25000000, 'Nov': 25000000,
        'Des': 25000000, 'Jan': 25000000, 'Feb': 25000000, 'Mar': 25000000
      },
      {
        'Kode COA': 'IT-60101',
        'Nama Akun': 'Enterprise Server Farm & Storage Expansion',
        'Kategori': 'Hardware',
        'Apr': 50000000, 'Mei': 50000000, 'Jun': 50000000, 'Jul': 50000000,
        'Agu': 50000000, 'Sep': 50000000, 'Okt': 50000000, 'Nov': 50000000,
        'Des': 50000000, 'Jan': 50000000, 'Feb': 50000000, 'Mar': 50000000
      },
      // Subtotal row (must be automatically filtered out!)
      {
        'Kode COA': '',
        'Nama Akun': 'Subtotal Belanja Hardware & Jaringan',
        'Kategori': '',
        'Apr': 90000000, 'Mei': 90000000, 'Jun': 90000000, 'Jul': 90000000,
        'Agu': 90000000, 'Sep': 90000000, 'Okt': 90000000, 'Nov': 90000000,
        'Des': 90000000, 'Jan': 90000000, 'Feb': 90000000, 'Mar': 90000000
      },
      // Blank row (must be automatically filtered out!)
      {},
      // Section header banner (must be automatically filtered out!)
      {
        'Kode COA': '',
        'Nama Akun': '2. SEKSI SOFTWARE & LISENSI APLIKASI (OPEX)',
        'Kategori': ''
      },
      // Software rows
      {
        'Kode COA': 'IT-60201',
        'Nama Akun': 'Core ERP License Renewal & Maintenance',
        'Kategori': 'Software',
        'Apr': 40000000, 'Mei': 40000000, 'Jun': 40000000, 'Jul': 40000000,
        'Agu': 40000000, 'Sep': 40000000, 'Okt': 40000000, 'Nov': 40000000,
        'Des': 40000000, 'Jan': 40000000, 'Feb': 40000000, 'Mar': 40000000
      },
      {
        'Kode COA': 'IT-60202',
        'Nama Akun': 'Cloud SaaS & Security Tools',
        'Kategori': 'Software',
        'Apr': 20000000, 'Mei': 20000000, 'Jun': 20000000, 'Jul': 20000000,
        'Agu': 20000000, 'Sep': 20000000, 'Okt': 20000000, 'Nov': 20000000,
        'Des': 20000000, 'Jan': 20000000, 'Feb': 20000000, 'Mar': 20000000
      },
      {
        'Kode COA': 'IT-60301',
        'Nama Akun': 'SD-WAN & Fiber Optic Redundant Link',
        'Kategori': 'Network',
        'Apr': 35000000, 'Mei': 35000000, 'Jun': 35000000, 'Jul': 35000000,
        'Agu': 35000000, 'Sep': 35000000, 'Okt': 35000000, 'Nov': 35000000,
        'Des': 35000000, 'Jan': 35000000, 'Feb': 35000000, 'Mar': 35000000
      },
      // Grand total row (must be automatically filtered out!)
      {
        'Kode COA': '',
        'Nama Akun': 'TOTAL ANGGARAN IT / MIS FY2026/2027',
        'Kategori': '',
        'Apr': 185000000, 'Mei': 185000000, 'Jun': 185000000, 'Jul': 185000000,
        'Agu': 185000000, 'Sep': 185000000, 'Okt': 185000000, 'Nov': 185000000,
        'Des': 185000000, 'Jan': 185000000, 'Feb': 185000000, 'Mar': 185000000
      },
      // Footnote row (must be automatically filtered out!)
      {
        'Kode COA': '',
        'Nama Akun': 'Catatan: Anggaran ini disetujui Direksi dan Head of MIS pada tanggal 20 Maret 2026',
        'Kategori': ''
      }
    ];

    setUploadedFileName('Anggaran_MIS_FY2026_Real_Excel_With_Subtotals.xlsx');
    setUploadedFileSize('512 KB');
    setAutoDetectionNotice('🛡️ Filter Otomatis Aktif: Baris subtotal, banner kategori, baris kosong, dan catatan kaki secara otomatis disaring tanpa perlu merapikan file Excel secara manual.');

    const validated = validateUploadedData(messyRows);
    setParsedRows(validated.rows);
    setDetectedNewCoas(validated.newCoas);
    setFilteredOutRows(validated.filteredRows);
    setCurrentStep(2);
  };

  // Accepted & rejected computations
  const acceptedRows = parsedRows.filter((r) => r.isValid);
  const rejectedRows = parsedRows.filter((r) => !r.isValid);
  const totalAmount = acceptedRows.reduce((sum, r) => sum + r.amount, 0);

  // 100% Accuracy checks
  const is100PercentAccurate = parsedRows.length > 0 && rejectedRows.length === 0;
  const accuracyPercentage = parsedRows.length > 0 
    ? ((acceptedRows.length / parsedRows.length) * 100).toFixed(0) 
    : '0';

  // Filtered rows for step 2 preview
  const filteredPreviewRows = acceptedRows.filter((r) => {
    if (previewFilter === 'detected' && !r.isAutoDetected) return false;
    if (previewFilter === 'valid' && r.isAutoDetected) return false;
    if (!previewSearch.trim()) return true;
    const q = previewSearch.toLowerCase();
    return (
      r.coaCode.toLowerCase().includes(q) ||
      (r.accountPattern && r.accountPattern.toLowerCase().includes(q)) ||
      (r.accountName && r.accountName.toLowerCase().includes(q)) ||
      (r.vendor && r.vendor.toLowerCase().includes(q)) ||
      (r.docNo && r.docNo.toLowerCase().includes(q)) ||
      (r.description && r.description.toLowerCase().includes(q))
    );
  });

  // Transition from Step 2 to Step 3
  const handleProceedToStep3 = () => {
    const collision = checkPeriodCollision(uploadType, fiscalYear, uploadType === 'Monthly GL' ? targetMonth : undefined);
    setExistingBatch(collision);
    setGantiDataConfirmed(!collision);
    setCurrentStep(3);
  };

  // Final Commit action
  const handleCommit = () => {
    if (existingBatch && !gantiDataConfirmed) {
      alert('You must confirm the GANTI DATA replacement to proceed.');
      return;
    }

    if (existingBatch && !replaceReason.trim()) {
      alert('Replacement reason justification is mandatory for compliance audit trail.');
      return;
    }

    const result = commitUpload({
      uploadType,
      fiscalYear,
      targetMonth: uploadType === 'Monthly GL' ? targetMonth : undefined,
      fileName: uploadedFileName,
      fileSize: uploadedFileSize,
      rowCount: parsedRows.length,
      acceptedRows: acceptedRows.length,
      rejectedRows: rejectedRows.length,
      totalAmount,
      replaceReason: existingBatch ? replaceReason : undefined,
      newCoas: detectedNewCoas.length > 0 ? detectedNewCoas : undefined,
      parsedGlRecords: uploadType === 'Monthly GL' ? acceptedRows.map((r) => ({
        coaCode: r.coaCode,
        amount: r.amount,
        description: r.description,
        docNo: r.docNo,
        vendor: r.vendor,
        postingDate: r.postingDate,
        category: r.category,
        department: r.department,
        sectionCode: r.sectionCode,
        currency: r.currency,
        accountNumberPattern: r.accountPattern
      })) : undefined,
      parsedBudgetRecords: uploadType === 'Budget' ? acceptedRows.map((r) => ({
        coaCode: r.coaCode,
        monthly: r.monthly!,
        annual: r.amount
      })) : undefined
    });

    setCommitResult(result);

    // Fire celebration confetti!
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.6 }
    });
  };

  const handleResetUpload = () => {
    setCurrentStep(1);
    setParsedRows([]);
    setDetectedNewCoas([]);
    setPreviewSearch('');
    setPreviewFilter('all');
    setUploadedFileName('');
    setUploadedFileSize('');
    setExistingBatch(null);
    setReplaceReason('');
    setGantiDataConfirmed(false);
    setCommitResult(null);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Wizard Progress Steps */}
      <div 
        id="upload-wizard-progress"
        className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs"
      >
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {/* Step 1 */}
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
              currentStep === 1 
                ? 'bg-[#1E5EFF] text-white shadow-sm' 
                : currentStep > 1 
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                : 'bg-slate-100 text-slate-400'
            }`}>
              {currentStep > 1 ? <Check className="w-4 h-4" /> : '1'}
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Step 1</span>
              <p className="text-xs font-bold text-slate-800 truncate">{t.uploadStep1}</p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
              currentStep === 2 
                ? 'bg-[#1E5EFF] text-white shadow-sm' 
                : currentStep > 2 
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                : 'bg-slate-100 text-slate-400'
            }`}>
              {currentStep > 2 ? <Check className="w-4 h-4" /> : '2'}
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Step 2</span>
              <p className="text-xs font-bold text-slate-800 truncate">{t.uploadStep2}</p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
              currentStep === 3 
                ? 'bg-[#1E5EFF] text-white shadow-sm' 
                : 'bg-slate-100 text-slate-400'
            }`}>
              3
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Step 3</span>
              <p className="text-xs font-bold text-slate-800 truncate">{t.uploadStep3}</p>
            </div>
          </div>
        </div>
      </div>

      {/* STEP 1: Upload Configuration */}
      {currentStep === 1 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
              1. {t.uploadStep1}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Select the data ingestion target and download the official template pre-aligned with registered COA accounts.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Upload Type Radio Cards */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-700">
                {t.uploadType}
              </label>

              {/* Monthly GL Actuals */}
              <label 
                onClick={() => setUploadType('Monthly GL')}
                className={`p-4 rounded-2xl border-2 cursor-pointer flex items-start gap-3 transition ${
                  uploadType === 'Monthly GL' 
                    ? 'border-[#1E5EFF] bg-blue-50/40' 
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input 
                  type="radio" 
                  name="uploadType" 
                  checked={uploadType === 'Monthly GL'} 
                  onChange={() => setUploadType('Monthly GL')} 
                  className="mt-1 text-[#1E5EFF]"
                />
                <div>
                  <div className="font-bold text-xs text-slate-900">{t.typeGl}</div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Import ERP monthly posted expenses (Actuals) for specific closed period month.
                  </p>
                </div>
              </label>

              {/* Annual Budget Allocation */}
              <label 
                onClick={() => setUploadType('Budget')}
                className={`p-4 rounded-2xl border-2 cursor-pointer flex items-start gap-3 transition ${
                  uploadType === 'Budget' 
                    ? 'border-[#1E5EFF] bg-blue-50/40' 
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input 
                  type="radio" 
                  name="uploadType" 
                  checked={uploadType === 'Budget'} 
                  onChange={() => setUploadType('Budget')} 
                  className="mt-1 text-[#1E5EFF]"
                />
                <div>
                  <div className="font-bold text-xs text-slate-900">{t.typeBudget}</div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Establish or revise 12-month annual approved budgets (Apr - Mar) for all IT accounts.
                  </p>
                </div>
              </label>
            </div>

            {/* Target Period & Downloads */}
            <div className="space-y-4 bg-slate-50 p-5 rounded-2xl border border-slate-200/80">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {t.targetFiscalYear}
                </label>
                <select
                  value={fiscalYear}
                  onChange={(e) => setFiscalYear(e.target.value)}
                  className="w-full text-xs font-bold py-2.5 px-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#1E5EFF]"
                >
                  <option value="FY2026/2027">FY 2026/2027 (Active Year)</option>
                  <option value="FY2025/2026">FY 2025/2026 (Audited Prior Year)</option>
                </select>
              </div>

              {uploadType === 'Monthly GL' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {t.targetMonthPeriod}
                  </label>
                  <select
                    value={targetMonth}
                    onChange={(e) => setTargetMonth(e.target.value as FiscalMonth)}
                    className="w-full text-xs font-bold py-2.5 px-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#1E5EFF]"
                  >
                    {FISCAL_MONTHS.map((m) => (
                      <option key={m} value={m}>{m} (Fiscal Period {m})</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-2 border-t border-slate-200/60">
                <button
                  id="download-template-btn"
                  onClick={handleDownloadTemplate}
                  className="w-full py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold shadow-2xs transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4 text-[#1E5EFF]" />
                  <span>{t.downloadTemplate} (.xlsx)</span>
                </button>
              </div>
            </div>
          </div>

          {/* File Upload Drag & Drop Zone */}
          <div
            id="drag-drop-zone"
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition ${
              dragActive 
                ? 'border-[#1E5EFF] bg-blue-50/50' 
                : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls, .csv"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  processFile(e.target.files[0]);
                }
              }}
            />
            <div className="w-14 h-14 bg-white text-[#1E5EFF] rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-xs border border-slate-200">
              <UploadCloud className="w-7 h-7" />
            </div>
            <p className="text-sm font-bold text-slate-800">
              {t.dragDropText}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {t.orBrowse} (Excel 2007+ .xlsx or CSV)
            </p>
          </div>

          {/* Quick Demo Pre-fill helpers */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 flex-wrap gap-2 text-xs">
            <span className="text-slate-400 font-medium">Shortcut Uji Coba:</span>
            <div className="flex gap-2 flex-wrap">
              <button
                id="load-sample-messy-budget-btn"
                type="button"
                onClick={handleLoadMessyBudgetSample}
                className="px-3 py-1.5 bg-blue-50 text-[#1E5EFF] hover:bg-blue-100 rounded-xl font-bold border border-blue-200 transition cursor-pointer flex items-center gap-1.5"
                title="Memuat file Excel mentah dengan subtotal, banner kategori, baris kosong & catatan kaki untuk membuktikan pembersihan otomatis"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Simulasi Excel Mentah (Auto-Filtered)</span>
              </button>
              <button
                id="load-sample-valid-btn"
                type="button"
                onClick={() => handleLoadSample(false)}
                className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl font-bold border border-emerald-200 transition cursor-pointer"
              >
                Sample Valid ({coaList.length} Rows)
              </button>
              <button
                id="load-sample-errors-btn"
                type="button"
                onClick={() => handleLoadSample(true)}
                className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-xl font-bold border border-rose-200 transition cursor-pointer"
              >
                Sample Error
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Validation Summary & Row Inspection */}
      {currentStep === 2 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
                2. {t.validationSummary}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                File: <strong className="text-slate-800">{uploadedFileName}</strong> ({uploadedFileSize}) • Target: {fiscalYear} {uploadType === 'Monthly GL' ? `• Month: ${targetMonth}` : ''}
              </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {availableSheets.length > 1 && (
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs">
                  <span className="text-slate-500 font-bold">Sheet:</span>
                  <select
                    value={selectedSheet}
                    onChange={(e) => handleSwitchSheet(e.target.value)}
                    className="bg-white border border-slate-300 rounded-lg font-bold text-slate-800 px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-[#1E5EFF]"
                  >
                    {availableSheets.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}

              <button
                onClick={() => setCurrentStep(1)}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition self-start cursor-pointer px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{t.backToStep1}</span>
              </button>
            </div>
          </div>

          {/* Auto-Detection Notification Banner */}
          {autoDetectionNotice && (
            <div className="p-3.5 bg-blue-50/80 border border-blue-200 text-blue-900 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 shadow-2xs">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#1E5EFF] shrink-0" />
                <span>{autoDetectionNotice}</span>
              </div>
              <button 
                onClick={() => setAutoDetectionNotice(null)}
                className="text-blue-500 hover:text-blue-800 text-xs px-2 py-0.5"
              >
                ✕
              </button>
            </div>
          )}

          {/* Auto-Filtered Rows Banner (Subtotals, Banners, Notes Filtered Out) */}
          {filteredOutRows.length > 0 && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0">
                    🛡️
                  </div>
                  <div>
                    <h5 className="text-xs font-extrabold text-slate-900">
                      Pembersihan Otomatis Berhasil ({filteredOutRows.length} Baris Non-Data Disaring)
                    </h5>
                    <p className="text-[11px] text-slate-500">
                      Sistem otomatis memisahkan baris subtotal, judul seksi, baris kosong, dan catatan kaki agar tidak perlu dirapikan manual.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowFilteredDrawer(!showFilteredDrawer)}
                  className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 text-xs font-bold transition shrink-0 cursor-pointer"
                >
                  {showFilteredDrawer ? 'Tutup Rincian' : `Lihat ${filteredOutRows.length} Baris yang Disaring`}
                </button>
              </div>

              {showFilteredDrawer && (
                <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden bg-white max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                        <th className="py-2 px-3">Baris #</th>
                        <th className="py-2 px-3">Alasan Disaring</th>
                        <th className="py-2 px-3">Teks / Konten Asli</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {filteredOutRows.map((fr, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80">
                          <td className="py-2 px-3 font-bold text-slate-500">Baris {fr.rowNum}</td>
                          <td className="py-2 px-3">
                            <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold">
                              {fr.reason}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-700 truncate max-w-xs font-sans">
                            {fr.rawContent || '(baris kosong)'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Accuracy Status Banner */}
          {is100PercentAccurate ? (
            <div 
              id="accuracy-100-success-banner"
              className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-emerald-950 flex items-center gap-2">
                    <span>Semua Baris Data Tervalidasi</span>
                    <span className="bg-emerald-600 text-white text-[10px] px-2 py-0.5 rounded-full font-mono font-bold uppercase">
                      100% Valid
                    </span>
                  </h4>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    Seluruh {parsedRows.length} baris telah tervalidasi dan cocok dengan kode COA Master TI MIS tanpa kesalahan format.
                  </p>
                </div>
              </div>
              <div className="text-xs font-semibold text-emerald-800 bg-white/80 px-3 py-1.5 rounded-xl border border-emerald-200 shrink-0">
                Total: {formatCurrencyUSD(totalAmount, true)}
              </div>
            </div>
          ) : (
            <div 
              id="accuracy-incomplete-warning-banner"
              className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-amber-950 flex items-center gap-2">
                    <span>Perhatian: Terdapat Baris Data Bermasalah</span>
                    <span className="bg-amber-600 text-white text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">
                      Valid: {acceptedRows.length} / {parsedRows.length} ({accuracyPercentage}%)
                    </span>
                  </h4>
                  <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                    Terdapat <strong>{rejectedRows.length} baris</strong> yang memiliki kode COA tidak terdaftar di MIS atau nominal tidak valid. Silakan gunakan tombol <strong>Koreksi</strong> atau <strong>Hapus</strong> pada baris bersangkutan sebelum melanjutkan.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Validation Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t.totalRows}</div>
              <div className="text-2xl font-black font-mono text-slate-900 mt-1">{parsedRows.length}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Total Baris File</div>
            </div>

            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200">
              <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">{t.acceptedRows}</div>
              <div className="text-2xl font-black font-mono text-emerald-700 mt-1">{acceptedRows.length}</div>
              <div className="text-[11px] text-emerald-600 font-mono mt-0.5">
                Total: {formatCurrencyUSD(totalAmount, true)}
              </div>
            </div>

            <div className="p-4 bg-rose-50 rounded-2xl border border-rose-200">
              <div className="text-[11px] font-bold text-rose-600 uppercase tracking-wider">{t.rejectedRows}</div>
              <div className="text-2xl font-black font-mono text-rose-700 mt-1">{rejectedRows.length}</div>
              <div className="text-[11px] text-rose-600 mt-0.5 font-bold">
                {rejectedRows.length > 0 ? `${rejectedRows.length} perlu diperbaiki` : '0 Kesalahan'}
              </div>
            </div>

            <div className={`p-4 rounded-2xl border ${is100PercentAccurate ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className={`text-[11px] font-bold uppercase tracking-wider ${is100PercentAccurate ? 'text-[#1E5EFF]' : 'text-amber-700'}`}>
                Status Validasi
              </div>
              <div className={`text-2xl font-black font-mono mt-1 ${is100PercentAccurate ? 'text-blue-700' : 'text-amber-800'}`}>
                {accuracyPercentage}%
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {is100PercentAccurate ? '100% Valid Sesuai COA' : 'Perlu Koreksi Manual'}
              </div>
            </div>
          </div>

          {/* Error Details Log (If any rejected rows) with Inline Fixer */}
          {rejectedRows.length > 0 && (
            <div className="p-5 bg-rose-50/70 rounded-2xl border border-rose-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-rose-900 font-bold text-xs">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span>Daftar {rejectedRows.length} Baris Bermasalah (Koreksi kode COA atau perbaiki nominal):</span>
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto divide-y divide-rose-200/60 text-xs">
                {rejectedRows.map((r) => (
                  <div key={r.rowNum} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-rose-900 bg-rose-200/80 px-2 py-0.5 rounded text-[11px]">
                        Baris {r.rowNum}
                      </span>
                      <span className="text-slate-800 font-mono text-[11px]">
                        Kode: <strong>{r.coaCode || '(kosong)'}</strong>
                      </span>
                    </div>

                    <div className="text-rose-700 font-medium text-xs flex-1 sm:text-right">
                      {r.errors.join('; ')}
                    </div>

                    {/* Inline Actions: Koreksi & Hapus */}
                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      <button
                        onClick={() => handleStartEditRow(r)}
                        className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-800 rounded-lg border border-slate-300 text-[11px] font-bold transition cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3 text-[#1E5EFF]" />
                        <span>Koreksi</span>
                      </button>
                      <button
                        onClick={() => handleDeleteRow(r.rowNum)}
                        className="flex items-center gap-1 px-2 py-1 bg-white hover:bg-rose-100 text-rose-700 rounded-lg border border-rose-200 text-[11px] font-bold transition cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3 text-rose-600" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inline Edit Modal if user clicks 'Koreksi' */}
          {editingRowIndex !== null && (
            <div className="p-4 bg-blue-50/70 border-2 border-blue-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between border-b border-blue-200 pb-2">
                <h5 className="text-xs font-black text-blue-900 flex items-center gap-1.5">
                  <Edit3 className="w-4 h-4 text-[#1E5EFF]" />
                  <span>Koreksi Baris {editingRowIndex} ke Akun COA Resmi</span>
                </h5>
                <button 
                  onClick={() => setEditingRowIndex(null)}
                  className="text-slate-400 hover:text-slate-700 text-xs"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Pilih Kode COA Valid:</label>
                  <select
                    value={editFormData.coaCode}
                    onChange={(e) => setEditFormData({ ...editFormData, coaCode: e.target.value })}
                    className="w-full py-1.5 px-2 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900"
                  >
                    <option value="">-- Pilih COA Terdaftar --</option>
                    {coaList.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} - {c.accountName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nominal (USD):</label>
                  <input
                    type="number"
                    value={editFormData.amount}
                    onChange={(e) => setEditFormData({ ...editFormData, amount: Number(e.target.value) })}
                    className="w-full py-1.5 px-2 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nomor Dokumen SAP / GL:</label>
                  <input
                    type="text"
                    value={editFormData.docNo}
                    onChange={(e) => setEditFormData({ ...editFormData, docNo: e.target.value })}
                    className="w-full py-1.5 px-2 bg-white border border-slate-300 rounded-lg font-mono text-slate-900"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setEditingRowIndex(null)}
                  className="px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200/50 rounded-lg"
                >
                  Batal
                </button>
                <button
                  onClick={handleSaveEditedRow}
                  className="px-4 py-1.5 bg-[#1E5EFF] text-white text-xs font-bold rounded-lg hover:bg-blue-700 shadow-xs"
                >
                  Simpan & Revalidasi
                </button>
              </div>
            </div>
          )}

          {/* Validated Rows Preview Table */}
          <div className="space-y-3">
            {detectedNewCoas.length > 0 && (
              <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-2xl flex items-center justify-between gap-3 text-xs text-blue-900 shadow-2xs">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#1E5EFF] shrink-0" />
                  <span>
                    <strong>{detectedNewCoas.length} Akun GL Baru Terdeteksi Otomatis</strong> dari file aktual SAP (otomatis didaftarkan ke Master Data COA saat batch di-commit).
                  </span>
                </div>
                <span className="font-mono font-bold text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md shrink-0">
                  SAP Core GL
                </span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <span>Pratinjau Data Aktual ({filteredPreviewRows.length} dari {acceptedRows.length} Baris Valid)</span>
                </h4>
                <span className="text-[11px] text-slate-500 font-mono">
                  {is100PercentAccurate ? '✓ 100% Seluruh Baris Terbaca & Lolos Validasi' : 'Menunggu perbaikan baris yang gagal'}
                </span>
              </div>

              {/* Search & Filter Controls */}
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={previewSearch}
                    onChange={(e) => setPreviewSearch(e.target.value)}
                    placeholder="Cari akun, vendor, doc no..."
                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 w-48 sm:w-60 focus:bg-white focus:ring-1 focus:ring-[#1E5EFF] outline-none"
                  />
                  {previewSearch && (
                    <button 
                      onClick={() => setPreviewSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="flex bg-slate-100 p-0.5 rounded-xl text-[11px] font-bold border border-slate-200/80">
                  <button
                    type="button"
                    onClick={() => setPreviewFilter('all')}
                    className={`px-2.5 py-1 rounded-lg transition ${previewFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    Semua ({acceptedRows.length})
                  </button>
                  {detectedNewCoas.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('detected')}
                      className={`px-2.5 py-1 rounded-lg transition ${previewFilter === 'detected' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-500 hover:text-blue-700'}`}
                    >
                      ✨ Terdeteksi ({detectedNewCoas.length})
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-96 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3">Kode COA & Segmen</th>
                    <th className="py-2.5 px-3">Nama Akun & Kategori</th>
                    <th className="py-2.5 px-3 text-right">Nominal (Actual)</th>
                    <th className="py-2.5 px-3">Vendor / Rekanan</th>
                    <th className="py-2.5 px-3">No. Dokumen / Ref</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {filteredPreviewRows.slice(0, 100).map((r) => (
                    <tr key={r.rowNum} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-3">
                        <div className="font-bold text-slate-900">{r.coaCode}</div>
                        {r.accountPattern && r.accountPattern !== r.coaCode && (
                          <div className="text-[10px] text-slate-400 font-mono truncate max-w-[150px]">
                            {r.accountPattern}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3 font-sans">
                        <div className="text-slate-800 font-medium">{r.accountName}</div>
                        {r.category && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium">
                            {r.category}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold">
                        <span className={r.amount < 0 ? 'text-amber-700' : 'text-slate-900'}>
                          {formatCurrencyUSD(r.amount, true)}
                        </span>
                        {r.amount < 0 && (
                          <div className="text-[9px] text-amber-600 font-sans font-bold">Kredit / Reversal</div>
                        )}
                      </td>
                      <td className="py-2 px-3 font-sans text-slate-600 text-[11px]">
                        {r.vendor || '-'}
                      </td>
                      <td className="py-2 px-3 text-slate-500 text-[11px]">
                        <div>{r.docNo}</div>
                        {r.reference && <div className="text-[10px] text-slate-400">{r.reference}</div>}
                      </td>
                      <td className="py-2 px-3 font-sans">
                        {r.isAutoDetected ? (
                          <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[10px] font-bold border border-blue-200 whitespace-nowrap">
                            ✨ Terdeteksi SAP
                          </span>
                        ) : (
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-200 whitespace-nowrap">
                            100% Cocok
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredPreviewRows.length > 100 && (
              <div className="text-[11px] text-slate-400 text-center font-medium">
                Menampilkan 100 baris pertama dari {filteredPreviewRows.length} baris. Seluruh {filteredPreviewRows.length} baris akan diproses saat di-commit.
              </div>
            )}
          </div>

          {/* Step 2 Action Buttons with Strict 100% Enforcement */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <button
              onClick={handleResetUpload}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition cursor-pointer"
            >
              {t.cancelUpload}
            </button>

            <div className="flex items-center gap-3">
              {!is100PercentAccurate && (
                <span className="text-xs text-rose-600 font-semibold hidden sm:inline">
                  Tombol terkunci: Akurasi harus 100% untuk melanjutkan
                </span>
              )}
              <button
                id="proceed-to-step3-btn"
                onClick={handleProceedToStep3}
                disabled={!is100PercentAccurate}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold shadow-md transition ${
                  is100PercentAccurate
                    ? 'bg-[#1E5EFF] hover:bg-blue-700 text-white cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                }`}
              >
                <span>{t.proceedToStep3}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Confirmation & Commit (GANTI DATA check) */}
      {currentStep === 3 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
                3. {t.uploadStep3}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Review batch parameters and confirm ledger commitment.
              </p>
            </div>

            <button
              onClick={() => setCurrentStep(2)}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t.backToStep2}</span>
            </button>
          </div>

          {/* Batch Summary Confirmation Card */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#1E5EFF] flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <div className="font-extrabold text-slate-900 text-sm">
                  Ringkasan Batch Komitmen Buku Besar
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  File: <span className="font-mono font-semibold text-slate-700">{uploadedFileName || 'Excel Batch'}</span> • {acceptedRows.length} baris valid (MIS Department)
                </div>
              </div>
            </div>
            <div className="sm:text-right">
              <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Total Nilai Batch</div>
              <div className="text-base font-extrabold font-mono text-[#1E5EFF]">
                {formatCurrencyUSD(totalAmount, true)}
              </div>
            </div>
          </div>

          {/* GANTI DATA Collision Alert Box */}
          {existingBatch ? (
            <div 
              id="ganti-data-warning-box"
              className="p-5 bg-amber-50 rounded-2xl border-2 border-amber-300 space-y-4 animate-in fade-in"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-200/70 text-amber-800 flex items-center justify-center shrink-0">
                  <AlertOctagon className="w-6 h-6 text-amber-700" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-amber-900">
                    {t.gantiDataWarning}
                  </h4>
                  <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                    {t.gantiDataDesc}
                  </p>
                </div>
              </div>

              {/* Existing Batch Details */}
              <div className="bg-white/80 p-3 rounded-xl border border-amber-200/80 text-xs font-mono space-y-1">
                <div className="text-slate-600">
                  Active Batch: <strong className="text-slate-900">{existingBatch.id}</strong>
                </div>
                <div className="text-slate-600">
                  File Name: {existingBatch.fileName} ({existingBatch.uploadedAt} by {existingBatch.uploadedBy})
                </div>
                <div className="text-slate-600">
                  Current Total: <strong className="text-slate-900">{formatCurrencyUSD(existingBatch.totalAmount, true)}</strong> → New Total: <strong className="text-blue-700">{formatCurrencyUSD(totalAmount, true)}</strong>
                </div>
              </div>

              {/* Replacement Reason Field (Mandatory) */}
              <div>
                <label className="block text-xs font-bold text-amber-900 mb-1.5">
                  {t.changeReasonLabel}
                </label>
                <textarea
                  id="ganti-data-reason-input"
                  rows={2}
                  value={replaceReason}
                  onChange={(e) => setReplaceReason(e.target.value)}
                  placeholder={t.changeReasonPlaceholder}
                  className="w-full p-3 text-xs bg-white border border-amber-300 rounded-xl focus:ring-2 focus:ring-amber-500 font-sans text-slate-800"
                />
              </div>

              {/* Confirmation Checkbox */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  id="ganti-data-confirm-checkbox"
                  type="checkbox"
                  checked={gantiDataConfirmed}
                  onChange={(e) => setGantiDataConfirmed(e.target.checked)}
                  className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500"
                />
                <span className="text-xs font-bold text-amber-950">
                  I understand this will supersede active data for {fiscalYear} {uploadType === 'Monthly GL' ? `(${targetMonth})` : ''} and record an immutable audit trail entry.
                </span>
              </label>
            </div>
          ) : (
            /* Clean New Period Banner */
            <div className="p-4 bg-blue-50/70 rounded-2xl border border-blue-200 text-xs text-blue-900 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />
              <div>
                <div className="font-bold">New Period Target Confirmed</div>
                <p className="text-[11px] text-blue-700 mt-0.5">
                  No existing active batch found for {fiscalYear} {uploadType === 'Monthly GL' ? `(${targetMonth})` : ''}. This upload will register as the baseline batch.
                </p>
              </div>
            </div>
          )}

          {/* Commit Summary Matrix */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400 font-bold block">Type</span>
              <span className="font-bold text-slate-800">{uploadType}</span>
            </div>
            <div>
              <span className="text-slate-400 font-bold block">Target</span>
              <span className="font-bold text-slate-800">{fiscalYear} {uploadType === 'Monthly GL' ? `(${targetMonth})` : ''}</span>
            </div>
            <div>
              <span className="text-slate-400 font-bold block">Committed Rows</span>
              <span className="font-bold text-emerald-700">{acceptedRows.length} valid</span>
            </div>
            <div>
              <span className="text-slate-400 font-bold block">Total Amount</span>
              <span className="font-mono font-bold text-blue-700">{formatCurrencyUSD(totalAmount, true)}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <button
              onClick={handleResetUpload}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition cursor-pointer"
            >
              {t.cancel}
            </button>

            <button
              id="commit-upload-btn"
              onClick={handleCommit}
              disabled={existingBatch ? !gantiDataConfirmed || !replaceReason.trim() : false}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#1E5EFF] hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{t.commitData}</span>
            </button>
          </div>
        </div>
      )}

      {/* Upload Success Modal with Detailed Budget Status (Req 10) */}
      {commitResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div 
            id="upload-success-card"
            className="bg-white w-full max-w-lg rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 text-center space-y-4"
          >
            <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto border shadow-xs ${
              commitResult.isOverBudget 
                ? 'bg-rose-50 text-rose-600 border-rose-200' 
                : 'bg-emerald-50 text-emerald-600 border-emerald-200'
            }`}>
              {commitResult.isOverBudget ? (
                <AlertTriangle className="w-9 h-9 text-rose-600 animate-pulse" />
              ) : (
                <CheckCircle2 className="w-9 h-9 text-emerald-600" />
              )}
            </div>

            <div>
              <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
                {t.uploadSuccessTitle}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Batch <strong className="font-mono text-slate-800">{commitResult.batchId}</strong> berhasil dicatat ke sistem dan matriks telah diperbarui.
              </p>
            </div>

            {/* Detailed Budget Status Card (Req 10) */}
            <div className={`p-4 rounded-2xl border text-left space-y-3 ${
              commitResult.isOverBudget 
                ? 'bg-rose-50/60 border-rose-200' 
                : 'bg-emerald-50/60 border-emerald-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Status Kondisi Anggaran:</span>
                <span className={`text-xs font-extrabold px-2.5 py-1 rounded-lg border ${
                  commitResult.isOverBudget 
                    ? 'bg-rose-100 text-rose-700 border-rose-300' 
                    : 'bg-emerald-100 text-emerald-700 border-emerald-300'
                }`}>
                  {commitResult.isOverBudget ? '🔴 OVER BUDGET' : '🟢 ON / UNDER BUDGET'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2 bg-white/80 rounded-xl border border-slate-200/60">
                  <span className="text-[10px] text-slate-400 block font-sans">Total Batch Diunggah</span>
                  <span className="font-bold text-slate-900 text-sm">{formatCurrencyUSD(totalAmount)}</span>
                </div>
                <div className="p-2 bg-white/80 rounded-xl border border-slate-200/60">
                  <span className="text-[10px] text-slate-400 block font-sans">Pagu Pembanding</span>
                  <span className="font-bold text-slate-700 text-sm">{formatCurrencyUSD(commitResult.targetBudgetAmount || 0)}</span>
                </div>
              </div>

              {commitResult.isOverBudget ? (
                <div className="p-2.5 bg-rose-100/70 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-1">
                  <div className="flex items-center justify-between font-bold">
                    <span>Besaran Over Budget:</span>
                    <span className="font-mono font-extrabold text-sm text-rose-700">
                      +{formatCurrencyUSD(commitResult.overBudgetAmount || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span>Persentase Kelebihan:</span>
                    <span className="font-mono font-bold text-rose-800">
                      +{commitResult.overBudgetPercentage}% di atas alokasi
                    </span>
                  </div>
                  {commitResult.overBudgetAccountsCount ? (
                    <div className="text-[10px] text-rose-700 pt-0.5">
                      ⚠️ {commitResult.overBudgetAccountsCount} pos akun COA melampaui pagu yang disetujui.
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="p-2.5 bg-emerald-100/70 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1">
                  <div className="flex items-center justify-between font-bold">
                    <span>Efisiensi Anggaran:</span>
                    <span className="font-mono font-extrabold text-sm text-emerald-700">
                      -{formatCurrencyUSD(Math.abs(commitResult.varianceAmount || 0))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span>Persentase Varians:</span>
                    <span className="font-mono font-bold text-emerald-800">
                      {commitResult.overBudgetPercentage}% (Dalam batas aman)
                    </span>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-slate-600 leading-snug">
                {commitResult.detailsSummary}
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                id="success-view-audit-btn"
                onClick={() => {
                  setCommitResult(null);
                  handleResetUpload();
                  onNavigateToAudit();
                }}
                className="w-full py-2.5 bg-[#1E5EFF] hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Layers className="w-4 h-4" />
                <span>Lihat Status Rinci di Audit Trail</span>
              </button>

              <button
                id="success-view-matrix-btn"
                onClick={() => {
                  setCommitResult(null);
                  handleResetUpload();
                  onNavigateToMatrix();
                }}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                {t.viewInMatrix}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
