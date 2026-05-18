import { useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import {
  ArrowLeft, Home, Users, Briefcase, MessageSquare, Bell,
  Search, Bookmark, MoreHorizontal, Heart, Share2,
  Repeat2, BarChart2, Layout, Hash, Feather,
  MessageCircle, CheckCircle, ChevronDown, ChevronRight, Send, X, UserPlus,
} from 'lucide-react';
import PeekboardLogo from '@/components/PeekboardLogo';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Profile {
  name: string; handle: string; headline: string;
  connections: string; followers: string;
  initials: string; color: string; avatar: string | null;
}

interface MockupProps {
  profile: Profile;
  onAvatarChange: (url: string) => void;
  creative: string | null;
  onCreativeChange: (url: string) => void;
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function E({ as: Tag = 'span', children, style, ...rest }: {
  as?: keyof JSX.IntrinsicElements; children?: React.ReactNode;
  style?: React.CSSProperties; [k: string]: any;
}) {
  return (
    <Tag contentEditable suppressContentEditableWarning spellCheck={false}
      style={{ outline: 'none', cursor: 'text', ...style }} {...rest}>
      {children}
    </Tag>
  );
}

function EditableAvatar({ src, initials, color, size, onUpload, style, shape = 'circle' }: {
  src: string | null; initials: string; color: string; size: number;
  onUpload: (url: string) => void; style?: React.CSSProperties; shape?: 'circle' | 'rounded';
}) {
  const ref = useRef<HTMLInputElement>(null);
  const load = (f: File) => {
    const r = new FileReader();
    r.onload = e => { if (e.target?.result) onUpload(e.target.result as string); };
    r.readAsDataURL(f);
  };
  const radius = shape === 'rounded' ? 8 : '50%';
  return (
    <div title="Click to change photo"
      onClick={e => { e.stopPropagation(); ref.current?.click(); }}
      style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, cursor: 'pointer', position: 'relative', ...style }}>
      {src
        ? <img src={src} alt="" style={{ width: '100%', height: '100%', borderRadius: radius, objectFit: 'cover' }} />
        : <div style={{ width: '100%', height: '100%', borderRadius: radius, background: color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: size * 0.36, fontWeight: 700, color: '#fff', userSelect: 'none', fontFamily: 'system-ui' }}>
            {initials}
          </div>
      }
      <div style={{ position: 'absolute', inset: 0, borderRadius: radius, transition: 'background 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.28)')}
        onMouseLeave={e => (e.currentTarget.style.background = '')} />
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ''; }} />
    </div>
  );
}

function CreativeZone({ creative, onCreativeChange, aspectRatio = '1/1', label, style }: {
  creative: string | null; onCreativeChange: (url: string) => void;
  aspectRatio?: string; label?: string; style?: React.CSSProperties;
}) {
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const load = (f: File) => {
    const r = new FileReader(); r.onload = e => { if (e.target?.result) onCreativeChange(e.target.result as string); }; r.readAsDataURL(f);
  };
  return (
    <div onClick={() => ref.current?.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) load(f); }}
      style={{ width: '100%', aspectRatio, overflow: 'hidden', position: 'relative',
        background: creative ? undefined : (drag ? 'rgba(27,175,216,0.1)' : '#e9e9e9'),
        border: creative ? 'none' : `2px dashed ${drag ? '#1BAFD8' : '#c8c8c8'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 0.15s', boxSizing: 'border-box', ...style }}>
      {creative ? (
        <>
          <img src={creative} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.3)'; (e.currentTarget.querySelector('span') as HTMLElement).style.opacity = '1'; }}
            onMouseLeave={e => { e.currentTarget.style.background = ''; (e.currentTarget.querySelector('span') as HTMLElement).style.opacity = '0'; }}>
            <span style={{ color: '#fff', fontSize: 12, fontWeight: 600, opacity: 0, background: 'rgba(0,0,0,0.55)', padding: '4px 12px', borderRadius: 6, transition: 'opacity 0.15s' }}>Replace</span>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', pointerEvents: 'none', padding: 16 }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>🖼️</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>Drop GIF or image here</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>or click to upload{label ? ` · ${label}` : ''}</div>
        </div>
      )}
      <input ref={ref} type="file" accept="image/*,image/gif" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ''; }} />
    </div>
  );
}

function PhoneFrame({ children, bg = '#fff' }: { children: React.ReactNode; bg?: string }) {
  const tc = bg === '#000' || bg === '#0f1419' ? '#fff' : '#000';
  return (
    <div style={{ width: 393, background: '#1a1a1a', borderRadius: 54, padding: 10,
      boxShadow: '0 50px 130px rgba(0,0,0,0.55), inset 0 0 0 1.5px rgba(255,255,255,0.14)', flexShrink: 0 }}>
      <div style={{ background: bg, borderRadius: 46, overflow: 'hidden', position: 'relative' }}>
        {/* Status bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 24px 0', background: bg, position: 'relative', zIndex: 2, height: 44 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: tc, fontFamily: '-apple-system, sans-serif' }}>9:41</span>
          <div style={{ width: 120, height: 30, background: '#000', borderRadius: 20,
            position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 8, zIndex: 3 }} />
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            {/* Signal */}
            <svg width="17" height="12" viewBox="0 0 17 12" fill={tc}>
              <rect x="0" y="4" width="3" height="8" rx="1"/><rect x="4.5" y="2.5" width="3" height="9.5" rx="1"/>
              <rect x="9" y="0.5" width="3" height="11.5" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1" opacity="0.3"/>
            </svg>
            {/* WiFi */}
            <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke={tc} strokeWidth="1.5" strokeLinecap="round">
              <path d="M8 9.5a1 1 0 100 2 1 1 0 000-2z" fill={tc} stroke="none"/>
              <path d="M4.5 7a4.9 4.9 0 017 0"/><path d="M1 4a9 9 0 0114 0"/>
            </svg>
            {/* Battery */}
            <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
              <rect x="0.5" y="0.5" width="21" height="11" rx="3.5" stroke={tc}/>
              <rect x="2" y="2" width="16" height="8" rx="2" fill={tc}/>
              <path d="M23 4v4a2 2 0 000-4z" fill={tc} opacity="0.4"/>
            </svg>
          </div>
        </div>
        {/* Content */}
        <div style={{ maxHeight: 780, overflowY: 'auto', overflowX: 'hidden' }}>{children}</div>
        {/* Home indicator */}
        <div style={{ padding: '8px 0 14px', display: 'flex', justifyContent: 'center', background: bg }}>
          <div style={{ width: 134, height: 5, background: tc, borderRadius: 3, opacity: 0.2 }} />
        </div>
      </div>
    </div>
  );
}

// ── MOCKUP LIST ───────────────────────────────────────────────────────────────

const MOCKUPS = [
  { id: 'linkedin-company-page', name: 'Company Page', sub: 'Desktop', platform: 'LinkedIn', color: '#0A66C2', bg: '#dbeafe' },
  { id: 'linkedin-desktop',  name: 'Feed Post',  sub: 'Desktop', platform: 'LinkedIn',    color: '#0A66C2', bg: '#dbeafe' },
  { id: 'linkedin-mobile',   name: 'Feed Post',  sub: 'Mobile',  platform: 'LinkedIn',    color: '#0A66C2', bg: '#dbeafe' },
  { id: 'instagram-mobile',  name: 'Feed Post',  sub: 'Mobile',  platform: 'Instagram',   color: '#C13584', bg: '#fce7f3' },
  { id: 'instagram-story',   name: 'Story',      sub: 'Mobile',  platform: 'Instagram',   color: '#C13584', bg: '#fce7f3' },
  { id: 'instagram-desktop', name: 'Feed Post',  sub: 'Desktop', platform: 'Instagram',   color: '#C13584', bg: '#fce7f3' },
  { id: 'twitter-desktop',   name: 'Post',       sub: 'Desktop', platform: 'Twitter / X', color: '#1D9BF0', bg: '#e0f2fe' },
  { id: 'twitter-mobile',    name: 'Post',       sub: 'Mobile',  platform: 'Twitter / X', color: '#1D9BF0', bg: '#e0f2fe' },
  { id: 'facebook-desktop',  name: 'Feed Post',  sub: 'Desktop', platform: 'Facebook',    color: '#1877F2', bg: '#dbeafe' },
  { id: 'tiktok-mobile',     name: 'For You',    sub: 'Mobile',  platform: 'TikTok',      color: '#FE2C55', bg: '#ffe4e6' },
];

// ── SVG logos ─────────────────────────────────────────────────────────────────

const XLogo = ({ size = 20, color = '#fff' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.857L1.254 2.25H8.08l4.259 5.63 5.905-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const IgGradient = () => (
  <defs>
    <linearGradient id="ig" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stopColor="#f09433"/><stop offset="25%" stopColor="#e6683c"/>
      <stop offset="50%" stopColor="#dc2743"/><stop offset="75%" stopColor="#cc2366"/>
      <stop offset="100%" stopColor="#bc1888"/>
    </linearGradient>
    <linearGradient id="ig-ring" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stopColor="#feda77"/><stop offset="25%" stopColor="#f37055"/>
      <stop offset="50%" stopColor="#ee2a7b"/><stop offset="75%" stopColor="#6228d7"/>
      <stop offset="100%" stopColor="#6228d7"/>
    </linearGradient>
  </defs>
);

// Instagram story ring around avatar
function IgRing({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <div style={{ width: size + 4, height: size + 4, borderRadius: '50%', padding: 2, flexShrink: 0,
      background: 'linear-gradient(45deg, #feda77, #f37055, #ee2a7b, #6228d7)' }}>
      <div style={{ width: '100%', height: '100%', borderRadius: '50%',
        background: '#fff', padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </div>
    </div>
  );
}

// ── Platform logo components ──────────────────────────────────────────────────

function LinkedInLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, display: 'block' }}>
      <rect width="100" height="100" rx="22" fill="#0A66C2"/>
      {/* i — dot */}
      <circle cx="26" cy="21" r="8.5" fill="white"/>
      {/* i — stem */}
      <rect x="17.5" y="34" width="17" height="46" rx="2" fill="white"/>
      {/* n — left stem */}
      <rect x="42" y="34" width="16" height="46" rx="2" fill="white"/>
      {/* n — arch: curves up and over to right stem */}
      <path d="M58 34 C58 34 64 34 70 34 C80 34 83 42 83 50 L83 80 L67 80 L67 52 C67 48 64 46 61 46 C58 46 58 48 58 52 Z" fill="white"/>
    </svg>
  );
}

// ── LINKEDIN DESKTOP ──────────────────────────────────────────────────────────

function LinkedInDesktopPost({ profile, onAvatarChange, creative, onCreativeChange }: MockupProps) {
  const [ratio, setRatio] = useState<'1:1' | '4:5'>('1:1');
  return (
    <div style={{ width: 1080, fontFamily: '"system-ui",-apple-system,"Segoe UI",sans-serif', fontSize: 14, userSelect: 'none' }}>
      {/* Navbar — 52px, white, bottom border */}
      <div style={{ height: 52, background: '#fff', borderBottom: '1px solid rgba(0,0,0,0.12)',
        display: 'flex', alignItems: 'center', padding: '0 20px', gap: 4 }}>
        {/* LinkedIn logo */}
        <LinkedInLogo size={32} />
        {/* Search */}
        <div style={{ background: '#EEF3F8', borderRadius: 4, padding: '7px 12px',
          display: 'flex', alignItems: 'center', gap: 6, width: 240, marginLeft: 8 }}>
          <Search size={14} color="#666" strokeWidth={2.5} />
          <span style={{ fontSize: 14, color: '#888' }}>Search</span>
        </div>
        <div style={{ flex: 1 }} />
        {/* Nav icons */}
        {[
          { icon: <Home size={22} strokeWidth={1.5} />, label: 'Home', active: true },
          { icon: <Users size={22} strokeWidth={1.5} />, label: 'My Network' },
          { icon: <Briefcase size={22} strokeWidth={1.5} />, label: 'Jobs' },
          { icon: <MessageSquare size={22} strokeWidth={1.5} />, label: 'Messaging' },
          { icon: <Bell size={22} strokeWidth={1.5} />, label: 'Notifications' },
        ].map(({ icon, label, active }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '0 12px', cursor: 'pointer', color: active ? '#000' : '#666',
            borderBottom: active ? '2px solid #000' : 'none', height: 52,
            justifyContent: 'center', marginBottom: active ? 0 : 2 }}>
            {icon}
            <span style={{ fontSize: 11, marginTop: 2 }}>{label}</span>
          </div>
        ))}
        <div style={{ width: 1, height: 32, background: '#e0e0e0', margin: '0 8px' }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
          cursor: 'pointer', padding: '0 12px', height: 52, justifyContent: 'center' }}>
          <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={24} onUpload={onAvatarChange} />
          <span style={{ fontSize: 11, color: '#666', marginTop: 2 }}>Me ▾</span>
        </div>
        {/* Work/grid icon */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
          cursor: 'pointer', padding: '0 12px', height: 52, justifyContent: 'center', color: '#666' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="4" cy="4" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="20" cy="4" r="2"/>
            <circle cx="4" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="20" cy="12" r="2"/>
            <circle cx="4" cy="20" r="2"/><circle cx="12" cy="20" r="2"/><circle cx="20" cy="20" r="2"/>
          </svg>
          <span style={{ fontSize: 11, marginTop: 2 }}>Work ▾</span>
        </div>
      </div>

      {/* Body: #F3F2EF bg */}
      <div style={{ background: '#F3F2EF', display: 'flex', gap: 20, padding: '20px 16px', justifyContent: 'center', minHeight: 500 }}>
        {/* Left: Profile card 225px */}
        <div style={{ width: 225, flexShrink: 0 }}>
          <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)' }}>
            <div style={{ height: 60, background: 'linear-gradient(135deg,#1BAFD8 0%,#0A66C2 100%)' }} />
            <div style={{ padding: '0 16px 16px', marginTop: -28 }}>
              <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color}
                size={56} onUpload={onAvatarChange} style={{ border: '2px solid #fff' }} />
              <div style={{ marginTop: 8 }}>
                <E style={{ display: 'block', fontWeight: 700, fontSize: 16, color: '#191919', lineHeight: 1.3 }}>{profile.name}</E>
                <E style={{ display: 'block', fontSize: 12, color: '#555', lineHeight: 1.4, marginTop: 3 }}>{profile.headline}</E>
              </div>
              <div style={{ borderTop: '1px solid #e8e8e8', margin: '12px -16px 0', padding: '10px 16px 0' }}>
                <div style={{ fontSize: 12, color: '#666' }}>Profile strength</div>
                <div style={{ height: 4, background: '#e0e0e0', borderRadius: 2, marginTop: 6 }}>
                  <div style={{ height: '100%', width: '70%', background: '#0A66C2', borderRadius: 2 }} />
                </div>
              </div>
              <div style={{ borderTop: '1px solid #e8e8e8', margin: '12px -16px 0', padding: '10px 16px 0' }}>
                <div style={{ fontSize: 12, color: '#666' }}>
                  <E style={{ fontWeight: 700, color: '#0A66C2', cursor: 'pointer' }}>{profile.connections}</E>
                  <span style={{ color: '#666' }}> connections</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Center: 554px feed */}
        <div style={{ width: 554 }}>
          {/* Create post bar */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)',
            padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={40} onUpload={onAvatarChange} />
            <div style={{ flex: 1, border: '1px solid #c5c3be', borderRadius: 24, padding: '10px 16px',
              fontSize: 14, color: '#888', cursor: 'pointer' }}>Start a post</div>
          </div>

          {/* Post card */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            {/* Post header */}
            <div style={{ display: 'flex', gap: 10, padding: '12px 16px 8px', alignItems: 'flex-start' }}>
              <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={48} onUpload={onAvatarChange} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <E style={{ fontWeight: 700, fontSize: 14, color: '#191919', display: 'block' }}>{profile.name}</E>
                    <E style={{ fontSize: 12, color: '#666', display: 'block', marginTop: 2, lineHeight: 1.4 }}>{profile.headline}</E>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                      <E style={{ fontSize: 12, color: '#666' }}>2h</E>
                      <span style={{ color: '#bbb' }}>·</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#666"><path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm0 18a8 8 0 110-16 8 8 0 010 16zm-1-5h2V7h-2v8zm0 4h2v-2h-2v2z" opacity="0"/><circle cx="12" cy="12" r="9" fill="none" stroke="#666" strokeWidth="1.5"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" fill="none" stroke="#666" strokeWidth="1.5"/><path d="M2 12h20" stroke="#666" strokeWidth="1.5"/></svg>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer',
                      color: '#0A66C2', fontSize: 13, fontWeight: 600, padding: '4px 8px' }}>+ Follow</button>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: 22, lineHeight: 1, padding: '0 4px' }}>⋯</button>
                  </div>
                </div>
              </div>
            </div>
            {/* Post text */}
            <E as="div" style={{ padding: '4px 16px 12px', fontSize: 14, color: '#191919',
              lineHeight: 1.65, display: 'block', whiteSpace: 'pre-wrap' }}>
              {`UK public sector productivity has been stagnant for three decades. Costs have risen. Demand has intensified.\n\nOur new whitepaper — The Agentic Blueprint for Public Sector Productivity — explores how AI can close the gap. Drop a comment if you'd like early access.`}
            </E>
            {/* Format toggle + Creative zone */}
            <div style={{ position: 'relative' }}>
              {/* Aspect ratio toggle pills */}
              <div style={{ display: 'flex', gap: 6, padding: '0 16px 10px', justifyContent: 'flex-end' }}>
                {(['1:1', '4:5'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setRatio(r)}
                    style={{
                      background: ratio === r ? '#0A66C2' : '#f0f0f0',
                      color: ratio === r ? '#fff' : '#555',
                      border: 'none', borderRadius: 6, padding: '4px 10px',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      transition: 'all 0.15s',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {r}
                    <span style={{ marginLeft: 4, fontWeight: 400, opacity: 0.75 }}>
                      {r === '1:1' ? '1080×1080' : '1080×1350'}
                    </span>
                  </button>
                ))}
              </div>
              <CreativeZone
                creative={creative}
                onCreativeChange={onCreativeChange}
                aspectRatio={ratio === '1:1' ? '1/1' : '4/5'}
                label={ratio === '1:1' ? '1080 × 1080' : '1080 × 1350'}
              />
            </div>
            {/* Reactions */}
            <div style={{ padding: '8px 16px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ fontSize: 15 }}>👍</span><span style={{ fontSize: 15 }}>❤️</span><span style={{ fontSize: 15 }}>💡</span>
                <E style={{ fontSize: 13, color: '#666', marginLeft: 4 }}>127</E>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <E style={{ fontSize: 13, color: '#666', cursor: 'pointer' }}>23 comments</E>
                <span style={{ color: '#ddd' }}>·</span>
                <E style={{ fontSize: 13, color: '#666', cursor: 'pointer' }}>14 reposts</E>
              </div>
            </div>
            {/* Action bar */}
            <div style={{ display: 'flex', borderTop: '1px solid #e8e8e8' }}>
              {[['👍', 'Like'], ['💬', 'Comment'], ['🔁', 'Repost'], ['✉️', 'Send']].map(([ico, lbl]) => (
                <button key={lbl} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                  padding: '10px 4px', fontSize: 13, fontWeight: 600, color: '#666',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 4 }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F3F2EF')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <span style={{ fontSize: 16 }}>{ico}</span><span>{lbl}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: 300px */}
        <div style={{ width: 300, flexShrink: 0 }}>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)', padding: '16px', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#191919', marginBottom: 14 }}>LinkedIn News</div>
            {[['AI reshapes product workflows','3h ago · 12K readers'],['Remote work trends 2026','5h ago · 8.4K readers'],
              ['Design systems at scale','1d ago · 5.1K readers'],['Brand motion is the new copy','2d ago · 3.2K readers']
            ].map(([t, m]) => (
              <div key={t as string} style={{ marginBottom: 12, cursor: 'pointer' }}>
                <E style={{ display: 'block', fontWeight: 600, fontSize: 13, color: '#191919' }}>{t}</E>
                <span style={{ fontSize: 12, color: '#888' }}>{m}</span>
              </div>
            ))}
            <div style={{ fontSize: 13, color: '#666', cursor: 'pointer', marginTop: 4 }}>Show more ▾</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── LINKEDIN MOBILE ────────────────────────────────────────────────────────────

function LinkedInMobilePost({ profile, onAvatarChange, creative, onCreativeChange }: MockupProps) {
  return (
    <PhoneFrame>
      <div style={{ fontFamily: '"system-ui",-apple-system,sans-serif' }}>
        {/* Nav */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e8e8e8', height: 52,
          display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '0 4px' }}>
          <LinkedInLogo size={30} />
          <Search size={22} color="#666" strokeWidth={2} />
          <div style={{ position: 'relative' }}>
            <Home size={22} color="#0A66C2" strokeWidth={2} />
            <div style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, background: '#CC1016', borderRadius: '50%' }} />
          </div>
          <MessageSquare size={22} color="#666" strokeWidth={2} />
          <Bell size={22} color="#666" strokeWidth={2} />
          <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={26} onUpload={onAvatarChange} />
        </div>

        {/* Feed */}
        <div style={{ background: '#F3F2EF' }}>
          <div style={{ background: '#fff', marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 8, padding: '12px 12px 6px', alignItems: 'flex-start' }}>
              <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={40} onUpload={onAvatarChange} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <E style={{ fontWeight: 700, fontSize: 14, color: '#191919', display: 'block' }}>{profile.name}</E>
                    <E style={{ fontSize: 12, color: '#666', display: 'block', lineHeight: 1.3 }}>{profile.headline}</E>
                    <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                      <E style={{ fontSize: 11, color: '#888' }}>2h</E>
                      <span style={{ fontSize: 11, color: '#aaa' }}>· 🌐</span>
                    </div>
                  </div>
                  <MoreHorizontal size={20} color="#666" />
                </div>
              </div>
            </div>
            <E as="div" style={{ padding: '0 12px 10px', fontSize: 14, color: '#191919', lineHeight: 1.55, display: 'block', whiteSpace: 'pre-wrap' }}>
              {`Not technology. Not talent. Measurement.\n\nAI productivity gains should be measured in more than minutes saved. Drop a comment for early access to our new whitepaper 🚀`}
            </E>
            <CreativeZone creative={creative} onCreativeChange={onCreativeChange} aspectRatio="1200/627" label="1200 × 627" />
            <div style={{ padding: '8px 12px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <span style={{ fontSize: 14 }}>👍❤️</span>
                <E style={{ fontSize: 12, color: '#888', marginLeft: 2 }}>127</E>
              </div>
              <E style={{ fontSize: 12, color: '#888' }}>23 comments</E>
            </div>
            <div style={{ display: 'flex', borderTop: '1px solid #e8e8e8' }}>
              {[['👍','Like'],['💬','Comment'],['🔁','Repost'],['✉️','Send']].map(([i,l]) => (
                <button key={l} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                  padding: '9px 2px', fontSize: 11, fontWeight: 600, color: '#666',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                  <span>{i}</span><span>{l}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

// ── INSTAGRAM MOBILE ──────────────────────────────────────────────────────────

function InstagramMobilePost({ profile, onAvatarChange, creative, onCreativeChange }: MockupProps) {
  const font = '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
  return (
    <PhoneFrame>
      <div style={{ fontFamily: font, background: '#fff' }}>
        {/* Header */}
        <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', borderBottom: '1px solid #dbdbdb' }}>
          <span style={{}}>
            <img src="/instagram-wordmark.png" alt="Instagram" style={{ height: 28, width: 'auto', display: 'block' }} /></span>
          <div style={{ display: 'flex', gap: 18 }}>
            {/* Add post */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/>
            </svg>
            {/* Messages */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="1.8">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
          </div>
        </div>

        {/* Stories */}
        <div style={{ display: 'flex', gap: 12, padding: '10px 12px', overflowX: 'auto',
          borderBottom: '1px solid #efefef', scrollbarWidth: 'none' }}>
          {/* Your story */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <div style={{ position: 'relative', width: 62, height: 62 }}>
              <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color}
                size={62} onUpload={onAvatarChange} style={{ border: '1px solid #dbdbdb' }} />
              <div style={{ position: 'absolute', bottom: 0, right: 0, width: 20, height: 20,
                background: '#0095f6', borderRadius: '50%', border: '2px solid #fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700 }}>+</div>
            </div>
            <span style={{ fontSize: 11, color: '#262626', maxWidth: 66, textAlign: 'center',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Your story</span>
          </div>
          {/* Other stories */}
          {[['Alex','#8b5cf6'],['Sam','#10b981'],['Riley','#f59e0b'],['Morgan','#ef4444'],['Drew','#3b82f6']].map(([name, bg]) => (
            <div key={name as string} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <IgRing size={58}>
                <div style={{ width: 54, height: 54, borderRadius: '50%', background: bg as string }} />
              </IgRing>
              <span style={{ fontSize: 11, color: '#262626', maxWidth: 66, textAlign: 'center',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
            </div>
          ))}
        </div>

        {/* Post */}
        <div style={{ borderBottom: '1px solid #efefef' }}>
          {/* Post header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <IgRing size={32}>
                <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={28} onUpload={onAvatarChange} />
              </IgRing>
              <div>
                <E style={{ fontWeight: 700, fontSize: 13, color: '#262626', display: 'block' }}>{profile.handle}</E>
                <E style={{ fontSize: 11, color: '#8e8e8e' }}>Sponsored</E>
              </div>
            </div>
            <MoreHorizontal size={20} color="#262626" />
          </div>

          {/* Creative — 4:5 */}
          <CreativeZone creative={creative} onCreativeChange={onCreativeChange} aspectRatio="4/5" label="1080 × 1350" />

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px 4px' }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <Heart size={26} color="#262626" strokeWidth={1.8} />
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#262626" strokeWidth="1.8"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#262626" strokeWidth="1.8"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            </div>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#262626" strokeWidth="1.8"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
          </div>

          {/* Likes + caption */}
          <div style={{ padding: '0 12px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div style={{ display: 'flex' }}>
                {['#1BAFD8','#e1306c','#f97316'].map((c, i) => (
                  <div key={i} style={{ width: 20, height: 20, borderRadius: '50%', background: c,
                    marginLeft: i > 0 ? -7 : 0, border: '2px solid #fff' }} />
                ))}
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#262626' }}>
                <E>1,247 likes</E>
              </span>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>
              <E style={{ fontWeight: 700, color: '#262626' }}>{profile.handle}</E>{' '}
              <E style={{ color: '#262626' }}>The Agentic Blueprint for Public Sector Productivity — from Generative AI to Generative UI 🎨✨</E>
            </div>
            <E style={{ display: 'block', fontSize: 13, color: '#8e8e8e', marginTop: 4 }}>View all 89 comments</E>
            <E style={{ display: 'block', fontSize: 10, color: '#c7c7c7', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.03em' }}>2 hours ago</E>
          </div>

          {/* Comment input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
            borderTop: '1px solid #efefef' }}>
            <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={28} onUpload={onAvatarChange} />
            <span style={{ fontSize: 14, color: '#8e8e8e', flex: 1 }}>Add a comment…</span>
            <span style={{ fontSize: 18 }}>😊</span>
          </div>
        </div>

        {/* Bottom tab bar */}
        <div style={{ display: 'flex', justifyContent: 'space-around', padding: '10px 0 6px',
          background: '#fff', borderTop: '1px solid #dbdbdb' }}>
          {[
            <svg key="h" width="24" height="24" viewBox="0 0 24 24" fill="#262626"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1z"/><path d="M9 21V12h6v9" fill="#fff"/></svg>,
            <Search key="s" size={24} color="#262626" strokeWidth={2} />,
            <div key="p" style={{ width: 24, height: 24, border: '1.5px solid #262626', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 10, height: 10, background: '#262626', borderRadius: 1 }} /></div>,
            <svg key="r" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#262626" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><polygon points="10 8 16 12 10 16 10 8" fill="#262626"/></svg>,
            <EditableAvatar key="av" src={profile.avatar} initials={profile.initials} color={profile.color} size={24} onUpload={onAvatarChange} style={{ border: '2px solid #262626' }} />,
          ].map((icon, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 30 }}>
              {icon}
            </div>
          ))}
        </div>
      </div>
    </PhoneFrame>
  );
}

// ── INSTAGRAM STORY ────────────────────────────────────────────────────────────

function InstagramStory({ profile, onAvatarChange, creative, onCreativeChange }: MockupProps) {
  return (
    <PhoneFrame bg="#000">
      <div style={{ position: 'relative', background: '#111', minHeight: 700 }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <CreativeZone creative={creative} onCreativeChange={onCreativeChange} aspectRatio="9/16"
            label="1080 × 1920" style={{ height: '100%', width: '100%', border: 'none', background: '#222', borderRadius: 0 }} />
        </div>
        <div style={{ position: 'relative', zIndex: 2, pointerEvents: 'none', minHeight: 700, display: 'flex', flexDirection: 'column' }}>
          {/* Progress bars */}
          <div style={{ display: 'flex', gap: 3, padding: '10px 8px 0' }}>
            {[1, 0.35].map((fill, i) => (
              <div key={i} style={{ flex: 1, height: 2.5, background: 'rgba(255,255,255,0.35)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${fill * 100}%`, background: '#fff', borderRadius: 2 }} />
              </div>
            ))}
          </div>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', pointerEvents: 'auto' }}>
            <IgRing size={32}>
              <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color}
                size={28} onUpload={onAvatarChange} />
            </IgRing>
            <E style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>{profile.handle}</E>
            <E style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>2h</E>
            <div style={{ flex: 1 }} />
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M18 6L6 18M6 6l12 12" stroke="white" strokeWidth="2.5" strokeLinecap="round"/></svg>
          </div>
          <div style={{ flex: 1 }} />
          {/* Reply bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px 8px', pointerEvents: 'auto' }}>
            <div style={{ flex: 1, border: '1.5px solid rgba(255,255,255,0.55)', borderRadius: 24,
              padding: '10px 16px', fontSize: 14, color: 'rgba(255,255,255,0.65)' }}>
              Reply to <E style={{ color: '#fff', fontWeight: 700 }}>{profile.handle}</E>…
            </div>
            <Heart size={26} color="#fff" strokeWidth={1.8} />
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

// ── INSTAGRAM DESKTOP ─────────────────────────────────────────────────────────

function InstagramDesktopPost({ profile, onAvatarChange, creative, onCreativeChange }: MockupProps) {
  const font = '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
  return (
    <div style={{ width: 975, fontFamily: font, background: '#fafafa', minHeight: 560 }}>
      {/* Nav */}
      <div style={{ background: '#fff', borderBottom: '1px solid #dbdbdb', height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 0 16px' }}>
        <span style={{}}>
        <img src="/instagram-wordmark.png" alt="Instagram" style={{ height: 30, width: 'auto', display: 'block' }} /></span>
        <div style={{ background: '#efefef', borderRadius: 10, padding: '7px 14px',
          display: 'flex', alignItems: 'center', gap: 8, width: 230 }}>
          <Search size={14} color="#8e8e8e" />
          <span style={{ fontSize: 14, color: '#8e8e8e' }}>Search</span>
        </div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="#262626"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1z"/><path d="M9 21V12h6v9" fill="#fafafa"/></svg>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#262626" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/></svg>
          <div style={{ position: 'relative' }}>
            <Heart size={24} color="#262626" strokeWidth={1.8} />
            <div style={{ position: 'absolute', top: -2, right: -2, width: 9, height: 9, background: '#ff3040', borderRadius: '50%', border: '1.5px solid #fff' }} />
          </div>
          <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={26} onUpload={onAvatarChange}
            style={{ border: '2px solid #262626' }} />
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', gap: 28, padding: '28px 20px', justifyContent: 'center' }}>
        {/* Feed */}
        <div style={{ width: 470 }}>
          {/* Stories */}
          <div style={{ background: '#fff', border: '1px solid #dbdbdb', borderRadius: 4,
            display: 'flex', gap: 16, padding: '12px 16px', marginBottom: 16, overflowX: 'auto' }}>
            {[{name: 'Your story', self: true}, {name: 'Alex'}, {name: 'Sam'}, {name: 'Riley'}, {name: 'Morgan'}].map((s, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                {s.self
                  ? <div style={{ position: 'relative', width: 56, height: 56 }}>
                      <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={56} onUpload={onAvatarChange} style={{ border: '1px solid #dbdbdb' }} />
                      <div style={{ position: 'absolute', bottom: 0, right: 0, width: 18, height: 18, background: '#0095f6', borderRadius: '50%', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>+</div>
                    </div>
                  : <IgRing size={52}><div style={{ width: 48, height: 48, borderRadius: '50%', background: `hsl(${i*70},60%,60%)` }} /></IgRing>
                }
                <span style={{ fontSize: 11, color: '#262626', maxWidth: 60, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
              </div>
            ))}
          </div>
          {/* Post */}
          <div style={{ background: '#fff', border: '1px solid #dbdbdb', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <IgRing size={32}><EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={28} onUpload={onAvatarChange} /></IgRing>
                <div>
                  <E style={{ fontWeight: 700, fontSize: 14, color: '#262626', display: 'block' }}>{profile.handle}</E>
                  <E style={{ fontSize: 12, color: '#8e8e8e' }}>Sponsored</E>
                </div>
              </div>
              <MoreHorizontal size={20} color="#262626" />
            </div>
            <CreativeZone creative={creative} onCreativeChange={onCreativeChange} aspectRatio="4/5" label="1080 × 1350" />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px 4px' }}>
              <div style={{ display: 'flex', gap: 14 }}>
                <Heart size={24} color="#262626" strokeWidth={1.8} />
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#262626" strokeWidth="1.8"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#262626" strokeWidth="1.8"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
              </div>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#262626" strokeWidth="1.8"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
            </div>
            <div style={{ padding: '0 12px 14px' }}>
              <E style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#262626', marginBottom: 4 }}>1,247 likes</E>
              <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                <E style={{ fontWeight: 700, color: '#262626' }}>{profile.handle}</E>{' '}
                <E>The Agentic Blueprint for Public Sector Productivity 🎨</E>
              </div>
              <E style={{ display: 'block', fontSize: 13, color: '#8e8e8e', marginTop: 4 }}>View all 89 comments</E>
            </div>
          </div>
        </div>
        {/* Right sidebar */}
        <div style={{ width: 293 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={44} onUpload={onAvatarChange} />
              <div>
                <E style={{ fontWeight: 700, fontSize: 14, color: '#262626', display: 'block' }}>{profile.handle}</E>
                <E style={{ fontSize: 13, color: '#8e8e8e', display: 'block' }}>{profile.name}</E>
              </div>
            </div>
            <button style={{ background: 'none', border: 'none', fontSize: 13, fontWeight: 600, color: '#0095f6', cursor: 'pointer' }}>Switch</button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#8e8e8e' }}>Suggested for you</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#262626', cursor: 'pointer' }}>See All</span>
          </div>
          {['kayleigh_d','studio_null','motioncraft','dsgn_weekly'].map((u, i) => (
            <div key={u} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: `hsl(${i*90},55%,60%)` }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>{u}</div>
                  <div style={{ fontSize: 11, color: '#8e8e8e' }}>Suggested for you</div>
                </div>
              </div>
              <button style={{ background: 'none', border: 'none', fontSize: 12, fontWeight: 600, color: '#0095f6', cursor: 'pointer' }}>Follow</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── TWITTER / X DESKTOP ───────────────────────────────────────────────────────

function TwitterDesktopPost({ profile, onAvatarChange, creative, onCreativeChange }: MockupProps) {
  const font = '"Chirp",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
  const bg = '#000000';
  const border = '#2f3336';
  return (
    <div style={{ width: 1050, background: bg, fontFamily: font, display: 'flex', minHeight: 560, color: '#fff' }}>
      {/* Left nav — 275px */}
      <div style={{ width: 275, borderRight: `1px solid ${border}`, padding: '8px 12px',
        display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
        {/* X Logo */}
        <div style={{ padding: '8px 12px', marginBottom: 4, display: 'inline-flex' }}>
          <XLogo size={28} />
        </div>
        {[
          [<Home size={24} strokeWidth={1.8} />, 'Home', true],
          [<Hash size={24} strokeWidth={1.8} />, 'Explore'],
          [<Bell size={24} strokeWidth={1.8} />, 'Notifications'],
          [<MessageSquare size={24} strokeWidth={1.8} />, 'Messages'],
          [<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 22c1.1 0 2-.9 2-2H10c0 1.1.9 2 2 2zm6-6V11c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>, 'Grok'],
          [<Bookmark size={24} strokeWidth={1.8} />, 'Bookmarks'],
          [<Users size={24} strokeWidth={1.8} />, 'Communities'],
          [<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/></svg>, 'Profile'],
          [<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>, 'More'],
        ].map(([icon, label, active]) => (
          <button key={label as string}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff',
              display: 'flex', alignItems: 'center', gap: 16, padding: '10px 12px', borderRadius: 30,
              fontSize: 19, fontWeight: active ? 700 : 400, transition: 'background 0.1s', textAlign: 'left' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}>
            {icon as React.ReactNode}
            <span>{label as string}</span>
          </button>
        ))}
        {/* Post button */}
        <button style={{ background: '#1D9BF0', border: 'none', borderRadius: 30, padding: '14px',
          color: '#fff', fontSize: 17, fontWeight: 700, cursor: 'pointer', marginTop: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Feather size={20} />
          <span>Post</span>
        </button>
        {/* Profile at bottom */}
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', borderRadius: 30, cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
          onMouseLeave={e => (e.currentTarget.style.background = '')}>
          <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={40} onUpload={onAvatarChange} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <E style={{ fontWeight: 700, fontSize: 14, color: '#fff', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.name}</E>
            <E style={{ fontSize: 13, color: '#71767b', display: 'block' }}>@{profile.handle}</E>
          </div>
          <span style={{ color: '#fff' }}>⋯</span>
        </div>
      </div>

      {/* Center feed */}
      <div style={{ width: 600, borderRight: `1px solid ${border}`, overflowY: 'auto', flexShrink: 0 }}>
        {/* Tabs */}
        <div style={{ position: 'sticky', top: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
          display: 'flex', borderBottom: `1px solid ${border}`, zIndex: 1 }}>
          {['For you', 'Following'].map((tab, i) => (
            <div key={tab} style={{ flex: 1, textAlign: 'center', padding: '16px 0', fontSize: 15,
              fontWeight: 700, color: i === 0 ? '#fff' : '#71767b', cursor: 'pointer',
              borderBottom: i === 0 ? '2px solid #1D9BF0' : 'none' }}>{tab}</div>
          ))}
        </div>
        {/* Post */}
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${border}`, display: 'flex', gap: 12 }}>
          <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={48} onUpload={onAvatarChange} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 2 }}>
              <E style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>{profile.name}</E>
              {/* Verified */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#1D9BF0"><path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91-1.01-1.01-2.52-1.27-3.91-.81-.67-1.31-1.91-2.19-3.34-2.19-1.43 0-2.67.88-3.34 2.19-1.39-.46-2.9-.2-3.91.81-1.01 1.01-1.27 2.52-.81 3.91C2.88 9.33 2 10.57 2 12c0 1.43.88 2.67 2.19 3.34-.46 1.39-.2 2.9.81 3.91 1.01 1.01 2.52 1.27 3.91.81.67 1.31 1.91 2.19 3.34 2.19 1.43 0 2.67-.88 3.34-2.19 1.39.46 2.9.2 3.91-.81 1.01-1.01 1.27-2.52.81-3.91 1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z"/></svg>
              <E style={{ fontSize: 15, color: '#71767b' }}>@{profile.handle}</E>
              <span style={{ color: '#71767b' }}>·</span>
              <E style={{ fontSize: 15, color: '#71767b' }}>2h</E>
            </div>
            <E as="div" style={{ fontSize: 15, color: '#fff', lineHeight: 1.55, marginBottom: 10, display: 'block', whiteSpace: 'pre-wrap' }}>
              {`AI projects start with the technology instead of the problem.\n\nThis is wrong.\n\nThe Agentic Blueprint for Public Sector Productivity — our new whitepaper — shows how to fix that. 🚀`}
            </E>
            {/* Creative — 16:9 with rounded corners */}
            <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${border}`, marginBottom: 10 }}>
              <CreativeZone creative={creative} onCreativeChange={onCreativeChange} aspectRatio="16/9" label="1600 × 900" />
            </div>
            {/* Action bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 380 }}>
              {[
                [<MessageSquare size={18} strokeWidth={1.8} />, '89', '#1D9BF0'],
                [<Repeat2 size={18} strokeWidth={1.8} />, '234', '#00ba7c'],
                [<Heart size={18} strokeWidth={1.8} />, '1.2K', '#f91880'],
                [<BarChart2 size={18} strokeWidth={1.8} />, '48K', '#1D9BF0'],
                [<Share2 size={18} strokeWidth={1.8} />, '', '#1D9BF0'],
              ].map(([icon, count, hoverColor], i) => (
                <button key={i} style={{ background: 'none', border: 'none', cursor: 'pointer',
                  color: '#71767b', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13,
                  borderRadius: 20, padding: '6px 8px', transition: 'color 0.1s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = hoverColor as string; e.currentTarget.style.background = `${hoverColor}18`; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#71767b'; e.currentTarget.style.background = ''; }}>
                  {icon as React.ReactNode}
                  {count ? <E style={{ color: 'inherit', fontSize: 13 }}>{count as string}</E> : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right sidebar */}
      <div style={{ flex: 1, padding: '8px 16px', minWidth: 0 }}>
        {/* Search */}
        <div style={{ background: '#202327', borderRadius: 30, padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Search size={16} color="#71767b" />
          <span style={{ fontSize: 15, color: '#71767b' }}>Search</span>
        </div>
        {/* Trending */}
        <div style={{ background: '#16181c', borderRadius: 16, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 12 }}>What's happening</div>
          {[['Technology · Trending','AI & Design','48.3K posts'],
            ['Trending in Design','Motion graphics','12.1K posts'],
            ['Branding · Trending','Visual content','9.4K posts']].map(([cat,topic,meta]) => (
            <div key={topic} style={{ padding: '10px 0', borderBottom: `1px solid ${border}`, cursor: 'pointer' }}>
              <div style={{ fontSize: 13, color: '#71767b' }}>{cat}</div>
              <E style={{ display: 'block', fontWeight: 700, fontSize: 15 }}>{topic}</E>
              <div style={{ fontSize: 13, color: '#71767b', marginTop: 2 }}>{meta}</div>
            </div>
          ))}
        </div>
        {/* Who to follow */}
        <div style={{ background: '#16181c', borderRadius: 16, padding: '12px 16px' }}>
          <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 12 }}>Who to follow</div>
          {['designpulse','motionstudio_hq','brandmotion'].map((u, i) => (
            <div key={u} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: `hsl(${i*110},60%,55%)` }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{u}</div>
                  <div style={{ fontSize: 13, color: '#71767b' }}>@{u}</div>
                </div>
              </div>
              <button style={{ background: '#fff', border: 'none', borderRadius: 20,
                padding: '6px 16px', fontSize: 14, fontWeight: 700, color: '#000', cursor: 'pointer' }}>Follow</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── TWITTER / X MOBILE ────────────────────────────────────────────────────────

function TwitterMobilePost({ profile, onAvatarChange, creative, onCreativeChange }: MockupProps) {
  const border = '#2f3336';
  const font = '"Chirp",-apple-system,sans-serif';
  return (
    <PhoneFrame bg="#000">
      <div style={{ background: '#000', fontFamily: font }}>
        {/* Nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px 10px', borderBottom: `1px solid ${border}` }}>
          <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={32} onUpload={onAvatarChange} />
          <XLogo size={24} />
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${border}` }}>
          {['For you','Following'].map((tab, i) => (
            <div key={tab} style={{ flex: 1, textAlign: 'center', padding: '13px 0', fontSize: 15,
              fontWeight: 700, color: i === 0 ? '#fff' : '#71767b', cursor: 'pointer',
              borderBottom: i === 0 ? '2px solid #1D9BF0' : 'none' }}>{tab}</div>
          ))}
        </div>
        {/* Post */}
        <div style={{ padding: '12px', borderBottom: `1px solid ${border}`, display: 'flex', gap: 10 }}>
          <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={42} onUpload={onAvatarChange} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 2 }}>
              <E style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>{profile.name}</E>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#1D9BF0"><path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91-1.01-1.01-2.52-1.27-3.91-.81-.67-1.31-1.91-2.19-3.34-2.19-1.43 0-2.67.88-3.34 2.19-1.39-.46-2.9-.2-3.91.81-1.01 1.01-1.27 2.52-.81 3.91C2.88 9.33 2 10.57 2 12c0 1.43.88 2.67 2.19 3.34-.46 1.39-.2 2.9.81 3.91 1.01 1.01 2.52 1.27 3.91.81.67 1.31 1.91 2.19 3.34 2.19 1.43 0 2.67-.88 3.34-2.19 1.39.46 2.9.2 3.91-.81 1.01-1.01 1.27-2.52.81-3.91 1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z"/></svg>
              <E style={{ fontSize: 15, color: '#71767b' }}>· 2h</E>
            </div>
            <E as="div" style={{ fontSize: 15, color: '#fff', lineHeight: 1.5, marginBottom: 8, display: 'block', whiteSpace: 'pre-wrap' }}>
              {`Not technology. Not talent. Measurement. The Agentic Blueprint for Public Sector Productivity — out soon. 🚀`}
            </E>
            <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${border}`, marginBottom: 10 }}>
              <CreativeZone creative={creative} onCreativeChange={onCreativeChange} aspectRatio="16/9" label="1600 × 900" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 300 }}>
              {[[<MessageSquare size={17} strokeWidth={1.8} />, '89'],
                [<Repeat2 size={17} strokeWidth={1.8} />, '234'],
                [<Heart size={17} strokeWidth={1.8} />, '1.2K'],
                [<BarChart2 size={17} strokeWidth={1.8} />, '48K']].map(([icon, count], i) => (
                <button key={i} style={{ background: 'none', border: 'none', cursor: 'pointer',
                  color: '#71767b', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                  {icon as React.ReactNode}
                  <E style={{ color: '#71767b' }}>{count as string}</E>
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* Bottom nav */}
        <div style={{ display: 'flex', justifyContent: 'space-around', padding: '10px 0',
          borderTop: `1px solid ${border}`, background: '#000' }}>
          {[<Home size={24} strokeWidth={1.8} />, <Search size={24} strokeWidth={1.8} />,
            <Bell size={24} strokeWidth={1.8} />, <MessageSquare size={24} strokeWidth={1.8} />].map((icon, i) => (
            <button key={i} style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: i === 0 ? '#fff' : '#71767b', padding: '6px 16px' }}>
              {icon}
            </button>
          ))}
        </div>
      </div>
    </PhoneFrame>
  );
}

// ── FACEBOOK DESKTOP ──────────────────────────────────────────────────────────

function FacebookDesktopPost({ profile, onAvatarChange, creative, onCreativeChange }: MockupProps) {
  const font = '"Segoe UI",system-ui,-apple-system,sans-serif';
  return (
    <div style={{ width: 1024, fontFamily: font, minHeight: 560 }}>
      {/* Nav */}
      <div style={{ background: '#fff', height: 56, borderBottom: '1px solid #e4e6eb',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 40, height: 40, background: '#1877F2', borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>
          </div>
          <div style={{ background: '#f0f2f5', borderRadius: 20, padding: '8px 14px',
            display: 'flex', alignItems: 'center', gap: 8, width: 220 }}>
            <Search size={14} color="#65676b" />
            <span style={{ fontSize: 15, color: '#65676b' }}>Search Facebook</span>
          </div>
        </div>
        {/* Center nav tabs */}
        <div style={{ display: 'flex', gap: 2 }}>
          {[<Home size={24} />, <Users size={24} />, <svg key="w" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
            <svg key="m" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 9L3 6h18L12 12z"/></svg>].map((icon, i) => (
            <button key={i} style={{ background: i === 0 ? '#e7f3ff' : 'none', border: 'none',
              borderBottom: i === 0 ? '3px solid #1877F2' : 'none', cursor: 'pointer',
              color: i === 0 ? '#1877F2' : '#65676b', padding: '14px 28px', borderRadius: 8, height: 56 }}>
              {icon}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0f2f5',
            borderRadius: 20, padding: '6px 12px', cursor: 'pointer' }}>
            <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={28} onUpload={onAvatarChange} />
            <E style={{ fontSize: 15, fontWeight: 600, color: '#050505' }}>{profile.name.split(' ')[0]}</E>
          </div>
          {[<svg key="g" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/></svg>,
            <Bell key="b" size={20} />, <MessageSquare key="m" size={20} />].map((icon, i) => (
            <div key={i} style={{ width: 36, height: 36, background: '#e4e6eb', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#050505' }}>
              {icon}
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ background: '#f0f2f5', display: 'flex', gap: 16, padding: '16px',
        justifyContent: 'center', minHeight: 500 }}>
        {/* Left nav */}
        <div style={{ width: 260, flexShrink: 0 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px',
              borderRadius: 8, marginBottom: 4, cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f2f2f2')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}>
              <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={36} onUpload={onAvatarChange} />
              <E style={{ fontSize: 15, fontWeight: 600, color: '#050505' }}>{profile.name}</E>
            </div>
            {[['🏠','Home'],['👥','Friends'],['📺','Watch'],['🗓️','Events'],['💬','Messenger'],['🛒','Marketplace']].map(([ico, lbl]) => (
              <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px',
                borderRadius: 8, cursor: 'pointer', fontSize: 15, fontWeight: 500, color: '#050505' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f2f2f2')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <span style={{ fontSize: 20, width: 36, textAlign: 'center' }}>{ico}</span><span>{lbl}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Center */}
        <div style={{ width: 500 }}>
          {/* Create post */}
          <div style={{ background: '#fff', borderRadius: 10, padding: '12px', marginBottom: 12,
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)', border: '1px solid #e4e6eb' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={38} onUpload={onAvatarChange} />
              <div style={{ flex: 1, background: '#f0f2f5', borderRadius: 20, padding: '10px 16px',
                fontSize: 15, color: '#65676b', cursor: 'pointer' }}>
                <E>What's on your mind, {profile.name.split(' ')[0]}?</E>
              </div>
            </div>
            <div style={{ borderTop: '1px solid #e4e6eb', paddingTop: 8, display: 'flex', justifyContent: 'space-around' }}>
              {[['🎥','Live video'],['🖼️','Photo/video'],['😊','Feeling/activity']].map(([ico, lbl]) => (
                <button key={lbl} style={{ background: 'none', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
                  color: '#65676b', padding: '6px 12px', borderRadius: 8 }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f2f2f2')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <span>{ico}</span><span>{lbl}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Post card */}
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e4e6eb',
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', alignItems: 'flex-start' }}>
              <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={40} onUpload={onAvatarChange} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <E style={{ fontWeight: 700, fontSize: 15, color: '#050505', display: 'block' }}>{profile.name}</E>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <E style={{ fontSize: 13, color: '#65676b' }}>2h</E>
                      <span style={{ color: '#bbb' }}>·</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#65676b"><circle cx="12" cy="12" r="9" fill="none" stroke="#65676b" strokeWidth="1.5"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" fill="none" stroke="#65676b" strokeWidth="1.5"/><path d="M2 12h20" stroke="#65676b" strokeWidth="1.5"/></svg>
                    </div>
                  </div>
                  <MoreHorizontal size={20} color="#65676b" />
                </div>
              </div>
            </div>
            <E as="div" style={{ padding: '0 16px 10px', fontSize: 15, color: '#050505', lineHeight: 1.65, display: 'block' }}>
              The future of AI lies in intelligent interfaces. Generative UI enables on-demand creation of new UI elements in real time — and we've just published our thinking on how it reshapes public sector productivity 🚀
            </E>
            <CreativeZone creative={creative} onCreativeChange={onCreativeChange} aspectRatio="1200/630" label="1200 × 630" />
            <div style={{ padding: '8px 16px 4px', display: 'flex', justifyContent: 'space-between',
              borderBottom: '1px solid #e4e6eb', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                {['👍','❤️','😮','😂','😢'].slice(0,3).map((e, i) => (
                  <span key={i} style={{ fontSize: 16, marginLeft: i > 0 ? -4 : 0 }}>{e}</span>
                ))}
                <E style={{ fontSize: 13, color: '#65676b', marginLeft: 6 }}>1.2K</E>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <E style={{ fontSize: 13, color: '#65676b', cursor: 'pointer' }}>89 comments</E>
                <span style={{ color: '#ddd' }}>·</span>
                <E style={{ fontSize: 13, color: '#65676b', cursor: 'pointer' }}>34 shares</E>
              </div>
            </div>
            <div style={{ display: 'flex', padding: '4px 8px' }}>
              {[['👍','Like','#1877F2'],['💬','Comment','#65676b'],['↗️','Share','#65676b']].map(([ico, lbl, hc]) => (
                <button key={lbl} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                  padding: '8px', fontSize: 14, fontWeight: 600, color: '#65676b',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 6 }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f0f2f5')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <span style={{ fontSize: 18 }}>{ico}</span><span>{lbl}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right */}
        <div style={{ width: 244, flexShrink: 0 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: '#050505', marginBottom: 12 }}>Sponsored</div>
            {['Design Tools Weekly','Motion Studio App'].map((ad, i) => (
              <div key={ad} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <div style={{ width: 100, height: 100, background: `hsl(${i*120+200},50%,75%)`, borderRadius: 8, flexShrink: 0 }} />
                <div>
                  <E style={{ display: 'block', fontSize: 13, color: '#050505', fontWeight: 500, lineHeight: 1.4 }}>{ad}</E>
                  <E style={{ display: 'block', fontSize: 12, color: '#65676b', marginTop: 3 }}>Sponsored</E>
                  <button style={{ marginTop: 8, background: '#e7f3ff', border: 'none', borderRadius: 6,
                    padding: '5px 10px', fontSize: 13, fontWeight: 600, color: '#1877F2', cursor: 'pointer' }}>
                    Learn More
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── TIKTOK MOBILE ─────────────────────────────────────────────────────────────

function TikTokMobilePost({ profile, onAvatarChange, creative, onCreativeChange }: MockupProps) {
  const font = '"ProximaNova",-apple-system,BlinkMacSystemFont,sans-serif';
  return (
    <PhoneFrame bg="#000">
      <div style={{ background: '#000', fontFamily: font, position: 'relative' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center',
          padding: '8px 60px 4px', background: 'transparent', position: 'relative', zIndex: 5 }}>
          <svg width="90" height="22" viewBox="0 0 90 22"><text x="0" y="17" fontFamily="-apple-system,sans-serif" fontWeight="900" fontSize="17" fill="white">TikTok</text></svg>
          <svg style={{ position: 'absolute', right: 16 }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 28, paddingBottom: 6, position: 'relative', zIndex: 5 }}>
          {['Following','For You'].map((tab, i) => (
            <span key={tab} style={{ fontSize: 15, fontWeight: 700, color: i === 1 ? '#fff' : 'rgba(255,255,255,0.5)',
              cursor: 'pointer', paddingBottom: 4, borderBottom: i === 1 ? '2px solid #fff' : 'none' }}>{tab}</span>
          ))}
        </div>

        {/* Full-screen creative */}
        <div style={{ position: 'relative' }}>
          <CreativeZone creative={creative} onCreativeChange={onCreativeChange}
            aspectRatio="9/16" label="1080 × 1920"
            style={{ maxHeight: 560, minHeight: 420, border: 'none', background: '#1a1a1a', borderRadius: 0 }} />

          {/* Right action column */}
          <div style={{ position: 'absolute', right: 8, bottom: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, zIndex: 4 }}>
            {/* Profile */}
            <div style={{ position: 'relative', marginBottom: 6 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', border: '2px solid #fff', overflow: 'hidden' }}>
                <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={40} onUpload={onAvatarChange} />
              </div>
              <div style={{ position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)',
                width: 20, height: 20, background: '#FE2C55', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 900, border: '2px solid #000' }}>+</div>
            </div>
            {/* Actions */}
            {[
              { icon: <Heart size={30} color="#fff" strokeWidth={2} />, label: '1.2K', active: false },
              { icon: <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>, label: '89', active: false },
              { icon: <Share2 size={28} color="#fff" strokeWidth={2} />, label: 'Share', active: false },
              { icon: <Bookmark size={28} color="#fff" strokeWidth={2} />, label: '234', active: false },
            ].map(({ icon, label }, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                {icon}
                <span style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>{label}</span>
              </div>
            ))}
            {/* Spinning music disc */}
            <div style={{ width: 44, height: 44, borderRadius: '50%',
              background: 'linear-gradient(135deg,#2a2a2a,#444)', border: '2px solid #555',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%',
                background: `hsl(200,60%,50%)`, border: '3px solid #2a2a2a' }} />
            </div>
          </div>

          {/* Bottom overlay */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 60,
            padding: '60px 12px 12px',
            background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)', zIndex: 3 }}>
            <E style={{ display: 'block', fontWeight: 800, fontSize: 14, color: '#fff', marginBottom: 4 }}>@{profile.handle}</E>
            <E style={{ display: 'block', fontSize: 13, color: '#fff', lineHeight: 1.4, marginBottom: 6 }}>
              From Generative AI to Generative UI — the future of intelligent interfaces ✨ The Agentic Blueprint for Public Sector Productivity 🎬
            </E>
            <E style={{ display: 'block', fontSize: 13, color: '#fff', marginBottom: 6 }}>
              <span style={{ color: '#FE2C55' }}>#design </span>
              <span style={{ color: '#FE2C55' }}>#motion </span>
              <span style={{ color: '#FE2C55' }}>#ux</span>
            </E>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
              <div style={{ overflow: 'hidden', flex: 1 }}>
                <E style={{ fontSize: 12, color: '#fff', whiteSpace: 'nowrap' }}>original sound · @elsewhen</E>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom nav */}
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center',
          padding: '8px 0 4px', background: '#000', borderTop: '1px solid #2a2a2a' }}>
          {[
            [<Home size={24} strokeWidth={2} />, 'Home', '#fff'],
            [<Search size={24} strokeWidth={2} />, 'Explore', '#888'],
            [null, '', ''],
            [<MessageSquare size={24} strokeWidth={2} />, 'Inbox', '#888'],
            [<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/></svg>, 'Profile', '#888'],
          ].map(([icon, label, color], i) => (
            i === 2
              ? <div key={i} style={{ display: 'flex', background: 'transparent', padding: '0 4px' }}>
                  <div style={{ background: '#25F4EE', width: 20, height: 32, borderRadius: '6px 0 0 6px', marginRight: -3 }} />
                  <div style={{ background: '#FE2C55', width: 20, height: 32, borderRadius: '0 6px 6px 0', marginLeft: -3 }} />
                  <div style={{ position: 'absolute', marginLeft: -2, marginTop: 1 }}>
                    <div style={{ background: '#fff', width: 36, height: 30, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 22, fontWeight: 900, color: '#000', lineHeight: 1 }}>+</span>
                    </div>
                  </div>
                </div>
              : <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'pointer', minWidth: 52 }}>
                  <div style={{ color: color as string }}>{icon as React.ReactNode}</div>
                  <span style={{ fontSize: 10, color: color as string, fontWeight: i === 0 ? 700 : 400 }}>{label}</span>
                </div>
          ))}
        </div>
      </div>
    </PhoneFrame>
  );
}

// ── Elsewhen logo (SVG data-URL so it works everywhere EditableAvatar is used) ─

const ELSEWHEN_AVATAR = (() => {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
    // dark charcoal background
    '<rect width="100" height="100" rx="0" fill="#111"/>',
    // left vertical stroke of E — centered with generous padding
    '<rect x="33" y="27" width="7" height="46" fill="#fff"/>',
    // top horizontal bar
    '<rect x="33" y="27" width="34" height="7" fill="#fff"/>',
    // bottom horizontal bar
    '<rect x="33" y="66" width="34" height="7" fill="#fff"/>',
    // middle bar — blue
    '<rect x="33" y="46" width="28" height="7" fill="#FF0000"/>',
    '</svg>',
  ].join('');
  return `data:image/svg+xml;base64,${btoa(svg)}`;
})();

// ── LINKEDIN COMPANY PAGE ─────────────────────────────────────────────────────

function LinkedInCompanyPage({ profile, onAvatarChange, creative, onCreativeChange }: MockupProps) {
  const font = '"system-ui",-apple-system,"Segoe UI",sans-serif';
  const [postCreative, setPostCreative] = useState<string | null>(null);
  return (
    <div style={{ width: 1080, fontFamily: font, fontSize: 14, userSelect: 'none', background: '#F3F2EF' }}>

      {/* ── Navbar ── */}
      <div style={{ height: 52, background: '#fff', borderBottom: '1px solid rgba(0,0,0,0.12)',
        display: 'flex', alignItems: 'center', padding: '0 20px', gap: 4 }}>
        <LinkedInLogo size={32} />
        <div style={{ background: '#EEF3F8', borderRadius: 4, padding: '7px 12px',
          display: 'flex', alignItems: 'center', gap: 6, width: 220, marginLeft: 8 }}>
          <Search size={14} color="#666" strokeWidth={2.5} />
          <span style={{ fontSize: 14, color: '#888' }}>Search</span>
        </div>
        <div style={{ flex: 1 }} />
        {[
          { icon: <Home size={20} strokeWidth={1.5} />, label: 'Home' },
          { icon: <Users size={20} strokeWidth={1.5} />, label: 'My Network' },
          { icon: <Briefcase size={20} strokeWidth={1.5} />, label: 'Jobs' },
          { icon: <MessageSquare size={20} strokeWidth={1.5} />, label: 'Messaging' },
          { icon: <Bell size={20} strokeWidth={1.5} />, label: 'Notifications', badge: true },
        ].map(({ icon, label, badge }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '0 10px', cursor: 'pointer', color: '#666',
            height: 52, justifyContent: 'center', position: 'relative' }}>
            {badge && <span style={{ position: 'absolute', top: 8, right: 8, width: 14, height: 14,
              background: '#CC1016', borderRadius: '50%', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff' }}>18</span>}
            {icon}
            <span style={{ fontSize: 11, marginTop: 2 }}>{label}</span>
          </div>
        ))}
        <div style={{ width: 1, height: 32, background: '#e0e0e0', margin: '0 8px' }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
          cursor: 'pointer', padding: '0 10px', height: 52, justifyContent: 'center' }}>
          <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={24} onUpload={onAvatarChange} />
          <span style={{ fontSize: 11, color: '#666', marginTop: 2 }}>Me ▾</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
          cursor: 'pointer', padding: '0 10px', height: 52, justifyContent: 'center', color: '#666' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="4" cy="4" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="20" cy="4" r="2"/>
            <circle cx="4" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="20" cy="12" r="2"/>
            <circle cx="4" cy="20" r="2"/><circle cx="12" cy="20" r="2"/><circle cx="20" cy="20" r="2"/>
          </svg>
          <span style={{ fontSize: 11, marginTop: 2 }}>For Business ▾</span>
        </div>
        <button style={{ background: 'linear-gradient(135deg,#f5a623,#e8a020)', border: 'none',
          borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: '#fff',
          cursor: 'pointer', marginLeft: 4, whiteSpace: 'nowrap' }}>
          Try Premium for £0
        </button>
      </div>

      {/* ── Main body ── */}
      <div style={{ display: 'flex', gap: 20, padding: '20px 16px', justifyContent: 'center' }}>

        {/* ── Center (main profile + posts) 660px ── */}
        <div style={{ width: 660, flexShrink: 0 }}>

          {/* Profile card */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)',
            overflow: 'hidden', marginBottom: 12 }}>

            {/* Cover image — 660×180 */}
            <div style={{ height: 180, position: 'relative' }}>
              <CreativeZone
                creative={creative ?? '/elsewhen-cover.jpeg'}
                onCreativeChange={onCreativeChange}
                aspectRatio="660/180"
                label="Cover photo · 1128 × 191"
                style={{ height: 180, aspectRatio: undefined, borderRadius: 0, border: 'none' }}
              />
            </div>

            {/* Company logo — overlaps cover */}
            <div style={{ padding: '0 24px 20px', position: 'relative' }}>
              <div style={{ marginTop: -52, marginBottom: 12, position: 'relative', width: 104, zIndex: 2 }}>
                <EditableAvatar
                  src={profile.avatar}
                  initials={profile.initials}
                  color={profile.color}
                  size={104}
                  onUpload={onAvatarChange}
                  shape="rounded"
                  style={{ border: '3px solid #fff', borderRadius: 8, boxShadow: '0 1px 6px rgba(0,0,0,0.15)', overflow: 'hidden' }}
                />
              </div>

              {/* Company info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <E style={{ fontSize: 22, fontWeight: 700, color: '#191919' }}>{profile.name}</E>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0A66C2" strokeWidth="2">
                      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                    </svg>
                  </div>
                  <E style={{ display: 'block', fontSize: 14, color: '#555', marginBottom: 6, lineHeight: 1.4 }}>
                    We build and deploy custom AI to transform how organisations operate
                  </E>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 6px', fontSize: 13, color: '#777' }}>
                    <E>Business Consulting and Services</E>
                    <span>·</span>
                    <E>London, England</E>
                    <span>·</span>
                    <span style={{ color: '#0A66C2', fontWeight: 600, cursor: 'pointer' }}>
                      <E>{profile.followers} followers</E>
                    </span>
                    <span>·</span>
                    <E>51–200 employees</E>
                  </div>
                </div>
                {/* LinkedIn logo watermark */}
                <div style={{ width: 44, height: 44, background: '#f5a623', borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>in</span>
                </div>
              </div>

              {/* Website row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color}
                  size={28} onUpload={onAvatarChange} shape="rounded" style={{ borderRadius: 4 }} />
                <span style={{ fontSize: 13, color: '#0A66C2', fontWeight: 600, cursor: 'pointer' }}>Visit website</span>
              </div>

              {/* Quote block */}
              <div style={{ background: '#f9f9f9', borderRadius: 8, padding: '14px 16px',
                marginTop: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 28, color: '#ccc', lineHeight: 1, flexShrink: 0, marginTop: -4 }}>"</span>
                <E style={{ fontSize: 13, color: '#444', lineHeight: 1.55 }}>
                  "You're the best consultancy we've worked with - you've really raised the bar for us." – Cliona O'Sullivan, Global Head of Design Operations, Spotify
                </E>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button style={{ background: '#0A66C2', border: 'none', borderRadius: 20,
                  padding: '8px 20px', fontSize: 14, fontWeight: 600, color: '#fff',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  + Follow
                </button>
                <button style={{ background: '#fff', border: '1px solid #0A66C2', borderRadius: 20,
                  padding: '8px 20px', fontSize: 14, fontWeight: 600, color: '#0A66C2',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  ✉ Message
                </button>
                <button style={{ background: '#fff', border: '1px solid #0A66C2', borderRadius: 20,
                  padding: '8px 20px', fontSize: 14, fontWeight: 600, color: '#0A66C2',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  🔗 Visit website ↗
                </button>
                <button style={{ background: '#fff', border: '1px solid #666', borderRadius: 20,
                  padding: '8px 14px', fontSize: 14, fontWeight: 600, color: '#555',
                  cursor: 'pointer' }}>
                  •••
                </button>
              </div>
            </div>

            {/* Tab nav */}
            <div style={{ display: 'flex', borderTop: '1px solid #e8e8e8', padding: '0 24px' }}>
              {['Home','About','Posts','Jobs','People'].map((tab, i) => (
                <div key={tab} style={{ padding: '14px 16px', fontSize: 14, fontWeight: i === 2 ? 600 : 400,
                  color: i === 2 ? '#0A66C2' : '#555', cursor: 'pointer',
                  borderBottom: i === 2 ? '2px solid #0A66C2' : '2px solid transparent' }}>
                  {tab}
                </div>
              ))}
            </div>
          </div>

          {/* Posts section */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            {/* Filter tabs */}
            <div style={{ padding: '14px 20px', display: 'flex', gap: 8, borderBottom: '1px solid #f0f0f0' }}>
              {['All','Images','Videos','Articles','Documents'].map((f, i) => (
                <button key={f} style={{
                  background: i === 0 ? '#0A66C2' : '#fff',
                  border: `1px solid ${i === 0 ? '#0A66C2' : '#c8c8c8'}`,
                  borderRadius: 20, padding: '5px 14px', fontSize: 13,
                  fontWeight: i === 0 ? 600 : 400,
                  color: i === 0 ? '#fff' : '#555', cursor: 'pointer' }}>
                  {f}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 13, color: '#666', display: 'flex', alignItems: 'center', gap: 4 }}>
                Sort by: <strong>Top</strong> ▾
              </span>
            </div>

            {/* Post */}
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color}
                  size={44} onUpload={onAvatarChange} shape="rounded" style={{ borderRadius: 6 }} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <E style={{ fontWeight: 700, fontSize: 14, color: '#191919' }}>{profile.name}</E>
                    <button style={{ background: 'none', border: '1px solid #0A66C2', borderRadius: 14,
                      padding: '2px 10px', fontSize: 12, fontWeight: 600, color: '#0A66C2', cursor: 'pointer' }}>
                      + Follow
                    </button>
                    <span style={{ color: '#bbb' }}>•••</span>
                  </div>
                  <E style={{ display: 'block', fontSize: 12, color: '#888' }}>{profile.followers} followers</E>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
                    <span style={{ fontSize: 12, color: '#0A66C2', cursor: 'pointer' }}>Visit website</span>
                    <span style={{ fontSize: 11, color: '#aaa' }}>· 5d · 🌐</span>
                  </div>
                </div>
              </div>
              <E as="div" style={{ fontSize: 14, color: '#191919', lineHeight: 1.6, display: 'block', marginBottom: 10 }}>
                Intelligence is now a commodity.{'\n\n'}The gap is narrowing.
                {' '}<span style={{ color: '#0A66C2', cursor: 'pointer' }}>...more</span>
              </E>
              {/* No creative zone here — just the post image slot */}
              <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #e8e8e8', marginBottom: 10 }}>
                <CreativeZone creative={postCreative} onCreativeChange={setPostCreative} aspectRatio="1200/627" label="Post image" />
              </div>
              {/* Reactions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 8px', borderBottom: '1px solid #e8e8e8' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span>👍❤️💡</span>
                  <E style={{ fontSize: 13, color: '#888', marginLeft: 4 }}>324</E>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <E style={{ fontSize: 13, color: '#888', cursor: 'pointer' }}>47 comments</E>
                  <span style={{ color: '#ddd' }}>·</span>
                  <E style={{ fontSize: 13, color: '#888', cursor: 'pointer' }}>18 reposts</E>
                </div>
              </div>
              <div style={{ display: 'flex', marginTop: 4 }}>
                {[['👍','Like'],['💬','Comment'],['🔁','Repost'],['✉️','Send']].map(([ico,lbl]) => (
                  <button key={lbl} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                    padding: '8px 4px', fontSize: 13, fontWeight: 600, color: '#666',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F3F2EF')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <span>{ico}</span><span>{lbl}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Right sidebar 300px ── */}
        <div style={{ width: 300, flexShrink: 0 }}>

          {/* Ad card */}
          <div style={{ background: '#0A66C2', borderRadius: 12, padding: '16px', marginBottom: 12,
            color: '#fff', overflow: 'hidden', position: 'relative' }}>
            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.75, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <LinkedInLogo size={16} /> <span>Linked<strong>in</strong></span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3, marginBottom: 8 }}>
              Your job search <span style={{ color: '#86efac' }}>powered by</span>{'\n'}your network
            </div>
            <button style={{ background: '#fff', border: 'none', borderRadius: 20,
              padding: '7px 16px', fontSize: 13, fontWeight: 600, color: '#0A66C2', cursor: 'pointer' }}>
              Explore jobs
            </button>
            <div style={{ marginTop: 12, borderRadius: 8, overflow: 'hidden', height: 80, background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, opacity: 0.7 }}>
              Network photo
            </div>
          </div>

          {/* Pages people also viewed */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)', padding: '16px' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#191919', marginBottom: 14 }}>Pages people also viewed</div>
            {[
              { name: 'AND Digital', sub: 'IT Services and IT Consulting', followers: '115,638', color: '#e53e3e', initials: 'AND' },
              { name: 'Canda | Embedded Talent', sub: 'Staffing and Recruiting', followers: '6,800', color: '#805ad5', initials: 'C' },
              { name: 'Dualo', sub: 'Software Development', followers: '1,796', color: '#2d3748', initials: 'D' },
            ].map(p => (
              <div key={p.name} style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 40, height: 40, background: p.color, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{p.initials}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#191919', marginBottom: 1 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{p.sub}</div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>{p.followers} followers</div>
                  <button style={{ border: '1px solid #0A66C2', background: '#fff', borderRadius: 20,
                    padding: '4px 14px', fontSize: 12, fontWeight: 600, color: '#0A66C2', cursor: 'pointer' }}>
                    + Follow
                  </button>
                </div>
              </div>
            ))}
            <div style={{ fontSize: 13, color: '#666', cursor: 'pointer', marginTop: 4 }}>Show all →</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Template map ──────────────────────────────────────────────────────────────

const TEMPLATE_MAP: Record<string, React.ComponentType<MockupProps>> = {
  'linkedin-company-page': LinkedInCompanyPage,
  'linkedin-desktop':  LinkedInDesktopPost,
  'linkedin-mobile':   LinkedInMobilePost,
  'instagram-mobile':  InstagramMobilePost,
  'instagram-story':   InstagramStory,
  'instagram-desktop': InstagramDesktopPost,
  'twitter-desktop':   TwitterDesktopPost,
  'twitter-mobile':    TwitterMobilePost,
  'facebook-desktop':  FacebookDesktopPost,
  'tiktok-mobile':     TikTokMobilePost,
};

// ── Comment / Collaboration types ─────────────────────────────────────────────

interface CommentReply {
  id: string;
  author: string;
  initials: string;
  color: string;
  text: string;
  createdAt: string;
}

interface CommentPin {
  id: string;
  mockupId: string;
  x: number;   // percent of container width
  y: number;   // percent of container height
  author: string;
  initials: string;
  color: string;
  text: string;
  createdAt: string;
  resolved: boolean;
  replies: CommentReply[];
}

interface Collaborator {
  id: string;
  email: string;
  name: string;
  initials: string;
  color: string;
  role: 'owner' | 'editor' | 'viewer' | 'commenter';
  joinedAt: string;
}

const ROLE_COLORS: Record<string, string> = {
  owner: '#7DD9ED', editor: '#34d399', commenter: '#fbbf24', viewer: '#9ca3af',
};
const ROLE_BG: Record<string, string> = {
  owner: 'rgba(27,175,216,0.15)', editor: 'rgba(52,211,153,0.15)',
  commenter: 'rgba(251,191,36,0.15)', viewer: 'rgba(156,163,175,0.15)',
};

// ── Comment pin dot ────────────────────────────────────────────────────────────

function CommentPinMarker({ pin, index, active, resolved, onClick }: {
  pin: CommentPin; index: number; active: boolean; resolved: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onClick={onClick}
      title={pin.text}
      style={{
        position: 'absolute',
        left: `${pin.x}%`,
        top: `${pin.y}%`,
        transform: 'translate(-12px, -28px)',
        zIndex: 120,
        cursor: 'pointer',
        filter: resolved ? 'grayscale(1) opacity(0.5)' : undefined,
      }}
    >
      {/* Figma-style teardrop pin */}
      <div style={{
        width: 28, height: 28,
        borderRadius: '50% 50% 50% 0',
        transform: 'rotate(-45deg)',
        background: active ? '#1BAFD8' : (resolved ? '#9ca3af' : '#FF6B35'),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: active ? '0 0 0 3px rgba(27,175,216,0.35), 0 3px 10px rgba(0,0,0,0.3)' : '0 3px 10px rgba(0,0,0,0.3)',
        transition: 'all 0.15s',
      }}>
        <span style={{ transform: 'rotate(45deg)', color: '#fff', fontSize: 11, fontWeight: 800, lineHeight: 1 }}>
          {resolved ? '✓' : index}
        </span>
      </div>
    </div>
  );
}

// ── Comment thread popup ───────────────────────────────────────────────────────

function CommentPopup({ pin, onClose, onResolve, onReply }: {
  pin: CommentPin;
  onClose: () => void;
  onResolve: () => void;
  onReply: (text: string) => void;
}) {
  const [replyText, setReplyText] = useState('');
  const fmt = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString();
  };
  return (
    <div style={{
      background: '#fff', borderRadius: 10, width: 300,
      boxShadow: '0 8px 32px rgba(0,0,0,0.22)', border: '1px solid #e8e8e8',
      fontFamily: '"Inter",system-ui,sans-serif', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: pin.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{pin.initials}</div>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{pin.author}</span>
          <span style={{ fontSize: 11, color: '#bbb' }}>{fmt(pin.createdAt)}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={onResolve}
            title={pin.resolved ? 'Reopen' : 'Resolve'}
            style={{ background: pin.resolved ? 'rgba(52,211,153,0.15)' : 'none', border: 'none',
              cursor: 'pointer', color: pin.resolved ? '#34d399' : '#9ca3af', borderRadius: 6,
              padding: '3px 6px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
            <CheckCircle size={14} />
            {pin.resolved ? 'Reopen' : 'Resolve'}
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer',
            color: '#bbb', padding: 3, borderRadius: 4, display: 'flex' }}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Original comment */}
      <div style={{ padding: '10px 12px', borderBottom: pin.replies.length > 0 ? '1px solid #f0f0f0' : 'none' }}>
        <p style={{ margin: 0, fontSize: 13, color: '#333', lineHeight: 1.55 }}>{pin.text}</p>
      </div>

      {/* Replies */}
      {pin.replies.map(r => (
        <div key={r.id} style={{ padding: '8px 12px', borderBottom: '1px solid #f7f7f7',
          display: 'flex', gap: 8 }}>
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: r.color, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', marginTop: 1 }}>{r.initials}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>{r.author}</span>
              <span style={{ fontSize: 11, color: '#bbb' }}>{fmt(r.createdAt)}</span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#333', lineHeight: 1.5 }}>{r.text}</p>
          </div>
        </div>
      ))}

      {/* Reply input */}
      {!pin.resolved && (
        <div style={{ padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'flex-end',
          borderTop: '1px solid #f0f0f0' }}>
          <textarea
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && replyText.trim()) {
                e.preventDefault(); onReply(replyText.trim()); setReplyText('');
              }
            }}
            placeholder="Reply… (Enter to send)"
            rows={1}
            style={{ flex: 1, resize: 'none', border: '1px solid #e0e0e0', borderRadius: 6,
              padding: '7px 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none',
              color: '#333', background: '#fafafa' }}
          />
          <button
            onClick={() => { if (replyText.trim()) { onReply(replyText.trim()); setReplyText(''); } }}
            disabled={!replyText.trim()}
            style={{ background: replyText.trim() ? '#1BAFD8' : '#e0e0e0', border: 'none',
              borderRadius: 6, padding: '7px 10px', cursor: replyText.trim() ? 'pointer' : 'default',
              color: '#fff', display: 'flex', alignItems: 'center' }}>
            <Send size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Invite modal ───────────────────────────────────────────────────────────────

function InviteModal({ collaborators, onClose, onInvite, onRoleChange, onRemove }: {
  collaborators: Collaborator[];
  onClose: () => void;
  onInvite: (email: string, name: string, role: Collaborator['role']) => void;
  onRoleChange: (id: string, role: Collaborator['role']) => void;
  onRemove: (id: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Collaborator['role']>('commenter');
  const initials = (n: string) => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const avatarColor = (s: string) => {
    const colors = ['#1BAFD8','#34d399','#f59e0b','#e87040','#8b5cf6','#ec4899'];
    let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % colors.length;
    return colors[h];
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 14, width: 500,
        fontFamily: '"Inter",system-ui,sans-serif',
        boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden',
        colorScheme: 'light' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px 14px' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0a0a0a' }}>Share mockup</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: '#1BAFD8', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 8px', borderRadius: 6 }}
              onClick={() => { try { navigator.clipboard.writeText(window.location.href); } catch {} }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
              Copy link
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: '#9ca3af', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}><X size={18} /></button>
          </div>
        </div>

        {/* Invite form */}
        <div style={{ padding: '0 22px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              value={name} onChange={e => setName(e.target.value)} placeholder="Name"
              style={{ width: 130, border: '1px solid #e2e8f0', borderRadius: 8, padding: '9px 12px',
                fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#0a0a0a',
                background: '#f8fafc', boxSizing: 'border-box' as const }}
              onFocus={e => (e.currentTarget.style.borderColor = '#1BAFD8')}
              onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
            />
            <input
              value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address"
              type="email"
              style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 8, padding: '9px 12px',
                fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#0a0a0a',
                background: '#f8fafc', boxSizing: 'border-box' as const }}
              onFocus={e => (e.currentTarget.style.borderColor = '#1BAFD8')}
              onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
            />
            <select
              value={role} onChange={e => setRole(e.target.value as Collaborator['role'])}
              style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '9px 12px',
                fontSize: 13, fontFamily: 'inherit', background: '#f8fafc', color: '#0a0a0a',
                cursor: 'pointer', outline: 'none', flexShrink: 0 }}>
              <option value="editor">Editor</option>
              <option value="commenter">Commenter</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <button
            onClick={() => {
              if (email.trim() && name.trim()) {
                onInvite(email.trim(), name.trim(), role);
                setEmail(''); setName('');
              }
            }}
            disabled={!email.trim() || !name.trim()}
            style={{ background: email.trim() && name.trim() ? '#1BAFD8' : '#e2e8f0',
              border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600,
              color: email.trim() && name.trim() ? '#fff' : '#9ca3af',
              cursor: email.trim() && name.trim() ? 'pointer' : 'default', width: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              transition: 'background 0.15s' }}>
            <UserPlus size={14} /> Invite
          </button>
        </div>

        {/* Collaborators list */}
        <div style={{ padding: '14px 22px 18px', maxHeight: 280, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: 12 }}>Who has access</div>
          {collaborators.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%',
                background: c.color || avatarColor(c.name),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{initials(c.name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0a0a0a', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {c.name}
                  {c.id === collaborators[0]?.id && <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>(you)</span>}
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>
              </div>
              {c.role !== 'owner' ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select
                    value={c.role}
                    onChange={e => onRoleChange(c.id, e.target.value as Collaborator['role'])}
                    style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 10px',
                      fontSize: 13, background: '#f8fafc', color: '#374151', fontWeight: 500,
                      cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}>
                    <option value="editor">can edit</option>
                    <option value="commenter">can comment</option>
                    <option value="viewer">can view</option>
                  </select>
                  <button onClick={() => onRemove(c.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer',
                      color: '#d1d5db', borderRadius: 4, padding: 3, display: 'flex' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#d1d5db')}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>owner</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Comments panel ─────────────────────────────────────────────────────────────

function CommentsPanel({ comments, activePin, onSelectPin, onResolve, onReply, currentMockupId, onClose }: {
  comments: CommentPin[];
  activePin: string | null;
  onSelectPin: (id: string | null) => void;
  onResolve: (id: string) => void;
  onReply: (id: string, text: string) => void;
  currentMockupId: string;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('open');
  const mockupComments = comments.filter(c => c.mockupId === currentMockupId);
  const filtered = mockupComments.filter(c =>
    filter === 'all' ? true : filter === 'resolved' ? c.resolved : !c.resolved
  );
  const fmt = (iso: string) => {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return new Date(iso).toLocaleDateString();
  };
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  return (
    <div style={{ width: 280, background: '#fff', borderLeft: '1px solid #e8e8e8',
      display: 'flex', flexDirection: 'column', flexShrink: 0, fontFamily: '"Inter",system-ui,sans-serif' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#0a0a0a' }}>
            Comments <span style={{ fontSize: 12, color: '#bbb', fontWeight: 400 }}>({mockupComments.filter(c => !c.resolved).length} open)</span>
          </span>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa',
              display: 'flex', padding: 2, borderRadius: 4 }}
            onMouseEnter={e => (e.currentTarget.style.color = '#555')}
            onMouseLeave={e => (e.currentTarget.style.color = '#aaa')}>
            <X size={14} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['open','all','resolved'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 5, border: 'none',
                background: filter === f ? '#1BAFD8' : '#f0f0f0',
                color: filter === f ? '#fff' : '#666', cursor: 'pointer', textTransform: 'capitalize' }}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: '#bbb', fontSize: 13 }}>
            {filter === 'open' ? 'No open comments' : 'No comments yet'}<br />
            <span style={{ fontSize: 12, marginTop: 4, display: 'block' }}>Enable comment mode and click the mockup to add one</span>
          </div>
        )}
        {filtered.map((pin, idx) => {
          const isActive = activePin === pin.id;
          return (
            <div key={pin.id}
              onClick={() => onSelectPin(isActive ? null : pin.id)}
              style={{ padding: '10px 14px', borderBottom: '1px solid #f7f7f7',
                background: isActive ? 'rgba(27,175,216,0.06)' : 'transparent',
                cursor: 'pointer', transition: 'background 0.1s',
                borderLeft: isActive ? '3px solid #1BAFD8' : '3px solid transparent' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                {/* Pin number */}
                <div style={{ width: 20, height: 20, borderRadius: '50%',
                  background: pin.resolved ? '#9ca3af' : '#FF6B35', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 800, color: '#fff', marginTop: 2 }}>
                  {pin.resolved ? '✓' : idx + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#0a0a0a' }}>{pin.author}</span>
                    <span style={{ fontSize: 11, color: '#bbb' }}>{fmt(pin.createdAt)}</span>
                  </div>
                  <p style={{ margin: '0 0 6px', fontSize: 12, color: '#444', lineHeight: 1.5,
                    overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{pin.text}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {pin.replies.length > 0 && (
                      <span style={{ fontSize: 11, color: '#888' }}>
                        <MessageCircle size={11} style={{ display: 'inline', marginRight: 3 }} />
                        {pin.replies.length} {pin.replies.length === 1 ? 'reply' : 'replies'}
                      </span>
                    )}
                    <button onClick={e => { e.stopPropagation(); onResolve(pin.id); }}
                      style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 11, fontWeight: 600, color: pin.resolved ? '#34d399' : '#9ca3af',
                        display: 'flex', alignItems: 'center', gap: 3, padding: 0 }}>
                      <CheckCircle size={12} />{pin.resolved ? 'Reopen' : 'Resolve'}
                    </button>
                  </div>
                  {/* Inline reply for active */}
                  {isActive && !pin.resolved && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 6 }}
                      onClick={e => e.stopPropagation()}>
                      <input
                        value={replyInputs[pin.id] ?? ''}
                        onChange={e => setReplyInputs(prev => ({ ...prev, [pin.id]: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && (replyInputs[pin.id] ?? '').trim()) {
                            onReply(pin.id, (replyInputs[pin.id] ?? '').trim());
                            setReplyInputs(prev => ({ ...prev, [pin.id]: '' }));
                          }
                        }}
                        placeholder="Reply…"
                        style={{ flex: 1, border: '1px solid #e0e0e0', borderRadius: 5,
                          padding: '5px 8px', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
                      />
                      <button
                        onClick={() => {
                          const t = (replyInputs[pin.id] ?? '').trim();
                          if (t) { onReply(pin.id, t); setReplyInputs(prev => ({ ...prev, [pin.id]: '' })); }
                        }}
                        style={{ background: '#1BAFD8', border: 'none', borderRadius: 5,
                          padding: '5px 8px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center' }}>
                        <Send size={11} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const DEFAULT_PROFILE: Profile = {
  name: 'Elsewhen', handle: 'elsewhen', headline: 'Digital Product Consultancy · Strategic AI & Design',
  connections: '11,538', followers: '11,538', initials: 'E', color: '#000000', avatar: ELSEWHEN_AVATAR,
};

let _pinId = 0;
const newPinId   = () => `pin-${Date.now()}-${_pinId++}`;
const newReplyId = () => `reply-${Date.now()}-${_pinId++}`;

const toInitials = (name: string) =>
  name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

export default function Mockups() {
  const navigate  = useNavigate();
  const authUser  = useAuthStore(s => s.user);

  // Build the owner collaborator from the real logged-in user
  const ownerCollaborator = useMemo<Collaborator>(() => ({
    id:       authUser?.id       ?? 'me',
    email:    authUser?.email    ?? '',
    name:     authUser?.name     ?? 'You',
    initials: toInitials(authUser?.name ?? 'Me'),
    color:    authUser?.avatar_color ?? '#1BAFD8',
    role:     'owner',
    joinedAt: new Date().toISOString(),
  }), [authUser]);

  const [active,   setActive]   = useState('linkedin-desktop');
  const [profile,  setProfile]  = useState<Profile>(DEFAULT_PROFILE);
  const [creatives,setCreatives]= useState<Record<string, string | null>>({});

  // ── Comment system ────────────────────────────────────────────────────────
  const [commentMode,  setCommentMode]  = useState(false);
  const [comments,     setComments]     = useState<CommentPin[]>([]);
  const [activePin,    setActivePin]    = useState<string | null>(null);
  const [pendingPin,   setPendingPin]   = useState<{ x: number; y: number } | null>(null);
  const [pendingText,  setPendingText]  = useState('');
  const [showComments, setShowComments] = useState(false);
  const mockupRef = useRef<HTMLDivElement>(null);

  // ── Collaboration ──────────────────────────────────────────────────────────
  const [showInvite,    setShowInvite]    = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>(() => [ownerCollaborator]);

  const platforms  = [...new Set(MOCKUPS.map(m => m.platform))];
  const creative   = creatives[active] ?? null;
  const Template   = TEMPLATE_MAP[active];
  const activeMeta = MOCKUPS.find(m => m.id === active)!;

  // Click on mockup canvas in comment mode
  const handleMockupClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!commentMode) return;
    if ((e.target as HTMLElement).closest('[data-comment-pin]')) return;
    const rect = mockupRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width)  * 100;
    const y = ((e.clientY - rect.top)  / rect.height) * 100;
    setPendingPin({ x, y });
    setPendingText('');
    setActivePin(null);
  }, [commentMode]);

  const submitComment = () => {
    if (!pendingPin || !pendingText.trim()) return;
    const pin: CommentPin = {
      id: newPinId(),
      mockupId: active,
      x: pendingPin.x, y: pendingPin.y,
      author:   ownerCollaborator.name,
      initials: ownerCollaborator.initials,
      color:    ownerCollaborator.color,
      text: pendingText.trim(),
      createdAt: new Date().toISOString(),
      resolved: false, replies: [],
    };
    setComments(prev => [...prev, pin]);
    setPendingPin(null); setPendingText('');
    setActivePin(pin.id);
    setShowComments(true);
  };

  const resolvePin = (id: string) =>
    setComments(prev => prev.map(c => c.id === id ? { ...c, resolved: !c.resolved } : c));

  const replyToPin = (id: string, text: string) => {
    setComments(prev => prev.map(c => c.id === id ? {
      ...c,
      replies: [...c.replies, {
        id: newReplyId(),
        author:   ownerCollaborator.name,
        initials: ownerCollaborator.initials,
        color:    ownerCollaborator.color,
        text, createdAt: new Date().toISOString(),
      }],
    } : c));
  };

  const currentPins = comments.filter(c => c.mockupId === active);
  const openCount   = currentPins.filter(c => !c.resolved).length;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column',
      fontFamily: '"Inter",system-ui,sans-serif', background: '#f0f0f0' }}>

      {/* Top bar */}
      <div style={{ height: 52, background: '#fff', borderBottom: '1px solid #e8e8e8',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, flexShrink: 0 }}>
        <button onClick={() => navigate('/dashboard')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500,
            padding: '5px 8px', borderRadius: 6 }}
          onMouseEnter={e => (e.currentTarget.style.background = '#f0f0f0')}
          onMouseLeave={e => (e.currentTarget.style.background = '')}>
          <ArrowLeft size={15} /> Dashboard
        </button>
        <div style={{ width: 1, height: 20, background: '#e0e0e0' }} />
        <PeekboardLogo height={20} />
        <div style={{ width: 1, height: 20, background: '#e0e0e0' }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: '#0a0a0a' }}>Mockups</span>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: activeMeta.color }} />
        <span style={{ fontSize: 13, color: '#888' }}>{activeMeta.platform} · {activeMeta.name} · {activeMeta.sub}</span>

        <div style={{ flex: 1 }} />

        {/* Collaborator avatars */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {collaborators.slice(0, 4).map((c, i) => (
            <div key={c.id} title={`${c.name} · ${c.role}`}
              style={{ width: 28, height: 28, borderRadius: '50%', background: c.color,
                border: '2px solid #fff', marginLeft: i > 0 ? -8 : 0, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: '#fff', cursor: 'default',
                boxShadow: '0 1px 4px rgba(0,0,0,0.12)', zIndex: collaborators.length - i }}>
              {c.initials}
            </div>
          ))}
          {collaborators.length > 4 && (
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e0e0e0',
              border: '2px solid #fff', marginLeft: -8, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#888' }}>
              +{collaborators.length - 4}
            </div>
          )}
        </div>

        {/* Comment tool — single icon, Figma-style */}
        <button
          title={commentMode ? 'Exit comment mode' : 'Add comment (C)'}
          onClick={() => {
            const next = !commentMode;
            setCommentMode(next);
            setShowComments(next || showComments);
          }}
          style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: 7, border: 'none', cursor: 'pointer',
            background: commentMode ? 'rgba(27,175,216,0.15)' : 'transparent',
            color: commentMode ? '#1BAFD8' : '#555', transition: 'all 0.15s' }}
          onMouseEnter={e => { if (!commentMode) e.currentTarget.style.background = '#f0f0f0'; }}
          onMouseLeave={e => { if (!commentMode) e.currentTarget.style.background = 'transparent'; }}>
          <MessageCircle size={16} />
          {openCount > 0 && (
            <span style={{ position: 'absolute', top: 2, right: 2, width: 8, height: 8,
              background: '#FF6B35', borderRadius: '50%', border: '1.5px solid #fff' }} />
          )}
        </button>

        <div style={{ width: 1, height: 20, background: '#e0e0e0' }} />

        {/* Invite button */}
        <button
          onClick={() => setShowInvite(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
            borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: '#1BAFD8', color: '#fff', transition: 'background 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#139fc4')}
          onMouseLeave={e => (e.currentTarget.style.background = '#1BAFD8')}>
          <UserPlus size={14} /> Invite
        </button>
      </div>

      {/* Comment mode hint banner */}
      {commentMode && (
        <div style={{ background: 'rgba(27,175,216,0.1)', borderBottom: '1px solid rgba(27,175,216,0.25)',
          padding: '6px 20px', fontSize: 12, color: '#1BAFD8', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <MessageCircle size={13} />
          Comment mode active — click anywhere on the mockup to drop a comment pin. Press Esc to exit.
          <button onClick={() => setCommentMode(false)} style={{ marginLeft: 'auto', background: 'none',
            border: 'none', cursor: 'pointer', color: '#1BAFD8', padding: 0, display: 'flex' }}>
            <X size={14} />
          </button>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left sidebar — mockup list */}
        <div style={{ width: 210, background: '#fff', borderRight: '1px solid #e8e8e8',
          overflowY: 'auto', flexShrink: 0, padding: '12px 8px' }}>
          {platforms.map(platform => (
            <div key={platform} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#bbb', letterSpacing: '0.08em',
                textTransform: 'uppercase', padding: '2px 10px 6px' }}>{platform}</div>
              {MOCKUPS.filter(m => m.platform === platform).map(m => {
                const pinCount = comments.filter(c => c.mockupId === m.id && !c.resolved).length;
                return (
                  <button key={m.id} onClick={() => { setActive(m.id); setActivePin(null); setPendingPin(null); }}
                    style={{ width: '100%', textAlign: 'left', background: active === m.id ? m.bg : 'none',
                      border: 'none', borderRadius: 8, padding: '8px 10px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 10 }}
                    onMouseEnter={e => { if (active !== m.id) e.currentTarget.style.background = '#f5f5f5'; }}
                    onMouseLeave={e => { if (active !== m.id) e.currentTarget.style.background = ''; }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: active === m.id ? m.color : '#0a0a0a' }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: '#999', marginTop: 1 }}>{m.sub}</div>
                    </div>
                    {pinCount > 0 && (
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#FF6B35',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{pinCount}</div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Canvas area */}
        <div
          style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'flex-start',
            justifyContent: 'center', padding: '32px', background: '#e8e8e8',
            backgroundImage: 'radial-gradient(circle, #d0d0d0 1px, transparent 1px)',
            backgroundSize: '24px 24px', position: 'relative' }}
          onKeyDown={e => { if (e.key === 'Escape') { setCommentMode(false); setActivePin(null); setPendingPin(null); } }}
          tabIndex={0}
        >
          {Template && (
            <div
              ref={mockupRef}
              style={{ position: 'relative', cursor: commentMode ? 'crosshair' : 'default',
                outline: commentMode ? '2px solid rgba(27,175,216,0.5)' : 'none', borderRadius: 4,
                transition: 'outline 0.15s' }}
              onClick={handleMockupClick}
            >
              <Template
                profile={profile}
                onAvatarChange={url => setProfile(p => ({ ...p, avatar: url }))}
                creative={creative}
                onCreativeChange={url => setCreatives(prev => ({ ...prev, [active]: url }))}
              />

              {/* Comment pins overlay */}
              {currentPins.map((pin, idx) => (
                <div key={pin.id} data-comment-pin="true" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                  <div style={{ position: 'absolute', left: `${pin.x}%`, top: `${pin.y}%`, pointerEvents: 'auto' }}>
                    <CommentPinMarker
                      pin={pin} index={idx + 1}
                      active={activePin === pin.id} resolved={pin.resolved}
                      onClick={e => { e.stopPropagation(); setActivePin(activePin === pin.id ? null : pin.id); setPendingPin(null); }}
                    />
                    {activePin === pin.id && (
                      <div style={{ position: 'absolute', left: 18, top: -28, zIndex: 200 }}>
                        <CommentPopup
                          pin={pin}
                          onClose={() => setActivePin(null)}
                          onResolve={() => resolvePin(pin.id)}
                          onReply={text => replyToPin(pin.id, text)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Pending new comment pin */}
              {pendingPin && (
                <div data-comment-pin="true" style={{ position: 'absolute', left: `${pendingPin.x}%`, top: `${pendingPin.y}%`, zIndex: 200, pointerEvents: 'auto' }}>
                  {/* Draft pin indicator */}
                  <div style={{ width: 28, height: 28, borderRadius: '50% 50% 50% 0',
                    transform: 'rotate(-45deg) translate(-14px, -14px)',
                    background: '#1BAFD8', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 0 0 3px rgba(27,175,216,0.3)', animation: 'pulse 1s infinite' }}>
                    <span style={{ transform: 'rotate(45deg)', color: '#fff', fontSize: 14, lineHeight: 1 }}>+</span>
                  </div>
                  {/* Text input popup — Figma-style */}
                  <div style={{ position: 'absolute', left: 22, top: -14,
                    background: '#fff', borderRadius: 8, width: 260,
                    boxShadow: '0 4px 24px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.08)',
                    fontFamily: '"Inter",system-ui,sans-serif', overflow: 'hidden' }}>
                    <textarea
                      autoFocus
                      value={pendingText}
                      onChange={e => setPendingText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); }
                        if (e.key === 'Escape') { setPendingPin(null); setPendingText(''); }
                      }}
                      placeholder="Add a comment…"
                      rows={3}
                      style={{ width: '100%', resize: 'none', border: 'none',
                        padding: '12px 12px 6px', fontSize: 13, fontFamily: 'inherit',
                        outline: 'none', boxSizing: 'border-box', color: '#111',
                        background: 'transparent', display: 'block',
                        lineHeight: 1.5 }}
                    />
                    {/* Bottom row: avatar + buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', padding: '6px 10px 10px', gap: 8 }}>
                      {/* Author avatar */}
                      <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                        background: ownerCollaborator.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 700, color: '#fff' }}>
                        {ownerCollaborator.initials}
                      </div>
                      <div style={{ flex: 1 }} />
                      <button onClick={() => { setPendingPin(null); setPendingText(''); }}
                        style={{ background: 'none', border: 'none', borderRadius: 5,
                          padding: '5px 10px', fontSize: 12, cursor: 'pointer', color: '#666',
                          fontFamily: 'inherit', fontWeight: 500 }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                        Cancel
                      </button>
                      <button onClick={submitComment} disabled={!pendingText.trim()}
                        style={{ background: pendingText.trim() ? '#1BAFD8' : '#e8e8e8', border: 'none',
                          borderRadius: 5, padding: '5px 12px', fontSize: 12, fontWeight: 600,
                          cursor: pendingText.trim() ? 'pointer' : 'default',
                          color: pendingText.trim() ? '#fff' : '#aaa',
                          fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5,
                          transition: 'background 0.15s' }}>
                        <Send size={11} /> Post
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: comments panel */}
        {showComments && (
          <CommentsPanel
            comments={comments}
            activePin={activePin}
            onSelectPin={setActivePin}
            onResolve={resolvePin}
            onReply={replyToPin}
            currentMockupId={active}
            onClose={() => setShowComments(false)}
          />
        )}
      </div>

      {/* Invite modal */}
      {showInvite && (
        <InviteModal
          collaborators={collaborators}
          onClose={() => setShowInvite(false)}
          onInvite={(email, name, role) => {
            const avatarColors = ['#34d399','#f59e0b','#e87040','#8b5cf6','#ec4899','#1BAFD8'];
            const color = avatarColors[collaborators.length % avatarColors.length];
            const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
            setCollaborators(prev => [...prev, {
              id: `collab-${Date.now()}`, email, name, initials, color, role,
              joinedAt: new Date().toISOString(),
            }]);
          }}
          onRoleChange={(id, role) =>
            setCollaborators(prev => prev.map(c => c.id === id ? { ...c, role } : c))
          }
          onRemove={id => setCollaborators(prev => prev.filter(c => c.id !== id))}
        />
      )}
    </div>
  );
}
