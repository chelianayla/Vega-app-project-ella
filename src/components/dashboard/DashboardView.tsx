import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle2, 
  Calendar, 
  Filter, 
  RotateCcw, 
  BarChart3, 
  ChevronRight, 
  Layers, 
  DollarSign, 
  PieChart, 
  Building2,
  HelpCircle,
  ArrowUpRight,
  ArrowDownRight,
  Info
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrencyUSD, formatPercentage } from '../../lib/calculations';
import { CoaCategory, ITDepartment, BudgetStatus, FISCAL_MONTHS } from '../../types';
import { GroupedBarChart } from './GroupedBarChart';

export const DashboardView: React.FC = () => {
  const { 
    kpiSummary, 
    categorySummaries, 
    worstCoaList, 
    highestAbsorptionList,
    lowestAbsorptionList,
    priorFiscalYear,
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
    allAccountSummaries,
    monthlyMatrixRows
  } = useData();

  const { t } = useAuth();
  const [absorptionTab, setAbsorptionTab] = useState<'lowest' | 'highest'>('lowest');
  const [showSignificance, setShowSignificance] = useState(false);
  const [activeChartMetric, setActiveChartMetric] = useState<'both' | 'variance'>('both');

  // Compute 12-month grouped budget vs actual data for the diagram batang
  const monthlyBarData = useMemo(() => {
    const elapsedMonths = ['Apr', 'May', 'Jun', 'Jul', 'Aug'];
    return FISCAL_MONTHS.map((m) => {
      let bTotal = 0;
      let aTotal = 0;
      monthlyMatrixRows.forEach((row) => {
        bTotal += row.monthlyBudgets[m] || 0;
        aTotal += row.monthlyActuals[m] || 0;
      });
      return {
        month: m,
        budget: bTotal,
        actual: aTotal,
        isClosed: elapsedMonths.includes(m)
      };
    });
  }, [monthlyMatrixRows]);

  // Status badge styling helper
  const getStatusBadge = (status: BudgetStatus) => {
    switch (status) {
      case 'Over Budget':
        return {
          bg: 'bg-rose-50 text-rose-700 border-rose-200',
          icon: AlertTriangle,
          dot: 'bg-rose-500',
          label: t.statusOverBudget
        };
      case 'On Budget':
      case 'On Track':
        return {
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          icon: CheckCircle2,
          dot: 'bg-emerald-500',
          label: t.statusOnBudget || t.statusOnTrack || 'On Budget'
        };
      case 'Under Budget':
        return {
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
          icon: TrendingDown,
          dot: 'bg-amber-500',
          label: t.statusUnderBudget
        };
    }
  };

  const currentStatusBadge = getStatusBadge(kpiSummary.status);
  const StatusIcon = currentStatusBadge.icon;

  // Maximum value for category chart scaling
  const maxCategoryAmount = Math.max(
    ...categorySummaries.map((c) => Math.max(c.budget, c.actual)),
    1_000_000_000
  );

  const isEmpty = allAccountSummaries.length === 0 || (kpiSummary.totalBudget === 0 && kpiSummary.totalActual === 0);

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Fiscal Year & Latest Month Banner */}
      <div 
        id="dashboard-banner"
        className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#1E5EFF] shrink-0">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {t.bannerFiscalYear}
              </span>
              <span className="text-sm font-extrabold text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200">
                {selectedFiscalYear}
              </span>
              <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
                {t.bannerLatestMonth}: {latestClosedMonth} 2026
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              {t.bannerStatusMsg}
            </p>
          </div>
        </div>

        {/* Status Kesehatan Anggaran - Banner Overview with Adjusted Status Percentages */}
        <div id="banner-health-status" className="flex flex-col sm:items-end gap-1.5 self-start md:self-auto">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider hidden sm:inline">
              {t.kpiStatus}:
            </span>
            <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 font-bold text-xs sm:text-sm shadow-2xs ${currentStatusBadge.bg}`}>
              <span className={`w-2 h-2 rounded-full animate-pulse ${currentStatusBadge.dot}`} />
              <StatusIcon className="w-4 h-4 shrink-0" />
              <span>{currentStatusBadge.label}</span>
            </div>
          </div>

          {/* SPV Mandate: Absorption Indicator Adjusted to Over, On, and Under Budget Percentages */}
          <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
            <span 
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-semibold" 
              title={`Over Budget: ${t.healthOverBudgetRule}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
              <span>Over: <strong className="font-mono">{formatPercentage(kpiSummary.healthBreakdown?.overBudgetPct || 0)}</strong></span>
            </span>
            <span 
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold" 
              title={`On Budget: ${t.healthOnBudgetRule}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span>On: <strong className="font-mono">{formatPercentage(kpiSummary.healthBreakdown?.onBudgetPct || 0)}</strong></span>
            </span>
            <span 
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 font-semibold" 
              title={`Under Budget: ${t.healthUnderBudgetRule}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              <span>Under: <strong className="font-mono">{formatPercentage(kpiSummary.healthBreakdown?.underBudgetPct || 0)}</strong></span>
            </span>
          </div>
        </div>
      </div>

      {/* 2. Analytical Filters */}
      <div 
        id="dashboard-filters-card"
        className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-3"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <Filter className="w-4 h-4 text-[#1E5EFF]" />
            <span>{t.filtersTitle}</span>
            {hasActiveFilters && (
              <span className="bg-blue-100 text-[#1E5EFF] px-2 py-0.5 rounded-full text-[10px] font-bold lowercase">
                {t.activeFilters}
              </span>
            )}
          </div>
          {hasActiveFilters && (
            <button
              id="reset-filters-btn"
              onClick={resetFilters}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#1E5EFF] transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t.resetFilters}</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Fiscal Year Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">
              {t.filterFiscalYear}
            </label>
            <select
              id="filter-fiscal-year"
              value={selectedFiscalYear}
              onChange={(e) => setSelectedFiscalYear(e.target.value)}
              className="w-full text-xs font-semibold py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5EFF] cursor-pointer"
            >
              <option value="FY2026/2027">FY 2026/2027 (Current)</option>
              <option value="FY2025/2026">FY 2025/2026 (Audited)</option>
            </select>
          </div>

          {/* Quarter Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">
              {t.filterQuarter}
            </label>
            <select
              id="filter-quarter"
              value={selectedQuarter}
              onChange={(e) => setSelectedQuarter(e.target.value)}
              className="w-full text-xs font-semibold py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5EFF] cursor-pointer"
            >
              <option value="All">{t.filterAllQuarters}</option>
              <option value="Q1">Q1 (Apr - Jun 2026)</option>
              <option value="Q2">Q2 (Jul - Sep 2026)</option>
              <option value="Q3">Q3 (Oct - Dec 2026)</option>
              <option value="Q4">Q4 (Jan - Mar 2027)</option>
            </select>
          </div>

          {/* COA Category Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">
              {t.filterCategory}
            </label>
            <select
              id="filter-category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full text-xs font-semibold py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5EFF] cursor-pointer"
            >
              <option value="All">{t.filterAll}</option>
              {(['Hardware', 'Software', 'Network', 'Consulting', 'Maintenance', 'Training'] as CoaCategory[]).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Department (MIS Department) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">
              {t.filterDepartment}
            </label>
            <div 
              id="active-department-indicator"
              className="w-full flex items-center justify-between py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
            >
              <span className="truncate">MIS Department</span>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-blue-50 text-[#1E5EFF] border border-blue-200 rounded uppercase shrink-0">
                Divisi MIS
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Empty State if filters exclude all data */}
      {isEmpty ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-xs">
          <div className="w-16 h-16 rounded-3xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-4">
            <Layers className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-1">
            {t.noDataTitle}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mb-6">
            {t.noDataDesc}
          </p>
          <button
            onClick={resetFilters}
            className="px-5 py-2.5 bg-[#1E5EFF] hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition cursor-pointer"
          >
            {t.resetFilters}
          </button>
        </div>
      ) : (
        <>
          {/* 3. Status Kesehatan Anggaran (SPV Indicator Section) */}
          <div 
            id="status-kesehatan-anggaran-card"
            className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#1E5EFF]"></div>
                  <h3 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                    <span>{t.healthStatusTitle}</span>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md uppercase">
                      SPV Indicator
                    </span>
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {t.healthStatusSubtitle}
                </p>
              </div>

              {/* Status Badge & Overall Rate */}
              <div className="flex items-center gap-2.5 self-start md:self-auto">
                <div className="text-right text-xs">
                  <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">{t.kpiAbsorptionRate}</span>
                  <span className="font-mono font-bold text-slate-700">{formatPercentage(kpiSummary.absorptionRate)}</span>
                </div>
                <div className={`px-3.5 py-1.5 rounded-xl border flex items-center gap-2 font-bold text-xs shadow-2xs ${currentStatusBadge.bg}`}>
                  <span className={`w-2 h-2 rounded-full animate-pulse ${currentStatusBadge.dot}`} />
                  <StatusIcon className="w-4 h-4 shrink-0" />
                  <span>{currentStatusBadge.label}</span>
                </div>
              </div>
            </div>

            {/* 3 Status Cards: Over Budget, On Budget, Under Budget */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Card 1: Over Budget */}
              <div 
                id="health-card-over-budget"
                className="bg-rose-50/50 border border-rose-200/80 rounded-xl p-4 flex flex-col justify-between hover:bg-rose-50/80 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-extrabold text-rose-900">Over Budget</span>
                      <div className="text-[10px] text-rose-600 font-semibold">
                        {kpiSummary.healthBreakdown?.overBudgetCount || 0} {t.accountsUnit}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black font-mono text-rose-700">
                      {formatPercentage(kpiSummary.healthBreakdown?.overBudgetPct || 0)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-rose-200/60 flex items-center justify-between text-[11px]">
                  <span className="text-rose-700 font-medium">Total Realisasi:</span>
                  <span className="font-mono font-bold text-rose-900">
                    {formatCurrencyUSD(kpiSummary.healthBreakdown?.overBudgetActualAmount || 0, true)}
                  </span>
                </div>

                <div className="mt-2 text-[10px] text-rose-700/90 bg-rose-100/70 px-2 py-1 rounded-md border border-rose-200/60 font-medium flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 shrink-0 text-rose-600" />
                  <span>{t.healthOverBudgetRule}</span>
                </div>
              </div>

              {/* Card 2: On Budget */}
              <div 
                id="health-card-on-budget"
                className="bg-emerald-50/50 border border-emerald-200/80 rounded-xl p-4 flex flex-col justify-between hover:bg-emerald-50/80 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-extrabold text-emerald-900">On Budget</span>
                      <div className="text-[10px] text-emerald-600 font-semibold">
                        {kpiSummary.healthBreakdown?.onBudgetCount || 0} {t.accountsUnit}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black font-mono text-emerald-700">
                      {formatPercentage(kpiSummary.healthBreakdown?.onBudgetPct || 0)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-emerald-200/60 flex items-center justify-between text-[11px]">
                  <span className="text-emerald-700 font-medium">Total Realisasi:</span>
                  <span className="font-mono font-bold text-emerald-900">
                    {formatCurrencyUSD(kpiSummary.healthBreakdown?.onBudgetActualAmount || 0, true)}
                  </span>
                </div>

                <div className="mt-2 text-[10px] text-emerald-700/90 bg-emerald-100/70 px-2 py-1 rounded-md border border-emerald-200/60 font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-600" />
                  <span>{t.healthOnBudgetRule}</span>
                </div>
              </div>

              {/* Card 3: Under Budget */}
              <div 
                id="health-card-under-budget"
                className="bg-amber-50/50 border border-amber-200/80 rounded-xl p-4 flex flex-col justify-between hover:bg-amber-50/80 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                      <TrendingDown className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-extrabold text-amber-900">Under Budget</span>
                      <div className="text-[10px] text-amber-600 font-semibold">
                        {kpiSummary.healthBreakdown?.underBudgetCount || 0} {t.accountsUnit}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black font-mono text-amber-700">
                      {formatPercentage(kpiSummary.healthBreakdown?.underBudgetPct || 0)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-amber-200/60 flex items-center justify-between text-[11px]">
                  <span className="text-amber-700 font-medium">Total Realisasi:</span>
                  <span className="font-mono font-bold text-amber-900">
                    {formatCurrencyUSD(kpiSummary.healthBreakdown?.underBudgetActualAmount || 0, true)}
                  </span>
                </div>

                <div className="mt-2 text-[10px] text-amber-700/90 bg-amber-100/70 px-2 py-1 rounded-md border border-amber-200/60 font-medium flex items-center gap-1.5">
                  <TrendingDown className="w-3 h-3 shrink-0 text-amber-600" />
                  <span>{t.healthUnderBudgetRule}</span>
                </div>
              </div>
            </div>

            {/* Segmented Proportional Distribution Bar */}
            <div className="pt-2">
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-bold mb-1.5">
                <span>{t.healthDistribution}</span>
                <span className="font-mono text-slate-400">
                  Total: {kpiSummary.healthBreakdown?.totalAccounts || 0} {t.accountsUnit}
                </span>
              </div>
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                {(kpiSummary.healthBreakdown?.overBudgetPct || 0) > 0 && (
                  <div 
                    className="bg-rose-500 h-full transition-all duration-500 hover:opacity-90"
                    style={{ width: `${kpiSummary.healthBreakdown.overBudgetPct}%` }}
                    title={`Over Budget: ${formatPercentage(kpiSummary.healthBreakdown.overBudgetPct)} (${kpiSummary.healthBreakdown.overBudgetCount} akun)`}
                  />
                )}
                {(kpiSummary.healthBreakdown?.onBudgetPct || 0) > 0 && (
                  <div 
                    className="bg-emerald-500 h-full transition-all duration-500 hover:opacity-90"
                    style={{ width: `${kpiSummary.healthBreakdown.onBudgetPct}%` }}
                    title={`On Budget: ${formatPercentage(kpiSummary.healthBreakdown.onBudgetPct)} (${kpiSummary.healthBreakdown.onBudgetCount} akun)`}
                  />
                )}
                {(kpiSummary.healthBreakdown?.underBudgetPct || 0) > 0 && (
                  <div 
                    className="bg-amber-400 h-full transition-all duration-500 hover:opacity-90"
                    style={{ width: `${kpiSummary.healthBreakdown.underBudgetPct}%` }}
                    title={`Under Budget: ${formatPercentage(kpiSummary.healthBreakdown.underBudgetPct)} (${kpiSummary.healthBreakdown.underBudgetCount} akun)`}
                  />
                )}
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold mt-1.5 flex-wrap gap-2">
                <span className="flex items-center gap-1.5 text-rose-700">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  Over Budget: <strong className="font-mono">{formatPercentage(kpiSummary.healthBreakdown?.overBudgetPct || 0)}</strong>
                </span>
                <span className="flex items-center gap-1.5 text-emerald-700">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  On Budget: <strong className="font-mono">{formatPercentage(kpiSummary.healthBreakdown?.onBudgetPct || 0)}</strong>
                </span>
                <span className="flex items-center gap-1.5 text-amber-700">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  Under Budget: <strong className="font-mono">{formatPercentage(kpiSummary.healthBreakdown?.underBudgetPct || 0)}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* 4. KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total Budget */}
            <div 
              id="kpi-budget-card"
              className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {t.kpiTotalBudget}
                </span>
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#1E5EFF] flex items-center justify-center font-bold">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">
                  {formatCurrencyUSD(kpiSummary.totalBudget, true)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 font-mono">
                  {formatCurrencyUSD(kpiSummary.totalBudget)}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>{t.kpiAnnualBudget}</span>
                <span className="font-mono font-bold text-slate-700">
                  {formatCurrencyUSD(kpiSummary.annualBudget, true)}
                </span>
              </div>
            </div>

            {/* Card 2: Total Actual */}
            <div 
              id="kpi-actual-card"
              className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {t.kpiTotalActual}
                </span>
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <BarChart3 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">
                  {formatCurrencyUSD(kpiSummary.totalActual, true)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 font-mono">
                  {formatCurrencyUSD(kpiSummary.totalActual)}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">{t.kpiStatus}</span>
                <span className={`font-mono font-bold ${
                  kpiSummary.status === 'Over Budget' 
                    ? 'text-rose-600' 
                    : kpiSummary.status === 'On Budget' || kpiSummary.status === 'On Track'
                    ? 'text-emerald-600' 
                    : 'text-amber-600'
                }`}>
                  {currentStatusBadge.label} ({formatPercentage(kpiSummary.absorptionRate)})
                </span>
              </div>
            </div>

            {/* Card 3: Variance + % */}
            <div 
              id="kpi-variance-card"
              className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {t.kpiVariance} (Act - Bud)
                </span>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                  kpiSummary.variance > 0
                    ? 'bg-rose-50 text-rose-600'
                    : 'bg-emerald-50 text-emerald-600'
                }`}>
                  {kpiSummary.variance > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                </div>
              </div>
              <div className="mt-3">
                <div className={`text-2xl font-black font-mono tracking-tight flex items-baseline gap-2 ${
                  kpiSummary.variance > 0 ? 'text-rose-600' : 'text-emerald-600'
                }`}>
                  <span>{formatCurrencyUSD(kpiSummary.variance, true)}</span>
                  <span className="text-sm font-bold">
                    ({formatPercentage(kpiSummary.variancePct, true)})
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 font-mono">
                  {formatCurrencyUSD(kpiSummary.variance)}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">Variance Type</span>
                <span className={`font-bold ${
                  kpiSummary.variance > 0 ? 'text-rose-600' : 'text-emerald-600'
                }`}>
                  {kpiSummary.variance > 0 ? 'Over Expenditure' : 'Favorable Savings'}
                </span>
              </div>
            </div>

            {/* Card 4: Year-End Projection */}
            <div 
              id="kpi-projection-card"
              className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {t.kpiYearEndProjection}
                </span>
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                  <PieChart className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">
                  {formatCurrencyUSD(kpiSummary.projectedYearEnd, true)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 font-mono">
                  Gap: {formatCurrencyUSD(kpiSummary.projectedGap, true)}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">{t.kpiProjectedGap}</span>
                <span className={`font-mono font-bold ${
                  kpiSummary.projectedGap > 0 ? 'text-rose-600' : 'text-emerald-600'
                }`}>
                  {kpiSummary.projectedGap > 0 ? '+' : ''}{formatCurrencyUSD(kpiSummary.projectedGap, true)}
                </span>
              </div>
            </div>
          </div>

          {/* 4. Grouped Budget vs Actual Diagram Batang Chart */}
          <GroupedBarChart 
            categorySummaries={categorySummaries} 
            monthlyData={monthlyBarData} 
          />

          {/* 5. Split Section: Worst COA & Budget Absorption with Prior Year YoY Comparison */}
          <div className="space-y-4">
            {/* Executive Significance Callout answering user query */}
            <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 text-xs text-slate-700">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-blue-100 text-blue-700 shrink-0 mt-0.5">
                    <Info className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-900 text-sm">
                        {t.yoyComparisonTitle}
                      </h4>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
                        {selectedFiscalYear} vs {priorFiscalYear || 'FY2025/2026'}
                      </span>
                    </div>
                    <p className="text-slate-600 mt-1 leading-relaxed">
                      {t.analysisSignificanceDesc}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSignificance(!showSignificance)}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shrink-0 hover:shadow-xs transition"
                >
                  {showSignificance ? 'Hide Context' : 'Strategic Value'}
                </button>
              </div>

              {showSignificance && (
                <div className="mt-3 pt-3 border-t border-slate-200/80 grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
                  <div className="bg-white p-3 rounded-xl border border-rose-100">
                    <span className="font-bold text-rose-700 flex items-center gap-1 mb-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                      Critical Worst Variance
                    </span>
                    <p className="text-slate-600 leading-normal">
                      Mendeteksi akun dengan pembengkakan belanja melampaui otorisasi. Membandingkan dengan tahun lalu membedakan antara lonjakan baru (new overrun) dan tren struktural yang memburuk (worsening).
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-amber-100">
                    <span className="font-bold text-amber-700 flex items-center gap-1 mb-1">
                      <TrendingDown className="w-3.5 h-3.5 text-amber-600" />
                      Under-Absorbed Allocation
                    </span>
                    <p className="text-slate-600 leading-normal">
                      Mendeteksi dana mengendap (dormant funds) atau keterlambatan pengadaan vendor. Penting agar dana dapat direalokasikan sebelum tahun anggaran berakhir.
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-emerald-100">
                    <span className="font-bold text-emerald-700 flex items-center gap-1 mb-1">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                      Top Absorption Velocity
                    </span>
                    <p className="text-slate-600 leading-normal">
                      Memantau program kerja dengan eksekusi tercepat. Berguna untuk mengantisipasi potensi defisit kuartal berikutnya apabila penyerapan terus berjalan di atas 100%.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Split Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Worst COA Table with YoY Comparison */}
              <div 
                id="worst-coa-card"
                className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                  <div>
                    <h3 className="text-sm font-extrabold text-rose-700 tracking-tight flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-rose-500" />
                      <span>{t.worstCoaTitle}</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {t.worstCoaSubtitle}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                      YoY vs {priorFiscalYear || 'FY2025/2026'}
                    </span>
                    <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-100">
                      {worstCoaList.length} Flagged
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        <th className="pb-2.5 font-bold">{t.tableCode}</th>
                        <th className="pb-2.5 font-bold">{t.tableAccount}</th>
                        <th className="pb-2.5 font-bold text-right">{t.tableActual}</th>
                        <th className="pb-2.5 font-bold text-right">{t.tableVariance}</th>
                        <th className="pb-2.5 font-bold text-right">{t.yoyActual}</th>
                        <th className="pb-2.5 font-bold text-center">{t.yoyTrend}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {worstCoaList.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-slate-400 text-xs">
                            No over-budget accounts in this filter view.
                          </td>
                        </tr>
                      ) : (
                        worstCoaList.map((item) => {
                          const isWorsening = item.yoyTrend === 'Worsening' || item.yoyTrend === 'New Overrun';
                          const trendColor = item.yoyTrend === 'Worsening'
                            ? 'text-rose-700 bg-rose-50 border-rose-200'
                            : item.yoyTrend === 'New Overrun'
                            ? 'text-amber-700 bg-amber-50 border-amber-200'
                            : 'text-emerald-700 bg-emerald-50 border-emerald-200';

                          return (
                            <tr key={item.coaCode} className="hover:bg-slate-50 transition">
                              <td className="py-2.5 font-mono font-bold text-slate-800">
                                {item.coaCode}
                              </td>
                              <td className="py-2.5 max-w-[150px]">
                                <div className="font-semibold text-slate-900 truncate">
                                  {item.accountName}
                                </div>
                                <div className="text-[10px] text-slate-400 truncate">
                                  {item.category} • {item.department}
                                </div>
                              </td>
                              <td className="py-2.5 text-right font-mono font-semibold text-slate-700">
                                {formatCurrencyUSD(item.actualYtd, true)}
                              </td>
                              <td className="py-2.5 text-right font-mono font-bold text-rose-600">
                                +{formatCurrencyUSD(item.variance, true)}
                                <div className="text-[10px] text-rose-500 font-normal">
                                  {formatPercentage(item.absorptionRate)}
                                </div>
                              </td>
                              <td className="py-2.5 text-right font-mono text-slate-500">
                                <div>{formatCurrencyUSD(item.priorYearActualYtd || 0, true)}</div>
                                {item.yoyActualGrowthPct !== undefined && (
                                  <div className={`text-[10px] font-semibold flex items-center justify-end gap-0.5 ${
                                    item.yoyActualGrowthPct > 0 ? 'text-rose-600' : 'text-emerald-600'
                                  }`}>
                                    {item.yoyActualGrowthPct > 0 ? (
                                      <ArrowUpRight className="w-3 h-3 inline" />
                                    ) : (
                                      <ArrowDownRight className="w-3 h-3 inline" />
                                    )}
                                    {item.yoyActualGrowthPct > 0 ? '+' : ''}{item.yoyActualGrowthPct.toFixed(1)}%
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 text-center">
                                <span className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold px-2 py-0.5 rounded-md border ${trendColor}`}>
                                  {item.yoyTrend || 'Stable'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Budget Absorption Table with Switcher: Lowest vs Highest & YoY */}
              <div 
                id="lowest-absorption-card"
                className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col"
              >
                <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 mb-4 gap-2">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800 tracking-tight flex items-center gap-1.5">
                      {absorptionTab === 'lowest' ? (
                        <TrendingDown className="w-4 h-4 text-amber-500" />
                      ) : (
                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                      )}
                      <span>
                        {absorptionTab === 'lowest' ? t.lowestAbsorptionTitle : t.highestAbsorptionTitle}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {absorptionTab === 'lowest' ? t.lowestAbsorptionSubtitle : t.highestAbsorptionSubtitle}
                    </p>
                  </div>

                  {/* Toggle between Lowest & Highest */}
                  <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/70">
                    <button
                      type="button"
                      onClick={() => setAbsorptionTab('lowest')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition ${
                        absorptionTab === 'lowest'
                          ? 'bg-white text-amber-800 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t.absorptionModeLowest}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAbsorptionTab('highest')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition ${
                        absorptionTab === 'highest'
                          ? 'bg-white text-emerald-800 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t.absorptionModeHighest}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        <th className="pb-2.5 font-bold">{t.tableCode}</th>
                        <th className="pb-2.5 font-bold">{t.tableAccount}</th>
                        <th className="pb-2.5 font-bold text-right">{t.tableBudget}</th>
                        <th className="pb-2.5 font-bold text-right">{t.tableActual}</th>
                        <th className="pb-2.5 font-bold text-right">{t.tableAbsorption}</th>
                        <th className="pb-2.5 font-bold text-right">PY Absorp.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(absorptionTab === 'lowest' ? lowestAbsorptionList : highestAbsorptionList).map((item) => {
                        const isUnder = item.absorptionRate < 80;
                        const isOver = item.absorptionRate > 105;
                        const badgeColor = isUnder
                          ? 'text-amber-700 bg-amber-50 border-amber-200'
                          : isOver
                          ? 'text-purple-700 bg-purple-50 border-purple-200'
                          : 'text-emerald-700 bg-emerald-50 border-emerald-200';

                        return (
                          <tr key={item.coaCode} className="hover:bg-slate-50 transition">
                            <td className="py-2.5 font-mono font-bold text-slate-800">
                              {item.coaCode}
                            </td>
                            <td className="py-2.5 max-w-[150px]">
                              <div className="font-semibold text-slate-900 truncate">
                                {item.accountName}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate">
                                {item.department}
                              </div>
                            </td>
                            <td className="py-2.5 text-right font-mono font-semibold text-slate-600">
                              {formatCurrencyUSD(item.budgetYtd, true)}
                            </td>
                            <td className="py-2.5 text-right font-mono font-semibold text-slate-900">
                              {formatCurrencyUSD(item.actualYtd, true)}
                            </td>
                            <td className="py-2.5 text-right">
                              <span className={`font-mono font-bold px-2 py-0.5 rounded-md border ${badgeColor}`}>
                                {formatPercentage(item.absorptionRate)}
                              </span>
                            </td>
                            <td className="py-2.5 text-right font-mono text-slate-500">
                              <div>{formatPercentage(item.priorYearAbsorptionRate || 0)}</div>
                              {item.yoyActualGrowthPct !== undefined && (
                                <div className={`text-[10px] font-semibold flex items-center justify-end gap-0.5 ${
                                  item.yoyActualGrowthPct > 0 ? 'text-emerald-600' : 'text-slate-500'
                                }`}>
                                  {item.yoyActualGrowthPct > 0 ? '+' : ''}{item.yoyActualGrowthPct.toFixed(0)}% YoY
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
