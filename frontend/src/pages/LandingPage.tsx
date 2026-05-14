import { Link } from 'react-router-dom';

export default function LandingPage() {
  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#f5f4f0', minHeight: '100vh' }}>

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', height: 56,
        background: 'rgba(245,244,240,0.92)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect width="8" height="8" fill="#0a0a0a" />
            <rect x="10" y="10" width="8" height="8" fill="#0a0a0a" />
            <rect x="10" width="8" height="8" fill="#0a0a0a" />
          </svg>
          <span style={{
            fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em',
            color: '#0a0a0a', fontFamily: 'Inter, sans-serif',
          }}>
            Peekboard
          </span>
        </div>

        {/* Nav actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link to="/login" style={{
            fontSize: 14, fontWeight: 500, color: '#0a0a0a',
            textDecoration: 'none', padding: '7px 16px', borderRadius: 8,
            fontFamily: 'Inter, sans-serif',
            transition: 'background 0.15s',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.05)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            Log in
          </Link>
          <Link to="/signup" style={{
            fontSize: 14, fontWeight: 500, color: '#fff',
            textDecoration: 'none', padding: '7px 18px', borderRadius: 8,
            background: '#0a0a0a', fontFamily: 'Inter, sans-serif',
            transition: 'background 0.15s',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = '#333')}
            onMouseLeave={e => (e.currentTarget.style.background = '#0a0a0a')}
          >
            Sign up
          </Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section style={{
        position: 'relative',
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
      }}>

        {/* Background video */}
        <video
          autoPlay
          muted
          loop
          playsInline
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover',
            objectPosition: 'center center',
            zIndex: 0,
          }}
        >
          <source src="/hero-bg.webm" type="video/webm" />
          <source src="/hero-bg.mp4"  type="video/mp4" />
        </video>

        {/* Subtle vignette so card sits cleanly on the scene */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1,
          background: 'linear-gradient(to right, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.04) 55%, transparent 100%)',
          pointerEvents: 'none',
        }} />

        {/* Content card */}
        <div style={{
          position: 'relative', zIndex: 2,
          marginLeft: 'clamp(24px, 5vw, 80px)',
          marginTop: 56, /* nav height offset */
          background: 'rgba(242,240,235,0.93)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: 20,
          padding: 'clamp(32px, 4vw, 52px)',
          maxWidth: 540,
          width: '90%',
          boxShadow: '0 2px 40px rgba(0,0,0,0.10)',
        }}>

          {/* Heading — Crimson Pro Regular */}
          <h1 style={{
            fontFamily: '"Crimson Pro", Georgia, serif',
            fontWeight: 400,
            fontSize: 'clamp(42px, 5vw, 64px)',
            lineHeight: 1.05,
            letterSpacing: '-0.01em',
            color: '#0a0a0a',
            margin: '0 0 20px 0',
          }}>
            Preview your<br />
            motion creatives<br />
            in context
          </h1>

          {/* Subtext — Source Serif 4 Regular */}
          <p style={{
            fontFamily: '"Source Serif 4", "Source Serif Pro", Georgia, serif',
            fontWeight: 400,
            fontSize: 'clamp(15px, 1.4vw, 18px)',
            lineHeight: 1.6,
            color: '#3a3a3a',
            margin: '0 0 32px 0',
          }}>
            See your GIFs in real social feeds, leave feedback,
            and get sign-off before publishing.
          </p>

          {/* CTA button — Inter Medium */}
          <Link to="/login" style={{
            display: 'inline-flex',
            alignItems: 'center',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 500,
            fontSize: 15,
            color: '#fff',
            background: '#0a0a0a',
            textDecoration: 'none',
            padding: '13px 24px',
            borderRadius: 10,
            letterSpacing: '-0.01em',
            transition: 'background 0.15s, transform 0.1s',
          }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#333';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#0a0a0a';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Sign into your workspace
          </Link>
        </div>
      </section>
    </div>
  );
}
