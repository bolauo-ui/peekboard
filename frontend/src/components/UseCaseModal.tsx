import { useState } from 'react';
import { Briefcase, User, Eye, Image, MoreHorizontal } from 'lucide-react';
import type { User as UserT } from '@/types';

interface Props {
  user: UserT;
  onSave: (useCase: NonNullable<UserT['use_case']>) => Promise<void> | void;
  onSkip: () => void;
}

const OPTIONS: { key: NonNullable<UserT['use_case']>; label: string; sub: string; icon: React.ReactNode }[] = [
  { key: 'work',          label: 'Work',           sub: 'Reviewing motion / design with my team',  icon: <Briefcase size={16} /> },
  { key: 'design-review', label: 'Design reviews', sub: 'Pin comments on shared work',             icon: <Eye       size={16} /> },
  { key: 'moodboard',     label: 'Moodboards',     sub: 'Collect GIFs + references',               icon: <Image     size={16} /> },
  { key: 'personal',      label: 'Personal',       sub: 'Hobby project, learning, or fun',         icon: <User      size={16} /> },
  { key: 'other',         label: 'Something else', sub: 'I\'ll figure it out',                     icon: <MoreHorizontal size={16} /> },
];

export default function UseCaseModal({ user, onSave, onSkip }: Props) {
  const [pick, setPick] = useState<NonNullable<UserT['use_case']> | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!pick) return;
    setBusy(true);
    try { await onSave(pick); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="rounded-2xl w-full max-w-lg p-6" style={{ background: '#ffffff', color: '#1f2024' }}>
        <h2 className="text-xl" style={{ fontFamily: '"Crimson Pro", Georgia, serif', fontWeight: 400, letterSpacing: '-0.05em' }}>How will you use Peekboard?</h2>
        <p className="text-sm mt-1" style={{ color: '#6b7280', fontFamily: '"Source Serif 4", "Source Serif Pro", Georgia, serif', fontWeight: 400, letterSpacing: '-0.03em' }}>
          Hi {user.name.split(' ')[0]} — a quick one so we can tailor the dashboard.
        </p>

        <div className="mt-4 space-y-2">
          {OPTIONS.map(o => {
            const active = pick === o.key;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => setPick(o.key)}
                className="w-full flex items-center gap-3 text-left rounded-lg px-3 py-2.5 transition-all"
                style={{
                  background: active ? 'rgba(27,175,216,0.08)' : '#fafbfc',
                  border:     active ? '1.5px solid var(--accent)' : '1.5px solid #ececef',
                }}
              >
                <span style={{ color: active ? 'var(--accent)' : '#3a3b3f' }}>{o.icon}</span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold">{o.label}</span>
                  <span className="block text-xs" style={{ color: '#6b7280' }}>{o.sub}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button
            onClick={onSkip}
            className="text-xs font-medium px-2 py-1 rounded"
            style={{ color: '#6b7280' }}
          >
            Skip for now
          </button>
          <button
            onClick={submit}
            disabled={!pick || busy}
            className="text-sm font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {busy ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
