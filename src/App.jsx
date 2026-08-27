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
import { syncDemoExperiment } from "./lib/apiClient.js";
import { analyzeExperiment } from "./lib/experiment.js";

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

function FormulaTrace({ mode, setMode }) {
  const data = metricModes[mode];
  return <section className="panel formula-panel"><div className="panel-heading formula-heading"><div><div className="eyebrow-row"><h2>LTV Formula Trace</h2><Info size={14} /></div><p>Every displayed value has a definition, time window, and data source.</p></div><div className="segmented-control" role="tablist" aria-label="LTV metric type"><button className={mode === "contribution" ? "is-selected" : ""} onClick={() => setMode("contribution")}>{metricModes.contribution.tab}</button><button className={mode === "revenue" ? "is-selected" : ""} onClick={() => setMode("revenue")}>{metricModes.revenue.tab}</button></div></div><div className="formula-equation" aria-label="LTV formula">{data.formula.map((part, index) => <div className="formula-group" key={part.label}><div className="formula-title"><strong>{part.label}</strong><Info size={13} /></div><small>{part.helper}</small>{index < data.formula.length - 1 && <span className="formula-symbol">×</span>}</div>)}<span className="formula-symbol equals">=</span><div className="formula-result"><strong>{mode === "contribution" ? "Contribution LTV" : "Revenue LTV"}</strong><small>per User · 90 Days</small></div></div><div className="formula-table"><div className="formula-table-row formula-table-head"><span /><span>Control</span><span>Treatment</span></div>{data.formula.map((part) => <div className="formula-table-row" key={part.label}><strong>{part.label}</strong><span>{part.control}</span><span className={part.label === "Purchase Frequency" || part.label === "Expected Lifetime" ? "is-positive-text" : ""}>{part.treatment}</span></div>)}<div className="formula-table-row formula-total"><strong>{mode === "contribution" ? "Contribution LTV" : "Revenue LTV"}</strong><strong>{data.control}</strong><strong className="is-positive-text">{data.treatment}</strong></div></div><div className="formula-footnote"><span>{data.ltvFootnote}</span><button className="text-button">View calculation details <ArrowRight size={14} /></button></div></section>;
}

function MetricContract({ expanded, setExpanded }) {
  return <section className={`panel contract-panel ${expanded ? "is-expanded" : ""}`}><div className="panel-heading"><div className="eyebrow-row"><h2>Metric Contract</h2><span className="version-badge">v1.1.0</span></div><button className="link-button">Version history</button></div><div className="contract-grid"><div className="contract-row"><strong>Name</strong><span>90-Day Contribution LTV per User</span><Copy size={13} /></div><div className="contract-row"><strong>Unit</strong><span>USD</span><Copy size={13} /></div><div className="contract-row"><strong>Definition</strong><span>Total contribution margin attributable to a user within 90 days of first exposure.</span><Copy size={13} /></div><div className="contract-row"><strong>Numerator</strong><span>Σ (order_revenue − variable_cost − payment_fee − refund_amount)</span><Copy size={13} /></div><div className="contract-row"><strong>Denominator</strong><span># of exposed users</span><Copy size={13} /></div><div className="contract-row"><strong>Exposure Event</strong><span>checkout_view</span><Copy size={13} /></div>{expanded && <><div className="contract-row"><strong>Attribution Window</strong><span>90 days from first exposure</span><Copy size={13} /></div><div className="contract-row"><strong>Filters</strong><span>country IN (US, CA, GB, AU) AND is_test_user = false</span><Copy size={13} /></div></>}<div className="contract-row contract-guardrails"><strong>Guardrails</strong><span><em>Min Sample Ratio (T/C): 0.80</em><em>Event Integrity Pass</em><em>Max SRM p-value: &gt; 0.01</em></span><Copy size={13} /></div><div className="contract-row"><strong>Updated</strong><span>Aug 18, 2026 by data-eng</span><Copy size={13} /></div></div><button className="contract-toggle" onClick={() => setExpanded(!expanded)}>{expanded ? "Show less" : "Show full contract"} {expanded ? <CaretUp size={15} /> : <CaretDown size={15} />}</button></section>;
}

function DataQualityPanel() {
  return <section className="panel quality-panel"><div className="panel-heading"><div className="eyebrow-row"><h2>Data Quality Checks</h2><CheckCircle size={15} className="check-icon" weight="fill" /></div><button className="link-button">View all <ArrowRight size={13} /></button></div><div className="quality-list"><CheckRow label="Sample Ratio Mismatch (SRM)" value={`p = ${experimentAnalysis.srm.pValue.toFixed(2)}`} detail={experimentAnalysis.srm.pass ? "Pass" : "Review"} /><CheckRow label="Event Integrity" value="0 issues" detail="Pass" /><CheckRow label="Metric Schema Change" value={experimentAnalysis.contractStatus.valid ? "No change" : "Review"} detail={experimentAnalysis.contractStatus.valid ? "Pass" : "Review"} /><CheckRow label="Exposure Uniqueness" value="99.98% unique" detail="Pass" /><CheckRow label="Missingness (Key Fields)" value="0.15%" detail="Pass" /><CheckRow label="Late Events (7d)" value="2.1%" detail="Pass" /></div><div className="quality-footer"><CheckCircle size={16} weight="fill" /> All checks passing</div></section>;
}

function DecisionPanel({ mode, onOpenDecision, onExport }) {
  const data = metricModes[mode];
  return <section className="panel decision-panel"><div className="panel-heading"><div className="eyebrow-row"><h2>Decision Insight</h2><TrendUp size={16} className="insight-icon" weight="bold" /></div></div><p>{data.insight} All data-quality guardrails are passing.</p><strong className="decision-line">Evidence supports shipping the redesign.</strong><span className="action-label">Primary Action</span><button className="primary-action" onClick={onOpenDecision}>Open decision brief <ArrowRight size={16} /></button><button className="secondary-action" onClick={onExport}><DownloadSimple size={16} /> Export reproducible report</button><div className="repro-note"><GitBranch size={14} /> Report includes data, code, and metric contract (v1.1.0)</div></section>;
}

function DecisionModal({ onClose, onExport }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="decision-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><span className="modal-kicker">Decision brief</span><h2 id="decision-title">Ship the checkout redesign?</h2></div><IconButton label="Close decision brief" onClick={onClose}><X size={19} /></IconButton></div><div className="modal-summary"><CheckCircle size={19} weight="fill" /><div><strong>Evidence supports shipping.</strong><p>Contribution LTV is higher for Treatment with 97.2% probability of benefit, while all monitored guardrails remain within threshold.</p></div></div><div className="modal-grid"><div><span>Primary metric</span><strong>+10.2%</strong><small>90-day Contribution LTV uplift</small></div><div><span>Expected value</span><strong>+$7.33</strong><small>per exposed user</small></div><div><span>Downside risk</span><strong>$16.4k</strong><small>expected loss if wrong</small></div></div><div className="modal-footer"><button className="secondary-action" onClick={onClose}>Keep running</button><button className="primary-action" onClick={() => { onExport(); onClose(); }}>Export brief <ArrowSquareOut size={16} /></button></div></div></div>;
}

export function App() {
  const [activeNav, setActiveNav] = useState("Experiments");
  const [activeStage, setActiveStage] = useState("evidence");
  const [metricMode, setMetricMode] = useState("contribution");
  const [contractExpanded, setContractExpanded] = useState(false);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [snapshot, setSnapshot] = useState("Aug 25, 2026 09:00 PT");
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [liveData, setLiveData] = useState({ status: "loading", ingestion: null, analysis: null, error: "" });
  const liveStatusCopy = liveData.status === "loading" ? "Connecting to API…" : liveData.status === "ready" ? `API connected · ${liveData.ingestion.assignments} assignments · ${liveData.ingestion.exposures} exposures · ${liveData.ingestion.outcomes} outcomes${liveData.analysis?.result?.survivalLtv ? " · Survival LTV ready" : ""}` : "API offline · showing seeded snapshot";
  const activeStageCopy = useMemo(() => `${stages.find((stage) => stage.id === activeStage)?.copy} · ${liveStatusCopy}`, [activeStage, liveStatusCopy]);

  useEffect(() => {
    let mounted = true;
    syncDemoExperiment()
      .then((result) => { if (mounted) setLiveData({ status: "ready", ingestion: result.ingestion, analysis: result.analysis, error: "" }); })
      .catch((error) => { if (mounted) setLiveData({ status: "offline", ingestion: null, analysis: null, error: error.message }); });
    return () => { mounted = false; };
  }, []);

  const showToast = (message) => { setToast(message); window.setTimeout(() => setToast(""), 2800); };
  const exportReport = async () => {
    try {
      const response = await fetch(`/api/experiments/${demoExperiment.id}/report?format=markdown`);
      if (!response.ok) throw new Error(`Report request failed with ${response.status}`);
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${demoExperiment.id}-report.md`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
      showToast("Reproducible report downloaded · markdown");
    } catch (error) {
      showToast(`Report export failed · ${error.message}`);
    }
  };
  const selectNav = (label) => { setActiveNav(label); if (label !== "Experiments") showToast(`${label} is available in the full workspace`); };

  return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark"><Flask size={22} weight="duotone" /></div><div><strong>Evidence Console</strong><span>Open-source LTV & Experimentation</span></div></div><nav className="side-nav">{navGroups.map((group) => <div className="nav-group" key={group.label}><span className="nav-label">{group.label}</span>{group.items.map((item) => <NavItem key={item.label} item={item} active={activeNav === item.label} onClick={() => selectNav(item.label)} />)}</div>)}</nav><div className="sidebar-bottom"><div className="project-select"><span>Project</span><button>evidence-console <CaretDown size={14} /></button></div><div className="open-source"><GithubLogo size={20} weight="fill" /><div><strong>View on GitHub</strong><span>evidence-console/core</span></div><ArrowUpRight size={14} /></div><div className="license-row"><span>Apache-2.0</span><span>v0.6.3</span></div><div className="user-row"><span className="avatar">AK</span><div><strong>Alex Kim</strong><span>alex@example.com</span></div><CaretRight size={15} /></div></div></aside><main className="main-content"><header className="topbar"><div className="breadcrumb"><button onClick={() => selectNav("Experiments")}><ArrowRight size={15} className="back-icon" /> Experiments</button><span>/</span><strong>Checkout Redesign v1</strong></div><div className="top-actions"><button className="top-link"><Code size={16} /> Commits <small>a1b2c3d</small></button><button className="top-link"><BookOpen size={17} /> Docs</button><IconButton label="More options"><DotsThreeVertical size={20} /></IconButton></div></header><div className="page-heading"><div><div className="title-row"><h1>Checkout Redesign v1</h1><span className="status-pill"><span className="status-dot" /> Running</span></div><div className="experiment-meta"><span><Info size={14} /> ID: exp_20260811_01</span><span><SlidersHorizontal size={14} /> Type: A/B Test</span><span><UsersThree size={14} /> Traffic: 50%</span><span><CalendarBlank size={14} /> Created: Aug 11, 2026</span><span><UsersThree size={14} /> Owner: Growth Team</span></div></div><div className="snapshot-wrap"><button className="snapshot-button" onClick={() => setSnapshotOpen(!snapshotOpen)}><CalendarBlank size={16} /> Snapshot: {snapshot} <CaretDown size={14} /></button>{snapshotOpen && <div className="snapshot-menu"><button onClick={() => { setSnapshot("Aug 25, 2026 09:00 PT"); setSnapshotOpen(false); }}>Aug 25, 2026 09:00 PT</button><button onClick={() => { setSnapshot("Aug 24, 2026 18:00 PT"); setSnapshotOpen(false); }}>Aug 24, 2026 18:00 PT</button><button onClick={() => { setSnapshot("Aug 18, 2026 09:00 PT"); setSnapshotOpen(false); }}>Aug 18, 2026 09:00 PT</button></div>}<span className="auto-update"><span className="status-dot" /> Auto-updates every 15m</span></div></div><StageRail activeStage={activeStage} setActiveStage={setActiveStage} /><div className="stage-context"><span className="context-kicker">{stages.find((stage) => stage.id === activeStage)?.label}</span><span>{activeStageCopy}</span></div><div className="content-grid"><div className="content-main"><EvidencePanel mode={metricMode} /><div className="quality-strip"><CheckCircle size={18} weight="fill" /><div><strong>Data quality checks passed</strong><span>All integrity guardrails are within thresholds.</span></div><span className="strip-updated">Last validated: Aug 25, 2026 09:00 PT</span><button className="link-button">View all checks <ArrowRight size={13} /></button></div><FormulaTrace mode={metricMode} setMode={setMetricMode} /></div><div className="content-aside"><MetricContract expanded={contractExpanded} setExpanded={setContractExpanded} /><DataQualityPanel /><DecisionPanel mode={metricMode} onOpenDecision={() => setDecisionOpen(true)} onExport={exportReport} /></div></div><footer className="app-footer"><span>All times in PT</span><span>Reproducible by commit <strong>a1b2c3d</strong></span><span>Data snapshot {snapshot}</span><span className="footer-spacer" /><button>Privacy</button><span>·</span><button>Terms</button></footer></main>{decisionOpen && <DecisionModal onClose={() => setDecisionOpen(false)} onExport={exportReport} />}{toast && <div className="toast"><CheckCircle size={17} weight="fill" /> {toast}</div>}</div>;
}
