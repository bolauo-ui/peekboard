import { useState } from 'react';
import { X, Linkedin, Loader2, AlertCircle, TrendingUp, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';
import { analyseApi, type LinkedInScore } from '@/lib/api';

const ELSEWHEN_CONTEXT = `Company: Elsewhen
What we do: Agentic AI consultancy that helps large enterprises move from AI pilots to production systems at scale.
Target audience: Senior enterprise decision-makers — CTOs, VPs of Strategy, Heads of Product/Design/Engineering at companies with $1B+ revenue (clients include Google, Spotify, Mastercard, WPP).
Brand aesthetic: Clean, minimal, modern. Professional but human. We frequently use bespoke illustrations and abstract digital art as part of our visual identity — this is intentional and should never be penalised.
Content types we post: Client case studies, thought leadership on agentic AI trends, webinar/event promotions, team culture and hiring, partnership announcements.
Tone: Outcome-focused, credible, accessible — we explain complex AI transformation in plain language. Not salesy, not jargon-heavy.
What performs well for us: ROI-led case studies, contrarian takes on AI adoption, recognisable client logos, specific outcome stats.`;

interface Props {
  onClose: () => void;
  getSnapshot: () => string | null;
}

const GRADE_COLOR: Record<string, { text: string; ring: string; bg: string }> = {
  A: { text: '#34d399', ring: '#34d399', bg: 'rgba(52,211,153,0.1)' },
  B: { text: '#60a5fa', ring: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
  C: { text: '#fbbf24', ring: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
  D: { text: '#f97316', ring: '#f97316', bg: 'rgba(249,115,22,0.1)' },
  F: { text: '#f05252', ring: '#f05252', bg: 'rgba(240,82,82,0.1)' },
};

const STYLE_LABEL: Record<string, string> = {
  photograph:    '📷 Photograph',
  illustration:  '🎨 Illustration',
  data_graphic:  '📊 Data / Text',
  mixed:         '🖼 Mixed',
};

const CONTENT_LABEL: Record<string, string> = {
  case_study:         '📁 Case Study',
  thought_leadership: '💡 Thought Leadership',
  event_promotion:    '📅 Event / Webinar',
  culture:            '🤝 Team / Culture',
  product:            '🚀 Product',
  other:              '📝 Other',
};

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const colors = GRADE_COLOR[grade] ?? GRADE_COLOR['C'];
  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width="92" height="92" viewBox="0 0 92 92">
        <circle cx="46" cy="46" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" />
        <circle cx="46" cy="46" r={r} fill="none" stroke={colors.ring} strokeWidth="8"
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 46 46)"
          style={{ transition: 'stroke-dasharray 0.8s ease' }} />
        <text x="46" y="43" textAnchor="middle" fill={colors.text} fontSize="18" fontWeight="700"
          fontFamily="-apple-system, BlinkMacSystemFont, 'Inter', sans-serif">{score}</text>
        <text x="46" y="58" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="10"
          fontFamily="-apple-system, BlinkMacSystemFont, 'Inter', sans-serif">/100</text>
      </svg>
      <span className="text-xs font-bold px-2 py-0.5 rounded"
        style={{ background: colors.bg, color: colors.text }}>Grade {grade}</span>
    </div>
  );
}

function CategoryBar({ name, score, max, benchmark, note }: {
  name: string; score: number; max: number; benchmark: string; note: string;
}) {
  const [open, setOpen] = useState(false);
  const pct = Math.round((score / max) * 100);
  const color = pct >= 80 ? '#34d399' : pct >= 55 ? '#fbbf24' : '#f05252';
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}>
        <span className="text-[12px] font-medium flex items-center gap-1"
          style={{ color: 'rgba(255,255,255,0.85)' }}>
          {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          {name}
        </span>
        <span className="text-[11px] font-semibold" style={{ color }}>{score}/{max}</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-1.5 rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }} />
      </div>
      {open && (
        <div className="mt-2 space-y-1.5 pl-3">
          <p className="text-[10px] leading-relaxed italic" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {benchmark}
          </p>
          <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {note}
          </p>
        </div>
      )}
    </div>
  );
}

export default function LinkedInScorePanel({ onClose, getSnapshot }: Props) {
  const [state, setState] = useState<'idle' | 'context' | 'loading' | 'done' | 'error'>('idle');
  const [context, setContext] = useState(ELSEWHEN_CONTEXT);
  const [result, setResult] = useState<LinkedInScore | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const runAnalysis = async () => {
    const snap = getSnapshot();
    if (!snap) { setErrorMsg('Could not capture canvas. Add some content first.'); setState('error'); return; }
    setState('loading');
    try {
      const score = await analyseApi.linkedin(snap, context);
      setResult(score);
      setState('done');
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.error || 'Analysis failed. Check ANTHROPIC_API_KEY is set in Railway.');
      setState('error');
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-sidebar)', borderLeft: '1px solid var(--border)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <Linkedin size={14} style={{ color: '#0a66c2' }} />
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>LinkedIn Score</span>
        </div>
        <div className="flex items-center gap-1">
          {(state === 'done' || state === 'error') && (
            <button onClick={() => setState('idle')}
              className="text-[11px] px-2 py-0.5 rounded transition-colors"
              style={{ color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}>
              New
            </button>
          )}
          <button onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Idle: intro + brand context ── */}
        {state === 'idle' && (
          <div className="px-4 py-4 flex flex-col gap-4">
            <div className="flex flex-col items-center text-center gap-3 pt-2">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(10,102,194,0.15)' }}>
                <TrendingUp size={20} style={{ color: '#0a66c2' }} />
              </div>
              <div>
                <p className="text-[13px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                  Analyse for LinkedIn
                </p>
                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Score your creative against enterprise B2B benchmarks, tailored to your brand context.
                </p>
              </div>
            </div>

            {/* Brand context editor */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: 'rgba(255,255,255,0.3)' }}>Brand Context</span>
                <button onClick={() => setContext(ELSEWHEN_CONTEXT)}
                  className="text-[10px]" style={{ color: '#60a5fa' }}>Reset</button>
              </div>
              <textarea
                value={context}
                onChange={e => setContext(e.target.value)}
                rows={7}
                className="w-full text-[11px] leading-relaxed rounded-lg px-3 py-2.5 resize-none outline-none"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.75)',
                }}
                placeholder="Describe your brand, audience and content style…"
              />
              <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Edit to customise for any client or campaign.
              </p>
            </div>

            <button onClick={runAnalysis}
              className="w-full py-2 rounded-lg text-[13px] font-semibold text-white transition-colors"
              style={{ background: '#0a66c2' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#004182')}
              onMouseLeave={e => (e.currentTarget.style.background = '#0a66c2')}>
              Run Analysis
            </button>
            <p className="text-[10px] text-center" style={{ color: 'rgba(255,255,255,0.2)' }}>
              Powered by Claude AI · ~5 seconds
            </p>
          </div>
        )}

        {/* ── Loading ── */}
        {state === 'loading' && (
          <div className="flex flex-col items-center justify-center gap-3 pt-16 px-4">
            <Loader2 size={28} className="animate-spin" style={{ color: '#0a66c2' }} />
            <p className="text-[12px] text-center" style={{ color: 'var(--text-secondary)' }}>
              Analysing your creative against enterprise LinkedIn benchmarks…
            </p>
          </div>
        )}

        {/* ── Error ── */}
        {state === 'error' && (
          <div className="flex flex-col items-center gap-3 px-4 pt-6">
            <div className="flex items-start gap-2 text-[12px] px-3 py-2 rounded-lg w-full"
              style={{ background: 'rgba(240,82,82,0.1)', color: '#f05252', border: '1px solid rgba(240,82,82,0.2)' }}>
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setState('idle')} className="text-[12px] underline"
              style={{ color: 'var(--text-secondary)' }}>Try again</button>
          </div>
        )}

        {/* ── Results ── */}
        {state === 'done' && result && (
          <div className="px-4 py-4 space-y-5">
            {/* Score + meta */}
            <div className="flex flex-col items-center gap-3">
              <ScoreRing score={result.overall} grade={result.grade} />
              <div className="flex gap-1.5 flex-wrap justify-center">
                <span className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }}>
                  {STYLE_LABEL[result.visual_style] ?? result.visual_style}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }}>
                  {CONTENT_LABEL[result.content_type] ?? result.content_type}
                </span>
              </div>
              <p className="text-[11px] text-center leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}>
                {result.verdict}
              </p>
            </div>

            {/* Categories */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-3"
                style={{ color: 'rgba(255,255,255,0.3)' }}>
                Score Breakdown · tap to expand
              </p>
              {result.categories.map(c => <CategoryBar key={c.name} {...c} />)}
            </div>

            {/* Content type tip */}
            {result.content_type_tips && (
              <div className="flex gap-2 px-3 py-2.5 rounded-lg"
                style={{ background: 'rgba(10,102,194,0.1)', border: '1px solid rgba(10,102,194,0.2)' }}>
                <Lightbulb size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#60a5fa' }} />
                <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {result.content_type_tips}
                </p>
              </div>
            )}

            {/* Suggestions */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'rgba(255,255,255,0.3)' }}>Top Improvements</p>
              <ol className="space-y-2">
                {result.suggestions.map((s, i) => (
                  <li key={i} className="flex gap-2 text-[11px] leading-relaxed"
                    style={{ color: 'rgba(255,255,255,0.75)' }}>
                    <span className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold mt-0.5"
                      style={{ background: 'rgba(10,102,194,0.3)', color: '#60a5fa' }}>
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>

            {/* Re-run */}
            <button onClick={runAnalysis}
              className="w-full py-2 rounded-lg text-[12px] font-medium transition-colors"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}>
              Re-analyse
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
