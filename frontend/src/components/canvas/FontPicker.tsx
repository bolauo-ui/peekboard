import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Upload, Trash2, Check } from 'lucide-react';

// Curated list of the ~120 most-used Google Fonts. We fetch the lightest two
// weights (400 + 700) lazily — `<link>` injection happens the first time a
// font is chosen so the dropdown stays snappy even with 100+ entries.
const GOOGLE_FONTS = [
  'Inter','Roboto','Open Sans','Lato','Montserrat','Source Sans 3','Poppins',
  'Raleway','Nunito','Nunito Sans','Mulish','Work Sans','Rubik','PT Sans',
  'Noto Sans','Manrope','DM Sans','Oswald','Merriweather','Playfair Display',
  'Lora','Roboto Mono','Source Code Pro','Fira Code','JetBrains Mono','IBM Plex Sans',
  'IBM Plex Mono','IBM Plex Serif','Quicksand','Karla','Bitter','Crimson Text',
  'Cormorant Garamond','EB Garamond','Libre Baskerville','Libre Franklin',
  'Cabin','Heebo','Hind','Hind Madurai','Kanit','Outfit','Plus Jakarta Sans',
  'Public Sans','Red Hat Display','Red Hat Text','Roboto Condensed','Roboto Slab',
  'Space Grotesk','Space Mono','Ubuntu','Ubuntu Mono','Anton','Archivo',
  'Archivo Narrow','Asap','Barlow','Bebas Neue','Catamaran','Comfortaa',
  'Dancing Script','Dosis','Fjalla One','Indie Flower','Josefin Sans',
  'Lobster','Marcellus','Old Standard TT','PT Serif','Pacifico','Permanent Marker',
  'Philosopher','Playfair','Poppins','Prata','Questrial','Righteous',
  'Sacramento','Satisfy','Shadows Into Light','Signika','Slabo 27px',
  'Slabo 13px','Source Serif Pro','Source Serif 4','Spectral','Staatliches',
  'Syne','Tinos','Titillium Web','Volkhov','Yanone Kaffeesatz','Yeseva One',
  'Zilla Slab','Zilla Slab Highlight','Abel','Alegreya','Alegreya Sans',
  'Aleo','Amatic SC','Amiri','Architects Daughter','Arvo','Audiowide',
  'Bree Serif','Cinzel','Cinzel Decorative','Crete Round','Domine',
  'Exo','Exo 2','Faustina','Frank Ruhl Libre','Gloria Hallelujah','Gothic A1',
  'Great Vibes','Italianno','Jura','Krona One','Lemon','Lemonada',
  'Lilita One','Lustria','Maven Pro','Monoton','Niconne','Pangolin',
  'Patua One','Press Start 2P','Quattrocento','Quattrocento Sans',
  'Rajdhani','Rancho','Rokkitt','Russo One','Sansita','Saira','Saira Condensed',
  'Sarabun','Secular One','Sora','Special Elite','Tajawal','Teko',
  'Vidaloka','Yellowtail',
];

const SYSTEM_FONTS = ['Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana', 'Impact', 'Trebuchet MS'];

const RECENT_KEY = 'mb_recent_fonts';
const CUSTOM_KEY = 'mb_custom_fonts';

// Track which Google fonts we've already injected so we don't add the same
// <link> twice per page life.
const loaded = new Set<string>();

function familyToCss(name: string) {
  // Names with spaces need to be replaced with + for the Google Fonts URL.
  return name.replace(/\s+/g, '+');
}

function loadGoogleFont(name: string) {
  if (loaded.has(name)) return;
  const link = document.createElement('link');
  link.rel  = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${familyToCss(name)}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(link);
  loaded.add(name);
}

interface CustomFont {
  name: string;
  dataUrl: string; // base64 data URL — survives refresh in localStorage
}

function readCustomFonts(): CustomFont[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); }
  catch { return []; }
}
function saveCustomFonts(fonts: CustomFont[]) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(fonts));
}

function readRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
  catch { return []; }
}
function pushRecent(name: string) {
  const list = readRecent().filter(x => x !== name);
  list.unshift(name);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
}

// Register a custom uploaded font with the browser via the FontFace API.
async function registerCustomFont(font: CustomFont) {
  try {
    const ff = new FontFace(font.name, `url(${font.dataUrl})`);
    await ff.load();
    (document.fonts as any).add(ff);
  } catch (err) {
    console.warn('Custom font failed to register:', font.name, err);
  }
}

// Re-register every custom font on page load so existing text references
// to "MyBrandFont" keep rendering correctly across refreshes.
let bootedCustomFonts = false;
function bootCustomFonts() {
  if (bootedCustomFonts) return;
  bootedCustomFonts = true;
  readCustomFonts().forEach(registerCustomFont);
}

interface Props {
  value: string;
  onChange: (font: string) => void;
  disabled?: boolean;
}

export default function FontPicker({ value, onChange, disabled }: Props) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState('');
  const [custom, setCustom] = useState<CustomFont[]>(() => { bootCustomFonts(); return readCustomFonts(); });
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Eagerly load whatever font is currently selected (so previews + the
  // active text both render correctly on mount).
  useEffect(() => {
    if (value && GOOGLE_FONTS.includes(value)) loadGoogleFont(value);
  }, [value]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const recent = readRecent();

  // Filter the catalogue against the search query.
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return GOOGLE_FONTS;
    return GOOGLE_FONTS.filter(f => f.toLowerCase().includes(q));
  }, [search]);

  const pick = (name: string) => {
    if (GOOGLE_FONTS.includes(name)) loadGoogleFont(name);
    pushRecent(name);
    onChange(name);
    setOpen(false);
    setSearch('');
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.(ttf|otf|woff2?|TTF|OTF|WOFF2?)$/.test(file.name)) {
      alert('Please choose a .ttf, .otf, .woff or .woff2 file.');
      return;
    }
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload  = () => res(r.result as string);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(file);
    });
    const name = file.name.replace(/\.[^.]+$/, '');
    const font: CustomFont = { name, dataUrl };
    await registerCustomFont(font);
    const next = [font, ...custom.filter(f => f.name !== name)];
    setCustom(next);
    saveCustomFonts(next);
    pick(name);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeCustom = (name: string) => {
    const next = custom.filter(f => f.name !== name);
    setCustom(next);
    saveCustomFonts(next);
  };

  // Lazily fetch fonts as their preview row enters view so we don't request
  // 120 fonts up-front (would block the dropdown render).
  const previewRowRef = (el: HTMLDivElement | null, name: string) => {
    if (!el) return;
    // IntersectionObserver kicks in once visible.
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) { loadGoogleFont(name); io.disconnect(); } });
    });
    io.observe(el);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className="panel-input w-full text-left flex items-center justify-between gap-2"
        style={{ fontFamily: value || 'inherit' }}
      >
        <span className="truncate">{value || 'Choose font'}</span>
        <ChevronDown size={12} style={{ opacity: 0.6 }} />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 mt-1 rounded-md"
          style={{
            zIndex:     50,
            background: 'var(--bg-panel)',
            border:     '1px solid var(--border)',
            boxShadow:  '0 10px 28px rgba(0,0,0,0.4)',
            maxHeight:  360,
            overflow:   'hidden',
            display:    'flex',
            flexDirection: 'column',
          }}
        >
          {/* Search */}
          <div className="p-2" style={{ borderBottom: '1px solid var(--border-light)' }}>
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search fonts"
                className="w-full text-xs rounded pl-6 pr-2 py-1.5 outline-none"
                style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              />
            </div>
          </div>

          <div className="overflow-y-auto" style={{ flex: 1 }}>
            {/* Custom fonts */}
            {(custom.length > 0 || true) && (
              <div className="px-2 py-1.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Custom fonts</span>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="text-[11px] flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors"
                    style={{ color: 'var(--accent)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Upload size={10} /> Upload
                  </button>
                  <input ref={fileRef} type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={onUpload} />
                </div>
                {custom.length === 0 ? (
                  <div className="text-[11px] px-2 py-1.5" style={{ color: 'var(--text-muted)' }}>
                    None yet — upload .ttf / .otf / .woff
                  </div>
                ) : custom.map(f => (
                  <Row key={f.name} name={f.name} selected={value === f.name} onPick={() => pick(f.name)}>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeCustom(f.name); }}
                      className="opacity-50 hover:opacity-100"
                      title="Remove"
                    >
                      <Trash2 size={11} />
                    </button>
                  </Row>
                ))}
              </div>
            )}

            {/* Recently used */}
            {recent.length > 0 && !search.trim() && (
              <div className="px-2 py-1.5" style={{ borderTop: '1px solid var(--border-light)' }}>
                <span className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Recent</span>
                {recent.map(f => (
                  <Row key={f} name={f} selected={value === f} onPick={() => pick(f)} previewRef={(el) => previewRowRef(el, f)} />
                ))}
              </div>
            )}

            {/* System */}
            {!search.trim() && (
              <div className="px-2 py-1.5" style={{ borderTop: '1px solid var(--border-light)' }}>
                <span className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>System</span>
                {SYSTEM_FONTS.map(f => (
                  <Row key={f} name={f} selected={value === f} onPick={() => pick(f)} />
                ))}
              </div>
            )}

            {/* Google */}
            <div className="px-2 py-1.5" style={{ borderTop: '1px solid var(--border-light)' }}>
              {!search.trim() && (
                <span className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Google Fonts</span>
              )}
              {filtered.length === 0 ? (
                <div className="text-[11px] px-2 py-1.5" style={{ color: 'var(--text-muted)' }}>No fonts match "{search}"</div>
              ) : filtered.map(f => (
                <Row
                  key={f}
                  name={f}
                  selected={value === f}
                  onPick={() => pick(f)}
                  previewRef={(el) => previewRowRef(el, f)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  name, selected, onPick, previewRef, children,
}: {
  name: string; selected: boolean; onPick: () => void;
  previewRef?: (el: HTMLDivElement | null) => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      ref={previewRef ?? null}
      onClick={onPick}
      className="flex items-center justify-between gap-2 px-2 py-1.5 rounded cursor-pointer text-[13px]"
      style={{
        fontFamily: name,
        color: selected ? 'var(--accent)' : 'var(--text-primary)',
        background: selected ? 'var(--accent-dim)' : 'transparent',
      }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
    >
      <span className="truncate flex-1">{name}</span>
      {selected && <Check size={12} />}
      {children}
    </div>
  );
}
