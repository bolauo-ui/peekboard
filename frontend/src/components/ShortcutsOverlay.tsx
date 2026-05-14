import { X } from 'lucide-react';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const META  = isMac ? '⌘' : 'Ctrl';

// Single source of truth for visible shortcuts. Keep aligned with the
// actual handlers in Board.tsx (and the toolbar buttons).
const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Tools',
    rows: [
      ['V',  'Select'],
      ['H',  'Pan / hand'],
      ['F',  'Frame'],
      ['T',  'Text'],
      ['C',  'Comment'],
    ],
  },
  {
    title: 'Comments',
    rows: [
      ['C',         'Drop a comment pin'],
      ['Enter',     'Send comment / reply'],
      ['Esc',       'Cancel pending pin'],
      ['@',         'Mention a teammate'],
    ],
  },
  {
    title: 'Zoom',
    rows: [
      [`${META} +`,   'Zoom in'],
      [`${META} -`,   'Zoom out'],
      [`${META} 0`,   'Zoom 100%'],
      [`⇧ 1`,        'Zoom to fit'],
      ['Scroll',      'Zoom at cursor'],
      ['Space + drag','Pan canvas'],
    ],
  },
  {
    title: 'Editing',
    rows: [
      [`${META} Z`,             'Undo'],
      [`${META} ⇧ Z`,           'Redo'],
      [`${META} C`,             'Copy'],
      [`${META} V`,             'Paste'],
      [`${META} D`,             'Duplicate'],
      [`${META} A`,             'Select all'],
      [`${META} G`,             'Group selection'],
      [`${META} ⇧ G`,           'Ungroup'],
      ['Del / Backspace',       'Delete selection'],
      ['Arrows',                'Nudge 1 px'],
      ['⇧ Arrows',              'Nudge 10 px'],
      [`${META} S`,             'Save now'],
    ],
  },
  {
    title: 'Transform',
    rows: [
      ['⇧ H',  'Flip horizontal'],
      ['⇧ V',  'Flip vertical'],
      ['1–9',  'Set opacity (10 %–90 %)'],
      ['0',    'Reset opacity to 100 %'],
    ],
  },
  {
    title: 'Z-order',
    rows: [
      [']',   'Bring forward'],
      ['⇧ ]', 'Bring to front'],
      ['[',   'Send backward'],
      ['⇧ [', 'Send to back'],
    ],
  },
  {
    title: 'Layout',
    rows: [
      ['⇧ A', 'Toggle auto-layout on frame'],
    ],
  },
  {
    title: 'Navigation',
    rows: [
      [`${META} K`, 'Open quick switcher'],
      ['?',         'This shortcut sheet'],
    ],
  },
];

interface Props { onClose: () => void; }

export default function ShortcutsOverlay({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col"
        style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
      >
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--border-light)' }}>
          <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
          <button onClick={onClose} className="rounded-full p-1.5"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
            <X size={14} />
          </button>
        </div>

        <div className="overflow-y-auto p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3 className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                {g.title}
              </h3>
              <ul className="space-y-1.5">
                {g.rows.map(([keys, label]) => (
                  <li key={keys + label} className="flex items-center justify-between text-[13px]">
                    <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                    <kbd
                      className="font-mono text-[11px] px-2 py-0.5 rounded"
                      style={{
                        background: 'var(--bg-section)',
                        border:     '1px solid var(--border)',
                        color:      'var(--text-primary)',
                      }}
                    >
                      {keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="px-5 py-2 text-[11px]" style={{ borderTop: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>
          Press <kbd className="font-mono">?</kbd> any time to reopen this sheet.
        </div>
      </div>
    </div>
  );
}
