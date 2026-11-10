/**
 * FinHealth Atlas — Wealth & Healthcare Forecaster (India) · v3
 * Single-file React application · React 18 · Tailwind CSS · Recharts · Framer Motion · Lucide
 *
 * There is no sample data in this app. Every figure on screen is calculated from
 * numbers the visitor types in. Those numbers stay in the visitor's own browser
 * (localStorage); nothing is sent to a server. Not financial, medical, or insurance advice.
 */
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, MotionConfig, animate } from "framer-motion";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Area,
  Line,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  CircleHelp,
  ClipboardList,
  CloudOff,
  Database,
  Download,
  HardDrive,
  HeartPulse,
  IndianRupee,
  Keyboard,
  Lock,
  Moon,
  Plus,
  Radio,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

/* ══════════════════════════════════════════════════════════════════════════
 * 1. EMPTY PROFILE + PERSISTENCE
 *    The app ships with no figures. Rates below are editable assumptions,
 *    not data about any person.
 * ══════════════════════════════════════════════════════════════════════════ */

const STORAGE_KEY = "finhealth-atlas:v3";
const RETIREMENT_AGE = 60;
const POST_RETIREMENT_HAIRCUT = 3; // percentage points taken off the CAGR after 60

const EMPTY = {
  v: 3,
  age: 30,
  wealth: {
    monthlyIncome: 0,
    monthlyExpenses: 0,
    equity: 0,
    debt: 0,
    cash: 0,
    gold: 0,
    monthlySip: 0,
    cagr: 12,
    stepUp: 0,
    livingInflation: 6,
    eduAnnual: 0,
    eduStartsIn: 0,
    eduYears: 0,
    eduInflation: 10,
  },
  health: {
    annualSpend: 0,
    healthInflation: 14,
    corpSI: 0,
    baseSI: 0,
    basePremium: 0,
    topupSI: 0,
    topupPremium: 0,
    copayPct: 0,
    nonPayablePct: 5,
    currentCover: "corp",
  },
  events: [],
  consent: { wealth: true, health: true, events: true },
  log: [],
  tourDone: false,
  theme: null,
};

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const num = (value, fallback = 0, lo = 0, hi = 1e12) => {
  const n = Number(value);
  return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
};

/** Coerce anything read from storage or an imported file into a valid profile. */
function sanitize(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const w = src.wealth && typeof src.wealth === "object" ? src.wealth : {};
  const h = src.health && typeof src.health === "object" ? src.health : {};
  const c = src.consent && typeof src.consent === "object" ? src.consent : {};
  const wealth = {};
  Object.keys(EMPTY.wealth).forEach((key) => {
    wealth[key] = num(w[key], EMPTY.wealth[key], 0, ["cagr", "stepUp", "livingInflation", "eduInflation"].includes(key) ? 40 : key === "eduStartsIn" || key === "eduYears" ? 60 : 1e12);
  });
  const health = {};
  Object.keys(EMPTY.health).forEach((key) => {
    if (key === "currentCover") health[key] = ["corp", "base", "topup"].includes(h[key]) ? h[key] : "corp";
    else health[key] = num(h[key], EMPTY.health[key], 0, ["healthInflation", "copayPct", "nonPayablePct"].includes(key) ? 50 : 1e12);
  });
  const events = Array.isArray(src.events)
    ? src.events.slice(0, 20).map((event, index) => ({
        id: typeof event.id === "string" ? event.id : `event-${index}-${Date.now()}`,
        name: String(event.name || "").slice(0, 60),
        cost: num(event.cost),
      }))
    : [];
  const log = Array.isArray(src.log)
    ? src.log.slice(0, 40).map((entry, index) => ({
        id: typeof entry.id === "string" ? entry.id : `log-${index}`,
        time: typeof entry.time === "string" ? entry.time : new Date().toISOString(),
        kind: ["save", "revoke", "grant", "export", "import", "erase"].includes(entry.kind) ? entry.kind : "save",
        text: String(entry.text || "").slice(0, 140),
      }))
    : [];
  return {
    v: 3,
    age: Math.round(num(src.age, EMPTY.age, 20, 70)),
    wealth,
    health,
    events,
    consent: { wealth: c.wealth !== false, health: c.health !== false, events: c.events !== false },
    log,
    tourDone: src.tourDone === true,
    theme: src.theme === "light" || src.theme === "dark" ? src.theme : null,
  };
}

/** What actually gets written to the device: only the categories the visitor allows. */
function toStored(data) {
  return {
    v: 3,
    age: data.age,
    wealth: data.consent.wealth ? data.wealth : undefined,
    health: data.consent.health ? data.health : undefined,
    events: data.consent.events ? data.events : undefined,
    consent: data.consent,
    log: data.log,
    tourDone: data.tourDone,
    theme: data.theme,
  };
}
function loadProfile() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return sanitize(raw ? JSON.parse(raw) : null);
  } catch (error) {
    return sanitize(null);
  }
}
function saveProfile(data) {
  try {
    const text = JSON.stringify(toStored(data));
    window.localStorage.setItem(STORAGE_KEY, text);
    return text.length;
  } catch (error) {
    return 0; // storage unavailable (private window): the app still works for this visit
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * 2. FORECAST MODELS — pure functions of the visitor's inputs
 * ══════════════════════════════════════════════════════════════════════════ */

const netWorthOf = (w) => w.equity + w.debt + w.cash + w.gold;

/**
 * Wealth projection from the selected age.
 * Before 60: corpus compounds at the chosen CAGR; the SIP rises by the step-up each year.
 * From 60: SIPs stop, the return is 3 points lower, and expenses are drawn from the corpus.
 * Cost lines are cumulative household outflows, shown as a benchmark.
 */
function projectWealth(age, w, h) {
  const r = w.cagr / 100;
  const endAge = clamp(age + 25, 65, 90);
  const start = netWorthOf(w);
  let corpus = start;
  let invested = start;
  let annualSip = w.monthlySip * 12;
  let cumulativeLiving = 0;
  let cumulativeHealth = 0;
  const rows = [];

  for (let t = 0; age + t <= endAge; t += 1) {
    const a = age + t;
    rows.push({
      age: a,
      year: t,
      corpus: Math.round(corpus),
      invested: Math.round(Math.min(corpus, invested)),
      gains: Math.round(Math.max(0, corpus - invested)),
      livingEducation: Math.round(cumulativeLiving),
      healthcare: Math.round(cumulativeHealth),
    });
    const living = w.monthlyExpenses * 12 * Math.pow(1 + w.livingInflation / 100, t);
    const inEducation = w.eduAnnual > 0 && w.eduYears > 0 && t >= w.eduStartsIn && t < w.eduStartsIn + w.eduYears;
    const education = inEducation ? w.eduAnnual * Math.pow(1 + w.eduInflation / 100, t) : 0;
    cumulativeLiving += living + education;
    cumulativeHealth += h.annualSpend * Math.pow(1 + h.healthInflation / 100, t);

    if (a < RETIREMENT_AGE) {
      corpus = corpus * (1 + r) + annualSip * (1 + r / 2);
      invested += annualSip;
      annualSip *= 1 + w.stepUp / 100;
    } else {
      const retiredReturn = Math.max(0, r - POST_RETIREMENT_HAIRCUT / 100);
      corpus = Math.max(0, corpus * (1 + retiredReturn) - living);
      invested = Math.max(0, invested - living);
    }
  }

  const milestoneAge = age < RETIREMENT_AGE ? RETIREMENT_AGE : Math.min(endAge, age + 15);
  const milestone = rows.find((row) => row.age === milestoneAge) || rows[rows.length - 1];
  const depleted = start > 0 ? rows.find((row) => row.year > 0 && row.corpus === 0) : null;
  return {
    rows,
    start,
    endAge,
    milestoneAge,
    milestone,
    milestoneReal: milestone.corpus / Math.pow(1 + w.livingInflation / 100, milestone.year),
    depletionAge: depleted ? depleted.age : null,
  };
}

/** The three cover scenarios, built from the visitor's own policy details. */
function coverScenarios(h) {
  return [
    { id: "corp", name: "Mediclaim", detail: "Employer group cover only", sumInsured: h.corpSI, annualPremium: 0, entered: h.corpSI > 0 },
    { id: "base", name: "Base Retail", detail: "Your own retail policy only", sumInsured: h.baseSI, annualPremium: h.basePremium, entered: h.baseSI > 0 },
    {
      id: "topup",
      name: "Super Top-up",
      detail: "Base retail plus super top-up",
      sumInsured: h.baseSI + h.topupSI,
      annualPremium: h.basePremium + h.topupPremium,
      entered: h.baseSI > 0 && h.topupSI > 0,
    },
  ];
}

/** What a hospital bill leaves you to pay under a cover. */
function outOfPocket(cost, cover, h) {
  const eligible = cost * (1 - h.nonPayablePct / 100);
  const insurerPays = Math.min(eligible, cover.sumInsured) * (1 - h.copayPct / 100);
  return Math.max(0, cost - insurerPays);
}

/**
 * Event names commonly relevant at an age, used only as quick-add suggestions.
 * The amounts are rough starting estimates the visitor is asked to replace.
 */
const gauss = (z) => Math.exp(-0.5 * z * z);
const sigmoid = (x, mid, spread) => 1 / (1 + Math.exp(-(x - mid) / spread));
const SUGGESTIONS = [
  { name: "Maternity (C-section)", estimate: 185000, relevance: (age) => (age <= 42 ? gauss((age - 29) / 6) : 0) },
  { name: "Accident surgery", estimate: 280000, relevance: (age) => 0.35 - 0.004 * (age - 20) },
  { name: "Parent's cardiac care", estimate: 420000, relevance: (age) => (age <= 58 ? 0.9 * gauss((age - 42) / 10) : 0) },
  { name: "Diabetes / BP care (per year)", estimate: 96000, relevance: (age) => sigmoid(age, 48, 7) },
  { name: "Angioplasty", estimate: 450000, relevance: (age) => 0.8 * sigmoid(age, 58, 7) },
  { name: "Joint replacement", estimate: 560000, relevance: (age) => 0.9 * sigmoid(age, 58, 5) },
  { name: "Cataract surgery (both eyes)", estimate: 110000, relevance: (age) => sigmoid(age, 64, 4) },
  { name: "Cancer care", estimate: 2000000, relevance: (age) => 0.3 + 0.4 * sigmoid(age, 55, 10) },
];
function suggestionsFor(age, existing) {
  const have = new Set(existing.map((event) => event.name.toLowerCase()));
  return SUGGESTIONS.filter((item) => !have.has(item.name.toLowerCase()))
    .map((item) => ({ ...item, score: item.relevance(age) }))
    .filter((item) => item.score > 0.12)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function lifeStage(age) {
  if (age < 27) return "Early career";
  if (age < 36) return "Family building";
  if (age < 50) return "Peak earning";
  if (age < 60) return "Pre-retirement";
  return "Retired";
}

/* ══════════════════════════════════════════════════════════════════════════
 * 3. THEME TOKENS (light + dark) · INDIAN-SYSTEM FORMATTERS
 * ══════════════════════════════════════════════════════════════════════════ */

const MODES = {
  dark: {
    name: "dark",
    page: "bg-slate-950 text-slate-100",
    header: "border-white/10 bg-slate-950/85 backdrop-blur-xl",
    sidebar: "border-white/10 bg-slate-900/70 backdrop-blur-xl",
    panel: "border-white/10 bg-slate-900/75 backdrop-blur-xl",
    inset: "border-white/10 bg-white/[0.05]",
    well: "border-white/10 bg-slate-950/60",
    field: "border-white/20 bg-slate-950/70 text-white focus-within:border-cyan-400 focus-within:ring-2 focus-within:ring-cyan-400/40",
    divider: "border-white/10",
    heading: "text-white",
    body: "text-slate-200",
    muted: "text-slate-400",
    track: "bg-white/10",
    chip: "border-white/15 bg-white/[0.06] text-slate-200",
    accentText: "text-cyan-300",
    accentSoft: "border-cyan-400/50 bg-cyan-400/10",
    iconTile: "bg-cyan-400/10 text-cyan-300",
    onAccent: "text-slate-950",
    button: "border-white/15 bg-white/[0.06] text-white hover:bg-white/10",
    dangerButton: "border-rose-400/50 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20",
    good: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
    warn: "border-amber-400/40 bg-amber-400/10 text-amber-300",
    bad: "border-rose-400/40 bg-rose-400/10 text-rose-300",
    warnText: "text-amber-300",
    badText: "text-rose-300",
    goodText: "text-emerald-300",
    tooltip: "border-white/15 bg-slate-900 text-slate-100",
    tourCard: "border-cyan-400/40 bg-slate-900 text-slate-100",
    logRow: "bg-slate-950/70",
    shadow: "0px 18px 50px -24px rgba(0,0,0,0.9), 0px 0px 0px 1px rgba(34,211,238,0)",
    shadowHover: "0px 26px 60px -22px rgba(34,211,238,0.45), 0px 0px 0px 1px rgba(34,211,238,0.4)",
    c: {
      accent: "#22d3ee",
      gain: "#34d399",
      warn: "#fbbf24",
      danger: "#fb7185",
      violet: "#a78bfa",
      off: "#475569",
      grid: "rgba(255,255,255,0.09)",
      tick: "#cbd5e1",
      ringTrack: "rgba(255,255,255,0.1)",
      cursor: "rgba(255,255,255,0.35)",
      gradient: "linear-gradient(135deg,#22d3ee 0%,#34d399 100%)",
      thumb: "#0f172a",
      glow: (hex) => `0 0 18px ${hex}99`,
    },
  },
  light: {
    name: "light",
    page: "bg-slate-50 text-slate-900",
    header: "border-slate-200 bg-white/95 backdrop-blur",
    sidebar: "border-slate-200 bg-white",
    panel: "border-slate-200 bg-white",
    inset: "border-slate-200 bg-slate-50",
    well: "border-slate-200 bg-slate-50",
    field: "border-slate-300 bg-white text-slate-900 focus-within:border-cyan-700 focus-within:ring-2 focus-within:ring-cyan-700/30",
    divider: "border-slate-200",
    heading: "text-slate-900",
    body: "text-slate-700",
    muted: "text-slate-600",
    track: "bg-slate-200",
    chip: "border-slate-200 bg-slate-100 text-slate-700",
    accentText: "text-cyan-800",
    accentSoft: "border-cyan-600/50 bg-cyan-50",
    iconTile: "bg-cyan-50 text-cyan-800",
    onAccent: "text-white",
    button: "border-slate-300 bg-white text-slate-800 hover:bg-slate-100",
    dangerButton: "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100",
    good: "border-emerald-600/30 bg-emerald-50 text-emerald-800",
    warn: "border-amber-600/30 bg-amber-50 text-amber-800",
    bad: "border-rose-600/30 bg-rose-50 text-rose-800",
    warnText: "text-amber-800",
    badText: "text-rose-700",
    goodText: "text-emerald-700",
    tooltip: "border-slate-200 bg-white text-slate-900",
    tourCard: "border-cyan-600/40 bg-white text-slate-900",
    logRow: "bg-slate-100",
    shadow: "0px 1px 3px 0px rgba(15,23,42,0.08), 0px 0px 0px 1px rgba(14,116,144,0)",
    shadowHover: "0px 22px 44px -20px rgba(15,23,42,0.28), 0px 0px 0px 1px rgba(14,116,144,0.35)",
    c: {
      accent: "#0e7490",
      gain: "#047857",
      warn: "#b45309",
      danger: "#be123c",
      violet: "#6d28d9",
      off: "#94a3b8",
      grid: "#e2e8f0",
      tick: "#475569",
      ringTrack: "#e2e8f0",
      cursor: "#94a3b8",
      gradient: "linear-gradient(135deg,#0e7490 0%,#047857 100%)",
      thumb: "#ffffff",
      glow: () => "0 2px 6px rgba(15,23,42,0.18)",
    },
  },
};

const ThemeContext = createContext(MODES.dark);
const useT = () => useContext(ThemeContext);

/** ₹ in the Indian numbering system: thousands → Lakh (1,00,000) → Crore (1,00,00,000). */
function fmtINR(value, digits = 2) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(digits)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(digits)} L`;
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
}
const fmtAxis = (value) => {
  if (value >= 1e7) return `₹${+(value / 1e7).toFixed(1)} Cr`;
  if (value >= 1e5) return `₹${+(value / 1e5).toFixed(1)} L`;
  if (value >= 1e3) return `₹${Math.round(value / 1e3)}K`;
  return `₹${value}`;
};
const fmtPct = (value, digits = 0) => `${(value * 100).toFixed(digits)}%`;
const fmtInt = (value) => Math.round(value).toLocaleString("en-IN");
const fmtBytes = (value) => (value >= 1024 ? `${(value / 1024).toFixed(1)} KB` : `${Math.round(value)} bytes`);

/* ══════════════════════════════════════════════════════════════════════════
 * 4. SHARED UI PRIMITIVES
 * ══════════════════════════════════════════════════════════════════════════ */

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } };
const rise = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } },
};

/** Counter that ticks from 0 on mount, then tweens whenever the value changes. */
function Counter({ value, format = fmtINR, duration = 1.3 }) {
  const [display, setDisplay] = useState(0);
  const current = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    const controls = animate(current.current, value, {
      duration: mounted.current ? 0.45 : duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        current.current = latest;
        setDisplay(latest);
      },
    });
    mounted.current = true;
    return () => controls.stop();
  }, [value, duration]);
  return <span className="tabular-nums">{format(display)}</span>;
}

function Panel({ children, className = "", lift = 4, tour }) {
  const t = useT();
  return (
    <motion.section
      data-tour={tour}
      variants={rise}
      animate={{ boxShadow: t.shadow }}
      whileHover={{ y: -lift, boxShadow: t.shadowHover }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className={`relative rounded-3xl border p-5 sm:p-6 ${t.panel} ${className}`}
    >
      {children}
    </motion.section>
  );
}

function LivePulse({ label = "Live recalculation", color }) {
  const t = useT();
  const dot = color || t.c.gain;
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${t.chip}`}>
      <span className="relative flex h-2 w-2">
        <motion.span
          className="absolute inline-flex h-full w-full rounded-full"
          style={{ background: dot }}
          animate={{ scale: [1, 2.6], opacity: [0.7, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
        />
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: dot }} />
      </span>
      {label}
    </span>
  );
}

function PanelTitle({ icon: Icon, title, subtitle, right }) {
  const t = useT();
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${t.iconTile}`}>
          <Icon size={18} aria-hidden="true" />
        </span>
        <div>
          <h3 className={`text-base font-semibold tracking-tight ${t.heading}`}>{title}</h3>
          {subtitle && <p className={`mt-0.5 max-w-xl text-sm leading-snug ${t.muted}`}>{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, caption, color, format = fmtINR }) {
  const t = useT();
  return (
    <Panel lift={8}>
      <div className="flex items-center justify-between gap-3">
        <p className={`text-xs font-semibold uppercase tracking-widest ${t.muted}`}>{label}</p>
        <motion.span
          whileHover={{ rotate: 12, scale: 1.12 }}
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl border ${t.inset}`}
          style={{ color, boxShadow: t.c.glow(color) }}
        >
          <Icon size={18} aria-hidden="true" />
        </motion.span>
      </div>
      <p className={`mt-4 text-3xl font-semibold tracking-tight sm:text-4xl ${t.heading}`}>
        <Counter value={value} format={format} />
      </p>
      <div className="mt-3 h-1 w-12 rounded-full" style={{ background: color }} />
      <p className={`mt-3 text-sm leading-snug ${t.muted}`}>{caption}</p>
    </Panel>
  );
}

function RangeInput({ id, label, value, min, max, step, onChange, onCommit, format, valueText, big = false }) {
  const t = useT();
  const pct = clamp(((value - min) / (max - min)) * 100, 0, 100);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor={id} className={`font-medium ${big ? "text-sm sm:text-base" : "text-sm"} ${t.body}`}>
          {label}
        </label>
        <motion.span
          key={value}
          initial={{ scale: 1.14 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 520, damping: 18 }}
          className={`rounded-lg border px-2.5 py-1 text-sm font-semibold tabular-nums ${t.accentSoft} ${t.accentText}`}
        >
          {format(value)}
        </motion.span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={clamp(value, min, max)}
        aria-valuetext={valueText || format(value)}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        className="atlas-range h-2 w-full cursor-pointer appearance-none rounded-full"
        style={{
          color: t.c.accent,
          "--thumb": t.c.thumb,
          background: `linear-gradient(90deg, ${t.c.accent} 0%, ${t.c.gain} ${pct}%, ${t.c.ringTrack} ${pct}%)`,
        }}
      />
      <div className={`mt-1.5 flex justify-between text-xs tabular-nums ${t.muted}`}>
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

/** Rupee amount typed by the visitor, grouped the Indian way as they type. */
function MoneyField({ id, label, value, onChange, onCommit, hint }) {
  const t = useT();
  return (
    <div>
      <label htmlFor={id} className={`text-sm font-medium ${t.body}`}>
        {label}
      </label>
      <div className={`mt-1.5 flex items-center rounded-xl border px-3 transition-shadow ${t.field}`}>
        <span className={`text-sm font-semibold ${t.muted}`} aria-hidden="true">
          ₹
        </span>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          value={value ? value.toLocaleString("en-IN") : ""}
          onChange={(event) => onChange(Number(event.target.value.replace(/[^0-9]/g, "").slice(0, 12)) || 0)}
          onBlur={onCommit}
          className="atlas-bare w-full bg-transparent px-2 py-2.5 text-sm font-semibold tabular-nums"
        />
      </div>
      <p className={`mt-1 min-h-[1rem] text-xs ${t.muted}`}>{value >= 100000 ? fmtINR(value) : hint || ""}</p>
    </div>
  );
}

function NumberField({ id, label, value, onChange, onCommit, suffix, min = 0, max = 100, step = 0.5, hint }) {
  const t = useT();
  return (
    <div>
      <label htmlFor={id} className={`text-sm font-medium ${t.body}`}>
        {label}
      </label>
      <div className={`mt-1.5 flex items-center rounded-xl border px-3 transition-shadow ${t.field}`}>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(clamp(Number(event.target.value) || 0, min, max))}
          onBlur={onCommit}
          className="atlas-bare w-full bg-transparent py-2.5 text-sm font-semibold tabular-nums"
        />
        <span className={`pl-2 text-sm font-semibold ${t.muted}`}>{suffix}</span>
      </div>
      <p className={`mt-1 min-h-[1rem] text-xs ${t.muted}`}>{hint || ""}</p>
    </div>
  );
}

function ChartTooltip({ active, payload, label, prefix = "Age" }) {
  const t = useT();
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm shadow-xl ${t.tooltip}`}>
      <p className="mb-2 font-semibold">{prefix ? `${prefix} ${label}` : label}</p>
      <ul className="space-y-1.5">
        {payload.map((entry) => (
          <li key={entry.dataKey} className="flex items-center justify-between gap-6">
            <span className={`flex items-center gap-2 ${t.muted}`}>
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: entry.color }} />
              {entry.name}
            </span>
            <span className="font-semibold tabular-nums">{fmtINR(entry.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Legend({ items }) {
  const t = useT();
  return (
    <div className={`mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs ${t.body}`}>
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-2">
          <span className={item.line ? "h-0.5 w-5 rounded-full" : "h-2.5 w-2.5 rounded-sm"} style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function PageHeader({ eyebrow, title, description, pulse = true }) {
  const t = useT();
  return (
    <motion.header variants={rise} className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${t.accentText}`}>{eyebrow}</p>
        <h2 className={`mt-2 text-2xl font-semibold tracking-tight sm:text-3xl ${t.heading}`}>{title}</h2>
        <p className={`mt-2 max-w-2xl text-sm leading-relaxed sm:text-base ${t.muted}`}>{description}</p>
      </div>
      {pulse && <LivePulse />}
    </motion.header>
  );
}

function EmptyState({ icon: Icon, title, text, action, onAction }) {
  const t = useT();
  return (
    <Panel lift={0} className="text-center">
      <motion.span
        className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${t.iconTile}`}
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <Icon size={24} aria-hidden="true" />
      </motion.span>
      <h3 className={`mt-4 text-lg font-semibold ${t.heading}`}>{title}</h3>
      <p className={`mx-auto mt-2 max-w-md text-sm leading-relaxed ${t.muted}`}>{text}</p>
      {action && (
        <motion.button
          type="button"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={onAction}
          className={`mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold ${t.onAccent}`}
          style={{ background: t.c.gradient }}
        >
          {action}
          <ArrowRight size={15} aria-hidden="true" />
        </motion.button>
      )}
    </Panel>
  );
}

function Switch({ checked, onToggle, label }) {
  const t = useT();
  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      whileTap={{ scale: 0.92 }}
      animate={{ backgroundColor: checked ? t.c.gain : t.c.off }}
      className={`flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 ${checked ? "justify-end" : "justify-start"}`}
    >
      <motion.span layout transition={{ type: "spring", stiffness: 600, damping: 30 }} className="h-6 w-6 rounded-full bg-white shadow-md" />
    </motion.button>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * 5. PAGE 0 — MY NUMBERS (the only source of data in the app)
 * ══════════════════════════════════════════════════════════════════════════ */

function NumbersPage({ data, setWealth, setHealth, commit, goTo }) {
  const t = useT();
  const w = data.wealth;
  const h = data.health;
  const money = (section, key, label, hint) => {
    const source = section === "wealth" ? w : h;
    const setter = section === "wealth" ? setWealth : setHealth;
    return (
      <MoneyField
        id={`${section}-${key}`}
        label={label}
        hint={hint}
        value={source[key]}
        onChange={(value) => setter({ [key]: value })}
        onCommit={() => commit(`Updated ${label.toLowerCase()}`)}
      />
    );
  };
  const rate = (section, key, label, suffix = "%", max = 40, step = 0.5, hint) => {
    const source = section === "wealth" ? w : h;
    const setter = section === "wealth" ? setWealth : setHealth;
    return (
      <NumberField
        id={`${section}-${key}`}
        label={label}
        suffix={suffix}
        max={max}
        step={step}
        hint={hint}
        value={source[key]}
        onChange={(value) => setter({ [key]: value })}
        onCommit={() => commit(`Updated ${label.toLowerCase()}`)}
      />
    );
  };

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <PageHeader
        eyebrow="My numbers"
        title="Enter your own figures"
        description="This app has no sample data. Every chart is calculated from what you type here, and it is saved only in this browser. Leave a field at zero if it does not apply."
        pulse={false}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel lift={2} tour="numbers">
          <PanelTitle icon={Wallet} title="Income, spending and investments" subtitle={`You are entering figures for age ${data.age}. Change the age with the slider at the top.`} />
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            {money("wealth", "monthlyIncome", "Monthly take-home income")}
            {money("wealth", "monthlyExpenses", "Monthly household expenses")}
            {money("wealth", "equity", "Equity (mutual funds, shares)")}
            {money("wealth", "debt", "Debt (EPF, PPF, NPS, bonds)")}
            {money("wealth", "cash", "Cash and fixed deposits")}
            {money("wealth", "gold", "Gold")}
            {money("wealth", "monthlySip", "Monthly SIP")}
            {rate("wealth", "stepUp", "Yearly SIP step-up", "%", 30, 1, "How much you raise the SIP each year")}
          </div>
          <div className={`mt-2 flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${t.well}`}>
            <span className={t.muted}>Net worth from the four asset fields</span>
            <span className={`text-base font-semibold ${t.heading}`}>
              <Counter value={netWorthOf(w)} duration={0.6} />
            </span>
          </div>
        </Panel>

        <Panel lift={2}>
          <PanelTitle icon={ShieldCheck} title="Health insurance" subtitle="Sum insured and yearly premium for each policy you hold." />
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            {money("health", "corpSI", "Employer Mediclaim sum insured")}
            {money("health", "annualSpend", "Yearly medical spend from pocket", "Medicines, OPD, tests")}
            {money("health", "baseSI", "Base retail policy sum insured")}
            {money("health", "basePremium", "Base retail yearly premium")}
            {money("health", "topupSI", "Super top-up sum insured")}
            {money("health", "topupPremium", "Super top-up yearly premium")}
            {rate("health", "copayPct", "Co-pay on claims", "%", 50, 1, "Share of each claim you must pay")}
            {rate("health", "nonPayablePct", "Non-payable items", "%", 30, 1, "Consumables and exclusions on a bill")}
          </div>
        </Panel>

        <Panel lift={2}>
          <PanelTitle icon={Sparkles} title="Assumptions" subtitle="Rates used in the projections. These are starting points for you to change, not facts about you." />
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-3">
            {rate("wealth", "cagr", "Expected CAGR", "%", 30)}
            {rate("wealth", "livingInflation", "Living inflation", "%", 20)}
            {rate("health", "healthInflation", "Healthcare inflation", "%", 30)}
          </div>
        </Panel>

        <Panel lift={2}>
          <PanelTitle icon={Target} title="Education goal (optional)" subtitle="Leave at zero if you have no education cost to plan for." />
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            {money("wealth", "eduAnnual", "Yearly cost at today's prices")}
            {rate("wealth", "eduInflation", "Education inflation", "%", 25)}
            {rate("wealth", "eduStartsIn", "Starts in", "years", 40, 1)}
            {rate("wealth", "eduYears", "Lasts for", "years", 15, 1)}
          </div>
        </Panel>
      </div>

      <motion.div variants={rise} className="mt-6 flex flex-wrap items-center gap-3">
        <motion.button
          type="button"
          whileHover={{ scale: 1.03, y: -2 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => goTo("wealth")}
          className={`inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold ${t.onAccent}`}
          style={{ background: t.c.gradient }}
        >
          See my wealth trajectory
          <ArrowRight size={16} aria-hidden="true" />
        </motion.button>
        <p className={`text-sm ${t.muted}`}>Changes save automatically on this device.</p>
      </motion.div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * 6. PAGE 1 — WEALTH TRAJECTORY
 * ══════════════════════════════════════════════════════════════════════════ */

function WealthPage({ data, setWealth, commit, goTo }) {
  const t = useT();
  const { age, wealth: w, health: h } = data;
  const model = useMemo(() => projectWealth(age, w, h), [age, w, h]);
  const hasData = model.start > 0 || w.monthlySip > 0;
  const retired = age >= RETIREMENT_AGE;
  const last = model.rows[model.rows.length - 1];
  const tick = { fill: t.c.tick, fontSize: 12 };
  const sipMax = Math.max(100000, Math.ceil((w.monthlySip * 2) / 50000) * 50000);

  if (!hasData) {
    return (
      <motion.div variants={stagger} initial="hidden" animate="show">
        <PageHeader eyebrow="Wealth trajectory" title="Nothing to project yet" description="Add your assets or a monthly SIP and this page will build your forecast." pulse={false} />
        <EmptyState
          icon={TrendingUp}
          title="Your wealth chart is waiting for your numbers"
          text="Enter what you own and what you invest each month. The chart, the three headline figures, and the scenario sliders are all calculated from them."
          action="Enter my numbers"
          onAction={() => goTo("numbers")}
        />
      </motion.div>
    );
  }

  const legend = [
    { label: "Amount invested", color: t.c.accent },
    { label: "Market gains", color: t.c.gain },
  ];
  if (last.livingEducation > 0) legend.push({ label: "Living + education (cumulative)", color: t.c.warn, line: true });
  if (last.healthcare > 0) legend.push({ label: "Healthcare (cumulative)", color: t.c.danger, line: true });

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <PageHeader
        eyebrow="Wealth trajectory"
        title={retired ? `Making the corpus last from ${age}` : `${RETIREMENT_AGE - age} years of compounding to 60`}
        description="Your corpus, built from your own assets and SIP, set against what living, education, and healthcare will cost over the same years."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard color={t.c.accent} icon={IndianRupee} label="Current Net Worth" value={model.start} caption="Sum of the equity, debt, cash, and gold you entered" />
        <KpiCard
          color={t.c.gain}
          icon={Target}
          label={`Projected Corpus at Age ${model.milestoneAge}`}
          value={model.milestone.corpus}
          caption={
            model.depletionAge
              ? `Corpus runs out at age ${model.depletionAge} on this plan`
              : `${fmtINR(model.milestoneReal)} in today's rupees at ${w.livingInflation}% inflation`
          }
        />
        <KpiCard
          color={t.c.violet}
          icon={Zap}
          label="Monthly SIP"
          value={w.monthlySip}
          caption={
            retired
              ? "SIPs are not added after 60 in this model"
              : w.monthlyIncome > 0
              ? `${fmtPct(w.monthlySip / w.monthlyIncome)} of your take-home income${w.stepUp ? `; rises ${w.stepUp}% a year` : ""}`
              : "Add your income in My Numbers to see your savings rate"
          }
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" lift={3} tour="chart">
          <PanelTitle
            icon={TrendingUp}
            title="Wealth Growth vs. Education / Living Inflation"
            subtitle={`Stacked corpus (invested + market gains) against cumulative household outflows, age ${age} to ${model.endAge}`}
          />
          <div className="h-80 w-full" role="img" aria-label={`Projected corpus of ${fmtINR(model.milestone.corpus)} at age ${model.milestoneAge}`}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={model.rows} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gInvested" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={t.c.accent} stopOpacity={0.7} />
                    <stop offset="100%" stopColor={t.c.accent} stopOpacity={0.15} />
                  </linearGradient>
                  <linearGradient id="gGains" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={t.c.gain} stopOpacity={0.75} />
                    <stop offset="100%" stopColor={t.c.gain} stopOpacity={0.15} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={t.c.grid} vertical={false} />
                <XAxis dataKey="age" tickLine={false} axisLine={false} tick={tick} interval={4} />
                <YAxis tickFormatter={fmtAxis} tickLine={false} axisLine={false} width={72} tick={tick} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: t.c.cursor, strokeDasharray: "4 4" }} />
                <Area type="monotone" dataKey="invested" name="Amount invested" stackId="corpus" stroke={t.c.accent} strokeWidth={2} fill="url(#gInvested)" animationDuration={500} />
                <Area type="monotone" dataKey="gains" name="Market gains" stackId="corpus" stroke={t.c.gain} strokeWidth={2} fill="url(#gGains)" animationDuration={500} />
                {last.livingEducation > 0 && (
                  <Line type="monotone" dataKey="livingEducation" name="Living + education (cumulative)" stroke={t.c.warn} strokeWidth={2.5} strokeDasharray="7 5" dot={false} animationDuration={500} />
                )}
                {last.healthcare > 0 && (
                  <Line type="monotone" dataKey="healthcare" name="Healthcare (cumulative)" stroke={t.c.danger} strokeWidth={2.5} strokeDasharray="2 4" dot={false} animationDuration={500} />
                )}
                {!retired && (
                  <ReferenceLine
                    x={RETIREMENT_AGE}
                    stroke={t.c.cursor}
                    strokeDasharray="3 3"
                    label={{ value: "Retire at 60", position: "insideTopLeft", fill: t.c.tick, fontSize: 12 }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <Legend items={legend} />
          <p className={`mt-3 text-xs leading-relaxed ${t.muted}`}>
            Method: before 60 the corpus compounds at your CAGR and your SIP is added each year. From 60, SIPs stop, the return is assumed {POST_RETIREMENT_HAIRCUT} points
            lower, and your expenses are drawn from the corpus.
          </p>
        </Panel>

        <Panel lift={3}>
          <PanelTitle icon={Sparkles} title="Scenario Modeler" subtitle="Move a slider and the forecast redraws. Changes are saved to your numbers." />
          <div className="space-y-6">
            <RangeInput
              id="sip"
              label="Monthly SIP"
              min={0}
              max={sipMax}
              step={500}
              value={w.monthlySip}
              format={(v) => fmtINR(v)}
              onChange={(value) => setWealth({ monthlySip: value })}
              onCommit={() => commit("Updated monthly SIP")}
            />
            <RangeInput
              id="cagr"
              label="Expected CAGR"
              min={4}
              max={20}
              step={0.5}
              value={w.cagr}
              format={(v) => `${Number(v).toFixed(1)}%`}
              onChange={(value) => setWealth({ cagr: value })}
              onCommit={() => commit("Updated expected CAGR")}
            />
          </div>
          <dl className={`mt-6 space-y-2 rounded-2xl border p-4 text-sm ${t.well}`}>
            <div className="flex justify-between gap-3">
              <dt className={t.muted}>Corpus at age {last.age}</dt>
              <dd className={`font-semibold ${t.heading}`}>
                <Counter value={last.corpus} />
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className={t.muted}>Market gains by age {model.milestoneAge}</dt>
              <dd className={`font-semibold ${t.goodText}`}>
                <Counter value={model.milestone.gains} />
              </dd>
            </div>
            {last.healthcare > 0 && (
              <div className="flex justify-between gap-3">
                <dt className={t.muted}>Healthcare outflow to {last.age}</dt>
                <dd className={`font-semibold ${t.badText}`}>
                  <Counter value={last.healthcare} />
                </dd>
              </div>
            )}
          </dl>
          <motion.button
            type="button"
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => goTo("numbers")}
            className={`mt-4 w-full rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-colors ${t.button}`}
          >
            Edit all my numbers
          </motion.button>
        </Panel>
      </div>

      <Panel className="mt-4" lift={3}>
        <PanelTitle icon={Wallet} title="Your Asset Mix" subtitle="From the four asset fields you entered." />
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { key: "equity", name: "Equity" },
            { key: "debt", name: "Debt" },
            { key: "cash", name: "Cash and FDs" },
            { key: "gold", name: "Gold" },
          ].map((item) => {
            const share = model.start > 0 ? w[item.key] / model.start : 0;
            return (
              <li key={item.key} className={`rounded-2xl border p-4 ${t.inset}`}>
                <p className={`text-sm font-medium ${t.body}`}>{item.name}</p>
                <p className={`mt-1 text-lg font-semibold tabular-nums ${t.heading}`}>{fmtINR(w[item.key])}</p>
                <div className={`mt-2 h-2 overflow-hidden rounded-full ${t.track}`}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: t.c.gradient }}
                    initial={{ width: 0 }}
                    animate={{ width: `${share * 100}%` }}
                    transition={{ type: "spring", stiffness: 90, damping: 20 }}
                  />
                </div>
                <p className={`mt-1.5 text-xs tabular-nums ${t.muted}`}>{fmtPct(share)} of net worth</p>
              </li>
            );
          })}
        </ul>
      </Panel>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * 7. PAGE 2 — HEALTHCARE RISK ATLAS
 * ══════════════════════════════════════════════════════════════════════════ */

function HealthPage({ data, setHealth, setEvents, commit, goTo }) {
  const t = useT();
  const { age, health: h, wealth: w, events } = data;
  const [eventId, setEventId] = useState(null);
  const [yearsAhead, setYearsAhead] = useState(0);

  const covers = useMemo(() => coverScenarios(h), [h]);
  const anyCover = covers.some((item) => item.entered);
  const priced = events.filter((item) => item.cost > 0);
  const suggestions = useMemo(() => suggestionsFor(age, events), [age, events]);
  const inflate = Math.pow(1 + h.healthInflation / 100, yearsAhead);
  const cover = covers.find((item) => item.id === h.currentCover) || covers[0];
  const event = priced.find((item) => item.id === eventId) || priced[0] || null;
  const tick = { fill: t.c.tick, fontSize: 12 };
  const circumference = 2 * Math.PI * 66;

  const addEvent = (name, cost) => {
    const id = `event-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    setEvents((current) => [...current, { id, name, cost }]);
    setEventId(id);
    commit(`Added health event: ${name || "custom"}`);
  };
  const patchEvent = (id, patch) => setEvents((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const removeEvent = (item) => {
    setEvents((current) => current.filter((entry) => entry.id !== item.id));
    commit(`Removed health event: ${item.name || "custom"}`);
  };

  const bars = event
    ? covers.map((item) => ({
        id: item.id,
        name: item.name,
        premium: item.entered ? item.annualPremium : 0,
        oop: Math.round(outOfPocket(event.cost * inflate, item.entered ? item : { sumInsured: 0 }, h)),
      }))
    : [];

  const worst = priced.reduce((a, b) => (!a || b.cost > a.cost ? b : a), null);
  const worstCost = worst ? worst.cost * inflate : 0;
  const ratio = worst && cover.entered ? cover.sumInsured / worstCost : 0;
  const status = !worst || !anyCover ? "none" : ratio >= 0.9 ? "green" : ratio >= 0.4 ? "yellow" : "red";
  const verdict = {
    none: { color: t.c.off, chip: t.chip, label: "Waiting for your inputs", text: "Add a cover and at least one health event to see your adequacy." },
    red: { color: t.c.danger, chip: t.bad, label: "Under-insured", text: "Your costliest listed event would mostly come out of your savings." },
    yellow: { color: t.c.warn, chip: t.warn, label: "Partially covered", text: "Smaller bills are covered; your costliest listed event is not." },
    green: { color: t.c.gain, chip: t.good, label: "Well covered", text: "This cover absorbs the costliest event you listed." },
  }[status];
  const worstOop = worst ? outOfPocket(worstCost, cover.entered ? cover : { sumInsured: 0 }, h) : 0;
  const netWorth = netWorthOf(w);
  const yearsTo60 = Math.max(0, RETIREMENT_AGE - age - yearsAhead);
  const corpusHit = worstOop * Math.pow(1 + w.cagr / 100, yearsTo60);

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <PageHeader
        eyebrow="Healthcare risk atlas"
        title={`Where a hospital bill meets your balance sheet at ${age}`}
        description={`Built from the covers and health events you enter. Future costs grow at your ${h.healthInflation}% healthcare inflation.`}
      />

      {/* Health events: entered by the visitor */}
      <Panel lift={3}>
        <PanelTitle
          icon={HeartPulse}
          title={`Health Event Risk at Age ${age}`}
          subtitle="List the hospital events you want to plan for and what each would cost. Select one to load it into the chart."
          right={
            <motion.button
              type="button"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => addEvent("", 0)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${t.button}`}
            >
              <Plus size={16} aria-hidden="true" /> Add my own event
            </motion.button>
          }
        />

        {events.length === 0 && (
          <p className={`mb-4 rounded-2xl border p-4 text-sm leading-relaxed ${t.well} ${t.body}`}>
            You have not listed any health events yet. Add your own, or start from a suggestion for your age below.
          </p>
        )}

        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout" initial={false}>
            {events.map((item) => {
              const cost = item.cost * inflate;
              const pay = cover.entered ? outOfPocket(cost, cover, h) : cost;
              const selected = event && item.id === event.id;
              return (
                <motion.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 300, damping: 28 }}
                  whileHover={{ y: -4 }}
                  className={`rounded-2xl border p-4 ${selected ? t.accentSoft : t.inset}`}
                >
                  <div className="flex items-center gap-2">
                    <label htmlFor={`name-${item.id}`} className="sr-only">
                      Event name
                    </label>
                    <div className={`flex flex-1 items-center rounded-xl border px-3 ${t.field}`}>
                      <input
                        id={`name-${item.id}`}
                        type="text"
                        maxLength={60}
                        placeholder="Event name"
                        value={item.name}
                        onChange={(e) => patchEvent(item.id, { name: e.target.value })}
                        onBlur={() => commit(`Updated health event: ${item.name || "custom"}`)}
                        className="atlas-bare w-full bg-transparent py-2 text-sm font-semibold"
                      />
                    </div>
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => removeEvent(item)}
                      aria-label={`Remove ${item.name || "this event"}`}
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${t.button}`}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </motion.button>
                  </div>
                  <div className="mt-3">
                    <MoneyField
                      id={`cost-${item.id}`}
                      label="Cost today"
                      hint="Use a quote from your hospital if you have one"
                      value={item.cost}
                      onChange={(value) => patchEvent(item.id, { cost: value })}
                      onCommit={() => commit(`Updated cost of ${item.name || "custom event"}`)}
                    />
                  </div>
                  {item.cost > 0 && (
                    <>
                      <div className={`mt-2 h-2 overflow-hidden rounded-full ${t.track}`}>
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: t.c.danger }}
                          initial={false}
                          animate={{ width: `${Math.max(2, (pay / cost) * 100)}%` }}
                          transition={{ type: "spring", stiffness: 120, damping: 20 }}
                        />
                      </div>
                      <div className={`mt-2 flex items-center justify-between gap-2 text-xs ${t.muted}`}>
                        <span>
                          You pay{" "}
                          <strong className={`text-sm ${t.badText}`}>
                            <Counter value={pay} duration={0.8} />
                          </strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => setEventId(item.id)}
                          aria-pressed={!!selected}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${selected ? `${t.accentSoft} ${t.accentText}` : t.button}`}
                        >
                          {selected ? "Shown in chart" : "Show in chart"}
                        </button>
                      </div>
                    </>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>

        {suggestions.length > 0 && (
          <div className={`mt-5 border-t pt-4 ${t.divider}`}>
            <p className={`text-sm font-semibold ${t.heading}`}>Suggestions for age {age}</p>
            <p className={`mt-0.5 text-xs leading-relaxed ${t.muted}`}>
              These add an event with a rough private-hospital estimate as a starting point. Replace the amount with a figure for your city and hospital.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <AnimatePresence mode="popLayout" initial={false}>
                {suggestions.map((item) => (
                  <motion.button
                    key={item.name}
                    layout
                    type="button"
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    whileHover={{ y: -2, scale: 1.03 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => addEvent(item.name, item.estimate)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${t.chip}`}
                  >
                    <Plus size={13} aria-hidden="true" /> {item.name}
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </Panel>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" lift={3}>
          <PanelTitle
            icon={Activity}
            title="Estimated Out-of-Pocket Costs"
            subtitle={
              event
                ? `If “${event.name || "this event"}” happens ${yearsAhead === 0 ? "today" : `in ${yearsAhead} years`}: a bill of ${fmtINR(event.cost * inflate)}`
                : "Add a health event with a cost to compare your three cover scenarios."
            }
            right={
              <div className={`inline-flex rounded-xl border p-1 ${t.inset}`} role="group" aria-label="Projection horizon">
                {[0, 5, 10].map((years) => {
                  const selected = years === yearsAhead;
                  return (
                    <button
                      key={years}
                      type="button"
                      onClick={() => setYearsAhead(years)}
                      aria-pressed={selected}
                      className={`relative rounded-lg px-3 py-1.5 text-xs font-semibold ${selected ? t.onAccent : t.muted}`}
                    >
                      {selected && (
                        <motion.span layoutId="years-pill" className="absolute inset-0 rounded-lg" style={{ background: t.c.gradient }} transition={{ type: "spring", stiffness: 420, damping: 32 }} />
                      )}
                      <span className="relative">{years === 0 ? "Today" : `+${years} yrs`}</span>
                    </button>
                  );
                })}
              </div>
            }
          />
          {event ? (
            <>
              <div className="h-72 w-full" role="img" aria-label="Out-of-pocket cost by insurance cover">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bars} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={t.c.grid} vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={tick} />
                    <YAxis tickFormatter={fmtAxis} tickLine={false} axisLine={false} width={66} tick={tick} />
                    <Tooltip content={<ChartTooltip prefix="" />} cursor={{ fill: t.c.grid }} />
                    <Bar dataKey="premium" name="Yearly premium" stackId="a" fill={t.c.accent} maxBarSize={72} animationDuration={600}>
                      {bars.map((bar) => (
                        <Cell key={bar.id} fill={t.c.accent} fillOpacity={bar.id === cover.id ? 1 : 0.5} />
                      ))}
                    </Bar>
                    <Bar dataKey="oop" name="You pay from savings" stackId="a" fill={t.c.danger} radius={[10, 10, 0, 0]} maxBarSize={72} animationDuration={600}>
                      {bars.map((bar) => (
                        <Cell key={bar.id} fill={t.c.danger} fillOpacity={bar.id === cover.id ? 1 : 0.5} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <Legend
                items={[
                  { label: "Yearly premium", color: t.c.accent },
                  { label: "You pay from savings (co-pay, non-payables, amount above cover)", color: t.c.danger },
                ]}
              />
            </>
          ) : (
            <div className={`grid h-40 place-items-center rounded-2xl border border-dashed text-sm ${t.divider} ${t.muted}`}>No event with a cost yet</div>
          )}

          <p className={`mt-5 text-sm font-semibold ${t.heading}`}>Which cover do you hold today?</p>
          <div className="mt-2 grid gap-3 md:grid-cols-3">
            {covers.map((item) => {
              const selected = item.id === cover.id;
              return (
                <motion.button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setHealth({ currentCover: item.id });
                    commit(`Set current cover to ${item.name}`);
                  }}
                  aria-pressed={selected}
                  whileHover={{ y: -4 }}
                  whileTap={{ scale: 0.97 }}
                  className={`rounded-2xl border p-4 text-left ${selected ? t.accentSoft : t.inset}`}
                >
                  <span className={`flex items-start justify-between gap-2 text-sm font-semibold ${t.heading}`}>
                    {item.name}
                    {selected && <CheckCircle2 size={16} className={`shrink-0 ${t.accentText}`} aria-hidden="true" />}
                  </span>
                  <span className={`mt-1 block text-xs leading-snug ${t.muted}`}>{item.detail}</span>
                  <span className={`mt-3 block text-xs ${t.muted}`}>
                    {item.entered ? (
                      <>
                        Sum insured <strong className={`tabular-nums ${t.heading}`}>{fmtINR(item.sumInsured)}</strong>
                        {item.annualPremium > 0 && (
                          <>
                            {" "}
                            · premium <strong className={`tabular-nums ${t.heading}`}>{fmtINR(item.annualPremium)}</strong>
                          </>
                        )}
                      </>
                    ) : (
                      <span className={t.warnText}>Not entered yet</span>
                    )}
                  </span>
                </motion.button>
              );
            })}
          </div>
          {!anyCover && (
            <button type="button" onClick={() => goTo("numbers")} className={`mt-3 text-sm font-semibold underline underline-offset-4 ${t.accentText}`}>
              Enter my insurance details
            </button>
          )}
        </Panel>

        <Panel lift={3}>
          <PanelTitle icon={BrainCircuit} title="Health-to-Wealth Indicator" />
          <div className="flex flex-col items-center text-center">
            <div className="relative grid h-44 w-44 place-items-center">
              <svg viewBox="0 0 160 160" className="absolute inset-0 -rotate-90" aria-hidden="true">
                <circle cx="80" cy="80" r="66" fill="none" stroke={t.c.ringTrack} strokeWidth="12" />
                <motion.circle
                  cx="80"
                  cy="80"
                  r="66"
                  fill="none"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  initial={{ strokeDashoffset: circumference, stroke: verdict.color }}
                  animate={{ strokeDashoffset: circumference * (1 - Math.min(1, ratio)), stroke: verdict.color }}
                  transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                />
              </svg>
              <motion.span
                aria-hidden="true"
                className="absolute inset-3 rounded-full border-2"
                animate={{ borderColor: verdict.color, opacity: [0.15, 0.5, 0.15], scale: [0.96, 1, 0.96] }}
                transition={{ duration: 2.4, repeat: Infinity }}
              />
              <div className="relative">
                <p className={`text-4xl font-semibold tracking-tight ${t.heading}`}>
                  <Counter value={Math.min(1, ratio)} format={(v) => fmtPct(v)} />
                </p>
                <p className={`text-xs ${t.muted}`}>coverage adequacy</p>
              </div>
            </div>
            <div aria-live="polite">
              <AnimatePresence mode="wait">
                <motion.div key={status} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                  <p className={`mt-4 inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${verdict.chip}`}>{verdict.label}</p>
                  <p className={`mt-2 text-sm leading-snug ${t.muted}`}>{verdict.text}</p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
          {worst && (
            <dl className={`mt-5 space-y-2 rounded-2xl border p-4 text-sm ${t.well}`}>
              <div className="flex justify-between gap-3">
                <dt className={t.muted}>Sum insured ({cover.name})</dt>
                <dd className={`font-semibold tabular-nums ${t.heading}`}>{fmtINR(cover.entered ? cover.sumInsured : 0)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className={t.muted}>Costliest event ({worst.name || "unnamed"})</dt>
                <dd className={`font-semibold tabular-nums ${t.heading}`}>{fmtINR(worstCost)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className={t.muted}>You would pay</dt>
                <dd className={`font-semibold tabular-nums ${t.badText}`}>{fmtINR(worstOop)}</dd>
              </div>
              {netWorth > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className={t.muted}>As a share of your net worth</dt>
                  <dd className={`font-semibold tabular-nums ${t.heading}`}>{fmtPct(worstOop / netWorth)}</dd>
                </div>
              )}
              {yearsTo60 > 0 && worstOop > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className={t.muted}>Cost to your age-60 corpus</dt>
                  <dd className={`font-semibold tabular-nums ${t.heading}`}>
                    <Counter value={corpusHit} />
                  </dd>
                </div>
              )}
            </dl>
          )}
          <p className={`mt-4 text-xs leading-relaxed ${t.muted}`}>
            Adequacy is your sum insured divided by the costliest event you listed. Green is 90% or more, yellow is 40–90%, red is below 40%.
          </p>
        </Panel>
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * 8. PAGE 3 — DATA PRIVACY & GOVERNANCE VAULT
 *    Everything here is real: it governs the visitor's own entries on this device.
 * ══════════════════════════════════════════════════════════════════════════ */

const CATEGORIES = [
  { id: "wealth", icon: Wallet, title: "Income, assets and SIP", detail: "Monthly income and expenses, the four asset fields, SIP, and growth assumptions" },
  { id: "health", icon: ShieldCheck, title: "Insurance and medical spend", detail: "Sum insured, premiums, co-pay, non-payables, and yearly medical spend" },
  { id: "events", icon: HeartPulse, title: "Health events list", detail: "The hospital events you listed and the cost you entered for each" },
];

function GovernancePage({ data, storedBytes, onConsent, onExport, onImport, onErase }) {
  const t = useT();
  const fileRef = useRef(null);
  const [confirmErase, setConfirmErase] = useState(false);
  const saved = CATEGORIES.filter((item) => data.consent[item.id]);
  const flowing = saved.length > 0;
  const pipeline = [
    { id: "you", icon: Keyboard, title: "You", subtitle: "Type your figures", live: true },
    { id: "browser", icon: HardDrive, title: "This browser", subtitle: "Saved in localStorage", live: flowing },
    { id: "engine", icon: BrainCircuit, title: "Forecast engine", subtitle: "Runs on this page", live: true },
    { id: "server", icon: CloudOff, title: "Any server", subtitle: "Never sent", live: false, blocked: true },
  ];

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <PageHeader
        eyebrow="Data governance"
        title="Trust & Consent Vault"
        description="Your figures never leave this device. This page shows what is saved in your browser, lets you withdraw consent for each category, and keeps a log of every change."
        pulse={false}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard color={t.c.gain} icon={ShieldCheck} label="Sent to a Server" value={0} format={(v) => `${fmtInt(v)} bytes`} caption="This site has no backend and no analytics" />
        <KpiCard color={t.c.accent} icon={Lock} label="Categories Saved Here" value={saved.length} format={(v) => `${fmtInt(v)} of ${CATEGORIES.length}`} caption="Categories you allow this browser to remember" />
        <KpiCard color={t.c.violet} icon={Database} label="Stored on This Device" value={storedBytes} format={fmtBytes} caption="Size of your saved profile in localStorage" />
      </div>

      <Panel className="mt-4" lift={3}>
        <PanelTitle
          icon={Radio}
          title="Where Your Data Goes"
          subtitle="The complete path your figures take. There is no fourth hop."
          right={<LivePulse label={flowing ? "Saving on this device" : "Session only"} color={flowing ? t.c.gain : t.c.warn} />}
        />
        <ol className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-center">
          {pipeline.map((node, index) => {
            const Icon = node.icon;
            const next = pipeline[index + 1];
            const connectorLive = next && next.live && !next.blocked && node.live;
            return (
              <React.Fragment key={node.id}>
                <motion.li
                  whileHover={{ y: -4 }}
                  className={`flex flex-1 items-center gap-3 rounded-2xl border p-4 ${node.blocked ? `border-dashed ${t.divider}` : t.inset}`}
                >
                  <motion.span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${node.blocked ? t.bad : t.iconTile}`}
                    animate={node.live && !node.blocked ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                    transition={{ duration: 2, repeat: node.live && !node.blocked ? Infinity : 0, delay: index * 0.5 }}
                  >
                    <Icon size={18} aria-hidden="true" />
                  </motion.span>
                  <span>
                    <span className={`block text-sm font-semibold ${t.heading}`}>{node.title}</span>
                    <span className={`block text-xs ${node.blocked ? t.badText : t.muted}`}>{node.subtitle}</span>
                  </span>
                </motion.li>
                {next && (
                  <li aria-hidden="true" className={`relative mx-auto h-8 w-0.5 overflow-hidden lg:mx-0 lg:h-0.5 lg:w-12 ${t.track}`}>
                    {connectorLive && (
                      <motion.span
                        className="absolute h-2 w-2 rounded-full"
                        style={{ background: t.c.accent, marginLeft: -3, marginTop: -3 }}
                        animate={{ top: ["0%", "100%"], left: ["0%", "100%"], opacity: [0, 1, 0] }}
                        transition={{ duration: 1.3, repeat: Infinity, delay: index * 0.35, ease: "linear" }}
                      />
                    )}
                  </li>
                )}
              </React.Fragment>
            );
          })}
        </ol>
        <p className={`mt-4 text-xs leading-relaxed ${t.muted}`}>
          This site does not connect to the Account Aggregator network, ABDM, or any bank or insurer. Linking real accounts would need a licensed backend, so figures are entered by hand
          instead.
        </p>
      </Panel>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" lift={3}>
          <PanelTitle
            icon={Lock}
            title="Consent Ledger"
            subtitle="Turn a category off to revoke this browser's permission to remember it. It is removed from storage at once and kept only until you close the tab."
          />
          <ul className="space-y-3">
            {CATEGORIES.map((item) => {
              const Icon = item.icon;
              const isOn = data.consent[item.id];
              return (
                <motion.li key={item.id} layout className={`flex items-center gap-3 rounded-2xl border p-4 ${t.inset}`}>
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${isOn ? t.iconTile : t.chip}`}>
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold ${t.heading}`}>{item.title}</p>
                    <p className={`mt-0.5 text-xs leading-snug ${t.muted}`}>{item.detail}</p>
                  </div>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={isOn ? "on" : "off"}
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      transition={{ duration: 0.15 }}
                      className={`hidden rounded-full border px-2.5 py-0.5 text-xs font-semibold sm:inline ${isOn ? t.good : t.bad}`}
                    >
                      {isOn ? "Saved on device" : "Access revoked"}
                    </motion.span>
                  </AnimatePresence>
                  <Switch checked={isOn} onToggle={() => onConsent(item)} label={`${isOn ? "Revoke" : "Allow"} saving of ${item.title}`} />
                </motion.li>
              );
            })}
          </ul>

          <div className={`mt-5 flex flex-wrap items-center gap-3 border-t pt-5 ${t.divider}`}>
            <motion.button type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} onClick={onExport} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${t.button}`}>
              <Download size={16} aria-hidden="true" /> Download my data
            </motion.button>
            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => fileRef.current && fileRef.current.click()}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${t.button}`}
            >
              <Upload size={16} aria-hidden="true" /> Restore from file
            </motion.button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Choose a FinHealth Atlas data file"
              onChange={(event) => {
                const file = event.target.files && event.target.files[0];
                if (file) onImport(file);
                event.target.value = "";
              }}
            />
            <div className="ml-auto flex items-center gap-2">
              <AnimatePresence mode="wait" initial={false}>
                {confirmErase ? (
                  <motion.div key="confirm" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} className="flex items-center gap-2">
                    <span className={`text-sm ${t.body}`}>Erase everything? This cannot be undone.</span>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmErase(false);
                        onErase();
                      }}
                      className={`rounded-xl border px-3 py-2 text-sm font-semibold ${t.dangerButton}`}
                    >
                      Yes, erase
                    </button>
                    <button type="button" onClick={() => setConfirmErase(false)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${t.button}`}>
                      Keep
                    </button>
                  </motion.div>
                ) : (
                  <motion.button
                    key="erase"
                    type="button"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setConfirmErase(true)}
                    className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${t.dangerButton}`}
                  >
                    <Trash2 size={16} aria-hidden="true" /> Erase all my data
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>
        </Panel>

        <Panel lift={3}>
          <PanelTitle icon={Activity} title="Activity Log" subtitle="A record of what you changed, kept on this device." />
          {data.log.length === 0 ? (
            <p className={`rounded-2xl border p-4 text-sm ${t.well} ${t.muted}`}>Nothing yet. Entries appear as you add or change your numbers.</p>
          ) : (
            <ul className="space-y-2 text-xs">
              <AnimatePresence initial={false}>
                {data.log.slice(0, 9).map((entry) => (
                  <motion.li
                    key={entry.id}
                    layout
                    initial={{ opacity: 0, x: 24, height: 0 }}
                    animate={{ opacity: 1, x: 0, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className={`rounded-lg px-3 py-2 ${t.logRow}`}>
                      <p className={`font-medium ${entry.kind === "revoke" || entry.kind === "erase" ? t.badText : entry.kind === "grant" ? t.goodText : t.body}`}>{entry.text}</p>
                      <p className={`mt-0.5 font-mono tabular-nums ${t.muted}`}>
                        {new Date(entry.time).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </p>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </Panel>
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * 9. GUIDED ONBOARDING TOUR
 *    A spotlight ring is drawn around the target; everything outside it is
 *    dimmed by the ring's own shadow, so the highlighted element stays crisp.
 * ══════════════════════════════════════════════════════════════════════════ */

function tourSteps(hasWealth) {
  return [
    {
      target: "age",
      tab: null,
      icon: Users,
      title: "Start with your age",
      body: "Drag the Age Slider anywhere from 20 to 70. Your years to retirement, the projections, and the health suggestions all follow it.",
    },
    hasWealth
      ? {
          target: "chart",
          tab: "wealth",
          icon: TrendingUp,
          title: "Read the wealth chart",
          body: "The stacked area is your corpus: what you invested plus market gains. The dashed lines are what living, education, and healthcare will cost over the same years.",
        }
      : {
          target: "numbers",
          tab: "numbers",
          icon: TrendingUp,
          title: "Your numbers build the wealth chart",
          body: "There is no sample data here. Enter your assets and monthly SIP, and the Wealth Trajectory chart is drawn from them: your corpus against living, education, and healthcare costs.",
        },
    {
      target: "governance",
      tab: null,
      icon: ShieldCheck,
      title: "You control your data",
      body: "Everything you type stays in this browser. The Data Governance tab lets you revoke saving for any category, download your data, or erase it.",
    },
  ];
}

function useTargetRect(target) {
  const [rect, setRect] = useState(null);
  useEffect(() => {
    let frame;
    let last = "";
    const find = () => Array.from(document.querySelectorAll(`[data-tour="${target}"]`)).find((el) => el.getBoundingClientRect().width > 0);
    const scrollTimer = setTimeout(() => {
      const first = find();
      if (first && first.scrollIntoView) first.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 350);
    const measure = () => {
      const el = find();
      if (el) {
        const box = el.getBoundingClientRect();
        const key = [box.top, box.left, box.width, box.height].map(Math.round).join(",");
        if (key !== last) {
          last = key;
          setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
        }
      }
      frame = requestAnimationFrame(measure);
    };
    frame = requestAnimationFrame(measure);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(scrollTimer);
    };
  }, [target]);
  return rect;
}

function OnboardingTour({ steps, step, onNext, onBack, onSkip }) {
  const t = useT();
  const config = steps[step];
  const rect = useTargetRect(config.target);
  const nextRef = useRef(null);
  const isLast = step === steps.length - 1;
  const Icon = config.icon;

  useEffect(() => {
    if (nextRef.current) nextRef.current.focus({ preventScroll: true });
  }, [step]);
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onSkip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);

  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const cardWidth = Math.min(380, vw - 32);
  const pad = 8;
  let cardStyle = { left: (vw - cardWidth) / 2, top: vh / 2 - 140 };
  let ring = null;
  if (rect) {
    // Keep the ring inside the viewport even when the target is taller than the screen.
    const top = Math.max(rect.top - pad, 8);
    const bottom = Math.min(rect.top + rect.height + pad, vh - 8);
    ring = { top, left: Math.max(rect.left - pad, 8), width: Math.min(rect.width + pad * 2, vw - 16), height: Math.max(40, bottom - top) };
    const left = clamp(rect.left + rect.width / 2 - cardWidth / 2, 16, vw - cardWidth - 16);
    if (vh - bottom > 290) cardStyle = { left, top: bottom + 14 };
    else if (top > 290) cardStyle = { left, bottom: vh - top + 14 };
    else cardStyle = { left, bottom: 16 };
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0" aria-hidden="true" />
      {ring ? (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-3xl"
          initial={false}
          animate={ring}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
          style={{ boxShadow: `0 0 0 3px ${t.c.accent}, 0 0 0 9999px rgba(2,6,23,0.62)` }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: "rgba(2,6,23,0.62)" }} aria-hidden="true" />
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-title"
          aria-describedby="tour-body"
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className={`fixed rounded-3xl border p-5 shadow-2xl ${t.tourCard}`}
          style={{ ...cardStyle, width: cardWidth }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className={`grid h-10 w-10 place-items-center rounded-2xl ${t.iconTile}`}>
              <Icon size={18} aria-hidden="true" />
            </span>
            <span className={`text-xs font-semibold ${t.muted}`}>
              Step {step + 1} of {steps.length}
            </span>
          </div>
          <h2 id="tour-title" className={`mt-4 text-lg font-semibold tracking-tight ${t.heading}`}>
            {config.title}
          </h2>
          <p id="tour-body" className={`mt-2 text-sm leading-relaxed ${t.body}`}>
            {config.body}
          </p>
          <div className="mt-4 flex gap-1.5" aria-hidden="true">
            {steps.map((item, index) => (
              <motion.span key={item.target} className="h-1.5 rounded-full" animate={{ width: index === step ? 28 : 8, backgroundColor: index <= step ? t.c.accent : t.c.off }} />
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between gap-3">
            <button type="button" onClick={onSkip} className={`rounded-xl px-3 py-2 text-sm font-semibold underline-offset-4 hover:underline ${t.muted}`}>
              Skip Tour
            </button>
            <div className="flex gap-2">
              {step > 0 && (
                <motion.button type="button" whileTap={{ scale: 0.96 }} onClick={onBack} className={`rounded-xl border px-4 py-2 text-sm font-semibold ${t.button}`}>
                  Back
                </motion.button>
              )}
              <motion.button
                ref={nextRef}
                type="button"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={onNext}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${t.onAccent}`}
                style={{ background: t.c.gradient }}
              >
                {isLast ? "Finish" : "Next"}
                <ArrowRight size={15} aria-hidden="true" />
              </motion.button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * 10. APP SHELL
 * ══════════════════════════════════════════════════════════════════════════ */

const TABS = [
  { id: "numbers", label: "My Numbers", icon: ClipboardList },
  { id: "wealth", label: "Wealth Trajectory", icon: TrendingUp },
  { id: "health", label: "Healthcare Risk Atlas", icon: HeartPulse },
  { id: "governance", label: "Data Governance", icon: ShieldCheck },
];

let logSeq = 0;
const logEntry = (kind, text) => ({ id: `log-${Date.now()}-${(logSeq += 1)}`, kind, text, time: new Date().toISOString() });

function systemMode() {
  if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}

export default function App() {
  const [data, setData] = useState(loadProfile);
  const [tab, setTab] = useState(() => (netWorthOf(data.wealth) > 0 || data.wealth.monthlySip > 0 ? "wealth" : "numbers"));
  const [tourStep, setTourStep] = useState(() => (data.tourDone ? null : 0));
  const [storedBytes, setStoredBytes] = useState(0);
  const [notice, setNotice] = useState(null);

  const mode = data.theme || systemMode();
  const t = MODES[mode];
  const hasWealth = netWorthOf(data.wealth) > 0 || data.wealth.monthlySip > 0;
  const steps = useMemo(() => tourSteps(hasWealth), [hasWealth]);

  /* Persist on every change; only consented categories are written */
  useEffect(() => {
    setStoredBytes(saveProfile(data));
  }, [data]);

  const patch = (section) => (changes) => setData((current) => ({ ...current, [section]: { ...current[section], ...changes } }));
  const setWealth = patch("wealth");
  const setHealth = patch("health");
  const setEvents = (updater) => setData((current) => ({ ...current, events: typeof updater === "function" ? updater(current.events) : updater }));
  const pushLog = (kind, text) =>
    setData((current) => {
      if (current.log[0] && current.log[0].text === text && Date.now() - new Date(current.log[0].time).getTime() < 4000) return current;
      return { ...current, log: [logEntry(kind, text), ...current.log].slice(0, 40) };
    });
  const commit = (text) => pushLog("save", text);
  const flash = (text) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 3200);
  };

  const toggleMode = () => setData((current) => ({ ...current, theme: mode === "dark" ? "light" : "dark" }));

  /* Vault actions */
  const onConsent = (item) => {
    const next = !data.consent[item.id];
    setData((current) => ({ ...current, consent: { ...current.consent, [item.id]: next } }));
    pushLog(next ? "grant" : "revoke", next ? `Consent granted: save ${item.title.toLowerCase()} on this device` : `Access revoked: ${item.title.toLowerCase()} removed from device storage`);
  };
  const onExport = () => {
    const blob = new Blob([JSON.stringify(toStored({ ...data, consent: { wealth: true, health: true, events: true } }), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "finhealth-atlas-my-data.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    pushLog("export", "Downloaded a copy of my data");
  };
  const onImport = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || typeof parsed !== "object" || !parsed.wealth) throw new Error("not a profile");
        const next = sanitize(parsed);
        setData({ ...next, tourDone: true, theme: data.theme, log: [logEntry("import", `Restored my data from ${file.name.slice(0, 60)}`), ...data.log].slice(0, 40) });
        flash("Your data was restored from the file.");
      } catch (error) {
        flash("That file is not a FinHealth Atlas data file. Nothing was changed.");
      }
    };
    reader.readAsText(file);
  };
  const onErase = () => {
    setData({ ...sanitize(null), age: data.age, theme: data.theme, tourDone: true, log: [logEntry("erase", "Erased all my data from this device")] });
    flash("All your data was erased from this device.");
  };

  /* Tour controls */
  const goToStep = (index) => {
    const step = steps[index];
    if (step.tab) setTab(step.tab);
    setTourStep(index);
  };
  const endTour = () => {
    setTourStep(null);
    setData((current) => ({ ...current, tourDone: true }));
  };
  const nextStep = () => (tourStep >= steps.length - 1 ? endTour() : goToStep(tourStep + 1));

  const navButton = (item, variant) => {
    const selected = item.id === tab;
    const Icon = item.icon;
    const tour = item.id === "governance" ? "governance" : undefined;
    if (variant === "side") {
      return (
        <motion.button
          key={item.id}
          type="button"
          data-tour={tour}
          onClick={() => setTab(item.id)}
          aria-current={selected ? "page" : undefined}
          whileHover={{ x: 4 }}
          whileTap={{ scale: 0.97 }}
          className={`relative flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold ${selected ? t.accentText : t.muted}`}
        >
          {selected && <motion.span layoutId="nav-active" className={`absolute inset-0 rounded-2xl border ${t.accentSoft}`} transition={{ type: "spring", stiffness: 360, damping: 30 }} />}
          <Icon size={18} className="relative" aria-hidden="true" />
          <span className="relative">{item.label}</span>
        </motion.button>
      );
    }
    return (
      <button
        key={item.id}
        type="button"
        data-tour={tour}
        onClick={() => setTab(item.id)}
        aria-current={selected ? "page" : undefined}
        className={`relative flex shrink-0 items-center gap-2 px-3 py-3 text-sm font-semibold ${selected ? t.accentText : t.muted}`}
      >
        <Icon size={16} aria-hidden="true" />
        {item.label}
        {selected && <motion.span layoutId="nav-underline" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full" style={{ background: t.c.accent }} />}
      </button>
    );
  };

  return (
    <ThemeContext.Provider value={t}>
      <MotionConfig reducedMotion="user">
        <style>{`
          .atlas-root { font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
          .atlas-root :focus-visible { outline: 2px solid ${t.c.accent}; outline-offset: 3px; border-radius: 12px; }
          .atlas-root .atlas-bare, .atlas-root .atlas-bare:focus-visible { outline: none; }
          .atlas-root input[type=number]::-webkit-inner-spin-button { opacity: .6; }
          .atlas-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; height: 22px; width: 22px; border-radius: 9999px; background: var(--thumb); border: 3px solid currentColor; box-shadow: 0 2px 8px rgba(2,6,23,.35); transition: transform .15s ease; }
          .atlas-range::-webkit-slider-thumb:hover { transform: scale(1.18); }
          .atlas-range::-webkit-slider-thumb:active { transform: scale(1.3); }
          .atlas-range::-moz-range-thumb { height: 18px; width: 18px; border-radius: 9999px; background: var(--thumb); border: 3px solid currentColor; box-shadow: 0 2px 8px rgba(2,6,23,.35); }
        `}</style>

        <div className={`atlas-root relative min-h-screen antialiased transition-colors duration-300 ${t.page}`}>
          {mode === "dark" && (
            <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
              <motion.div
                className="absolute -left-40 -top-40 h-[30rem] w-[30rem] rounded-full bg-cyan-500 blur-[130px]"
                animate={{ x: [0, 50, 0], y: [0, 30, 0], opacity: [0.1, 0.16, 0.1] }}
                transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                className="absolute -bottom-52 right-0 h-[30rem] w-[30rem] rounded-full bg-violet-500 blur-[140px]"
                animate={{ x: [0, -40, 0], opacity: [0.08, 0.14, 0.08] }}
                transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          )}

          <div className="relative flex min-h-screen">
            <motion.aside
              initial={{ x: -60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className={`sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r p-5 lg:flex ${t.sidebar}`}
            >
              <div className="flex items-center gap-3">
                <span className={`grid h-11 w-11 place-items-center rounded-2xl ${t.onAccent}`} style={{ background: t.c.gradient }}>
                  <HeartPulse size={22} aria-hidden="true" />
                </span>
                <div>
                  <p className={`text-base font-semibold tracking-tight ${t.heading}`}>FinHealth Atlas</p>
                  <p className={`text-xs ${t.muted}`}>Wealth & Healthcare Forecaster</p>
                </div>
              </div>
              <nav className="mt-10 space-y-1.5" aria-label="Primary">
                {TABS.map((item) => navButton(item, "side"))}
              </nav>
              <div className={`mt-auto rounded-2xl border p-4 ${t.inset}`}>
                <LivePulse />
                <p className={`mt-3 text-sm font-semibold ${t.heading}`}>Planning for age {data.age}</p>
                <p className={`text-xs ${t.muted}`}>{lifeStage(data.age)} · your data stays on this device</p>
                <button type="button" onClick={() => goToStep(0)} className={`mt-3 inline-flex items-center gap-2 text-xs font-semibold underline-offset-4 hover:underline ${t.accentText}`}>
                  <CircleHelp size={14} aria-hidden="true" /> Replay the tour
                </button>
              </div>
            </motion.aside>

            <div className="flex min-w-0 flex-1 flex-col">
              <motion.header
                initial={{ y: -30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className={`sticky top-0 z-20 border-b ${t.header}`}
              >
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-8">
                  <div className="flex items-center gap-3 lg:hidden">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${t.onAccent}`} style={{ background: t.c.gradient }}>
                      <HeartPulse size={18} aria-hidden="true" />
                    </span>
                    <h1 className={`text-base font-semibold ${t.heading}`}>FinHealth Atlas</h1>
                  </div>

                  <div data-tour="age" className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
                    <RangeInput
                      id="age"
                      big
                      label={`Your age · ${lifeStage(data.age)}`}
                      min={20}
                      max={70}
                      step={1}
                      value={data.age}
                      format={(v) => `${v} yrs`}
                      valueText={`${data.age} years, ${lifeStage(data.age)}`}
                      onChange={(value) => setData((current) => ({ ...current, age: value }))}
                      onCommit={() => commit(`Set age to ${data.age}`)}
                    />
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    <motion.button
                      type="button"
                      onClick={() => goToStep(0)}
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.92 }}
                      aria-label="Replay the guided tour"
                      className={`grid h-10 w-10 place-items-center rounded-xl border lg:hidden ${t.button}`}
                    >
                      <CircleHelp size={18} aria-hidden="true" />
                    </motion.button>
                    <motion.button
                      type="button"
                      onClick={toggleMode}
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.9, rotate: 20 }}
                      aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                      className={`grid h-10 w-10 place-items-center overflow-hidden rounded-xl border ${t.button}`}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span key={mode} initial={{ y: 16, opacity: 0, rotate: -60 }} animate={{ y: 0, opacity: 1, rotate: 0 }} exit={{ y: -16, opacity: 0, rotate: 60 }} transition={{ duration: 0.2 }}>
                          {mode === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
                        </motion.span>
                      </AnimatePresence>
                    </motion.button>
                  </div>
                </div>
                <nav className={`flex overflow-x-auto border-t px-2 lg:hidden ${t.divider}`} aria-label="Primary">
                  {TABS.map((item) => navButton(item, "top"))}
                </nav>
              </motion.header>

              <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-8 sm:py-8">
                <AnimatePresence mode="wait">
                  <motion.div key={tab} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
                    {tab === "numbers" && <NumbersPage data={data} setWealth={setWealth} setHealth={setHealth} commit={commit} goTo={setTab} />}
                    {tab === "wealth" && <WealthPage data={data} setWealth={setWealth} commit={commit} goTo={setTab} />}
                    {tab === "health" && <HealthPage data={data} setHealth={setHealth} setEvents={setEvents} commit={commit} goTo={setTab} />}
                    {tab === "governance" && (
                      <GovernancePage data={data} storedBytes={storedBytes} onConsent={onConsent} onExport={onExport} onImport={onImport} onErase={onErase} />
                    )}
                  </motion.div>
                </AnimatePresence>
              </main>

              <footer className={`border-t px-4 py-4 text-xs leading-relaxed sm:px-8 ${t.muted} ${t.divider}`}>
                FinHealth Atlas is a planning calculator. Results depend entirely on the figures and assumptions you enter. It is not financial, medical, or insurance advice.
              </footer>
            </div>
          </div>

          {/* Status messages */}
          <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
            <AnimatePresence>
              {notice && (
                <motion.p
                  key={notice}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10 }}
                  className={`rounded-2xl border px-4 py-3 text-sm font-semibold shadow-2xl ${t.tourCard}`}
                >
                  {notice}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {tourStep !== null && (
              <motion.div key="tour" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <OnboardingTour steps={steps} step={tourStep} onNext={nextStep} onBack={() => goToStep(tourStep - 1)} onSkip={endTour} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </MotionConfig>
    </ThemeContext.Provider>
  );
}
