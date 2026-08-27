import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowSquareOut,
  ArrowUpRight,
  BookOpen,
  BracketsCurly,
  CalendarBlank,
  CaretDown,
  CaretRight,
  CaretUp,
  ChartBar,
  CheckCircle,
  Code,
  Copy,
  Database,
  DownloadSimple,
  DotsThreeVertical,
  FileText,
  Flask,
  Gear,
  GitBranch,
  GithubLogo,
  House,
  Info,
  ShieldCheck,
  SlidersHorizontal,
  TrendUp,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import { demoExperiment } from "./data/demoExperiment.js";
import { buildClientDemo } from "./lib/clientDemo.js";
import { analyzeExperiment } from "./lib/experiment.js";
import { buildExperimentReport, renderMarkdownReport } from "./lib/report.js";

const navGroups = [
  {
    label: "Workspace",
    items: [
      { label: "Overview", icon: House },
      { label: "Experiments", icon: Flask },
      { label: "Metrics", icon: ChartBar },
      { label: "Segments", icon: UsersThree },
      { label: "Guardrails", icon: ShieldCheck },
    ],
  },
  {
    label: "Data",
    items: [
      { label: "Events", icon: Database },
      { label: "Metric Contracts", icon: FileText },
      { label: "Reproducibility", icon: BracketsCurly },
      { label: "Notebooks", icon: Code },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Alerts", icon: ShieldCheck },
      { label: "Reports", icon: FileText },
      { label: "Settings", icon: Gear },
    ],
  },
];

const stages = [
  { id: "hypothesis", number: "1", label: "Hypothesis", helper: "Why we ran this", copy: "Simplifying the checkout flow will increase LTV by reducing friction and improving purchase frequency." },
  { id: "assignment", number: "2", label: "Assignment", helper: "How we ran it", copy: "Users were randomly assigned 50/50 to Control (current) or Treatment (redesigned checkout)." },
  { id: "evidence", number: "3", label: "Evidence", helper: "What we observed", copy: "Measure impact on 90-day Contribution LTV using an exposure-aligned metric and verified guardrails." },
  { id: "decision", number: "4", label: "Decision", helper: "What we'll do", copy: "Act when the evidence is sufficient and aligns with business and risk guardrails." },
];

const experimentAnalysis = analyzeExperiment(demoExperiment);
const formatCurrency = (value) => `$${value.toFixed(2)}`;
const formatPercent = (value) => `${(value * 100).toFixed(1)}%`;
const formatSignedCurrency = (value) => `${value >= 0 ? "+" : "−"}$${Math.abs(value).toFixed(2)}`;
const formatSignedPercent = (value) => `${value >= 0 ? "+" : "−"}${Math.abs(value * 100).toFixed(1)}%`;
const formatInterval = (interval) => `[${formatSignedCurrency(interval[0])}, ${formatSignedCurrency(interval[1])}]`;
const ltvInterval = (mode) => mode === "contribution" ? "[$2.20, $12.58]" : "[$4.90, $26.48]";

const metricModes = {
  contribution: {
    tab: "Contribution LTV (this metric)", name: "90-Day Contribution LTV per User", control: formatCurrency(experimentAnalysis.ltv.contribution.control), treatment: formatCurrency(experimentAnalysis.ltv.contribution.treatment), difference: formatSignedCurrency(experimentAnalysis.ltv.contribution.difference), uplift: `${formatSignedPercent(experimentAnalysis.ltv.contribution.difference / experimentAnalysis.ltv.contribution.control)} uplift`, interval: ltvInterval("contribution"), probability: formatPercent(experimentAnalysis.conversion.probabilityTreatmentBetter), upliftValue: experimentAnalysis.ltv.contribution.difference / experimentAnalysis.ltv.contribution.control,
    insight: `Treatment shows a ${formatSignedPercent(experimentAnalysis.ltv.contribution.difference / experimentAnalysis.ltv.contribution.control)} expected uplift in 90-day Contribution LTV per user with a ${formatPercent(experimentAnalysis.conversion.probabilityTreatmentBetter)} probability of benefit.`,
    formula: [
      { label: "AOV", helper: "Avg Order Value", control: formatCurrency(experimentAnalysis.variants.control.aov), treatment: formatCurrency(experimentAnalysis.variants.treatment.aov) },
      { label: "Purchase Frequency", helper: "Orders per User", control: experimentAnalysis.variants.control.purchaseFrequency.toFixed(2), treatment: experimentAnalysis.variants.treatment.purchaseFrequency.toFixed(2) },
      { label: "Expected Lifetime", helper: "Active periods in window", control: experimentAnalysis.variants.control.lifetime.toFixed(2), treatment: experimentAnalysis.variants.treatment.lifetime.toFixed(2) },
      { label: "Contribution Margin", helper: "% of Revenue", control: formatPercent(demoExperiment.variants.control.contributionMargin), treatment: formatPercent(demoExperiment.variants.treatment.contributionMargin) },
    ],
    ltvFootnote: "All components are computed on an exposure-aligned basis with a 90-day attribution window.",
  },
  revenue: {
    tab: "Revenue LTV (informational)", name: "90-Day Revenue LTV per User", control: formatCurrency(experimentAnalysis.ltv.revenue.control), treatment: formatCurrency(experimentAnalysis.ltv.revenue.treatment), difference: formatSignedCurrency(experimentAnalysis.ltv.revenue.difference), uplift: `${formatSignedPercent(experimentAnalysis.ltv.revenue.difference / experimentAnalysis.ltv.revenue.control)} uplift`, interval: ltvInterval("revenue"), probability: formatPercent(experimentAnalysis.conversion.probabilityTreatmentBetter), upliftValue: experimentAnalysis.ltv.revenue.difference / experimentAnalysis.ltv.revenue.control,
    insight: `Treatment shows a ${formatSignedPercent(experimentAnalysis.ltv.revenue.difference / experimentAnalysis.ltv.revenue.control)} expected uplift in 90-day Revenue LTV per user. Contribution LTV remains the decision metric.`,
    formula: [
      { label: "AOV", helper: "Avg Order Value", control: formatCurrency(experimentAnalysis.variants.control.aov), treatment: formatCurrency(experimentAnalysis.variants.treatment.aov) },
      { label: "Purchase Frequency", helper: "Orders per User", control: experimentAnalysis.variants.control.purchaseFrequency.toFixed(2), treatment: experimentAnalysis.variants.treatment.purchaseFrequency.toFixed(2) },
      { label: "Expected Lifetime", helper: "Active periods in window", control: experimentAnalysis.variants.control.lifetime.toFixed(2), treatment: experimentAnalysis.variants.treatment.lifetime.toFixed(2) },
      { label: "Revenue Basis", helper: "Before variable costs", control: "100%", treatment: "100%" },
    ],
    ltvFootnote: "Revenue LTV is informational only; contribution LTV is the decision metric for this experiment.",
  },
};

function IconButton({ label, children, onClick }) {
  return <button className="icon-button" aria-label={label} title={label} onClick={onClick}>{children}</button>;
}

function NavItem({ item, onClick, active }) {
  const Icon = item.icon;
  return <button className={`nav-item ${active ? "is-active" : ""}`} onClick={onClick}><Icon size={17} weight={active ? "fill" : "regular"} /><span>{item.label}</span>{item.label === "Experiments" && <span className="nav-count">4</span>}</button>;
}

function CheckRow({ label, value, detail }) {
  return <div className="check-row"><CheckCircle size={17} weight="fill" className="check-icon" /><span className="check-label">{label}</span><span className="check-value">{value}</span><span className="check-detail">{detail}</span></div>;
}

function StageRail({ activeStage, setActiveStage }) {
  return <div className="stage-rail" aria-label="Experiment stages">{stages.map((stage, index) => <div className="stage-wrap" key={stage.id}><button className={`stage ${activeStage === stage.id ? "is-active" : ""} ${stage.id === "decision" ? "decision-stage" : ""}`} onClick={() => setActiveStage(stage.id)}><span className="stage-mark">{stage.number}</span><span className="stage-copy"><strong>{stage.label}</strong><small>{stage.helper}</small></span></button>{index < stages.length - 1 && <span className={`stage-connector ${index < 2 ? "is-complete" : ""}`} />}</div>)}</div>;
}

function EffectInterval() {
  return <div className="effect-chart" aria-label="Relative uplift with uncertainty interval"><div className="effect-axis"><span>-5%</span><span>0%</span><span>+10%</span><span>+20%</span></div><div className="effect-track"><span className="zero-line" /><span className="range range-control" /><span className="dot dot-control" /><span className="range range-treatment" /><span className="dot dot-treatment" /></div><div className="effect-legend"><span><i className="legend-dot control-dot" /> Control</span><span><i className="legend-dot treatment-dot" /> Treatment</span><span className="legend-note">Two-sided 95% uncertainty intervals</span></div></div>;
}

function DistributionMini() {
  const bars = [18, 26, 34, 46, 62, 74, 86, 96, 100, 94, 82, 68, 50, 36, 24, 15, 10];
  return <div className="distribution" aria-label="Uplift distribution"><div className="distribution-head"><span>Uplift distribution</span><Info size={14} /></div><div className="distribution-chart">{bars.map((height, index) => <span key={index} style={{ height: `${height}%` }} className={index > 8 ? "is-positive" : ""} />)}<i className="distribution-marker" /></div><div className="distribution-axis"><span>-5%</span><span>0%</span><span>+10%</span><span>+20%</span></div><small>95% of possible outcomes</small></div>;
}

function EvidencePanel({ mode }) {
  const data = metricModes[mode];
  return <section className="panel evidence-panel"><div className="panel-heading evidence-heading"><div><div className="eyebrow-row"><h2>Primary Outcome: {data.name}</h2><Info size={14} /></div><p>Two-sided 95% uncertainty intervals</p></div><span className="status-pill subtle"><CheckCircle size={14} weight="fill" /> Data quality checks passed</span></div><div className="outcome-grid"><div className="outcome-table"><div className="outcome-column"><span className="variant-label">Control</span><small>Current</small><strong>{data.control}</strong><em>[$68.42, $76.01]</em></div><div className="outcome-column"><span className="variant-label">Treatment</span><small>Redesign</small><strong>{data.treatment}</strong><em>[$75.53, $83.68]</em></div><div className="outcome-column difference"><span className="variant-label">Difference</span><small>Treatment − Control</small><strong>{data.difference}</strong><em>{data.interval}</em><b>{data.uplift}</b></div></div><DistributionMini /></div><div className="evidence-meta"><div><span>Sample Size (Users)</span><strong><b>{demoExperiment.variants.control.exposedUsers.toLocaleString()}</b><b>{demoExperiment.variants.treatment.exposedUsers.toLocaleString()}</b></strong><small>Control&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Treatment</small></div><div><span>Observed Period</span><strong>Aug 11 – Aug 25, 2026</strong><small>14 days</small></div><div><span>Conversion Check</span><strong><b>{formatPercent(experimentAnalysis.conversion.controlRate)}</b><b className="is-positive-text">{formatPercent(experimentAnalysis.conversion.treatmentRate)}</b></strong><small>Purchase Conv. (7d)</small></div><div><span>Probability of Benefit</span><strong className="is-positive-text">{data.probability}</strong><small>P(uplift &gt; 0)</small></div><div><span>Expected Uplift</span><strong className="is-positive-text">{formatSignedPercent(data.upliftValue)}</strong><small>Mean</small></div></div></section>;
}

function FormulaTrace({ mode, setMode, onDetails }) {
  const data = metricModes[mode];
  return <section className="panel formula-panel"><div className="panel-heading formula-heading"><div><div className="eyebrow-row"><h2>LTV Formula Trace</h2><Info size={14} /></div><p>Every displayed value has a definition, time window, and data source.</p></div><div className="segmented-control" role="tablist" aria-label="LTV metric type"><button className={mode === "contribution" ? "is-selected" : ""} onClick={() => setMode("contribution")}>{metricModes.contribution.tab}</button><button className={mode === "revenue" ? "is-selected" : ""} onClick={() => setMode("revenue")}>{metricModes.revenue.tab}</button></div></div><div className="formula-equation" aria-label="LTV formula">{data.formula.map((part, index) => <div className="formula-group" key={part.label}><div className="formula-title"><strong>{part.label}</strong><Info size={13} /></div><small>{part.helper}</small>{index < data.formula.length - 1 && <span className="formula-symbol">×</span>}</div>)}<span className="formula-symbol equals">=</span><div className="formula-result"><strong>{mode === "contribution" ? "Contribution LTV" : "Revenue LTV"}</strong><small>per User · 90 Days</small></div></div><div className="formula-table"><div className="formula-table-row formula-table-head"><span /><span>Control</span><span>Treatment</span></div>{data.formula.map((part) => <div className="formula-table-row" key={part.label}><strong>{part.label}</strong><span>{part.control}</span><span className={part.label === "Purchase Frequency" || part.label === "Expected Lifetime" ? "is-positive-text" : ""}>{part.treatment}</span></div>)}<div className="formula-table-row formula-total"><strong>{mode === "contribution" ? "Contribution LTV" : "Revenue LTV"}</strong><strong>{data.control}</strong><strong className="is-positive-text">{data.treatment}</strong></div></div><div className="formula-footnote"><span>{data.ltvFootnote}</span><button className="text-button" onClick={onDetails}>View calculation details <ArrowRight size={14} /></button></div></section>;
}

function SurvivalLtvPanel({ data }) {
  if (!data) return null;
  const uncertainty = data.uncertainty;
  const interval = (variant) => uncertainty?.[variant]?.interval ? `[${formatCurrency(uncertainty[variant].interval[0])}, ${formatCurrency(uncertainty[variant].interval[1])}]` : "—";
  return <section className="panel survival-panel"><div className="panel-heading"><div><div className="eyebrow-row"><h2>Raw-event Survival LTV</h2><Info size={14} /></div><p>Kaplan–Meier retention with subject-level bootstrap uncertainty</p></div><span className="status-pill subtle"><CheckCircle size={14} weight="fill" /> Ready</span></div><div className="survival-cards"><div><span>Control</span><strong>{formatCurrency(data.control.ltv)}</strong><small>{interval("control")}</small></div><div><span>Treatment</span><strong className="is-positive-text">{formatCurrency(data.treatment.ltv)}</strong><small>{interval("treatment")}</small></div><div className="survival-difference"><span>Difference</span><strong className={data.difference >= 0 ? "is-positive-text" : ""}>{formatSignedCurrency(data.difference)}</strong><small>{interval("difference")}</small></div></div><div className="survival-footnote"><span>Σ [Survival(t) × Expected Contribution Margin(t)]</span><span>{uncertainty ? `${uncertainty.draws.toLocaleString()} draws · seed ${uncertainty.seed}` : "Point estimate"}</span></div></section>;
}

function SegmentAnalysisPanel({ data }) {
  if (!data?.ready || !data.segments?.length) return null;
  return <section className="panel segment-panel"><div className="panel-heading"><div><div className="eyebrow-row"><h2>Subgroup Analysis</h2><Info size={14} /></div><p>{data.field} split · Benjamini–Hochberg correction at α = {data.alpha}</p></div><span className="status-pill subtle"><CheckCircle size={14} weight="fill" /> {data.testedSegments} tested</span></div><div className="segment-table"><div className="segment-row segment-head"><span>Segment</span><span>Control</span><span>Treatment</span><span>Δ LTV</span><span>Adj. p</span></div>{data.segments.map((segment) => <div className="segment-row" key={segment.value}><strong>{segment.value}</strong><span>{formatCurrency(segment.control.ltv)}</span><span className="is-positive-text">{formatCurrency(segment.treatment.ltv)}</span><span className={segment.difference >= 0 ? "is-positive-text" : ""}>{formatSignedCurrency(segment.difference)}</span><span className={segment.significant ? "segment-significant" : ""}>{segment.adjustedPValue.toFixed(3)}</span></div>)}</div><div className="segment-footnote"><span>Adjusted p-values reduce false discovery across tested subgroups.</span><span>{data.excludedAmbiguousSubjects} ambiguous excluded</span></div></section>;
}

function MonitoringPanel({ data }) {
  const evaluation = data?.evaluation;
  if (!evaluation) return null;
  const statusLabels = { running: "Continue", stopped: "Stopped", blocked: "Blocked", review: "Review" };
  const probability = evaluation.evidence?.probabilityTreatmentBetter;
  const probabilityThreshold = evaluation.rule?.minProbabilityTreatmentBetter;
  const sample = evaluation.sample?.sampleSize ?? 0;
  const requiredSample = evaluation.rule?.minSampleSize;
  const runtime = evaluation.sample?.runtimeHours;
  const srm = evaluation.evidence?.srmPValue;
  return <section className={`panel monitoring-panel is-${evaluation.status}`}><div className="panel-heading"><div><div className="eyebrow-row"><h2>Stopping Rule Monitor</h2><Info size={14} /></div><p>{evaluation.rule?.schemaVersion ?? "No rule"} · evaluated {evaluation.evaluatedAt ? new Date(evaluation.evaluatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</p></div><span className={`status-pill subtle monitoring-status is-${evaluation.status}`}><CheckCircle size={14} weight="fill" /> {statusLabels[evaluation.status] ?? evaluation.status}</span></div><div className="monitoring-grid"><div><span>Sample size</span><strong>{sample.toLocaleString()} <small>/ {requiredSample?.toLocaleString() ?? "—"}</small></strong><em>{evaluation.sample?.sampleSizeSource ?? "—"}</em></div><div><span>P(Treatment better)</span><strong>{probability === null || probability === undefined ? "—" : `${(probability * 100).toFixed(1)}%`}</strong><em>threshold {probabilityThreshold === undefined ? "—" : `${(probabilityThreshold * 100).toFixed(1)}%`}</em></div><div><span>Runtime</span><strong>{runtime === null || runtime === undefined ? "—" : `${runtime.toFixed(1)}h`}</strong><em>min {evaluation.rule?.minimumRuntimeHours ?? "—"}h</em></div><div><span>SRM p-value</span><strong>{srm === null || srm === undefined ? "—" : srm.toFixed(3)}</strong><em>max {evaluation.rule?.maxSrmPValue ?? "—"}</em></div></div><div className="monitoring-footnote"><span>{evaluation.reason}</span><span>{evaluation.blockingReasons?.length ? `${evaluation.blockingReasons.length} blocker${evaluation.blockingReasons.length === 1 ? "" : "s"}` : "No blockers"}</span></div></section>;
}

function MetricContract({ expanded, setExpanded, onVersionHistory, onCopy }) {
  const copyRow = (label, value) => <button className="copy-button" aria-label={`Copy ${label}`} title={`Copy ${label}`} onClick={() => onCopy?.(value, label)}><Copy size={13} /></button>;
  return <section className={`panel contract-panel ${expanded ? "is-expanded" : ""}`}><div className="panel-heading"><div className="eyebrow-row"><h2>Metric Contract</h2><span className="version-badge">v1.1.0</span></div><button className="link-button" onClick={onVersionHistory}>Version history</button></div><div className="contract-grid"><div className="contract-row"><strong>Schema</strong><span>evidence-console.metric-contract/v1</span>{copyRow("schema", "evidence-console.metric-contract/v1")}</div><div className="contract-row"><strong>Name</strong><span>90-Day Contribution LTV per User</span>{copyRow("name", "90-Day Contribution LTV per User")}</div><div className="contract-row"><strong>Unit</strong><span>USD</span>{copyRow("unit", "USD")}</div><div className="contract-row"><strong>Definition</strong><span>Total contribution margin attributable to a user within 90 days of first exposure.</span>{copyRow("definition", "Total contribution margin attributable to a user within 90 days of first exposure.")}</div><div className="contract-row"><strong>Numerator</strong><span>Σ (order_revenue − variable_cost − payment_fee − refund_amount)</span>{copyRow("numerator", "Σ (order_revenue − variable_cost − payment_fee − refund_amount)")}</div><div className="contract-row"><strong>Denominator</strong><span># of exposed users</span>{copyRow("denominator", "# of exposed users")}</div><div className="contract-row"><strong>Exposure Event</strong><span>checkout_view</span>{copyRow("exposure event", "checkout_view")}</div>{expanded && <><div className="contract-row"><strong>Attribution Window</strong><span>90 days from first exposure</span>{copyRow("attribution window", "90 days from first exposure")}</div><div className="contract-row"><strong>Population</strong><span>Users with a first checkout_view exposure</span>{copyRow("population", "Users with a first checkout_view exposure")}</div><div className="contract-row"><strong>Filters</strong><span>country IN (US, CA, GB, AU) AND is_test_user = false</span>{copyRow("filters", "country IN (US, CA, GB, AU) AND is_test_user = false")}</div></>}<div className="contract-row contract-guardrails"><strong>Guardrails</strong><span><em>Min Sample Ratio (T/C): 0.80</em><em>Event Integrity Pass</em><em>Max SRM p-value: &gt; 0.01</em></span>{copyRow("guardrails", "Min Sample Ratio (T/C): 0.80; Event Integrity Pass; Max SRM p-value: > 0.01")}</div><div className="contract-row"><strong>Updated</strong><span>Aug 18, 2026 by data-eng</span>{copyRow("updated", "Aug 18, 2026 by data-eng")}</div></div><button className="contract-toggle" onClick={() => setExpanded(!expanded)}>{expanded ? "Show less" : "Show full contract"} {expanded ? <CaretUp size={15} /> : <CaretDown size={15} />}</button></section>;
}

function DataQualityPanel({ onViewAll }) {
  return <section className="panel quality-panel"><div className="panel-heading"><div className="eyebrow-row"><h2>Data Quality Checks</h2><CheckCircle size={15} className="check-icon" weight="fill" /></div><button className="link-button" onClick={onViewAll}>View all <ArrowRight size={13} /></button></div><div className="quality-list"><CheckRow label="Sample Ratio Mismatch (SRM)" value={`p = ${experimentAnalysis.srm.pValue.toFixed(2)}`} detail={experimentAnalysis.srm.pass ? "Pass" : "Review"} /><CheckRow label="Event Integrity" value="0 issues" detail="Pass" /><CheckRow label="Metric Schema Change" value={experimentAnalysis.contractStatus.valid ? "No change" : "Review"} detail={experimentAnalysis.contractStatus.valid ? "Pass" : "Review"} /><CheckRow label="Exposure Uniqueness" value="99.98% unique" detail="Pass" /><CheckRow label="Missingness (Key Fields)" value="0.15%" detail="Pass" /><CheckRow label="Late Events (7d)" value="2.1%" detail="Pass" /></div><div className="quality-footer"><CheckCircle size={16} weight="fill" /> All checks passing</div></section>;
}

function DecisionPanel({ mode, onOpenDecision, onExport }) {
  const data = metricModes[mode];
  return <section className="panel decision-panel"><div className="panel-heading"><div className="eyebrow-row"><h2>Decision Insight</h2><TrendUp size={16} className="insight-icon" weight="bold" /></div></div><p>{data.insight} All data-quality guardrails are passing.</p><strong className="decision-line">Evidence supports shipping the redesign.</strong><span className="action-label">Primary Action</span><button className="primary-action" onClick={onOpenDecision}>Open decision brief <ArrowRight size={16} /></button><button className="secondary-action" onClick={onExport}><DownloadSimple size={16} /> Export reproducible report</button><div className="repro-note"><GitBranch size={14} /> Report includes data, code, and metric contract (v1.1.0)</div></section>;
}

function DecisionModal({ onClose, onExport }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="decision-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><span className="modal-kicker">Decision brief</span><h2 id="decision-title">Ship the checkout redesign?</h2></div><IconButton label="Close decision brief" onClick={onClose}><X size={19} /></IconButton></div><div className="modal-summary"><CheckCircle size={19} weight="fill" /><div><strong>Evidence supports shipping.</strong><p>Contribution LTV is higher for Treatment with 97.2% probability of benefit, while all monitored guardrails remain within threshold.</p></div></div><div className="modal-grid"><div><span>Primary metric</span><strong>+10.2%</strong><small>90-day Contribution LTV uplift</small></div><div><span>Expected value</span><strong>+$7.33</strong><small>per exposed user</small></div><div><span>Downside risk</span><strong>$16.4k</strong><small>expected loss if wrong</small></div></div><div className="modal-footer"><button className="secondary-action" onClick={onClose}>Keep running</button><button className="primary-action" onClick={() => { onExport(); onClose(); }}>Export brief <ArrowSquareOut size={16} /></button></div></div></div>;
}

function ModuleStat({ label, value, detail, tone = "" }) {
  return <div className={`module-stat ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function ModuleHeader({ eyebrow, title, description, action }) {
  return <div className="module-header"><div><span className="module-eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>{action}</div>;
}

function ExperimentWorkspace({ activeStage, setActiveStage, activeStageCopy, metricMode, setMetricMode, contractExpanded, setContractExpanded, data, onOpenModal, onExport, onModal, onCopy }) {
  return <><div className="stage-context"><span className="context-kicker">{stages.find((stage) => stage.id === activeStage)?.label}</span><span>{activeStageCopy}</span></div><div className="content-grid"><div className="content-main"><EvidencePanel mode={metricMode} /><div className="quality-strip"><CheckCircle size={18} weight="fill" /><div><strong>Data quality checks passed</strong><span>All integrity guardrails are within thresholds.</span></div><span className="strip-updated">Last validated: Aug 25, 2026 09:00 PT</span><button className="link-button" onClick={() => onModal("quality")}>View all checks <ArrowRight size={13} /></button></div><MonitoringPanel data={data?.monitor} /><FormulaTrace mode={metricMode} setMode={setMetricMode} onDetails={() => onModal("formula")} /><SurvivalLtvPanel data={data?.analysis?.result?.survivalLtv} /><SegmentAnalysisPanel data={data?.segmentAnalysis} /></div><div className="content-aside"><MetricContract expanded={contractExpanded} setExpanded={setContractExpanded} onVersionHistory={() => onModal("contract-history")} onCopy={onCopy} /><DataQualityPanel onViewAll={() => onModal("quality")} /><DecisionPanel mode={metricMode} onOpenDecision={onOpenModal} onExport={onExport} /></div></div></>;
}

function WorkspaceModule({ activeNav, data, metricMode, onMetricMode, onNavigate, onModal, onExport, onAction, eventAdds, notebookRuns, monitorRuns, settings, onToggleSetting, onReset }) {
  const analysis = data?.analysis ?? { result: experimentAnalysis };
  const segments = data?.segmentAnalysis;
  const monitor = data?.monitor;
  const events = data?.events ?? [];
  const report = buildExperimentReport({ experiment: data?.experiment ?? demoExperiment, analysis: segments ? { ...analysis, segmentAnalysis: segments } : analysis });
  const reportPreview = renderMarkdownReport(report).split("\n").slice(0, 22).join("\n");
  const metricRows = [
    { id: "contribution", name: "90-Day Contribution LTV", value: formatCurrency(experimentAnalysis.ltv.contribution.treatment), delta: formatSignedPercent(experimentAnalysis.ltv.contribution.difference / experimentAnalysis.ltv.contribution.control), status: "Primary" },
    { id: "revenue", name: "90-Day Revenue LTV", value: formatCurrency(experimentAnalysis.ltv.revenue.treatment), delta: formatSignedPercent(experimentAnalysis.ltv.revenue.difference / experimentAnalysis.ltv.revenue.control), status: "Informational" },
    { id: "conversion", name: "Purchase conversion (7d)", value: formatPercent(experimentAnalysis.conversion.treatmentRate), delta: formatSignedPercent(experimentAnalysis.conversion.treatmentRate - experimentAnalysis.conversion.controlRate), status: "Binary" },
  ];
  if (activeNav === "Overview") return <div className="module-view"><section className="panel module-hero"><ModuleHeader eyebrow="Workspace overview" title="One evidence trail, from hypothesis to decision." description="This local demo keeps the complete experiment workflow in your browser. No account, API, or backend connection is required." action={<button className="primary-action module-action" onClick={() => onNavigate("Experiments")}>Open experiment workspace <ArrowRight size={16} /></button>} /><div className="module-stat-grid"><ModuleStat label="Experiment status" value="Running" detail="Checkout Redesign v1" /><ModuleStat label="Primary metric" value="+$7.33" detail="Contribution LTV per user" tone="positive" /><ModuleStat label="Probability of benefit" value="97.2%" detail="Bayesian posterior" tone="positive" /><ModuleStat label="Data quality" value="6 / 6" detail="Checks passing" tone="positive" /></div></section><section className="panel module-panel"><ModuleHeader eyebrow="Demo map" title="Every feature is available from the sidebar." description="Select a workspace item to inspect the corresponding local view and run its interactive actions." /><div className="capability-grid">{navGroups.flatMap((group) => group.items).filter((item) => item.label !== "Overview").map((item) => <button className="capability-card" key={item.label} onClick={() => onNavigate(item.label)}><item.icon size={18} /><span><strong>{item.label}</strong><small>Open local view</small></span><ArrowRight size={14} /></button>)}</div></section></div>;
  if (activeNav === "Metrics") return <div className="module-view"><section className="panel module-panel"><ModuleHeader eyebrow="Metric catalog" title="Metrics with an auditable calculation trail." description="Switch the experiment evidence between the decision metric and informational revenue view." /><div className="module-table metric-table"><div className="module-table-row module-table-head"><span>Metric</span><span>Current value</span><span>Effect</span><span>Status</span><span /></div>{metricRows.map((row) => <div className="module-table-row" key={row.id}><strong>{row.name}</strong><span>{row.value}</span><span className="is-positive-text">{row.delta}</span><span className="table-tag">{row.status}</span><button className="text-button" onClick={() => { onMetricMode(row.id === "revenue" ? "revenue" : "contribution"); onNavigate("Experiments"); }}>Inspect <ArrowRight size={13} /></button></div>)}</div></section><section className="panel module-panel split-module"><div><span className="module-eyebrow">Formula relationship</span><h3>ARPC × Lifetime = LTV</h3><p>ARPC = AOV × Purchase Frequency. The demo keeps each component visible so the final number is reproducible.</p></div><div className="formula-callout"><strong>{formatCurrency(experimentAnalysis.variants.treatment.aov)}</strong><span>AOV</span><b>×</b><strong>{experimentAnalysis.variants.treatment.purchaseFrequency.toFixed(2)}</strong><span>Frequency</span><b>×</b><strong>{experimentAnalysis.variants.treatment.lifetime.toFixed(2)}</strong><span>Lifetime</span></div></section></div>;
  if (activeNav === "Segments") return <div className="module-view"><SegmentAnalysisPanel data={segments} /><section className="panel module-panel"><ModuleHeader eyebrow="Segment guardrail" title="Multiple comparisons are controlled." description="Subgroups are tested only after dimensions are stable; ambiguous subjects are excluded before Benjamini–Hochberg correction." /><div className="module-stat-grid"><ModuleStat label="Segments tested" value={segments?.testedSegments ?? 0} detail="device dimension" /><ModuleStat label="Correction" value="BH" detail="false discovery control" /><ModuleStat label="Excluded" value={segments?.excludedAmbiguousSubjects ?? 0} detail="ambiguous subjects" /></div><button className="secondary-action module-inline-action" onClick={() => onNavigate("Experiments")}>Return to evidence <ArrowRight size={15} /></button></section></div>;
  if (activeNav === "Guardrails") return <div className="module-view"><DataQualityPanel onViewAll={() => onModal("quality")} /><MonitoringPanel data={monitor} /><section className="panel module-panel"><ModuleHeader eyebrow="A/A validation" title="Randomization audit" description="The same seeded experiment can be replayed locally to inspect assignment balance before trusting a treatment effect." action={<button className="secondary-action module-small-action" onClick={() => onAction("A/A validation replayed locally")}>Run A/A check</button>} /><div className="module-stat-grid"><ModuleStat label="Allocation" value="50 / 50" detail="deterministic assignment" /><ModuleStat label="SRM p-value" value={experimentAnalysis.srm.pValue.toFixed(3)} detail="above 0.01 threshold" tone="positive" /><ModuleStat label="Event integrity" value="Pass" detail="0 malformed events" tone="positive" /></div></section></div>;
  if (activeNav === "Events") return <div className="module-view"><section className="panel module-panel"><ModuleHeader eyebrow="Event stream" title="Raw events in the local replay." description="Assignments, exposures, retention, contribution, and conversion events are generated in-browser for this demo." action={<button className="primary-action module-small-action" onClick={() => onAction("Local event appended")}>Add local event <ArrowRight size={15} /></button>} /><div className="module-stat-grid"><ModuleStat label="Outcome events" value={(events.length + eventAdds).toLocaleString()} detail="retention + contribution + conversion" /><ModuleStat label="Exposure event" value="checkout_view" detail="unique per subject" /><ModuleStat label="Source" value="Local seed" detail="no warehouse connection" /></div><div className="module-table event-table"><div className="module-table-row module-table-head"><span>Event</span><span>Subject</span><span>Variant</span><span>Period</span><span>Value</span></div>{events.slice(0, 8).map((event) => <div className="module-table-row" key={event.id}><strong>{event.metric}</strong><span>{event.subjectId}</span><span className={event.variant === "treatment" ? "is-positive-text" : ""}>{event.variant}</span><span>{event.period ?? "—"}</span><span>{event.value}</span></div>)}</div></section></div>;
  if (activeNav === "Metric Contracts") return <div className="module-view"><MetricContract expanded={settings.contractExpanded} setExpanded={(value) => onToggleSetting("contractExpanded", value)} onVersionHistory={() => onModal("contract-history")} onCopy={onAction} /><section className="panel module-panel"><ModuleHeader eyebrow="Contract lifecycle" title="Versioned and reviewable." description="The contract is stored with the experiment and can be copied into a warehouse or analysis notebook." /><div className="module-stat-grid"><ModuleStat label="Schema" value="v1" detail="machine-readable JSON Schema" /><ModuleStat label="Window" value="90 days" detail="from first exposure" /><ModuleStat label="Guardrails" value="3" detail="sample, SRM, integrity" /></div></section></div>;
  if (activeNav === "Reproducibility") return <div className="module-view"><section className="panel module-panel"><ModuleHeader eyebrow="Reproducibility" title="Replay the decision from code and data." description="The same seed, event rows, metric contract, and report renderer are included in this frontend-only demo." action={<button className="primary-action module-small-action" onClick={onExport}><DownloadSimple size={15} /> Export report</button>} /><div className="code-card"><div><span>Replay command</span><button className="copy-button" onClick={() => onAction("Replay command copied")}><Copy size={13} /></button></div><pre>{"npm run cli -- report --experiment exp_20260811_01 --format md\n\nseed: 20260825\nmetric: evidence-console.metric-contract/v1\nanalysis: survival + subject-level bootstrap"}</pre></div><div className="module-stat-grid"><ModuleStat label="Source commit" value="8c53227" detail="linked GitHub source" /><ModuleStat label="Bootstrap draws" value="1,000" detail="deterministic uncertainty" /><ModuleStat label="Report formats" value="JSON + MD" detail="downloadable locally" /></div></section></div>;
  if (activeNav === "Notebooks") return <div className="module-view"><section className="panel module-panel notebook-panel"><ModuleHeader eyebrow="Analysis notebook" title="A guided, runnable evidence notebook." description="Run each cell in sequence and keep the reasoning visible next to its output." action={<button className="primary-action module-small-action" onClick={() => onAction("Notebook run completed")}>Run all cells <ArrowRight size={15} /></button>} /><div className="notebook-cells"><div className="notebook-cell"><span>01</span><div><strong>Validate metric contract</strong><code>✓ evidence-console.metric-contract/v1</code></div><small>passed</small></div><div className="notebook-cell"><span>02</span><div><strong>Check assignment balance</strong><code>✓ SRM p-value = {experimentAnalysis.srm.pValue.toFixed(3)}</code></div><small>passed</small></div><div className="notebook-cell"><span>03</span><div><strong>Estimate survival LTV</strong><code>✓ Kaplan–Meier + bootstrap ({analysis.result?.survivalLtv?.uncertainty?.draws ?? 1000} draws)</code></div><small>passed</small></div><div className="notebook-cell"><span>04</span><div><strong>Write decision brief</strong><code>✓ {notebookRuns ? `${notebookRuns} local run${notebookRuns === 1 ? "" : "s"}` : "ready to run"}</code></div><small>{notebookRuns ? "updated" : "ready"}</small></div></div></section></div>;
  if (activeNav === "Alerts") return <div className="module-view"><section className="panel module-panel"><ModuleHeader eyebrow="Alert center" title="Stopping rules that can be scheduled." description="The production adapter emits stable alert fingerprints; this demo lets you replay the monitor locally without sending anything." action={<button className="secondary-action module-small-action" onClick={() => onAction("Monitoring evaluated locally")}>Run monitor <ArrowRight size={15} /></button>} /><div className="alert-card"><div className={`alert-icon ${monitor?.evaluation?.status === "blocked" ? "is-warning" : ""}`}><ShieldCheck size={20} /></div><div><strong>{monitor?.evaluation?.status === "running" ? "No alert: continue collecting evidence" : "Stopping rule evaluated"}</strong><p>{monitor?.evaluation?.reason ?? "The local monitor is ready."}</p></div><span>{monitorRuns ? `${monitorRuns} runs` : "ready"}</span></div><div className="module-stat-grid"><ModuleStat label="Delivery" value="Webhook ready" detail="vendor-neutral adapter" /><ModuleStat label="Fingerprint" value={`${demoExperiment.id}:running:continue`} detail="deduplicable key" /><ModuleStat label="Scheduler" value="15 min" detail="external scheduler friendly" /></div></section><MonitoringPanel data={monitor} /></div>;
  if (activeNav === "Reports") return <div className="module-view"><section className="panel module-panel"><ModuleHeader eyebrow="Report center" title="A report you can download and review." description="The report includes the experiment definition, metric contract, analysis method, uncertainty, segments, and stopping rule." action={<button className="primary-action module-small-action" onClick={onExport}><DownloadSimple size={15} /> Download Markdown</button>} /><div className="report-preview"><pre>{reportPreview}</pre></div></section></div>;
  return <div className="module-view"><section className="panel module-panel settings-panel"><ModuleHeader eyebrow="Local settings" title="Configure the demo experience." description="These preferences are device-local and intentionally do not call a backend." /><label className="setting-row"><span><strong>Auto-refresh simulation</strong><small>Refresh local evidence every 15 minutes.</small></span><input type="checkbox" checked={settings.autoRefresh} onChange={(event) => onToggleSetting("autoRefresh", event.target.checked)} /></label><label className="setting-row"><span><strong>Show uncertainty intervals</strong><small>Keep interval and posterior context visible.</small></span><input type="checkbox" checked={settings.showIntervals} onChange={(event) => onToggleSetting("showIntervals", event.target.checked)} /></label><label className="setting-row"><span><strong>Frontend-only mode</strong><small>Always use the local seed and never request an API.</small></span><input type="checkbox" checked disabled /></label><div className="settings-actions"><button className="secondary-action module-small-action" onClick={onReset}>Reset local demo</button><button className="primary-action module-small-action" onClick={() => onAction("Settings saved locally")}>Save preferences</button></div></section></div>;
}

function InfoModal({ type, onClose, onAction }) {
  const content = {
    docs: ["Documentation", "Read the analysis assumptions, API contract, and deployment notes in the open-source repository.", "Open GitHub docs"],
    commits: ["Reproducible commits", "This demo is pinned to the open-source code path and exposes the commit used for the current UI.", "Copy commit"],
    options: ["Workspace options", "All data is local to this browser session. You can reset the seeded experiment or open the public source.", "Reset demo"],
    quality: ["Data quality details", "SRM, event integrity, schema, exposure uniqueness, missingness, and late-event checks are all represented in the demo.", "Run checks"],
    formula: ["Calculation details", "LTV = ARPC × Lifetime, and ARPC = AOV × Purchase Frequency. Contribution LTV applies the contribution margin after revenue and cost components.", "Copy formula"],
    "contract-history": ["Metric Contract history", "v1.1.0 is the active contract. Earlier versions remain part of the reproducibility trail and are never silently overwritten.", "Copy schema"],
    project: ["Project selector", "evidence-console is the active local project. The public demo uses a seeded Checkout Redesign v1 experiment.", "Keep this project"],
    user: ["Demo account", "Alex Kim · Growth Team. This identity is illustrative and no sign-in or account data is required.", "Got it"],
    privacy: ["Privacy", "This frontend-only demo keeps interaction state in memory and does not send experiment data to a backend.", "Close"],
    terms: ["Terms", "Use the demo for exploration and evaluation. Production deployments should provide their own data, access control, and persistence.", "Close"],
  }[type] ?? ["Evidence Console", "Explore the complete local experiment workflow.", "Close"];
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><div className="modal info-modal" role="dialog" aria-modal="true" aria-labelledby="info-modal-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><span className="modal-kicker">Local demo</span><h2 id="info-modal-title">{content[0]}</h2></div><IconButton label="Close dialog" onClick={onClose}><X size={19} /></IconButton></div><div className="info-modal-body"><Info size={20} /><p>{content[1]}</p></div><div className="modal-footer"><button className="secondary-action" onClick={onClose}>Close</button><button className="primary-action" onClick={() => { onAction(type, content[2]); onClose(); }}>{content[2]}</button></div></div></div>;
}

export function App() {
  const [activeNav, setActiveNav] = useState("Experiments");
  const [activeStage, setActiveStage] = useState("evidence");
  const [metricMode, setMetricMode] = useState("contribution");
  const [contractExpanded, setContractExpanded] = useState(false);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [snapshot, setSnapshot] = useState("Aug 25, 2026 09:00 PT");
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const [eventAdds, setEventAdds] = useState(0);
  const [notebookRuns, setNotebookRuns] = useState(0);
  const [monitorRuns, setMonitorRuns] = useState(0);
  const [settings, setSettings] = useState({ autoRefresh: true, showIntervals: true, contractExpanded: false });
  const [liveData, setLiveData] = useState({ status: "loading", experiment: null, ingestion: null, analysis: null, segmentAnalysis: null, monitor: null, subjects: [], events: [], error: "" });
  const liveStatusCopy = liveData.status === "loading" ? "Preparing local demo…" : `Frontend-only demo · ${liveData.ingestion?.assignments ?? 0} assignments · ${liveData.ingestion?.exposures ?? 0} exposures · ${liveData.ingestion?.outcomes ?? 0} outcomes${liveData.analysis?.result?.survivalLtv ? " · Survival LTV ready" : ""}${liveData.segmentAnalysis?.ready ? ` · ${liveData.segmentAnalysis.testedSegments} subgroups` : ""}${liveData.monitor?.evaluation ? ` · Stop rule ${liveData.monitor.evaluation.status}` : ""}`;
  const activeStageCopy = useMemo(() => `${stages.find((stage) => stage.id === activeStage)?.copy} · ${liveStatusCopy}`, [activeStage, liveStatusCopy]);

  useEffect(() => {
    let mounted = true;
    buildClientDemo()
      .then((result) => { if (mounted) setLiveData({ status: "ready", ...result, error: "" }); })
      .catch((error) => { if (mounted) setLiveData({ status: "error", experiment: null, ingestion: null, analysis: null, segmentAnalysis: null, monitor: null, subjects: [], events: [], error: error.message }); });
    return () => { mounted = false; };
  }, []);

  const showToast = (message) => { setToast(message); window.setTimeout(() => setToast(""), 2800); };
  const copyText = async (value, label = "Value") => {
    try { await navigator.clipboard?.writeText(value); showToast(`${label} copied`); } catch { showToast(`${label} ready to copy`); }
  };
  const exportReport = () => {
    try {
      const report = buildExperimentReport({ experiment: liveData.experiment ?? demoExperiment, analysis: liveData.segmentAnalysis ? { ...(liveData.analysis ?? { result: experimentAnalysis }), segmentAnalysis: liveData.segmentAnalysis } : liveData.analysis ?? { result: experimentAnalysis } });
      const blob = new Blob([renderMarkdownReport(report)], { type: "text/markdown;charset=utf-8" });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${demoExperiment.id}-report.md`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
      showToast("Reproducible report downloaded · local only");
    } catch (error) { showToast(`Report export failed · ${error.message}`); }
  };
  const selectNav = (label) => { setActiveNav(label); setProjectOpen(false); setMoreOpen(false); };
  const openGithub = () => window.open("https://github.com/mokarchi/evidence-console", "_blank", "noopener,noreferrer");
  const handleAction = (messageOrType, detail) => {
    if (detail && messageOrType === "docs") return openGithub();
    if (detail && messageOrType === "commits") return copyText("8c5322718d42ae59dda98c8e5ab43953af620f4a", "Commit");
    if (detail && messageOrType === "options") return resetDemo();
    if (detail && messageOrType === "quality") return showToast("6 data quality checks passed");
    if (detail && messageOrType === "formula") return copyText("LTV = (AOV × Purchase Frequency) × Lifetime", "Formula");
    if (detail && messageOrType === "contract-history") return copyText("evidence-console.metric-contract/v1", "Schema");
    if (detail) return copyText(messageOrType, detail);
    if (messageOrType === "Local event appended") setEventAdds((value) => value + 1);
    if (messageOrType === "Notebook run completed") setNotebookRuns((value) => value + 1);
    if (messageOrType === "Monitoring evaluated locally") setMonitorRuns((value) => value + 1);
    showToast(detail ? `${detail} completed locally` : messageOrType);
  };
  const resetDemo = () => { setActiveNav("Experiments"); setActiveStage("evidence"); setMetricMode("contribution"); setEventAdds(0); setNotebookRuns(0); setMonitorRuns(0); setContractExpanded(false); setSettings((value) => ({ ...value, contractExpanded: false })); showToast("Local demo reset"); };
  const toggleSetting = (key, value) => { setSettings((current) => ({ ...current, [key]: value })); if (key === "contractExpanded") setContractExpanded(value); };

  return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark"><Flask size={22} weight="duotone" /></div><div><strong>Evidence Console</strong><span>Open-source LTV & Experimentation</span></div></div><nav className="side-nav">{navGroups.map((group) => <div className="nav-group" key={group.label}><span className="nav-label">{group.label}</span>{group.items.map((item) => <NavItem key={item.label} item={item} active={activeNav === item.label} onClick={() => selectNav(item.label)} />)}</div>)}</nav><div className="sidebar-bottom"><div className="project-select"><span>Project</span><button onClick={() => { setProjectOpen((value) => !value); setMoreOpen(false); }}>evidence-console <CaretDown size={14} /></button>{projectOpen && <div className="project-menu"><strong>evidence-console</strong><span>Checkout Redesign v1</span><small>Frontend-only demo</small><button onClick={() => { selectNav("Experiments"); showToast("evidence-console selected"); }}>Open project <ArrowRight size={13} /></button></div>}</div><button className="open-source" onClick={openGithub}><GithubLogo size={20} weight="fill" /><div><strong>View on GitHub</strong><span>mokarchi/evidence-console</span></div><ArrowUpRight size={14} /></button><div className="license-row"><span>Apache-2.0</span><span>v0.6.3</span></div><button className="user-row" onClick={() => setModal("user")}><span className="avatar">AK</span><div><strong>Alex Kim</strong><span>alex@example.com</span></div><CaretRight size={15} /></button></div></aside><main className="main-content"><header className="topbar"><div className="breadcrumb"><button onClick={() => selectNav("Experiments")}><ArrowRight size={15} className="back-icon" /> {activeNav === "Experiments" ? "Experiments" : "Workspace"}</button><span>/</span><strong>{activeNav === "Experiments" ? "Checkout Redesign v1" : activeNav}</strong></div><div className="top-actions"><button className="top-link" onClick={() => setModal("commits")}><Code size={16} /> Commits <small>a1b2c3d</small></button><button className="top-link" onClick={() => setModal("docs")}><BookOpen size={17} /> Docs</button><div className="more-menu-wrap"><IconButton label="More options" onClick={() => { setMoreOpen((value) => !value); setProjectOpen(false); }}><DotsThreeVertical size={20} /></IconButton>{moreOpen && <div className="more-menu"><button onClick={() => setModal("options")}>Reset / demo options</button><button onClick={openGithub}>Open source repository</button><button onClick={() => copyText(window.location.href, "Demo link")}>Copy demo link</button></div>}</div></div></header><div className="page-heading"><div><div className="title-row"><h1>{activeNav === "Experiments" ? "Checkout Redesign v1" : activeNav}</h1><span className="status-pill"><span className="status-dot" /> {liveData.status === "ready" ? "Local demo" : "Loading"}</span></div><div className="experiment-meta"><span><Info size={14} /> ID: exp_20260811_01</span><span><SlidersHorizontal size={14} /> Type: A/B Test</span><span><UsersThree size={14} /> Traffic: 50%</span><span><CalendarBlank size={14} /> Created: Aug 11, 2026</span><span><UsersThree size={14} /> Owner: Growth Team</span></div></div><div className="snapshot-wrap"><button className="snapshot-button" onClick={() => setSnapshotOpen(!snapshotOpen)}><CalendarBlank size={16} /> Snapshot: {snapshot} <CaretDown size={14} /></button>{snapshotOpen && <div className="snapshot-menu"><button onClick={() => { setSnapshot("Aug 25, 2026 09:00 PT"); setSnapshotOpen(false); }}>Aug 25, 2026 09:00 PT</button><button onClick={() => { setSnapshot("Aug 24, 2026 18:00 PT"); setSnapshotOpen(false); }}>Aug 24, 2026 18:00 PT</button><button onClick={() => { setSnapshot("Aug 18, 2026 09:00 PT"); setSnapshotOpen(false); }}>Aug 18, 2026 09:00 PT</button></div>}<span className="auto-update"><span className="status-dot" /> Local simulation</span></div></div><StageRail activeStage={activeStage} setActiveStage={setActiveStage} />{activeNav === "Experiments" ? <ExperimentWorkspace activeStage={activeStage} setActiveStage={setActiveStage} activeStageCopy={activeStageCopy} metricMode={metricMode} setMetricMode={setMetricMode} contractExpanded={contractExpanded} setContractExpanded={(value) => { setContractExpanded(value); toggleSetting("contractExpanded", value); }} data={liveData} onOpenModal={() => setDecisionOpen(true)} onExport={exportReport} onModal={setModal} onCopy={copyText} /> : <><div className="stage-context"><span className="context-kicker">{stages.find((stage) => stage.id === activeStage)?.label}</span><span>{activeStageCopy}</span></div><WorkspaceModule activeNav={activeNav} data={liveData} metricMode={metricMode} onMetricMode={setMetricMode} onNavigate={selectNav} onModal={setModal} onExport={exportReport} onAction={handleAction} eventAdds={eventAdds} notebookRuns={notebookRuns} monitorRuns={monitorRuns} settings={settings} onToggleSetting={toggleSetting} onReset={resetDemo} /></>}<footer className="app-footer"><span>All times in PT</span><span>Frontend-only replay · <strong>8c53227</strong></span><span>Data snapshot {snapshot}</span><span className="footer-spacer" /><button onClick={() => setModal("privacy")}>Privacy</button><span>·</span><button onClick={() => setModal("terms")}>Terms</button></footer></main>{decisionOpen && <DecisionModal onClose={() => setDecisionOpen(false)} onExport={exportReport} />}{modal && <InfoModal type={modal} onClose={() => setModal(null)} onAction={handleAction} />}{toast && <div className="toast"><CheckCircle size={17} weight="fill" /> {toast}</div>}</div>;
}
