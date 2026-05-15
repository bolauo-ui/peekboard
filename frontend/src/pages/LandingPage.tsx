import { Link } from 'react-router-dom';

export default function LandingPage() {
  return (
    <div style={{ fontFamily: 'Inter, sans-serif', minHeight: '100vh', background: '#e8e6e0' }}>

      {/* ── Hero — full viewport with video behind everything ───────────────── */}
      <section style={{
        position: 'relative',
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>

        {/* Background video */}
        <video
          autoPlay muted loop playsInline
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

        {/* ── Nav — floats over video ─────────────────────────────────────── */}
        <nav style={{
          position: 'relative', zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 32px', height: 56,
          background: 'rgba(232,230,222,0.85)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(0,0,0,0.07)',
          flexShrink: 0,
        }}>
          <img
            src="/peekboard-logo.svg"
            alt="Peekboard"
            style={{ height: 22, width: 'auto', display: 'block' }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Link to="/login" style={{
              fontSize: 14, fontWeight: 500, color: '#0a0a0a',
              textDecoration: 'none', padding: '7px 16px', borderRadius: 8,
              fontFamily: 'Inter, sans-serif',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              Log in
            </Link>
            <Link to="/signup" style={{
              fontSize: 14, fontWeight: 500, color: '#fff',
              textDecoration: 'none', padding: '7px 20px', borderRadius: 8,
              background: '#0a0a0a', fontFamily: 'Inter, sans-serif',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = '#2a2a2a')}
              onMouseLeave={e => (e.currentTarget.style.background = '#0a0a0a')}
            >
              Sign up
            </Link>
          </div>
        </nav>

        {/* ── Content — vertically centred in remaining space ─────────────── */}
        <div style={{
          position: 'relative', zIndex: 2,
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 'clamp(24px, 5vw, 80px)',
        }}>
          {/* Content card */}
          <div style={{
            background: 'rgba(235,232,224,0.91)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderRadius: 22,
            padding: 'clamp(32px, 3.5vw, 50px) clamp(32px, 4vw, 56px)',
            maxWidth: 520,
            width: '90%',
            boxShadow: '0 4px 48px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.06)',
          }}>

            {/* Heading — Crimson Pro Regular */}
            <h1 style={{
              fontFamily: '"Crimson Pro", Georgia, serif',
              fontWeight: 400,
              fontSize: 60,
              lineHeight: 0.81,
              letterSpacing: '-0.05em',
              color: '#0a0a0a',
              margin: '0 0 20px 0',
            }}>
              Preview your<br />
              motion creatives<br />
              in context
            </h1>

            {/* Body — Source Serif 4 Regular */}
            <p style={{
              fontFamily: '"Source Serif 4", "Source Serif Pro", Georgia, serif',
              fontWeight: 400,
              fontSize: 'clamp(17px, 1.3vw, 19px)',
              lineHeight: 1.2,
              letterSpacing: '-0.03em',
              color: '#444',
              margin: '0 0 32px 0',
            }}>
              See your GIFs in real social feeds, leave feedback,
              and get sign-off before publishing.
            </p>

            {/* CTA — Inter Medium */}
            <Link to="/login" style={{
              display: 'inline-flex',
              alignItems: 'center',
              fontFamily: 'Inter, sans-serif',
              fontWeight: 500,
              fontSize: 15,
              color: '#fff',
              background: '#0a0a0a',
              textDecoration: 'none',
              padding: '13px 26px',
              borderRadius: 10,
              letterSpacing: '-0.01em',
              transition: 'background 0.15s, transform 0.12s',
            }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#2a2a2a';
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
        </div>
      </section>
    </div>
  );
}
