import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Home, Users, Briefcase, MessageSquare, Bell,
  Search, Hash, Bookmark, MoreHorizontal, Heart, Share2,
  Repeat2, BarChart2, Upload,
} from 'lucide-react';
import PeekboardLogo from '@/components/PeekboardLogo';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Profile {
  name: string;
  handle: string;
  headline: string;
  connections: string;
  followers: string;
  initials: string;
  color: string;
  avatar: string | null;
}

interface MockupProps {
  profile: Profile;
  onAvatarChange: (url: string) => void;
  creative: string | null;
  onCreativeChange: (url: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Inline editable text — click to edit */
function E({
  as: Tag = 'span', children, style, ...rest
}: {
  as?: keyof JSX.IntrinsicElements;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  [k: string]: any;
}) {
  return (
    <Tag
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      style={{ outline: 'none', cursor: 'text', ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Clickable avatar — click to replace */
function EditableAvatar({
  src, initials, color, size, onUpload, style,
}: {
  src: string | null; initials: string; color: string;
  size: number; onUpload: (url: string) => void; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const load = (f: File) => {
    const r = new FileReader();
    r.onload = e => { if (e.target?.result) onUpload(e.target.result as string); };
    r.readAsDataURL(f);
  };
  return (
    <div
      title="Click to change photo"
      onClick={e => { e.stopPropagation(); ref.current?.click(); }}
      style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0,
        cursor: 'pointer', position: 'relative', ...style }}
    >
      {src
        ? <img src={src} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
        : <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: size * 0.36, fontWeight: 700, color: '#fff', userSelect: 'none',
            fontFamily: 'system-ui, sans-serif' }}>
            {initials}
          </div>
      }
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', transition: 'background 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.28)')}
        onMouseLeave={e => (e.currentTarget.style.background = '')} />
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ''; }} />
    </div>
  );
}

/** Drag-drop / click-to-upload creative placeholder */
function CreativeZone({
  creative, onCreativeChange, aspectRatio = '1/1', label, style,
}: {
  creative: string | null; onCreativeChange: (url: string) => void;
  aspectRatio?: string; label?: string; style?: React.CSSProperties;
}) {
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const load = (f: File) => {
    const r = new FileReader();
    r.onload = e => { if (e.target?.result) onCreativeChange(e.target.result as string); };
    r.readAsDataURL(f);
  };
  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) load(f); }}
      style={{
        width: '100%', aspectRatio, overflow: 'hidden', position: 'relative',
        background: creative ? undefined : (drag ? 'rgba(27,175,216,0.1)' : '#e9e9e9'),
        border: creative ? 'none' : `2px dashed ${drag ? '#1BAFD8' : '#c8c8c8'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 0.15s', boxSizing: 'border-box', ...style,
      }}
    >
      {creative ? (
        <>
          <img src={creative} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', transition: 'background 0.15s' }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(0,0,0,0.3)';
              (e.currentTarget.querySelector('span') as HTMLElement).style.opacity = '1';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '';
              (e.currentTarget.querySelector('span') as HTMLElement).style.opacity = '0';
            }}>
            <span style={{ color: '#fff', fontSize: 12, fontWeight: 600, opacity: 0,
              background: 'rgba(0,0,0,0.5)', padding: '4px 12px', borderRadius: 6, transition: 'opacity 0.15s' }}>
              Replace
            </span>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', pointerEvents: 'none', padding: 16 }}>
          <div style={{ fontSize: 30, marginBottom: 6 }}>🖼️</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>Drop GIF or image here</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>
            or click to upload{label ? ` · ${label}` : ''}
          </div>
        </div>
      )}
      <input ref={ref} type="file" accept="image/*,image/gif" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ''; }} />
    </div>
  );
}

/** iPhone-style frame for mobile mockups */
function PhoneFrame({ children, bg = '#fff' }: { children: React.ReactNode; bg?: string }) {
  const textColor = bg === '#000' ? '#fff' : '#000';
  return (
    <div style={{ width: 393, background: '#0a0a0a', borderRadius: 54, padding: 10,
      boxShadow: '0 40px 120px rgba(0,0,0,0.5), inset 0 0 0 1.5px rgba(255,255,255,0.12)',
      flexShrink: 0 }}>
      <div style={{ background: bg, borderRadius: 46, overflow: 'hidden', position: 'relative' }}>
        {/* Status bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 24px 8px', background: bg, position: 'relative', zIndex: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: textColor, fontFamily: 'system-ui' }}>9:41</span>
          <div style={{ width: 120, height: 30, background: '#000', borderRadius: 20,
            position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 8, zIndex: 3 }} />
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <svg width="16" height="11" viewBox="0 0 16 11"><path d="M1 4h2v7H1zM5 2h2v9H5zM9 0h2v11H9zM13 3h2v8h-2z" fill={textColor} /></svg>
            <svg width="16" height="12" viewBox="0 0 24 12"><path d="M22 5H2C1 5 0 6 0 7v4c0 1 1 2 2 2h20c1 0 2-1 2-2V7c0-1-1-2-2-2zm-2 5H4V7h16v3z" fill={textColor} /><path d="M24 8v3a1 1 0 01-1 1" stroke={textColor} strokeWidth="1.5" fill="none" /></svg>
          </div>
        </div>
        {/* Scrollable content */}
        <div style={{ maxHeight: 762, overflowY: 'auto', overflowX: 'hidden' }}>
          {children}
        </div>
        {/* Home indicator */}
        <div style={{ padding: '8px 0 12px', display: 'flex', justifyContent: 'center', background: bg }}>
          <div style={{ width: 130, height: 4, background: textColor, borderRadius: 2, opacity: 0.25 }} />
        </div>
      </div>
    </div>
  );
}

// ── Mockup list ───────────────────────────────────────────────────────────────

const MOCKUPS = [
  { id: 'linkedin-desktop',  name: 'Feed Post',  sub: 'Desktop', platform: 'LinkedIn',   color: '#0a66c2', bg: '#dbeafe' },
  { id: 'linkedin-mobile',   name: 'Feed Post',  sub: 'Mobile',  platform: 'LinkedIn',   color: '#0a66c2', bg: '#dbeafe' },
  { id: 'instagram-mobile',  name: 'Feed Post',  sub: 'Mobile',  platform: 'Instagram',  color: '#e1306c', bg: '#fce7f3' },
  { id: 'instagram-story',   name: 'Story',      sub: 'Mobile',  platform: 'Instagram',  color: '#e1306c', bg: '#fce7f3' },
  { id: 'instagram-desktop', name: 'Feed Post',  sub: 'Desktop', platform: 'Instagram',  color: '#e1306c', bg: '#fce7f3' },
  { id: 'twitter-desktop',   name: 'Post',       sub: 'Desktop', platform: 'Twitter / X', color: '#000',  bg: '#e7e7e7' },
  { id: 'twitter-mobile',    name: 'Post',       sub: 'Mobile',  platform: 'Twitter / X', color: '#000',  bg: '#e7e7e7' },
  { id: 'facebook-desktop',  name: 'Feed Post',  sub: 'Desktop', platform: 'Facebook',   color: '#1877f2', bg: '#dbeafe' },
  { id: 'tiktok-mobile',     name: 'For You',    sub: 'Mobile',  platform: 'TikTok',     color: '#ff0050', bg: '#ffe4e6' },
];

// ── Platform SVG logos ────────────────────────────────────────────────────────

function IgLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <defs>
        <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f09433" />
          <stop offset="25%" stopColor="#e6683c" />
          <stop offset="50%" stopColor="#dc2743" />
          <stop offset="75%" stopColor="#cc2366" />
          <stop offset="100%" stopColor="#bc1888" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#ig-grad)" />
      <circle cx="12" cy="12" r="5" stroke="#fff" strokeWidth="1.8" fill="none" />
      <circle cx="17.5" cy="6.5" r="1.2" fill="#fff" />
    </svg>
  );
}

function XLogo({ size = 20, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.857L1.254 2.25H8.08l4.259 5.63 5.905-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

// ── LinkedIn Desktop ──────────────────────────────────────────────────────────

function LinkedInDesktopPost({ profile, onAvatarChange, creative, onCreativeChange }: MockupProps) {
  const font = '"system-ui", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  return (
    <div style={{ width: 1060, fontFamily: font, fontSize: 14, userSelect: 'none' }}>
      {/* Nav */}
      <div style={{ background: '#fff', borderBottom: '1px solid rgba(0,0,0,0.1)', height: 52,
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8, flexShrink: 0 }}>
        <div style={{ width: 34, height: 34, background: '#0a66c2', borderRadius: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 900, fontSize: 20, fontFamily: 'Georgia, serif', userSelect: 'none' }}>in</div>
        <div style={{ background: '#eef3f8', borderRadius: 4, padding: '7px 12px',
          display: 'flex', alignItems: 'center', gap: 6, width: 230 }}>
          <Search size={13} color="#666" />
          <span style={{ fontSize: 13, color: '#888' }}>Search</span>
        </div>
        <div style={{ flex: 1 }} />
        {[
          { icon: <Home size={20} />, label: 'Home' },
          { icon: <Users size={20} />, label: 'Network' },
          { icon: <Briefcase size={20} />, label: 'Jobs' },
          { icon: <MessageSquare size={20} />, label: 'Messaging' },
          { icon: <Bell size={20} />, label: 'Notifications' },
        ].map(({ icon, label }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '0 10px', cursor: 'pointer', color: '#666' }}>
            {icon}
            <span style={{ fontSize: 11, marginTop: 1 }}>{label}</span>
          </div>
        ))}
        <div style={{ width: 1, height: 28, background: '#e0e0e0', margin: '0 4px' }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', padding: '0 10px' }}>
          <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={22} onUpload={onAvatarChange} />
          <span style={{ fontSize: 11, color: '#666', marginTop: 1 }}>Me ▾</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ background: '#f3f2ef', display: 'flex', gap: 20, padding: '20px',
        justifyContent: 'center', minHeight: 520 }}>

        {/* Left: Profile card */}
        <div style={{ width: 225, flexShrink: 0 }}>
          <div style={{ background: '#fff', borderRadius: 10, overflow: 'hidden',
            border: '1px solid rgba(0,0,0,0.09)' }}>
            <div style={{ height: 58, background: 'linear-gradient(135deg, #1BAFD8 0%, #0a66c2 100%)' }} />
            <div style={{ padding: '0 16px 16px', marginTop: -28 }}>
              <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color}
                size={56} onUpload={onAvatarChange}
                style={{ border: '2px solid #fff' }} />
              <div style={{ marginTop: 8 }}>
                <E style={{ display: 'block', fontWeight: 700, fontSize: 15, color: '#191919', lineHeight: 1.3 }}>{profile.name}</E>
                <E style={{ display: 'block', fontSize: 12, color: '#555', lineHeight: 1.4, marginTop: 2 }}>{profile.headline}</E>
              </div>
              <div style={{ borderTop: '1px solid #e8e8e8', margin: '12px -16px 0', padding: '10px 16px 0' }}>
                <div style={{ fontSize: 12, color: '#666' }}>
                  <E style={{ fontWeight: 700, color: '#191919' }}>{profile.connections}</E> connections
                </div>
                <div style={{ fontSize: 12, color: '#0a66c2', marginTop: 6, cursor: 'pointer', fontWeight: 600 }}>
                  Grow your network
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Post */}
        <div style={{ width: 560 }}>
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid rgba(0,0,0,0.09)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 10, padding: '12px 16px 8px', alignItems: 'flex-start' }}>
              <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={48} onUpload={onAvatarChange} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <E style={{ fontWeight: 700, fontSize: 14, color: '#191919', display: 'block' }}>{profile.name}</E>
                    <E style={{ fontSize: 12, color: '#666', display: 'block', marginTop: 1 }}>{profile.headline}</E>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <E style={{ fontSize: 12, color: '#666' }}>2h</E>
                      <span style={{ color: '#ccc' }}>·</span>
                      <span style={{ fontSize: 13 }}>🌐</span>
                    </div>
                  </div>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer',
                    color: '#666', fontSize: 22, padding: '0 4px', lineHeight: 1 }}>⋯</button>
                </div>
              </div>
            </div>
            <E as="div" style={{ padding: '4px 16px 12px', fontSize: 14, color: '#191919',
              lineHeight: 1.65, display: 'block', whiteSpace: 'pre-wrap' }}>
              {`We've been building something that changes how teams preview motion creatives in real context. Really excited to share this with you very soon 🚀\n\nDrop a comment below if you want early access.`}
            </E>
            <CreativeZone creative={creative} onCreativeChange={onCreativeChange} aspectRatio="1200/627" label="1200 × 627" />
            <div style={{ padding: '8px 16px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ fontSize: 16 }}>👍</span><span style={{ fontSize: 16 }}>❤️</span><span style={{ fontSize: 16 }}>💡</span>
                <E style={{ fontSize: 13, color: '#666', marginLeft: 3 }}>127</E>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <E style={{ fontSize: 13, color: '#666', cursor: 'pointer' }}>23 comments</E>
                <span style={{ color: '#ddd' }}>·</span>
                <E style={{ fontSize: 13, color: '#666', cursor: 'pointer' }}>14 reposts</E>
              </div>
            </div>
            <div style={{ display: 'flex', borderTop: '1px solid #e8e8e8', padding: '2px 8px' }}>
              {[['👍', 'Like'], ['💬', 'Comment'], ['🔁', 'Repost'], ['✉️', 'Send']].map(([ico, lbl]) => (
                <button key={lbl} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                  padding: '9px 4px', fontSize: 13, fontWeight: 600, color: '#666',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 4 }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f3f2ef')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <span>{ico}</span><span>{lbl}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: News */}
        <div style={{ width: 300, flexShrink: 0 }}>
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid rgba(0,0,0,0.09)', padding: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#191919', marginBottom: 12 }}>LinkedIn News</div>
            {[
              ['AI reshapes product workflows', '3h ago · 12K readers'],
              ['Remote work trends in 2026', '5h ago · 8.4K readers'],
              ['Design systems at scale', '1d ago · 5.1K readers'],
              ['Brand motion is the new copy', '2d ago · 3.2K readers'],
            ].map(([title, meta]) => (
              <div key={title} style={{ marginBottom: 12, cursor: 'pointer' }}>
                <E style={{ display: 'block', fontWeight: 600, fontSize: 13, color: '#191919' }}>{title}</E>
                <span style={{ fontSize: 12, color: '#888' }}>{meta}</span>
              </div>
            ))}
            <div style={{ fontSize: 13, color: '#666', cursor: 'pointer', marginTop: 4 }}>Show more ▾</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── LinkedIn Mobile ────────────────────────────────────────────────────────────

function LinkedInMobilePost({ profile, onAvatarChange, creative, onCreativeChange }: MockupProps) {
  const font = '"system-ui", -apple-system, sans-serif';
  return (
    <PhoneFrame>
      {/* Nav */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e8e8e8',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '6px 0', fontFamily: font }}>
        <div style={{ width: 28, height: 28, background: '#0a66c2', borderRadius: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 900, fontSize: 16, fontFamily: 'Georgia, serif' }}>in</div>
        <Search size={22} color="#666" />
        <div style={{ position: 'relative' }}>
          <Home size={22} color="#0a66c2" />
          <div style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8,
            background: '#cc1016', borderRadius: '50%' }} />
        </div>
        <MessageSquare size={22} color="#666" />
        <Bell size={22} color="#666" />
        <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={22} onUpload={onAvatarChange} />
      </div>

      {/* Feed */}
      <div style={{ background: '#f3f2ef', fontFamily: font }}>
        {/* Post card */}
        <div style={{ background: '#fff', marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 8, padding: '12px 12px 6px', alignItems: 'flex-start' }}>
            <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={40} onUpload={onAvatarChange} />
            <div style={{ flex: 1 }}>
              <E style={{ fontWeight: 700, fontSize: 14, color: '#191919', display: 'block' }}>{profile.name}</E>
              <E style={{ fontSize: 12, color: '#666', display: 'block' }}>{profile.headline}</E>
              <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                <E style={{ fontSize: 11, color: '#888' }}>2h</E>
                <span style={{ fontSize: 11, color: '#aaa' }}>· 🌐</span>
              </div>
            </div>
            <button style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
              <MoreHorizontal size={18} color="#666" />
            </button>
          </div>
          <E as="div" style={{ padding: '0 12px 10px', fontSize: 14, color: '#191919',
            lineHeight: 1.55, display: 'block', whiteSpace: 'pre-wrap' }}>
            {`We've been building something new. Excited to share soon 🚀\n\nComment below for early access.`}
          </E>
          <CreativeZone creative={creative} onCreativeChange={onCreativeChange} aspectRatio="1200/627" label="1200 × 627" />
          <div style={{ padding: '8px 12px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <span>👍❤️</span>
              <E style={{ fontSize: 12, color: '#888', marginLeft: 2 }}>127</E>
            </div>
            <E style={{ fontSize: 12, color: '#888' }}>23 comments</E>
          </div>
          <div style={{ display: 'flex', borderTop: '1px solid #e8e8e8', padding: '2px 4px' }}>
            {[['👍', 'Like'], ['💬', 'Comment'], ['🔁', 'Repost'], ['✉️', 'Send']].map(([ico, lbl]) => (
              <button key={lbl} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px 2px', fontSize: 11, fontWeight: 600, color: '#666',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                <span>{ico}</span><span>{lbl}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

// ── Instagram Mobile Post ──────────────────────────────────────────────────────

function InstagramMobilePost({ profile, onAvatarChange, creative, onCreativeChange }: MockupProps) {
  const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  return (
    <PhoneFrame>
      {/* Nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', background: '#fff', borderBottom: '1px solid #efefef', fontFamily: font }}>
        <svg width="105" height="30" viewBox="0 0 105 30" fill="none">
          <text x="0" y="23" fontFamily="'Billabong', cursive, serif" fontSize="26" fill="#000">Instagram</text>
        </svg>
        <div style={{ display: 'flex', gap: 16 }}>
          <Heart size={24} color="#000" />
          <MessageSquare size={24} color="#000" />
        </div>
      </div>

      {/* Stories */}
      <div style={{ display: 'flex', gap: 12, padding: '12px 16px', overflowX: 'auto',
        background: '#fff', borderBottom: '1px solid #efefef' }}>
        {['Your story', profile.name, 'Alex', 'Sam', 'Riley', 'Morgan'].map((name, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', padding: 2,
              background: i === 0 ? '#e8e8e8' : 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {i === 0
                ? <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={48} onUpload={onAvatarChange} />
                : <div style={{ width: 48, height: 48, borderRadius: '50%', background: `hsl(${i*60},60%,60%)`,
                    border: '2px solid #fff' }} />
              }
            </div>
            <span style={{ fontSize: 11, color: '#262626', fontFamily: font, maxWidth: 60,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {i === 0 ? 'Your story' : name}
            </span>
          </div>
        ))}
      </div>

      {/* Post */}
      <div style={{ background: '#fff', fontFamily: font }}>
        {/* Post header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', padding: 2,
              background: 'linear-gradient(45deg, #f09433, #bc1888)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={26} onUpload={onAvatarChange}
                style={{ border: '1.5px solid #fff' }} />
            </div>
            <div>
              <E style={{ fontWeight: 700, fontSize: 13, color: '#262626', display: 'block' }}>{profile.handle}</E>
              <E style={{ fontSize: 11, color: '#8e8e8e' }}>Sponsored</E>
            </div>
          </div>
          <MoreHorizontal size={18} color="#262626" />
        </div>

        {/* Creative – 1:1 */}
        <CreativeZone creative={creative} onCreativeChange={onCreativeChange} aspectRatio="1/1" label="1080 × 1080" />

        {/* Action bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px 4px' }}>
          <div style={{ display: 'flex', gap: 14 }}>
            <Heart size={24} color="#262626" />
            <MessageSquare size={24} color="#262626" />
            <Share2 size={24} color="#262626" />
          </div>
          <Bookmark size={24} color="#262626" />
        </div>

        {/* Likes */}
        <div style={{ padding: '0 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ display: 'flex' }}>
              {['#1BAFD8', '#e1306c', '#f97316'].map((c, i) => (
                <div key={i} style={{ width: 18, height: 18, borderRadius: '50%', background: c,
                  marginLeft: i > 0 ? -6 : 0, border: '1.5px solid #fff' }} />
              ))}
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#262626', fontFamily: font }}>
              <E>1,247 likes</E>
            </span>
          </div>
          <div style={{ marginTop: 4, fontSize: 13, fontFamily: font }}>
            <E style={{ fontWeight: 700, color: '#262626' }}>{profile.handle}</E>{' '}
            <E style={{ color: '#262626' }}>Motion creatives in real context — see how your GIFs look before you publish 🎨✨ Drop your thoughts below 👇</E>
          </div>
          <E style={{ display: 'block', fontSize: 12, color: '#8e8e8e', marginTop: 4 }}>View all 89 comments</E>
          <E style={{ display: 'block', fontSize: 11, color: '#c8c8c8', marginTop: 3 }}>2 HOURS AGO</E>
        </div>

        {/* Comment input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
          borderTop: '1px solid #efefef', marginTop: 8 }}>
          <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={28} onUpload={onAvatarChange} />
          <span style={{ fontSize: 13, color: '#8e8e8e', fontFamily: font, flex: 1 }}>Add a comment…</span>
          <span style={{ fontSize: 20 }}>😊</span>
        </div>
      </div>
    </PhoneFrame>
  );
}

// ── Instagram Story ────────────────────────────────────────────────────────────

function InstagramStory({ profile, onAvatarChange, creative, onCreativeChange }: MockupProps) {
  const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  return (
    <PhoneFrame bg={creative ? 'transparent' : '#111'}>
      <div style={{ position: 'relative', background: '#111', minHeight: 690, fontFamily: font }}>
        {/* Full-screen creative */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <CreativeZone creative={creative} onCreativeChange={onCreativeChange}
            aspectRatio="9/16" label="1080 × 1920"
            style={{ height: '100%', width: '100%', border: 'none', background: '#222', borderRadius: 0 }} />
        </div>
        {/* Overlay */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column',
          height: '100%', pointerEvents: 'none' }}>
          {/* Progress bars */}
          <div style={{ display: 'flex', gap: 3, padding: '8px 10px 0' }}>
            {[1, 0.3].map((fill, i) => (
              <div key={i} style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.35)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${fill * 100}%`, background: '#fff', borderRadius: 2 }} />
              </div>
            ))}
          </div>
          {/* Story header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
            pointerEvents: 'auto' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', padding: 2,
              background: 'linear-gradient(45deg, #f09433, #bc1888)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={26} onUpload={onAvatarChange}
                style={{ border: '1.5px solid #fff' }} />
            </div>
            <E style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>{profile.handle}</E>
            <E style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>2h</E>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 20, color: '#fff', cursor: 'pointer' }}>✕</span>
          </div>
          <div style={{ flex: 1 }} />
          {/* Bottom: reply + reactions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px 16px',
            pointerEvents: 'auto' }}>
            <div style={{ flex: 1, border: '1.5px solid rgba(255,255,255,0.5)', borderRadius: 22,
              padding: '9px 14px', fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
              Reply to <E style={{ color: '#fff', fontWeight: 600 }}>{profile.handle}</E>…
            </div>
            <span style={{ fontSize: 22 }}>❤️</span>
            <Share2 size={22} color="#fff" />
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

// ── Instagram Desktop ──────────────────────────────────────────────────────────

function InstagramDesktopPost({ profile, onAvatarChange, creative, onCreativeChange }: MockupProps) {
  const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  return (
    <div style={{ width: 980, fontFamily: font, background: '#fafafa', minHeight: 560 }}>
      {/* Nav */}
      <div style={{ background: '#fff', borderBottom: '1px solid #dbdbdb',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 60 }}>
        <svg height="30" viewBox="0 0 105 30"><text x="0" y="23" fontFamily="'Billabong', cursive, serif" fontSize="26" fill="#000">Instagram</text></svg>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#efefef',
          borderRadius: 8, padding: '6px 12px', width: 220 }}>
          <Search size={14} color="#8e8e8e" />
          <span style={{ fontSize: 14, color: '#8e8e8e' }}>Search</span>
        </div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <Home size={24} color="#000" />
          <Upload size={24} color="#262626" />
          <div style={{ position: 'relative' }}>
            <Heart size={24} color="#262626" />
            <div style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8,
              background: '#e1306c', borderRadius: '50%' }} />
          </div>
          <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={26} onUpload={onAvatarChange}
            style={{ border: '2px solid #000', borderRadius: '50%' }} />
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', gap: 28, padding: '28px 20px', justifyContent: 'center' }}>
        {/* Feed */}
        <div style={{ width: 470 }}>
          {/* Post card */}
          <div style={{ background: '#fff', border: '1px solid #dbdbdb', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', padding: 2,
                  background: 'linear-gradient(45deg, #f09433, #bc1888)' }}>
                  <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={24}
                    onUpload={onAvatarChange} style={{ border: '1.5px solid #fff' }} />
                </div>
                <div>
                  <E style={{ fontWeight: 700, fontSize: 13, color: '#262626', display: 'block' }}>{profile.handle}</E>
                  <E style={{ fontSize: 11, color: '#8e8e8e' }}>Sponsored</E>
                </div>
              </div>
              <MoreHorizontal size={16} color="#262626" />
            </div>
            <CreativeZone creative={creative} onCreativeChange={onCreativeChange} aspectRatio="1/1" label="1080 × 1080" />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px 4px' }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <Heart size={22} color="#262626" />
                <MessageSquare size={22} color="#262626" />
                <Share2 size={22} color="#262626" />
              </div>
              <Bookmark size={22} color="#262626" />
            </div>
            <div style={{ padding: '0 12px 12px' }}>
              <E style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#262626' }}>1,247 likes</E>
              <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
                <E style={{ fontWeight: 700, color: '#262626' }}>{profile.handle}</E>{' '}
                <E>Motion creatives in real context — see how your GIFs look before you publish 🎨</E>
              </div>
              <E style={{ display: 'block', fontSize: 12, color: '#8e8e8e', marginTop: 4 }}>View all 89 comments</E>
            </div>
          </div>
        </div>

        {/* Right: Suggestions */}
        <div style={{ width: 328 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={44} onUpload={onAvatarChange} />
              <div>
                <E style={{ fontWeight: 700, fontSize: 13, color: '#262626', display: 'block' }}>{profile.handle}</E>
                <E style={{ fontSize: 12, color: '#8e8e8e', display: 'block' }}>{profile.name}</E>
              </div>
            </div>
            <button style={{ background: 'none', border: 'none', fontSize: 12, fontWeight: 600,
              color: '#0095f6', cursor: 'pointer' }}>Switch</button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#8e8e8e' }}>Suggestions For You</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#262626', cursor: 'pointer' }}>See All</span>
          </div>
          {['kayleigh_designs', 'studio_null', 'motioncraft_co', 'dsgn_weekly'].map((u, i) => (
            <div key={u} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%',
                  background: `hsl(${i * 90},60%,60%)`, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>{u}</div>
                  <div style={{ fontSize: 11, color: '#8e8e8e' }}>Suggested for you</div>
                </div>
              </div>
              <button style={{ background: 'none', border: 'none', fontSize: 12, fontWeight: 600,
                color: '#0095f6', cursor: 'pointer' }}>Follow</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Twitter / X Desktop ───────────────────────────────────────────────────────

function TwitterDesktopPost({ profile, onAvatarChange, creative, onCreativeChange }: MockupProps) {
  const font = '"Chirp", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  return (
    <div style={{ width: 1000, background: '#000', fontFamily: font, display: 'flex', minHeight: 560, color: '#fff' }}>
      {/* Left nav */}
      <div style={{ width: 88, borderRight: '1px solid #2f3336', padding: '12px 0', display: 'flex',
        flexDirection: 'column', gap: 4, alignItems: 'center' }}>
        <div style={{ padding: '8px', marginBottom: 4 }}>
          <XLogo size={26} />
        </div>
        {[
          [<Home size={22} />, 'Home'],
          [<Search size={22} />, 'Explore'],
          [<Bell size={22} />, 'Notifications'],
          [<MessageSquare size={22} />, 'Messages'],
          [<Bookmark size={22} />, 'Bookmarks'],
          [<Users size={22} />, 'Profile'],
        ].map(([icon, label]) => (
          <button key={label as string} style={{ background: 'none', border: 'none', cursor: 'pointer',
            color: '#fff', padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', width: 48, height: 48, transition: 'background 0.1s' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}>
            {icon as React.ReactNode}
          </button>
        ))}
        <div style={{ marginTop: 8, width: 42, height: 42, background: '#1d9bf0', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>+</span>
        </div>
      </div>

      {/* Feed */}
      <div style={{ flex: 1, borderRight: '1px solid #2f3336', overflowY: 'auto' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #2f3336',
          fontWeight: 700, fontSize: 20 }}>Home</div>
        {/* Post */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #2f3336', display: 'flex', gap: 10 }}>
          <div style={{ flexShrink: 0 }}>
            <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={42} onUpload={onAvatarChange} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <E style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>{profile.name}</E>
              <E style={{ fontSize: 14, color: '#71767b' }}>@{profile.handle}</E>
              <span style={{ color: '#71767b' }}>·</span>
              <E style={{ fontSize: 14, color: '#71767b' }}>2h</E>
            </div>
            <E as="div" style={{ fontSize: 15, color: '#fff', lineHeight: 1.55, margin: '4px 0 10px',
              display: 'block', whiteSpace: 'pre-wrap' }}>
              {`We've been building something that changes how creative teams preview motion assets in real social context.\n\nReally excited to share this soon. 🚀`}
            </E>
            <CreativeZone creative={creative} onCreativeChange={onCreativeChange}
              aspectRatio="16/9" label="1600 × 900"
              style={{ borderRadius: 12, overflow: 'hidden' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, maxWidth: 420 }}>
              {[
                [<MessageSquare size={17} />, '89'],
                [<Repeat2 size={17} />, '234'],
                [<Heart size={17} />, '1.2K'],
                [<BarChart2 size={17} />, '48K'],
                [<Share2 size={17} />, ''],
              ].map(([icon, count], i) => (
                <button key={i} style={{ background: 'none', border: 'none', cursor: 'pointer',
                  color: '#71767b', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13,
                  borderRadius: 20, padding: '4px 8px', transition: 'all 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(29,155,240,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  {icon as React.ReactNode}
                  {count ? <E style={{ color: '#71767b' }}>{count as string}</E> : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right: trending */}
      <div style={{ width: 320, padding: '8px 16px' }}>
        <div style={{ background: '#16181c', borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 12 }}>What's happening</div>
          {[
            ['Technology', 'AI & Design', '48.3K posts'],
            ['Trending', 'Motion design', '12.1K posts'],
            ['Branding', 'Visual content', '9.4K posts'],
          ].map(([cat, topic, meta]) => (
            <div key={topic} style={{ padding: '10px 0', borderBottom: '1px solid #2f3336', cursor: 'pointer' }}>
              <div style={{ fontSize: 12, color: '#71767b' }}>{cat} · Trending</div>
              <E style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>{topic}</E>
              <div style={{ fontSize: 12, color: '#71767b', marginTop: 2 }}>{meta}</div>
            </div>
          ))}
        </div>
        <div style={{ background: '#16181c', borderRadius: 16, padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 12 }}>Who to follow</div>
          {['designpulse', 'motionstudio_hq', 'brandmotion'].map((u, i) => (
            <div key={u} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%',
                  background: `hsl(${i * 100},60%,55%)` }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{u}</div>
                  <div style={{ fontSize: 12, color: '#71767b' }}>@{u}</div>
                </div>
              </div>
              <button style={{ background: '#fff', border: 'none', borderRadius: 20,
                padding: '5px 14px', fontSize: 13, fontWeight: 700, color: '#000', cursor: 'pointer' }}>
                Follow
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Twitter / X Mobile ─────────────────────────────────────────────────────────

function TwitterMobilePost({ profile, onAvatarChange, creative, onCreativeChange }: MockupProps) {
  const font = '"Chirp", -apple-system, sans-serif';
  return (
    <PhoneFrame bg="#000">
      {/* Nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', background: '#000', borderBottom: '1px solid #2f3336' }}>
        <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={30} onUpload={onAvatarChange} />
        <XLogo size={22} />
        <div style={{ width: 30 }} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: '#000', borderBottom: '1px solid #2f3336' }}>
        {['For you', 'Following'].map((tab, i) => (
          <div key={tab} style={{ flex: 1, textAlign: 'center', padding: '12px 0', fontSize: 14,
            fontWeight: 700, color: i === 0 ? '#fff' : '#71767b', borderBottom: i === 0 ? '2px solid #1d9bf0' : 'none',
            fontFamily: font, cursor: 'pointer' }}>
            {tab}
          </div>
        ))}
      </div>

      {/* Post */}
      <div style={{ background: '#000', borderBottom: '1px solid #2f3336', padding: '12px',
        display: 'flex', gap: 10, fontFamily: font }}>
        <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={40} onUpload={onAvatarChange} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
            <E style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>{profile.name}</E>
            <E style={{ fontSize: 13, color: '#71767b' }}>· 2h</E>
          </div>
          <E as="div" style={{ fontSize: 14, color: '#fff', lineHeight: 1.5, margin: '4px 0 8px',
            display: 'block', whiteSpace: 'pre-wrap' }}>
            {`We've been building something new for creative teams. Excited to share soon 🚀`}
          </E>
          <CreativeZone creative={creative} onCreativeChange={onCreativeChange}
            aspectRatio="16/9" label="1600 × 900"
            style={{ borderRadius: 12, overflow: 'hidden' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
            {[
              [<MessageSquare size={16} />, '89'],
              [<Repeat2 size={16} />, '234'],
              [<Heart size={16} />, '1.2K'],
              [<BarChart2 size={16} />, ''],
            ].map(([icon, count], i) => (
              <button key={i} style={{ background: 'none', border: 'none', cursor: 'pointer',
                color: '#71767b', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                {icon as React.ReactNode}
                {count ? <E style={{ color: '#71767b' }}>{count as string}</E> : null}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom nav */}
      <div style={{ display: 'flex', justifyContent: 'space-around', padding: '10px 0',
        background: '#000', borderTop: '1px solid #2f3336' }}>
        {[<Home size={22} />, <Search size={22} />, <Bell size={22} />, <MessageSquare size={22} />].map((icon, i) => (
          <button key={i} style={{ background: 'none', border: 'none', cursor: 'pointer',
            color: i === 0 ? '#fff' : '#71767b', padding: '6px' }}>
            {icon}
          </button>
        ))}
      </div>
    </PhoneFrame>
  );
}

// ── Facebook Desktop ───────────────────────────────────────────────────────────

function FacebookDesktopPost({ profile, onAvatarChange, creative, onCreativeChange }: MockupProps) {
  const font = 'Helvetica, Arial, "system-ui", sans-serif';
  return (
    <div style={{ width: 1000, fontFamily: font, minHeight: 560 }}>
      {/* Nav */}
      <div style={{ background: '#1877f2', height: 56, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 36, height: 36, background: '#fff', borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#1877f2', fontWeight: 900, fontSize: 22, fontFamily: 'Arial Black, sans-serif' }}>f</span>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 20, padding: '7px 12px',
            display: 'flex', alignItems: 'center', gap: 6, width: 200 }}>
            <Search size={14} color="#fff" />
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>Search Facebook</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[<Home size={22} />, <Users size={22} />, <Bell size={22} />, <MessageSquare size={22} />].map((icon, i) => (
            <button key={i} style={{ background: i === 0 ? 'rgba(255,255,255,0.2)' : 'none',
              border: 'none', borderRadius: 8, padding: '6px 24px', cursor: 'pointer', color: '#fff' }}>
              {icon}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={32} onUpload={onAvatarChange} />
          <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>
            <E>{profile.name.split(' ')[0]}</E>
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ background: '#f0f2f5', display: 'flex', gap: 20, padding: '20px',
        justifyContent: 'center', minHeight: 500 }}>

        {/* Left nav */}
        <div style={{ width: 240, flexShrink: 0 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 12,
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
            {[['🏠', 'Home'], ['👥', 'Friends'], ['📺', 'Watch'], ['🗓️', 'Events'], ['💬', 'Messenger']].map(([ico, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px',
                borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500, color: '#050505' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#e7e7e7')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <span style={{ fontSize: 20 }}>{ico}</span><span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Center */}
        <div style={{ width: 500 }}>
          <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 10, padding: '12px 16px', alignItems: 'flex-start' }}>
              <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={40} onUpload={onAvatarChange} />
              <div>
                <E style={{ fontWeight: 600, fontSize: 14, color: '#050505', display: 'block' }}>{profile.name}</E>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
                  <E style={{ fontSize: 12, color: '#65676b' }}>2h</E>
                  <span style={{ fontSize: 12, color: '#65676b' }}>·</span>
                  <span style={{ fontSize: 13 }}>🌐</span>
                </div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <MoreHorizontal size={18} color="#65676b" />
              </div>
            </div>
            <E as="div" style={{ padding: '0 16px 12px', fontSize: 15, color: '#050505',
              lineHeight: 1.6, display: 'block' }}>
              We've been building something that changes how teams preview motion creatives. Excited to share this with everyone soon 🚀
            </E>
            <CreativeZone creative={creative} onCreativeChange={onCreativeChange} aspectRatio="1200/630" label="1200 × 630" />
            <div style={{ padding: '6px 16px', display: 'flex', justifyContent: 'space-between',
              borderBottom: '1px solid #e4e6eb' }}>
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <span style={{ fontSize: 16 }}>👍</span><span style={{ fontSize: 16 }}>❤️</span><span style={{ fontSize: 16 }}>😮</span>
                <E style={{ fontSize: 13, color: '#65676b', marginLeft: 4 }}>1.2K</E>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <E style={{ fontSize: 13, color: '#65676b', cursor: 'pointer' }}>89 comments</E>
                <span style={{ color: '#ddd' }}>·</span>
                <E style={{ fontSize: 13, color: '#65676b', cursor: 'pointer' }}>34 shares</E>
              </div>
            </div>
            <div style={{ display: 'flex', padding: '4px 8px' }}>
              {[['👍', 'Like'], ['💬', 'Comment'], ['↗️', 'Share']].map(([ico, lbl]) => (
                <button key={lbl} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                  padding: '8px', fontSize: 14, fontWeight: 600, color: '#65676b',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 4 }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f0f2f5')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <span>{ico}</span><span>{lbl}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: sponsored */}
        <div style={{ width: 300, flexShrink: 0 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#050505', marginBottom: 12 }}>Sponsored</div>
            {['Design Tools Weekly', 'Motion Studio App', 'Creative Cloud'].map((ad, i) => (
              <div key={ad} style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 80, height: 80, background: `hsl(${i * 120},50%,80%)`, borderRadius: 8, flexShrink: 0 }} />
                <div>
                  <E style={{ display: 'block', fontSize: 13, color: '#050505', fontWeight: 500 }}>{ad}</E>
                  <E style={{ display: 'block', fontSize: 12, color: '#65676b', marginTop: 2 }}>Sponsored</E>
                  <button style={{ marginTop: 6, background: '#e7f3ff', border: 'none', borderRadius: 6,
                    padding: '5px 10px', fontSize: 13, fontWeight: 600, color: '#1877f2', cursor: 'pointer' }}>
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

// ── TikTok Mobile ──────────────────────────────────────────────────────────────

function TikTokMobilePost({ profile, onAvatarChange, creative, onCreativeChange }: MockupProps) {
  const font = '"ProximaNova", -apple-system, BlinkMacSystemFont, sans-serif';
  return (
    <PhoneFrame bg="#000">
      {/* Tabs */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 20, padding: '10px 0 6px',
        background: '#000', fontFamily: font }}>
        {['Following', 'For You'].map((tab, i) => (
          <span key={tab} style={{ fontSize: 15, fontWeight: 700,
            color: i === 1 ? '#fff' : 'rgba(255,255,255,0.5)', cursor: 'pointer',
            borderBottom: i === 1 ? '2px solid #fff' : 'none', paddingBottom: 4 }}>
            {tab}
          </span>
        ))}
      </div>

      {/* Video area */}
      <div style={{ position: 'relative', background: '#111' }}>
        {/* Creative fills screen */}
        <CreativeZone creative={creative} onCreativeChange={onCreativeChange}
          aspectRatio="9/16" label="1080 × 1920"
          style={{ maxHeight: 540, border: 'none', background: '#1a1a1a', borderRadius: 0 }} />

        {/* Overlay */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', pointerEvents: 'none' }}>
          {/* Right icons */}
          <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 20, padding: '0 10px', justifyContent: 'flex-end', paddingBottom: 70, pointerEvents: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%',
                border: '2px solid #fff', overflow: 'hidden', position: 'relative' }}>
                <EditableAvatar src={profile.avatar} initials={profile.initials} color={profile.color} size={40} onUpload={onAvatarChange} />
              </div>
              <div style={{ width: 20, height: 20, background: '#ff0050', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: -10, fontSize: 14, color: '#fff', fontWeight: 700 }}>+</div>
            </div>
            {[['❤️', '1.2K'], ['💬', '89'], ['🔖', '234'], ['↗️', 'Share']].map(([ico, count]) => (
              <div key={count} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 28 }}>{ico}</span>
                <span style={{ fontSize: 11, color: '#fff', fontWeight: 600, fontFamily: font }}>{count}</span>
              </div>
            ))}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#333',
                border: '8px solid #333', overflow: 'hidden' }}>
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: `hsl(200,60%,50%)` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom overlay: username + description */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 56,
          padding: '12px', pointerEvents: 'none' }}>
          <div style={{ pointerEvents: 'auto' }}>
            <E style={{ display: 'block', fontWeight: 700, fontSize: 14, color: '#fff', fontFamily: font }}>
              @{profile.handle}
            </E>
            <E style={{ display: 'block', fontSize: 13, color: '#fff', lineHeight: 1.4, marginTop: 4, fontFamily: font }}>
              Motion creatives in real context ✨ Before you publish, preview it here 🎬 #design #motion #ux
            </E>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <span style={{ fontSize: 14 }}>🎵</span>
              <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
                <E style={{ fontSize: 12, color: '#fff', fontFamily: font }}>original sound - {profile.handle}</E>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom nav */}
      <div style={{ display: 'flex', justifyContent: 'space-around', padding: '8px 0',
        background: '#000', borderTop: '1px solid #2f2f2f' }}>
        {[['🏠', 'Home'], ['🔍', 'Explore'], ['➕', ''], ['📥', 'Inbox'], ['👤', 'Profile']].map(([ico, label], i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 2, cursor: 'pointer', minWidth: 50 }}>
            {i === 2
              ? <div style={{ background: '#fe2c55', borderRadius: 8, padding: '4px 12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 42, height: 28 }}>
                  <span style={{ fontSize: 18, color: '#fff' }}>+</span>
                </div>
              : <span style={{ fontSize: 22 }}>{ico}</span>
            }
            <span style={{ fontSize: 10, color: i === 0 ? '#fff' : '#888', fontFamily: font }}>{label}</span>
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}

// ── Template map ──────────────────────────────────────────────────────────────

const TEMPLATE_MAP: Record<string, React.ComponentType<MockupProps>> = {
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

// ── Main Page ─────────────────────────────────────────────────────────────────

const DEFAULT_PROFILE: Profile = {
  name:        'Jordan Lee',
  handle:      'jordanlee',
  headline:    'Creative Director · Pulse Studio',
  connections: '2,847',
  followers:   '4.1K',
  initials:    'JL',
  color:       '#1BAFD8',
  avatar:      null,
};

export default function Mockups() {
  const navigate  = useNavigate();
  const [active,   setActive]   = useState('linkedin-desktop');
  const [profile,  setProfile]  = useState<Profile>(DEFAULT_PROFILE);
  const [creatives, setCreatives] = useState<Record<string, string | null>>({});

  const platforms = [...new Set(MOCKUPS.map(m => m.platform))];
  const creative   = creatives[active] ?? null;
  const Template   = TEMPLATE_MAP[active];

  const handleAvatarChange = (url: string) =>
    setProfile(p => ({ ...p, avatar: url }));
  const handleCreativeChange = (url: string) =>
    setCreatives(prev => ({ ...prev, [active]: url }));

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column',
      fontFamily: '"Inter", system-ui, sans-serif', background: '#f5f5f5' }}>

      {/* Top bar */}
      <div style={{ height: 52, background: '#fff', borderBottom: '1px solid #e8e8e8',
        display: 'flex', alignItems: 'center', padding: '0 20px', gap: 16, flexShrink: 0 }}>
        <button
          onClick={() => navigate('/dashboard')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500,
            padding: '5px 8px', borderRadius: 6, transition: 'background 0.1s' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#f0f0f0')}
          onMouseLeave={e => (e.currentTarget.style.background = '')}>
          <ArrowLeft size={15} /> Dashboard
        </button>
        <div style={{ width: 1, height: 20, background: '#e0e0e0' }} />
        <PeekboardLogo height={20} />
        <div style={{ width: 1, height: 20, background: '#e0e0e0' }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: '#0a0a0a' }}>Mockups</span>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: '#aaa', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 14 }}>✏️</span> Click any text to edit · Click avatar or image to replace
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Sidebar */}
        <div style={{ width: 220, background: '#fff', borderRight: '1px solid #e8e8e8',
          overflowY: 'auto', flexShrink: 0, padding: '12px 8px' }}>
          {platforms.map(platform => {
            const items = MOCKUPS.filter(m => m.platform === platform);
            return (
              <div key={platform} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa', letterSpacing: '0.08em',
                  textTransform: 'uppercase', padding: '4px 8px 6px' }}>
                  {platform}
                </div>
                {items.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setActive(m.id)}
                    style={{
                      width: '100%', textAlign: 'left', background: active === m.id ? `${m.bg}` : 'none',
                      border: 'none', borderRadius: 8, padding: '8px 10px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (active !== m.id) e.currentTarget.style.background = '#f5f5f5'; }}
                    onMouseLeave={e => { if (active !== m.id) e.currentTarget.style.background = ''; }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: active === m.id ? m.color : '#0a0a0a' }}>
                        {m.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#999', marginTop: 1 }}>{m.sub}</div>
                    </div>
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        {/* Main canvas */}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'flex-start',
          justifyContent: 'center', padding: '32px', background: '#f0f0f0' }}>
          {Template && (
            <Template
              profile={profile}
              onAvatarChange={handleAvatarChange}
              creative={creative}
              onCreativeChange={handleCreativeChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}
