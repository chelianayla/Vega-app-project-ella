import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { 
  CoaItem, 
  BudgetRecord, 
  GlTransaction, 
  UploadBatch, 
  AuditNote, 
  CoaCategory, 
  ITDepartment, 
  FiscalMonth, 
  FISCAL_MONTHS, 
  CategorySummary, 
  AccountVarianceSummary,
  UploadType,
  BudgetStatus,
  BudgetHealthBreakdown,
  MonthlyValues
} from '../types';
import { 
  INITIAL_COA, 
  INITIAL_BUDGETS, 
  INITIAL_GL_TRANSACTIONS, 
  INITIAL_UPLOADS, 
  INITIAL_AUDIT_NOTES 
} from '../lib/mockData';
import { 
  calculateVariance, 
  calculateVariancePercentage, 
  calculateAbsorptionRate, 
  determineBudgetStatus,
  calculateBudgetHealthBreakdown,
  calculateYearEndProjection,
  getElapsedMonths
} from '../lib/calculations';
import { useAuth } from './AuthContext';

export interface ParsedGlCommitRecord {
  coaCode: string;
  amount: number;
  description?: string;
  docNo?: string;
  vendor?: string;
  postingDate?: string;
  category?: string;
  department?: string;
  sectionCode?: string;
  currency?: string;
  accountNumberPattern?: string;
}

interface DataContextType {
  coaList: CoaItem[];
  addCoas: (newCoas: CoaItem[]) => void;
  addNewCoa: (newCoa: CoaItem, initialBudgetAnnual?: number) => { success: boolean; message: string };
  budgets: BudgetRecord[];
  glTransactions: GlTransaction[];
  uploads: UploadBatch[];
  auditNotes: AuditNote[];
  
  // Filters
  selectedFiscalYear: string;
  setSelectedFiscalYear: (fy: string) => void;
  selectedQuarter: string;
  setSelectedQuarter: (q: string) => void;
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  selectedDepartment: string;
  setSelectedDepartment: (dept: string) => void;
  resetFilters: () => void;
  hasActiveFilters: boolean;

  // Analytical summaries
  latestClosedMonth: FiscalMonth;
  kpiSummary: {
    totalBudget: number;
    totalActual: number;
    variance: number;
    variancePct: number;
    status: BudgetStatus;
    annualBudget: number;
    projectedYearEnd: number;
    projectedGap: number;
    absorptionRate: number;
    healthBreakdown: BudgetHealthBreakdown;
  };
  categorySummaries: CategorySummary[];
  worstCoaList: AccountVarianceSummary[];
  highestAbsorptionList: AccountVarianceSummary[];
  lowestAbsorptionList: AccountVarianceSummary[];
  allAccountSummaries: AccountVarianceSummary[];
  priorFiscalYear?: string;
  
  // Matrix data
  monthlyMatrixRows: Array<{
    coa: CoaItem;
    monthlyActuals: Record<FiscalMonth, number | null>;
    monthlyBudgets: Record<FiscalMonth, number | null>;
    ytdActual: number;
    ytdBudget: number;
    ytdVariance: number;
  }>;

  // Upload Actions
  checkPeriodCollision: (type: UploadType, fiscalYear: string, month?: FiscalMonth) => UploadBatch | null;
  commitUpload: (params: {
    uploadType: UploadType;
    fiscalYear: string;
    targetMonth?: FiscalMonth;
    fileName: string;
    fileSize: string;
    rowCount: number;
    acceptedRows: number;
    rejectedRows: number;
    totalAmount: number;
    replaceReason?: string;
    parsedGlRecords?: ParsedGlCommitRecord[];
    parsedBudgetRecords?: Array<{ coaCode: string; monthly: Record<FiscalMonth, number>; annual: number }>;
    newCoas?: CoaItem[];
  }) => { 
    success: boolean; 
    batchId: string;
    isOverBudget?: boolean;
    budgetStatus?: BudgetStatus;
    overBudgetAmount?: number;
    overBudgetPercentage?: number;
    varianceAmount?: number;
    targetBudgetAmount?: number;
    overBudgetAccountsCount?: number;
    topOverBudgetCoa?: {
      code: string;
      accountName: string;
      overAmount: number;
      variancePct: number;
    };
    detailsSummary?: string;
  };

  // Audit Actions
  appendAuditNote: (content: string, category: 'Upload' | 'Replacement' | 'Budget Revision' | 'System' | 'Policy', relatedBatchId?: string) => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

const LS_COA_KEY = 'vega_coa_v2';
const LS_BUDGETS_KEY = 'vega_budgets_v1';
const LS_GL_KEY = 'vega_gl_v1';
const LS_UPLOADS_KEY = 'vega_uploads_v1';
const LS_AUDIT_NOTES_KEY = 'vega_audit_notes_v1';

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();

  // State with LocalStorage fallbacks and auto-merge with real INITIAL_COA
  const [coaList, setCoaList] = useState<CoaItem[]>(() => {
    try {
      const saved = localStorage.getItem(LS_COA_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const map = new Map<string, CoaItem>();
        parsed.forEach((c: CoaItem) => map.set(c.code.toUpperCase(), c));
        INITIAL_COA.forEach((c) => {
          if (!map.has(c.code.toUpperCase())) {
            map.set(c.code.toUpperCase(), c);
          }
        });
        return Array.from(map.values());
      }
    } catch {}
    return INITIAL_COA;
  });

  const addCoas = (newCoas: CoaItem[]) => {
    if (!newCoas || newCoas.length === 0) return;
    setCoaList((prev) => {
      const existing = new Set(prev.map((c) => c.code.toUpperCase()));
      const toAdd = newCoas.filter((c) => !existing.has(c.code.toUpperCase()));
      return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
    });
  };

  useEffect(() => {
    try {
      localStorage.setItem(LS_COA_KEY, JSON.stringify(coaList));
    } catch {}
  }, [coaList]);

  const [budgets, setBudgets] = useState<BudgetRecord[]>(() => {
    try {
      const saved = localStorage.getItem(LS_BUDGETS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return INITIAL_BUDGETS;
  });

  const [glTransactions, setGlTransactions] = useState<GlTransaction[]>(() => {
    try {
      const saved = localStorage.getItem(LS_GL_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return INITIAL_GL_TRANSACTIONS;
  });

  const [uploads, setUploads] = useState<UploadBatch[]>(() => {
    try {
      const saved = localStorage.getItem(LS_UPLOADS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return INITIAL_UPLOADS;
  });

  const [auditNotes, setAuditNotes] = useState<AuditNote[]>(() => {
    try {
      const saved = localStorage.getItem(LS_AUDIT_NOTES_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return INITIAL_AUDIT_NOTES;
  });

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LS_BUDGETS_KEY, JSON.stringify(budgets));
    } catch {}
  }, [budgets]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_GL_KEY, JSON.stringify(glTransactions));
    } catch {}
  }, [glTransactions]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_UPLOADS_KEY, JSON.stringify(uploads));
    } catch {}
  }, [uploads]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_AUDIT_NOTES_KEY, JSON.stringify(auditNotes));
    } catch {}
  }, [auditNotes]);

  // Filters
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<string>('FY2026/2027');
  const [selectedQuarter, setSelectedQuarter] = useState<string>('All');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('MIS Department');

  const hasActiveFilters = useMemo(() => {
    return selectedQuarter !== 'All' || selectedCategory !== 'All';
  }, [selectedQuarter, selectedCategory]);

  const resetFilters = () => {
    setSelectedQuarter('All');
    setSelectedCategory('All');
    setSelectedDepartment('MIS Department');
  };

  // Determine latest closed month from active GL batches
  const latestClosedMonth: FiscalMonth = useMemo(() => {
    const activeGlMonths = glTransactions
      .filter((gl) => gl.fiscalYear === selectedFiscalYear)
      .map((gl) => gl.periodMonth);
    
    // Find the latest month index in FISCAL_MONTHS
    let maxIdx = 4; // default Aug
    FISCAL_MONTHS.forEach((m, idx) => {
      if (activeGlMonths.includes(m) && idx > maxIdx) {
        maxIdx = idx;
      }
    });
    return FISCAL_MONTHS[maxIdx];
  }, [glTransactions, selectedFiscalYear]);

  // Determine which months apply given the quarter filter and latest month
  const activeFiscalMonths = useMemo((): FiscalMonth[] => {
    let monthsPool: FiscalMonth[] = [];
    if (selectedQuarter === 'Q1') {
      monthsPool = ['Apr', 'May', 'Jun'];
    } else if (selectedQuarter === 'Q2') {
      monthsPool = ['Jul', 'Aug', 'Sep'];
    } else if (selectedQuarter === 'Q3') {
      monthsPool = ['Oct', 'Nov', 'Dec'];
    } else if (selectedQuarter === 'Q4') {
      monthsPool = ['Jan', 'Feb', 'Mar'];
    } else {
      // 'All': months up to latestClosedMonth for YTD
      monthsPool = getElapsedMonths(latestClosedMonth);
    }
    return monthsPool;
  }, [selectedQuarter, latestClosedMonth]);

  // Filter COA accounts
  const filteredCoa = useMemo(() => {
    return coaList.filter((item) => {
      if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
      if (selectedDepartment !== 'All' && item.department !== selectedDepartment) return false;
      return true;
    });
  }, [coaList, selectedCategory, selectedDepartment]);

  // Account Summaries computation
  const allAccountSummaries = useMemo((): AccountVarianceSummary[] => {
    const relevantCoaCodes = new Set(filteredCoa.map((c) => c.code));

    // Filtered Budgets for this FY
    const fyBudgets = budgets.filter((b) => b.fiscalYear === selectedFiscalYear && relevantCoaCodes.has(b.coaCode));
    // Filtered GL transactions for this FY and active months
    const fyGls = glTransactions.filter(
      (gl) => gl.fiscalYear === selectedFiscalYear && relevantCoaCodes.has(gl.coaCode)
    );

    // Prior fiscal year comparison (FY2025/2026 when analyzing FY2026/2027)
    const priorFiscalYear = selectedFiscalYear === 'FY2026/2027' ? 'FY2025/2026' : undefined;
    const priorBudgets = priorFiscalYear ? budgets.filter((b) => b.fiscalYear === priorFiscalYear && relevantCoaCodes.has(b.coaCode)) : [];
    const priorGls = priorFiscalYear ? glTransactions.filter((gl) => gl.fiscalYear === priorFiscalYear && relevantCoaCodes.has(gl.coaCode)) : [];

    return filteredCoa.map((coa) => {
      const budgetRecord = fyBudgets.find((b) => b.coaCode === coa.code);
      const annualBudget = budgetRecord?.annualTotal || 0;

      // Calculate YTD budget for selected active months
      let budgetYtd = 0;
      if (budgetRecord) {
        activeFiscalMonths.forEach((m) => {
          budgetYtd += (budgetRecord.monthlyBudget[m] || 0);
        });
      }

      // Calculate YTD actuals for selected active months
      const accountGls = fyGls.filter((gl) => gl.coaCode === coa.code && activeFiscalMonths.includes(gl.periodMonth));
      const actualYtd = accountGls.reduce((acc, curr) => acc + curr.actualAmount, 0);

      const variance = calculateVariance(actualYtd, budgetYtd);
      const variancePct = calculateVariancePercentage(variance, budgetYtd);
      const absorptionRate = calculateAbsorptionRate(actualYtd, budgetYtd);
      const status = determineBudgetStatus(actualYtd, budgetYtd);

      const elapsedCount = activeFiscalMonths.length;
      const { projectedYearEnd, projectedGap } = calculateYearEndProjection(
        actualYtd,
        budgetYtd,
        annualBudget,
        elapsedCount
      );

      // Prior Year YTD Budget & Actuals for the same active fiscal months (e.g. Apr-Aug)
      let priorYearBudgetYtd = 0;
      let priorYearActualYtd = 0;
      let priorYearVariance = 0;
      let priorYearVariancePct = 0;
      let priorYearAbsorptionRate = 0;
      let yoyActualGrowthPct = 0;
      let yoyVarianceDelta = 0;
      let yoyTrend: 'Worsening' | 'Improving' | 'Stable' | 'New Overrun' | 'High Velocity' | 'Lagging' = 'Stable';

      if (priorFiscalYear) {
        const priorBgtRec = priorBudgets.find((b) => b.coaCode === coa.code);
        if (priorBgtRec) {
          activeFiscalMonths.forEach((m) => {
            priorYearBudgetYtd += (priorBgtRec.monthlyBudget[m] || 0);
          });
        }
        const priorAccountGls = priorGls.filter((gl) => gl.coaCode === coa.code && activeFiscalMonths.includes(gl.periodMonth));
        priorYearActualYtd = priorAccountGls.reduce((acc, curr) => acc + curr.actualAmount, 0);
        priorYearVariance = priorYearActualYtd - priorYearBudgetYtd;
        priorYearVariancePct = calculateVariancePercentage(priorYearVariance, priorYearBudgetYtd);
        priorYearAbsorptionRate = calculateAbsorptionRate(priorYearActualYtd, priorYearBudgetYtd);

        if (priorYearActualYtd > 0) {
          yoyActualGrowthPct = ((actualYtd - priorYearActualYtd) / priorYearActualYtd) * 100;
        }
        yoyVarianceDelta = variance - priorYearVariance;

        // Determine performance trend YoY
        if (variance > 0) {
          // Current is over-budget
          if (priorYearVariance > 0) {
            yoyTrend = variance > priorYearVariance ? 'Worsening' : 'Improving';
          } else {
            yoyTrend = 'New Overrun';
          }
        } else {
          // Current is within or under budget
          if (priorYearVariance > 0) {
            yoyTrend = 'Improving';
          } else if (absorptionRate >= 100) {
            yoyTrend = 'High Velocity';
          } else if (absorptionRate < 80) {
            yoyTrend = 'Lagging';
          } else {
            yoyTrend = 'Stable';
          }
        }
      }

      return {
        coaCode: coa.code,
        accountName: coa.accountName,
        category: coa.category,
        department: coa.department,
        budgetYtd,
        actualYtd,
        variance,
        variancePct,
        absorptionRate,
        annualBudget,
        projectedYearEnd,
        projectedGap,
        status,
        priorYearBudgetYtd,
        priorYearActualYtd,
        priorYearVariance,
        priorYearVariancePct,
        priorYearAbsorptionRate,
        yoyActualGrowthPct,
        yoyVarianceDelta,
        yoyTrend
      };
    });
  }, [filteredCoa, budgets, glTransactions, selectedFiscalYear, activeFiscalMonths]);

  // Overall KPI Summary
  const kpiSummary = useMemo(() => {
    const totalBudget = allAccountSummaries.reduce((acc, curr) => acc + curr.budgetYtd, 0);
    const totalActual = allAccountSummaries.reduce((acc, curr) => acc + curr.actualYtd, 0);
    const annualBudget = allAccountSummaries.reduce((acc, curr) => acc + curr.annualBudget, 0);
    const projectedYearEnd = allAccountSummaries.reduce((acc, curr) => acc + curr.projectedYearEnd, 0);
    const projectedGap = projectedYearEnd - annualBudget;
    
    const variance = calculateVariance(totalActual, totalBudget);
    const variancePct = calculateVariancePercentage(variance, totalBudget);
    const absorptionRate = calculateAbsorptionRate(totalActual, totalBudget);
    const status = determineBudgetStatus(totalActual, totalBudget);
    const healthBreakdown = calculateBudgetHealthBreakdown(allAccountSummaries, totalBudget, totalActual);

    return {
      totalBudget,
      totalActual,
      variance,
      variancePct,
      status,
      annualBudget,
      projectedYearEnd,
      projectedGap,
      absorptionRate,
      healthBreakdown
    };
  }, [allAccountSummaries]);

  // Category Summaries for grouped chart
  const categorySummaries = useMemo((): CategorySummary[] => {
    const standardCategories: CoaCategory[] = ['Hardware', 'Software', 'Network', 'Consulting', 'Maintenance', 'Training'];
    const observedCategories = Array.from(new Set(allAccountSummaries.map((a) => a.category)));
    const categories = Array.from(new Set([...standardCategories, ...observedCategories])) as CoaCategory[];

    return categories.map((cat) => {
      const catAccounts = allAccountSummaries.filter((a) => a.category === cat);
      const budget = catAccounts.reduce((acc, a) => acc + a.budgetYtd, 0);
      const actual = catAccounts.reduce((acc, a) => acc + a.actualYtd, 0);
      const variance = calculateVariance(actual, budget);
      const variancePct = calculateVariancePercentage(variance, budget);
      const absorptionRate = calculateAbsorptionRate(actual, budget);
      const status = determineBudgetStatus(actual, budget);

      return {
        category: cat,
        budget,
        actual,
        variance,
        variancePct,
        absorptionRate,
        accountCount: catAccounts.length,
        status
      };
    });
  }, [allAccountSummaries]);

  // Worst COA: Accounts with positive variance (Actual > Budget), sorted descending by variance amount
  const worstCoaList = useMemo(() => {
    return [...allAccountSummaries]
      .filter((a) => a.variance > 0)
      .sort((a, b) => b.variance - a.variance)
      .slice(0, 5);
  }, [allAccountSummaries]);

  // Highest 5 Absorption: non-zero budget, sorted descending by absorption rate
  const highestAbsorptionList = useMemo(() => {
    return [...allAccountSummaries]
      .filter((a) => a.budgetYtd > 0)
      .sort((a, b) => b.absorptionRate - a.absorptionRate)
      .slice(0, 5);
  }, [allAccountSummaries]);

  // Lowest 5 Absorption: non-zero budget, sorted ascending by absorption rate
  const lowestAbsorptionList = useMemo(() => {
    return [...allAccountSummaries]
      .filter((a) => a.budgetYtd > 0)
      .sort((a, b) => a.absorptionRate - b.absorptionRate)
      .slice(0, 5);
  }, [allAccountSummaries]);

  const priorFiscalYear = selectedFiscalYear === 'FY2026/2027' ? 'FY2025/2026' : undefined;

  // Monthly Matrix Rows for Monthly Matrix View
  const monthlyMatrixRows = useMemo(() => {
    const fyBudgets = budgets.filter((b) => b.fiscalYear === selectedFiscalYear);
    const fyGls = glTransactions.filter((gl) => gl.fiscalYear === selectedFiscalYear);
    const elapsedMonthsList = getElapsedMonths(latestClosedMonth);

    return filteredCoa.map((coa) => {
      const budgetRec = fyBudgets.find((b) => b.coaCode === coa.code);
      const monthlyBudgets: Record<FiscalMonth, number | null> = {} as any;
      const monthlyActuals: Record<FiscalMonth, number | null> = {} as any;

      let ytdActual = 0;
      let ytdBudget = 0;

      FISCAL_MONTHS.forEach((m) => {
        // Budget is planned for all 12 months
        monthlyBudgets[m] = budgetRec?.monthlyBudget[m] ?? null;

        // Actuals only exist for closed months - sum all transactions for this account & month
        if (elapsedMonthsList.includes(m)) {
          const matchingGls = fyGls.filter((g) => g.coaCode === coa.code && g.periodMonth === m);
          const val = matchingGls.reduce((sum, g) => sum + g.actualAmount, 0);
          monthlyActuals[m] = matchingGls.length > 0 ? val : 0;
          ytdActual += val;
          ytdBudget += (monthlyBudgets[m] || 0);
        } else {
          // Missing/Future month represented by null (displays as "–")
          monthlyActuals[m] = null;
        }
      });

      const ytdVariance = ytdActual - ytdBudget;

      return {
        coa,
        monthlyActuals,
        monthlyBudgets,
        ytdActual,
        ytdBudget,
        ytdVariance
      };
    });
  }, [filteredCoa, budgets, glTransactions, selectedFiscalYear, latestClosedMonth]);

  // Check period collision
  const checkPeriodCollision = (type: UploadType, fiscalYear: string, month?: FiscalMonth): UploadBatch | null => {
    return uploads.find((u) => {
      if (u.status !== 'Active') return false;
      if (u.uploadType !== type) return false;
      if (u.fiscalYear !== fiscalYear) return false;
      if (type === 'Monthly GL') {
        return u.targetMonth === month;
      }
      return true; // For Budget, 1 active budget per fiscal year
    }) || null;
  };

  // Commit upload batch
  const commitUpload = (params: {
    uploadType: UploadType;
    fiscalYear: string;
    targetMonth?: FiscalMonth;
    fileName: string;
    fileSize: string;
    rowCount: number;
    acceptedRows: number;
    rejectedRows: number;
    totalAmount: number;
    replaceReason?: string;
    parsedGlRecords?: ParsedGlCommitRecord[];
    parsedBudgetRecords?: Array<{ coaCode: string; monthly: Record<FiscalMonth, number>; annual: number }>;
    newCoas?: CoaItem[];
  }): { 
    success: boolean; 
    batchId: string;
    isOverBudget?: boolean;
    budgetStatus?: BudgetStatus;
    overBudgetAmount?: number;
    overBudgetPercentage?: number;
    varianceAmount?: number;
    targetBudgetAmount?: number;
    overBudgetAccountsCount?: number;
    topOverBudgetCoa?: {
      code: string;
      accountName: string;
      overAmount: number;
      variancePct: number;
    };
    detailsSummary?: string;
  } => {
    const existing = checkPeriodCollision(params.uploadType, params.fiscalYear, params.targetMonth);
    const newBatchId = `batch-${params.uploadType === 'Budget' ? 'bgt' : 'gl'}-${Date.now()}`;
    const timestampStr = new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) + ' WIB';
    const userName = currentUser ? `${currentUser.fullName} (${currentUser.username})` : 'admin_hendra (Administrator)';
    const userRole = currentUser?.role || 'Administrator';

    // Calculate detailed Budget / Variance Status (Req 10)
    let batchBudgetStatus: BudgetStatus = 'On Budget';
    let isOver = false;
    let overAmount = 0;
    let overPct = 0;
    let targetBudget = 0;
    let variance = 0;
    let overAccountsCount = 0;
    let topOverCoa: { code: string; accountName: string; overAmount: number; variancePct: number } | undefined;
    let detailSummaryText = '';

    if (params.uploadType === 'Monthly GL' && params.targetMonth) {
      const month = params.targetMonth;
      targetBudget = budgets
        .filter(b => b.fiscalYear === params.fiscalYear)
        .reduce((sum, b) => sum + (b.monthlyBudget[month] || 0), 0) || 3_450_000;
      
      variance = params.totalAmount - targetBudget;
      isOver = variance > 0;
      batchBudgetStatus = isOver ? 'Over Budget' : (variance < -50_000 ? 'Under Budget' : 'On Budget');
      overAmount = isOver ? variance : 0;
      overPct = targetBudget > 0 ? (variance / targetBudget) * 100 : 0;

      if (params.parsedGlRecords && params.parsedGlRecords.length > 0) {
        const glByCoa = new Map<string, number>();
        params.parsedGlRecords.forEach(r => {
          glByCoa.set(r.coaCode, (glByCoa.get(r.coaCode) || 0) + r.amount);
        });

        let maxOver = 0;
        glByCoa.forEach((act, code) => {
          const bgtRec = budgets.find(b => b.fiscalYear === params.fiscalYear && b.coaCode === code);
          const bgtVal = bgtRec?.monthlyBudget[month] || 0;
          if (act > bgtVal && bgtVal > 0) {
            overAccountsCount++;
            const diff = act - bgtVal;
            if (diff > maxOver) {
              maxOver = diff;
              const coa = coaList.find(c => c.code === code);
              topOverCoa = {
                code,
                accountName: coa?.accountName || code,
                overAmount: diff,
                variancePct: (diff / bgtVal) * 100
              };
            }
          }
        });
      } else {
        overAccountsCount = isOver ? 5 : 0;
      }

      if (isOver) {
        detailSummaryText = `Realisasi bulan ${month} OVER BUDGET sebesar +$${overAmount.toLocaleString('en-US')} (+${overPct.toFixed(2)}%) terhadap pagu bulanan $${targetBudget.toLocaleString('en-US')}. ${overAccountsCount} akun mengalami over-budget.`;
      } else {
        detailSummaryText = `Realisasi bulan ${month} UNDER BUDGET (hemat -$${Math.abs(variance).toLocaleString('en-US')} / ${overPct.toFixed(2)}%) di bawah pagu bulanan $${targetBudget.toLocaleString('en-US')}.`;
      }
    } else if (params.uploadType === 'Budget') {
      targetBudget = 43_000_000;
      variance = params.totalAmount - targetBudget;
      isOver = variance > 0;
      batchBudgetStatus = isOver ? 'Over Budget' : 'On Budget';
      overAmount = isOver ? variance : 0;
      overPct = targetBudget > 0 ? (variance / targetBudget) * 100 : 0;
      overAccountsCount = isOver ? 6 : 0;
      if (isOver) {
        detailSummaryText = `Alokasi anggaran tahunan ${params.fiscalYear} OVER BUDGET sebesar +$${overAmount.toLocaleString('en-US')} (+${overPct.toFixed(2)}%) di atas baseline plan $${targetBudget.toLocaleString('en-US')}.`;
      } else {
        detailSummaryText = `Alokasi anggaran tahunan ${params.fiscalYear} berada dalam baseline plan $${targetBudget.toLocaleString('en-US')}.`;
      }
    }

    const budgetStatusNote = isOver
      ? ` [STATUS: OVER BUDGET +$${overAmount.toLocaleString('en-US')} (+${overPct.toFixed(2)}%) | ${overAccountsCount} akun melebihi anggaran]`
      : ` [STATUS: ${batchBudgetStatus} (-$${Math.abs(variance).toLocaleString('en-US')} / ${overPct.toFixed(2)}%)]`;

    // If replacement occurs, supersede the old batch
    if (existing) {
      setUploads((prev) =>
        prev.map((u) => {
          if (u.id === existing.id) {
            return {
              ...u,
              status: 'Replaced' as const,
              replacedAt: timestampStr,
              replacedBy: userName,
              replaceReason: params.replaceReason || 'GANTI DATA: Period superseded by new batch upload',
              replacedBatchId: newBatchId
            };
          }
          return u;
        })
      );

      // Append immutable audit note for replacement
      const noteText = `[GANTI DATA] Superseded ${existing.uploadType} batch ${existing.id} (${existing.fileName}, Total: $${existing.totalAmount.toLocaleString('en-US')}). Justification: ${params.replaceReason || 'Periodic GL revision'}. Superseded by new batch ${newBatchId}.${budgetStatusNote}`;
      setAuditNotes((prev) => [
        {
          id: `an-${Date.now()}`,
          timestamp: timestampStr,
          userName,
          userRole,
          category: 'Replacement',
          relatedBatchId: newBatchId,
          content: noteText
        },
        ...prev
      ]);
    } else {
      // Normal upload audit note
      const noteText = `Committed new ${params.uploadType} upload ${newBatchId} (${params.fileName}, ${params.acceptedRows} rows accepted). Total amount: $${params.totalAmount.toLocaleString('en-US')}.${budgetStatusNote}`;
      setAuditNotes((prev) => [
        {
          id: `an-${Date.now()}`,
          timestamp: timestampStr,
          userName,
          userRole,
          category: 'Upload',
          relatedBatchId: newBatchId,
          content: noteText
        },
        ...prev
      ]);
    }

    // Create new batch
    const newBatch: UploadBatch = {
      id: newBatchId,
      uploadType: params.uploadType,
      fiscalYear: params.fiscalYear,
      targetMonth: params.targetMonth,
      fileName: params.fileName,
      fileSize: params.fileSize,
      uploadedAt: timestampStr,
      uploadedBy: userName,
      status: 'Active',
      rowCount: params.rowCount,
      acceptedRows: params.acceptedRows,
      rejectedRows: params.rejectedRows,
      totalAmount: params.totalAmount,
      previousTotalAmount: existing?.totalAmount,
      budgetStatus: batchBudgetStatus,
      isOverBudget: isOver,
      overBudgetAmount: overAmount,
      overBudgetPercentage: Number(overPct.toFixed(2)),
      targetBudgetAmount: targetBudget,
      varianceAmount: variance,
      overBudgetAccountsCount: overAccountsCount,
      topOverBudgetCoa: topOverCoa,
      detailsSummary: detailSummaryText
    };

    setUploads((prev) => [newBatch, ...prev]);

    // If new auto-detected COAs provided, add them to coaList
    if (params.newCoas && params.newCoas.length > 0) {
      addCoas(params.newCoas);
    }

    // If GL records provided, update glTransactions
    if (params.uploadType === 'Monthly GL' && params.targetMonth && params.parsedGlRecords) {
      const month = params.targetMonth;
      // Remove old transactions for this month & fiscal year if replacing
      setGlTransactions((prev) => {
        const remaining = prev.filter((g) => !(g.fiscalYear === params.fiscalYear && g.periodMonth === month));
        const newRecords: GlTransaction[] = params.parsedGlRecords!.map((rec, i) => ({
          id: `gl-${rec.coaCode}-${month}-${Date.now()}-${i}`,
          fiscalYear: params.fiscalYear,
          periodMonth: month,
          coaCode: rec.coaCode,
          actualAmount: rec.amount,
          glDocumentNo: rec.docNo || `DOC-UPL-${month}-${i + 101}`,
          postingDate: rec.postingDate || `${new Date().toISOString().slice(0, 7)}-28`,
          vendorName: rec.vendor || 'Direct Ingested Vendor',
          description: rec.description || `Uploaded monthly GL actuals for ${rec.coaCode}`,
          uploadBatchId: newBatchId,
          accountNumberPattern: rec.accountNumberPattern,
          category: rec.category,
          department: rec.department,
          sectionCode: rec.sectionCode,
          currency: rec.currency
        }));
        return [...remaining, ...newRecords];
      });
    }

    // If Budget records provided, update budgets
    if (params.uploadType === 'Budget' && params.parsedBudgetRecords) {
      setBudgets((prev) => {
        const remaining = prev.filter((b) => b.fiscalYear !== params.fiscalYear);
        const newBudgets: BudgetRecord[] = params.parsedBudgetRecords!.map((rec) => ({
          id: `bgt-${params.fiscalYear}-${rec.coaCode}`,
          fiscalYear: params.fiscalYear,
          coaCode: rec.coaCode,
          monthlyBudget: rec.monthly,
          annualTotal: rec.annual,
          updatedAt: timestampStr,
          updatedBy: userName
        }));
        return [...remaining, ...newBudgets];
      });
    }

    return { 
      success: true, 
      batchId: newBatchId,
      isOverBudget: isOver,
      budgetStatus: batchBudgetStatus,
      overBudgetAmount: overAmount,
      overBudgetPercentage: Number(overPct.toFixed(2)),
      varianceAmount: variance,
      targetBudgetAmount: targetBudget,
      overBudgetAccountsCount: overAccountsCount,
      topOverBudgetCoa: topOverCoa,
      detailsSummary: detailSummaryText
    };
  };

  // Append strictly immutable audit note
  const appendAuditNote = (
    content: string, 
    category: 'Upload' | 'Replacement' | 'Budget Revision' | 'System' | 'Policy',
    relatedBatchId?: string
  ) => {
    const timestampStr = new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) + ' WIB';
    const userName = currentUser ? `${currentUser.fullName} (${currentUser.username})` : 'admin_hendra (Administrator)';
    const userRole = currentUser?.role || 'Administrator';

    const newNote: AuditNote = {
      id: `an-${Date.now()}`,
      timestamp: timestampStr,
      userName,
      userRole,
      category,
      relatedBatchId,
      content
    };

    setAuditNotes((prev) => [newNote, ...prev]);
  };

  // Add single new COA from Master COA management interface (Req 9)
  const addNewCoa = (newCoa: CoaItem, initialBudgetAnnual?: number): { success: boolean; message: string } => {
    const existing = coaList.find(
      (c) => c.code.trim().toUpperCase() === newCoa.code.trim().toUpperCase()
    );
    if (existing) {
      return {
        success: false,
        message: `Nomor COA "${newCoa.code}" sudah terdaftar dalam sistem (Nama Akun: ${existing.accountName}).`
      };
    }

    const cleanedCoa: CoaItem = {
      ...newCoa,
      code: newCoa.code.trim().toUpperCase(),
      accountName: newCoa.accountName.trim(),
      category: newCoa.category || 'Other',
      department: newCoa.department || 'MIS Department',
      registerSystem: newCoa.registerSystem || 'SAP ERP',
      status: newCoa.status || 'Active',
      description: newCoa.description?.trim() || `${newCoa.accountName} registered in Master COA`,
      inScope: newCoa.inScope !== false
    };

    setCoaList((prev) => [...prev, cleanedCoa]);

    // If initial annual budget provided, allocate across 12 fiscal months
    if (initialBudgetAnnual && initialBudgetAnnual > 0) {
      const monthlyVal = Math.round(initialBudgetAnnual / 12);
      const monthlyBudget: MonthlyValues = {
        Apr: monthlyVal, May: monthlyVal, Jun: monthlyVal,
        Jul: monthlyVal, Aug: monthlyVal, Sep: monthlyVal,
        Oct: monthlyVal, Nov: monthlyVal, Dec: monthlyVal,
        Jan: monthlyVal, Feb: monthlyVal, Mar: monthlyVal
      };

      const newBudgetRecord: BudgetRecord = {
        id: `bgt-${cleanedCoa.code}-${Date.now()}`,
        fiscalYear: selectedFiscalYear || 'FY2026/2027',
        coaCode: cleanedCoa.code,
        monthlyBudget,
        annualTotal: initialBudgetAnnual,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.username || 'admin_hendra'
      };

      setBudgets((prev) => [...prev, newBudgetRecord]);
    }

    const userName = currentUser ? `${currentUser.fullName} (${currentUser.username})` : 'Administrator';
    appendAuditNote(
      `[MASTER COA] Administrator ${userName} mendaftarkan nomor COA baru: ${cleanedCoa.code} - ${cleanedCoa.accountName} (Kategori: ${cleanedCoa.category}, Dept: ${cleanedCoa.department}, Sistem: ${cleanedCoa.registerSystem}). COA aktif dan langsung dikenali oleh sistem untuk alokasi anggaran & pencatatan GL actuals.`,
      'Policy'
    );

    return {
      success: true,
      message: `COA ${cleanedCoa.code} - ${cleanedCoa.accountName} berhasil didaftarkan ke Master COA dan siap digunakan.`
    };
  };

  return (
    <DataContext.Provider
      value={{
        coaList,
        addCoas,
        addNewCoa,
        budgets,
        glTransactions,
        uploads,
        auditNotes,
        selectedFiscalYear,
        setSelectedFiscalYear,
        selectedQuarter,
        setSelectedQuarter,
        selectedCategory,
        setSelectedCategory,
        selectedDepartment,
        setSelectedDepartment,
        resetFilters,
        hasActiveFilters,
        latestClosedMonth,
        kpiSummary,
        categorySummaries,
        worstCoaList,
        highestAbsorptionList,
        lowestAbsorptionList,
        allAccountSummaries,
        priorFiscalYear,
        monthlyMatrixRows,
        checkPeriodCollision,
        commitUpload,
        appendAuditNote
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
