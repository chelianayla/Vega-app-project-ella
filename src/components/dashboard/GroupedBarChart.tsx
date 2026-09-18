import React, { useState } from 'react';
import { CategorySummary, FiscalMonth, FISCAL_MONTHS } from '../../types';
import { formatCurrencyUSD, formatPercentage } from '../../lib/calculations';
import { Layers, Calendar, BarChart2, TrendingUp, TrendingDown, Info } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface GroupedBarChartProps {
  categorySummaries: CategorySummary[];
  monthlyData?: {
    month: FiscalMonth;
    budget: number;
    actual: number;
    isClosed: boolean;
  }[];
}

export const GroupedBarChart: React.FC<GroupedBarChartProps> = ({
  categorySummaries,
  monthlyData = []
}) => {
  const { language } = useAuth();
  const [chartMode, setChartMode] = useState<'category' | 'monthly'>('category');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Labels based on language
  const labels = {
    categoryTab: language === 'ID' ? 'Diagram Batang Kategori' : 'By IT Category',
    monthlyTab: language === 'ID' ? 'Diagram Batang Bulanan (Apr–Mar)' : 'By Fiscal Month',
    budgetLegend: language === 'ID' ? 'Anggaran (Budget)' : 'Budget (Plan)',
    actualLegend: language === 'ID' ? 'Realisasi (Actual)' : 'Actual Expenses',
    overBudgetLegend: language === 'ID' ? 'Melebihi Anggaran (Over)' : 'Over Budget',
    variance: language === 'ID' ? 'Varians' : 'Variance',
    absorption: language === 'ID' ? 'Penyerapan' : 'Absorption',
    monthClosed: language === 'ID' ? 'Tutup Buku' : 'Closed Period',
    monthPlanned: language === 'ID' ? 'Rencana' : 'Projected',
  };

  // Determine maximum value for Y-axis scaling
  const maxCategoryValue = Math.max(
    ...categorySummaries.map((c) => Math.max(c.budget, c.actual)),
    1_000_000_000
  );

  const maxMonthlyValue = Math.max(
    ...monthlyData.map((m) => Math.max(m.budget, m.actual)),
    500_000_000
  );

  const currentMax = chartMode === 'category' ? maxCategoryValue : maxMonthlyValue;
  // Round up to nice ceiling for 4 y-axis steps
  const yAxisCeiling = Math.ceil(currentMax * 1.15 / 1_000_000_000) * 1_000_000_000;
  const yTicks = [
    yAxisCeiling,
    yAxisCeiling * 0.75,
    yAxisCeiling * 0.5,
    yAxisCeiling * 0.25,
    0
  ];

  return (
    <div 
      id="grouped-bar-chart-container"
      className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6"
    >
      {/* Chart Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#1E5EFF] flex items-center justify-center font-bold">
              <BarChart2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                {language === 'ID' ? 'Diagram Batang Perbandingan Budget vs Actual' : 'Grouped Bar Chart: Budget vs Actual'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {language === 'ID'
                  ? 'Visualisasi diagram batang terkelompok untuk mengevaluasi varians dan penyerapan biaya TI'
                  : 'Side-by-side bar visualization to evaluate variance, absorptions, and overspends'}
              </p>
            </div>
          </div>
        </div>

        {/* Controls & Mode Switcher */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Mode Switch Tabs */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/70 text-xs font-bold">
            <button
              id="chart-mode-category-btn"
              onClick={() => {
                setChartMode('category');
                setHoveredIndex(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
                chartMode === 'category'
                  ? 'bg-white text-[#1E5EFF] shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{labels.categoryTab}</span>
            </button>
            <button
              id="chart-mode-monthly-btn"
              onClick={() => {
                setChartMode('monthly');
                setHoveredIndex(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
                chartMode === 'monthly'
                  ? 'bg-white text-[#1E5EFF] shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{labels.monthlyTab}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200/70">
        <div className="flex items-center gap-5">
          {/* Budget Legend */}
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-slate-300 border border-slate-400/30 inline-block" />
            <span className="font-semibold text-slate-700">{labels.budgetLegend}</span>
          </div>

          {/* Actual Legend */}
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-[#1E5EFF] inline-block shadow-2xs" />
            <span className="font-bold text-slate-900">{labels.actualLegend}</span>
          </div>

          {/* Over Budget Flag Legend */}
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-rose-500 inline-block shadow-2xs" />
            <span className="font-semibold text-rose-700">{labels.overBudgetLegend}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
          <Info className="w-3.5 h-3.5 text-slate-400" />
          <span>{language === 'ID' ? 'Arahkan kursor ke batang untuk detail rincian' : 'Hover over any bar column to view details'}</span>
        </div>
      </div>

      {/* Main Bar Chart Stage */}
      <div className="relative pt-6 pb-2 select-none">
        {/* Category Mode Diagram Batang */}
        {chartMode === 'category' && (
          <div className="relative">
            {/* Grid Lines and Y-Axis Ticks */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pl-14 pr-2 pb-14">
              {yTicks.map((val, idx) => (
                <div key={idx} className="flex items-center w-full">
                  <span className="w-14 text-right pr-3 font-mono text-[10px] font-semibold text-slate-400 -translate-y-1/2">
                    {formatCurrencyUSD(val, true)}
                  </span>
                  <div className="flex-1 border-b border-slate-100" />
                </div>
              ))}
            </div>

            {/* Bars Container */}
            <div className="relative z-10 pl-16 pr-4 pb-14 pt-4 min-h-[340px] flex items-end justify-around gap-2 sm:gap-6">
              {categorySummaries.map((cat, idx) => {
                const isHovered = hoveredIndex === idx;
                const isOverBudget = cat.variance > 0;
                
                const budgetHeightPct = Math.max(4, (cat.budget / yAxisCeiling) * 100);
                const actualHeightPct = Math.max(4, (cat.actual / yAxisCeiling) * 100);

                return (
                  <div 
                    key={cat.category}
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    className="flex-1 max-w-[120px] flex flex-col items-center group cursor-pointer relative"
                  >
                    {/* Hover Floating Tooltip */}
                    {isHovered && (
                      <div className="absolute bottom-full mb-3 z-30 w-64 bg-slate-900/95 text-white p-3.5 rounded-2xl shadow-xl backdrop-blur-xs border border-slate-800 text-xs pointer-events-none animate-in fade-in zoom-in-95 duration-100">
                        <div className="font-extrabold text-sm border-b border-slate-700 pb-1.5 mb-2 flex items-center justify-between">
                          <span>{cat.category}</span>
                          <span className="text-[10px] font-mono font-medium text-slate-300">
                            {cat.accountCount} COA
                          </span>
                        </div>
                        <div className="space-y-1.5 font-mono text-[11px]">
                          <div className="flex justify-between">
                            <span className="text-slate-400">{labels.budgetLegend}:</span>
                            <span className="font-bold">{formatCurrencyUSD(cat.budget)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">{labels.actualLegend}:</span>
                            <span className="font-bold text-blue-300">{formatCurrencyUSD(cat.actual)}</span>
                          </div>
                          <div className="flex justify-between pt-1 border-t border-slate-800">
                            <span className="text-slate-400">{labels.variance}:</span>
                            <span className={`font-bold ${isOverBudget ? 'text-rose-400' : 'text-emerald-400'}`}>
                              {isOverBudget ? '+' : ''}{formatCurrencyUSD(cat.variance)} ({formatPercentage(cat.variancePct, true)})
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">{labels.absorption}:</span>
                            <span className="font-bold">{formatPercentage(cat.absorptionRate)}</span>
                          </div>
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px]">
                          <span className="text-slate-400">Status:</span>
                          <span className={`px-2 py-0.5 rounded font-bold ${
                            cat.status === 'Over Budget'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' 
                              : cat.status === 'Under Budget'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}>
                            {cat.status}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Grouped Bars Pair (Side by Side) */}
                    <div className="w-full flex items-end justify-center gap-1.5 sm:gap-2 h-64">
                      {/* Budget Bar (Plan) */}
                      <div className="w-1/2 max-w-[28px] h-full flex flex-col justify-end items-center">
                        <div 
                          className={`w-full rounded-t-lg transition-all duration-300 ${
                            isHovered ? 'bg-slate-400' : 'bg-slate-300'
                          }`}
                          style={{ height: `${budgetHeightPct}%` }}
                        />
                      </div>

                      {/* Actual Bar */}
                      <div className="w-1/2 max-w-[28px] h-full flex flex-col justify-end items-center">
                        <div 
                          className={`w-full rounded-t-lg transition-all duration-300 shadow-sm ${
                            isOverBudget
                              ? isHovered ? 'bg-rose-600' : 'bg-rose-500'
                              : isHovered ? 'bg-blue-700' : 'bg-[#1E5EFF]'
                          }`}
                          style={{ height: `${actualHeightPct}%` }}
                        />
                      </div>
                    </div>

                    {/* X-Axis Category Label */}
                    <div className="absolute top-full mt-2 w-full text-center">
                      <p className={`text-xs font-bold truncate transition ${
                        isHovered ? 'text-[#1E5EFF]' : 'text-slate-700'
                      }`}>
                        {cat.category}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {formatPercentage(cat.absorptionRate)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Monthly Mode Diagram Batang (12 Months Apr-Mar) */}
        {chartMode === 'monthly' && (
          <div className="relative">
            {/* Grid Lines and Y-Axis Ticks */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pl-14 pr-2 pb-14">
              {yTicks.map((val, idx) => (
                <div key={idx} className="flex items-center w-full">
                  <span className="w-14 text-right pr-3 font-mono text-[10px] font-semibold text-slate-400 -translate-y-1/2">
                    {formatCurrencyUSD(val, true)}
                  </span>
                  <div className="flex-1 border-b border-slate-100" />
                </div>
              ))}
            </div>

            {/* Bars Container */}
            <div className="relative z-10 pl-16 pr-4 pb-14 pt-4 min-h-[340px] flex items-end justify-between gap-1 sm:gap-2">
              {monthlyData.map((m, idx) => {
                const isHovered = hoveredIndex === idx;
                const isOverBudget = m.actual > m.budget && m.isClosed;
                const variance = m.actual - m.budget;
                
                const budgetHeightPct = Math.max(4, (m.budget / yAxisCeiling) * 100);
                const actualHeightPct = m.isClosed ? Math.max(4, (m.actual / yAxisCeiling) * 100) : 0;

                return (
                  <div 
                    key={m.month}
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    className="flex-1 flex flex-col items-center group cursor-pointer relative"
                  >
                    {/* Hover Tooltip */}
                    {isHovered && (
                      <div className="absolute bottom-full mb-3 z-30 w-56 bg-slate-900/95 text-white p-3 rounded-2xl shadow-xl backdrop-blur-xs border border-slate-800 text-xs pointer-events-none animate-in fade-in zoom-in-95 duration-100">
                        <div className="font-extrabold text-sm border-b border-slate-700 pb-1 mb-2 flex items-center justify-between">
                          <span>{m.month} 2026</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                            m.isClosed ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-700 text-slate-300'
                          }`}>
                            {m.isClosed ? labels.monthClosed : labels.monthPlanned}
                          </span>
                        </div>
                        <div className="space-y-1 font-mono text-[11px]">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Budget:</span>
                            <span className="font-bold">{formatCurrencyUSD(m.budget)}</span>
                          </div>
                          {m.isClosed ? (
                            <>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Actual:</span>
                                <span className="font-bold text-blue-300">{formatCurrencyUSD(m.actual)}</span>
                              </div>
                              <div className="flex justify-between pt-1 border-t border-slate-800">
                                <span className="text-slate-400">Variance:</span>
                                <span className={`font-bold ${isOverBudget ? 'text-rose-400' : 'text-emerald-400'}`}>
                                  {isOverBudget ? '+' : ''}{formatCurrencyUSD(variance)}
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="text-slate-400 text-[10px] italic pt-1">
                              Realisasi belum diunggah (Future Month)
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Bars */}
                    <div className="w-full flex items-end justify-center gap-1 h-64">
                      {/* Budget */}
                      <div className="w-1/2 max-w-[14px] h-full flex flex-col justify-end items-center">
                        <div 
                          className="w-full rounded-t-sm bg-slate-300 transition-all duration-300"
                          style={{ height: `${budgetHeightPct}%` }}
                        />
                      </div>

                      {/* Actual */}
                      <div className="w-1/2 max-w-[14px] h-full flex flex-col justify-end items-center">
                        {m.isClosed ? (
                          <div 
                            className={`w-full rounded-t-sm transition-all duration-300 ${
                              isOverBudget ? 'bg-rose-500' : 'bg-[#1E5EFF]'
                            }`}
                            style={{ height: `${actualHeightPct}%` }}
                          />
                        ) : (
                          <div className="w-full h-1 bg-slate-200 rounded-full mb-0" />
                        )}
                      </div>
                    </div>

                    {/* Month Label */}
                    <div className="absolute top-full mt-2 w-full text-center">
                      <p className={`text-[11px] font-bold transition ${
                        isHovered ? 'text-[#1E5EFF]' : 'text-slate-700'
                      }`}>
                        {m.month}
                      </p>
                      <p className="text-[9px] text-slate-400 font-mono">
                        {m.isClosed ? 'Closed' : '–'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer Metrics Row */}
      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-4 text-slate-500">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-rose-500" />
            <span>Highest Variance: <strong>Software (+18.2%)</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingDown className="w-4 h-4 text-emerald-500" />
            <span>Top Discipline: <strong>Training (On Track)</strong></span>
          </div>
        </div>

        <div className="text-[11px] font-mono text-slate-400">
          YTD Period: Apr 2026 – Aug 2026 (5 Months Active)
        </div>
      </div>
    </div>
  );
};
