import { useState, useCallback, useEffect, useRef, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import GoogleSignInButton from '@/components/GoogleSignInButton';

function getPostAuthRedirect(): string {
  const pending = localStorage.getItem('pending_invite');
  if (pending) return `/invite/${pending}`;
  return '/dashboard';
}

// ── Cat eye tracking overlay ─────────────────────────────────────────────────
// The cat's eye in the 1264×720 source frame sits at roughly (670, 215).
// We store it as a ratio so it scales with however large the video renders.
const EYE_X_RATIO  = 0.530;
const EYE_Y_RATIO  = 0.299;
const IRIS_R_RATIO = 0.028; // iris radius as fraction of video width

function CatEyeCanvas({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement> }) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const cursorRef  = useRef({ x: -9999, y: -9999 });
  const smoothRef  = useRef({ x: -9999, y: -9999 });
  const rafRef     = useRef<number>(0);
  const tiltRef    = useRef({ x: 0, y: 0 });       // current tilt degrees (for head turn)
  const tiltTgtRef = useRef({ x: 0, y: 0 });        // target tilt

  /* Sync canvas size to video element */
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const sync = () => {
      canvas.width  = video.clientWidth;
      canvas.height = video.clientHeight;
      canvas.style.width  = `${video.clientWidth}px`;
      canvas.style.height = `${video.clientHeight}px`;
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(video);
    return () => ro.disconnect();
  }, [videoRef]);

  /* Track cursor globally */
  useEffect(() => {
    const onMove = (e: MouseEvent) => { cursorRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  /* RAF draw loop */
  useEffect(() => {
    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const video  = videoRef.current;
      if (!canvas || !video) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const k = 0.10;
      smoothRef.current.x += (cursorRef.current.x - smoothRef.current.x) * k;
      smoothRef.current.y += (cursorRef.current.y - smoothRef.current.y) * k;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const W = canvas.width;
      const H = canvas.height;

      // ── Head tilt (applied via CSS transform on video wrapper) ───────────
      const rect    = canvas.getBoundingClientRect();
      const cx      = rect.left + W / 2;
      const cy      = rect.top  + H / 2;
      const MAX_DEG = 5;
      tiltTgtRef.current.x = ((smoothRef.current.y - cy) / (H / 2)) * -MAX_DEG;
      tiltTgtRef.current.y = ((smoothRef.current.x - cx) / (W / 2)) *  MAX_DEG;
      tiltRef.current.x += (tiltTgtRef.current.x - tiltRef.current.x) * 0.08;
      tiltRef.current.y += (tiltTgtRef.current.y - tiltRef.current.y) * 0.08;
      if (video.parentElement) {
        video.parentElement.style.transform =
          `perspective(900px) rotateX(${tiltRef.current.x.toFixed(2)}deg) rotateY(${tiltRef.current.y.toFixed(2)}deg)`;
      }

      // ── Pupil overlay ────────────────────────────────────────────────────
      const irisR  = W * IRIS_R_RATIO;
      const eyeSx  = W * EYE_X_RATIO;
      const eyeSy  = H * EYE_Y_RATIO;

      // Cursor in canvas-local space
      const lx = smoothRef.current.x - rect.left;
      const ly = smoothRef.current.y - rect.top;
      const dx = lx - eyeSx, dy = ly - eyeSy;
      const dist = Math.hypot(dx, dy) || 1;
      const maxOffset = irisR * 0.42;
      const t  = Math.min(dist, maxOffset) / dist;
      const px = eyeSx + dx * t;
      const py = eyeSy + dy * t;

      // Draw dark pupil (sits on top of the painted yellow iris)
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(px, py, irisR * 0.38, irisR * 0.42, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#0a0b0d';
      ctx.fill();
      // Catch-light
      ctx.beginPath();
      ctx.ellipse(px - irisR * 0.11, py - irisR * 0.14, irisR * 0.1, irisR * 0.1, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.fill();
      ctx.restore();
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [videoRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}
    />
  );
}

// ── Main Login component ─────────────────────────────────────────────────────
export default function Login() {
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [preToken,  setPreToken]  = useState<string | null>(null);
  const [twoCode,   setTwoCode]   = useState('');
  const { setAuth } = useAuthStore();
  const navigate    = useNavigate();
  const [searchParams] = useSearchParams();
  const videoRef    = useRef<HTMLVideoElement>(null);

  const inviteToken = searchParams.get('invite');
  useEffect(() => {
    if (inviteToken) localStorage.setItem('pending_invite', inviteToken);
  }, [inviteToken]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const r: any = await authApi.login({ email, password });
      if (r.requires_2fa) { setPreToken(r.token); }
      else { setAuth(r.user, r.token); navigate(getPostAuthRedirect()); }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally { setLoading(false); }
  };

  const verify2fa = async (e: FormEvent) => {
    e.preventDefault();
    if (!preToken || !twoCode.trim()) return;
    setError(''); setLoading(true);
    try {
      const { token, user } = await authApi.twoFaLogin(preToken, twoCode.trim());
      setAuth(user, token); navigate(getPostAuthRedirect());
    } catch (err: any) {
      setError(err.response?.data?.error || 'Code is incorrect.');
    } finally { setLoading(false); }
  };

  const sendMagicLink = async () => {
    if (!email.trim()) { setError('Enter your email first.'); return; }
    setLoading(true); setError('');
    try { await authApi.magicRequest(email.trim()); setMagicSent(true); }
    catch (err: any) { setError(err.response?.data?.error || 'Could not send the link.'); }
    finally { setLoading(false); }
  };

  const handleGoogle = useCallback(async (credential: string) => {
    setError(''); setLoading(true);
    try {
      const { token, user } = await authApi.google(credential);
      setAuth(user, token); navigate(getPostAuthRedirect());
    } catch (err: any) {
      setError(err.response?.data?.error || 'Google sign-in failed.');
    } finally { setLoading(false); }
  }, [navigate, setAuth]);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#e8e6e0',
      display: 'flex',
      fontFamily: 'Inter, sans-serif',
    }}>
      {/* ── Left column: form ──────────────────────────────────────────────── */}
      <div style={{
        width: 'clamp(360px, 45%, 560px)',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        padding: 'clamp(32px, 4vw, 56px) clamp(32px, 5vw, 72px)',
        justifyContent: 'space-between',
      }}>
        {/* Logo */}
        <img
          src="/peekboard-logo.svg"
          alt="Peekboard"
          style={{ height: 22, width: 'auto', display: 'block' }}
        />

        {/* Form area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: 48, paddingBottom: 32 }}>

          {/* Heading */}
          <h1 style={{
            fontFamily: '"Crimson Pro", Georgia, serif',
            fontWeight: 400,
            fontSize: 'clamp(36px, 3.5vw, 48px)',
            letterSpacing: '-0.05em',
            lineHeight: 1.0,
            color: '#0a0a0a',
            margin: '0 0 8px 0',
          }}>
            Welcome Back 👋
          </h1>
          <p style={{
            fontFamily: '"Source Serif 4", "Source Serif Pro", Georgia, serif',
            fontWeight: 400,
            fontSize: 16,
            letterSpacing: '-0.03em',
            color: '#555',
            margin: '0 0 36px 0',
          }}>
            {inviteToken ? 'Sign in to accept your board invite' : 'Sign in to your workspace'}
          </p>

          {/* Invite banner */}
          {inviteToken && (
            <div style={{
              marginBottom: 20, padding: '10px 16px', borderRadius: 10,
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
              fontSize: 13, color: '#4338ca',
            }}>
              🎉 You've been invited to a board — sign in to join it.
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              marginBottom: 16, padding: '10px 14px', borderRadius: 8,
              background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)',
              fontSize: 13, color: '#dc2626',
            }}>
              {error}
            </div>
          )}

          {preToken ? (
            /* 2FA form */
            <form onSubmit={verify2fa} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 14, color: '#555' }}>
                Open your authenticator app and enter the 6-digit code.
              </p>
              <LField label="Authenticator code">
                <input
                  value={twoCode}
                  onChange={e => setTwoCode(e.target.value.replace(/\D/g,'').slice(0, 10))}
                  inputMode="numeric" autoFocus
                  style={{ ...inputStyle, textAlign: 'center', letterSpacing: '0.4em', fontSize: 18 }}
                  placeholder="123 456"
                />
              </LField>
              <SubmitBtn disabled={loading || twoCode.length < 6}>
                {loading ? 'Verifying…' : 'Verify and sign in'}
              </SubmitBtn>
              <button type="button" onClick={() => { setPreToken(null); setTwoCode(''); setError(''); }}
                style={{ background: 'none', border: 'none', fontSize: 13, color: '#888', cursor: 'pointer' }}>
                Use a different account
              </button>
            </form>
          ) : (
            /* Main sign-in form */
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <LField label="Email">
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  style={inputStyle} placeholder="you@company.com" required autoFocus />
              </LField>

              <LField label="Password">
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  style={inputStyle} placeholder="••••••••" required />
                <div style={{ textAlign: 'right', marginTop: 4 }}>
                  <Link to="/forgot-password" style={{ fontSize: 13, color: '#4338ca', textDecoration: 'none' }}>
                    Forgot Password?
                  </Link>
                </div>
              </LField>

              <SubmitBtn disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </SubmitBtn>

              {magicSent ? (
                <p style={{ fontSize: 13, textAlign: 'center', color: '#16a34a' }}>
                  Magic link sent — check <strong>{email}</strong>.
                </p>
              ) : (
                <button type="button" onClick={sendMagicLink} disabled={loading}
                  style={{ background: 'none', border: 'none', fontSize: 13, color: '#888', cursor: 'pointer', padding: '4px 0' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#0a0a0a')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#888')}>
                  Or send me a sign-in link by email
                </button>
              )}

              <GoogleDivider />
              <GoogleSignInButton onCredential={handleGoogle} onError={err => setError(err.message)} />
            </form>
          )}

          <p style={{ marginTop: 28, fontSize: 14, color: '#666' }}>
            Don't you have an account?{' '}
            <Link
              to={inviteToken ? `/signup?invite=${inviteToken}` : '/signup'}
              style={{ color: '#4338ca', fontWeight: 500, textDecoration: 'none' }}
            >
              Sign up
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p style={{ fontSize: 11, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          © 2026 All rights reserved
        </p>
      </div>

      {/* ── Right column: cat video ─────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        padding: 'clamp(16px, 2vw, 24px)',
        display: 'flex',
        alignItems: 'stretch',
        minWidth: 0,
      }}>
        <div style={{
          flex: 1,
          borderRadius: 24,
          overflow: 'hidden',
          position: 'relative',
          transformOrigin: 'center center',
          transition: 'box-shadow 0.3s',
          boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
        }}>
          <video
            ref={videoRef}
            autoPlay muted loop playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          >
            <source src="/cat-login.webm" type="video/webm" />
            <source src="/cat-login.mp4"  type="video/mp4" />
          </video>
          <CatEyeCanvas videoRef={videoRef} />
        </div>
      </div>
    </div>
  );
}

// ── Small helpers ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  borderRadius: 10,
  border: '1.5px solid #d4d2cc',
  background: '#fff',
  fontSize: 14,
  color: '#0a0a0a',
  outline: 'none',
  fontFamily: 'Inter, sans-serif',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
};

function LField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: '#0a0a0a' }}>{label}</label>
      {children}
    </div>
  );
}

function SubmitBtn({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      style={{
        width: '100%',
        padding: '13px',
        borderRadius: 10,
        border: 'none',
        background: '#0a0a0a',
        color: '#fff',
        fontSize: 15,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'Inter, sans-serif',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = '#2a2a2a'; }}
      onMouseLeave={e => { e.currentTarget.style.background = '#0a0a0a'; }}
    >
      {children}
    </button>
  );
}

function GoogleDivider() {
  if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, height: 1, background: '#d4d2cc' }} />
      <span style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em' }}>or</span>
      <div style={{ flex: 1, height: 1, background: '#d4d2cc' }} />
    </div>
  );
}
