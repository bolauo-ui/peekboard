import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import rateLimit from 'express-rate-limit';
import { sendMail, welcomeEmail, inviteEmail, resetEmail, verifyEmail, mentionEmail, magicLinkEmail, isMailConfigured } from './mailer';
import { makeWelcomeCanvas } from './welcomeBoard';

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-peekboard-2024';
const APP_URL = process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`;
const IS_PROD = process.env.NODE_ENV === 'production';

// ── Storage paths ─────────────────────────────────────────────────────────────
// On Railway every deploy replaces the container, which would wipe the local
// `./data` and `./uploads` directories — that's why existing boards / GIFs
// kept disappearing after each push. We now prefer a persistent location:
//   1. Explicit `DATA_DIR` env var (lets the operator point anywhere)
//   2. Railway's `RAILWAY_VOLUME_MOUNT_PATH` if a Volume is attached
//   3. Fall back to local `./data` for `npm run dev`
// The same logic is applied for uploads, so user-uploaded GIFs / videos
// survive deploys when a Volume is mounted.
const PERSIST_ROOT =
  process.env.DATA_DIR
  || process.env.RAILWAY_VOLUME_MOUNT_PATH
  || path.join(__dirname, '..');

const DATA_DIR    = path.join(PERSIST_ROOT, 'data');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(PERSIST_ROOT, 'uploads');
const DB_PATH     = path.join(DATA_DIR, 'peekboard.json');
fs.mkdirSync(DATA_DIR,    { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// One-time migration: if the persistent volume is fresh but the legacy
// in-container `./data/peekboard.json` exists (left over from a previous
// non-volume deploy), copy it over so we don't appear to "lose" the boards.
const LEGACY_DB = path.join(__dirname, '..', 'data', 'peekboard.json');
if (LEGACY_DB !== DB_PATH && fs.existsSync(LEGACY_DB) && !fs.existsSync(DB_PATH)) {
  try {
    fs.copyFileSync(LEGACY_DB, DB_PATH);
    console.log('[peekboard] migrated legacy db.json → persistent volume');
  } catch (err) {
    console.warn('[peekboard] legacy db migration failed:', err);
  }
}
console.log(`[peekboard] storage → db=${DB_PATH}  uploads=${UPLOADS_DIR}`);

// ── JSON file database ────────────────────────────────────────────────────────
interface User {
  id: string; email: string; name: string;
  password_hash: string; avatar_color: string; created_at: string;
  // Set true once the user clicks the link emailed on signup. Optional for
  // backwards-compat with rows created before this column existed.
  email_verified?: boolean;
  // URL of the user-uploaded profile photo (Avatar falls back to the
  // letter-on-color circle when missing).
  avatar_url?: string;
  // Captured by the "How will you use Peekboard?" first-run prompt so we
  // can personalise the dashboard / template list later.
  use_case?:    'work' | 'personal' | 'design-review' | 'moodboard' | 'other';
  // ── 2FA / session revocation ───────────────────────────────────────────
  // Any JWT issued before `tokens_valid_after` is rejected by the
  // authenticate middleware. Bumping it = "sign out of every device".
  tokens_valid_after?: number;       // ms since epoch
  totp_secret?:        string;       // base32 — present once enrolled
  totp_enabled?:       boolean;
  totp_backup_codes?:  string[];     // bcrypt hashes; consumed on use
}
interface Board {
  id: string; name: string; owner_id: string; canvas_data: string;
  width: number; height: number; created_at: string; updated_at: string;
  // Tracks who last touched the board so cards can show "Edited by …"
  // without needing the canvas history. Optional for back-compat.
  last_edited_by?: string;   // user id
  last_edited_at?: string;   // ISO timestamp
  // Filed into a project / folder. Null = top-level "All boards".
  project_id?:    string | null;
  // Persisted canvas snapshot used as the dashboard card preview.
  thumbnail_url?: string;
  // When set, /view/:public_token serves the board without authentication.
  public_token?:  string;
}
interface Project {
  id: string; owner_id: string; name: string;
  color: string;          // accent for the sidebar swatch
  created_at: string;
}
interface MagicLink {
  token:      string;
  user_id:    string;
  expires_at: number;     // ms since epoch
}
interface Notification {
  id:         string;
  user_id:    string;            // recipient
  type:       'mention' | 'reply' | 'invite';
  from_user_id?: string;
  board_id?:    string;
  comment_id?:  string;
  text?:        string;          // short body snippet for preview
  read:         boolean;
  created_at:   string;
}
interface BoardAccess {
  id: string; board_id: string; email: string; user_id: string | null;
  role: string; invite_token: string; accepted: boolean; created_at: string;
}
interface Comment {
  id: string; board_id: string; user_id: string;
  x: number; y: number; content: string; parent_id: string | null;
  resolved: boolean; created_at: string;
}
interface PasswordReset {
  token:      string;
  user_id:    string;
  expires_at: number;   // ms since epoch
}
// Email-verification one-time tokens. Burned on use, GC'd when expired.
interface EmailVerify {
  token:      string;
  user_id:    string;
  expires_at: number;
}
// User-specific "starred" boards. We keep this in its own table rather than
// piggybacking on BoardAccess because the owner doesn't have a board_access
// row for their own boards.
interface BoardStar {
  user_id:  string;
  board_id: string;
}
interface MockupSnapshot {
  id:            string;
  owner_id:      string;
  name:          string;
  template_id:   string;   // e.g. 'linkedin-desktop'
  profile:       string;   // JSON-stringified Profile
  creatives:     string;   // JSON-stringified Record<string, string|null>
  thumbnail_url?: string;
  created_at:    string;
  updated_at:    string;
}
interface DbSchema {
  users: User[]; boards: Board[]; board_access: BoardAccess[]; comments: Comment[];
  password_resets?:    PasswordReset[];
  email_verifies?:     EmailVerify[];
  stars?:              BoardStar[];
  projects?:           Project[];
  magic_links?:        MagicLink[];
  notifications?:      Notification[];
  mockup_snapshots?:   MockupSnapshot[];
}

const readDb = (): DbSchema => {
  try {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')) as DbSchema;
    db.password_resets    ??= [];
    db.email_verifies     ??= [];
    db.stars              ??= [];
    db.projects           ??= [];
    db.magic_links        ??= [];
    db.notifications      ??= [];
    db.mockup_snapshots   ??= [];
    return db;
  } catch {
    return {
      users: [], boards: [], board_access: [], comments: [],
      password_resets: [], email_verifies: [], stars: [],
      projects: [], magic_links: [], notifications: [],
    };
  }
};

const writeDb = (data: DbSchema): void => {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
};

// Initialise db file if missing
if (!fs.existsSync(DB_PATH)) writeDb({ users: [], boards: [], board_access: [], comments: [] });

// ── Middleware ────────────────────────────────────────────────────────────────
const corsOrigin = IS_PROD
  ? (process.env.APP_URL ? [process.env.APP_URL] : true)   // same-origin in prod
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

// ── Rate limiting ─────────────────────────────────────────────────────────────
// General API limiter — generous for normal use, blocks abuse
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 500,                   // 500 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again shortly.' },
  skip: (req) => !IS_PROD,    // only enforce in production
}));

// Stricter limit on auth endpoints to prevent brute force
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts, please try again in 15 minutes.' },
  skip: (req) => !IS_PROD,
}));
app.use('/api/auth/register', rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many accounts created from this IP, please try again later.' },
  skip: (req) => !IS_PROD,
}));

// ── Static frontend (production) ──────────────────────────────────────────────
if (IS_PROD) {
  const PUBLIC_DIR = path.join(__dirname, '..', 'public');
  app.use(express.static(PUBLIC_DIR));
}

// ── Auth middleware ───────────────────────────────────────────────────────────
interface JwtPayload { id: string; email: string; name: string; avatar_color: string; iat?: number; step?: string; }

const authenticate = (req: any, res: any, next: any): void => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    // Reject the short-lived "2fa pre-auth" token here so it can't be used
    // as a full session token. It's only valid for /api/auth/2fa/login.
    if (payload.step === '2fa') {
      res.status(401).json({ error: 'Two-factor verification required' });
      return;
    }
    // "Sign out everywhere" support: if the user has bumped
    // tokens_valid_after since this JWT was issued, reject.
    if (payload.iat) {
      const db = readDb();
      const u = db.users.find(x => x.id === payload.id);
      if (u?.tokens_valid_after && payload.iat * 1000 < u.tokens_valid_after) {
        res.status(401).json({ error: 'Session expired. Please sign in again.' });
        return;
      }
    }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const getBoardAccess = (boardId: string, userId: string) => {
  const db = readDb();
  const board = db.boards.find((b) => b.id === boardId);
  if (!board) return null;
  if (board.owner_id === userId) return { board, role: 'owner' as const, db };
  const access = db.board_access.find((a) => a.board_id === boardId && a.user_id === userId && a.accepted);
  if (access) return { board, role: access.role, db };
  return null;
};

const requireBoardRole = (allowed: string[]) => (req: any, res: any, next: any): void => {
  const ctx = getBoardAccess(req.params.id, req.user.id);
  if (!ctx || !allowed.includes(ctx.role)) { res.status(403).json({ error: 'Access denied' }); return; }
  req.boardCtx = ctx;
  next();
};

// ── Auth ──────────────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { email, name, password } = req.body;
  if (!email || !name || !password) { res.status(400).json({ error: 'All fields required' }); return; }
  if (password.length < 6) { res.status(400).json({ error: 'Password must be at least 6 characters' }); return; }

  const db = readDb();
  const normalEmail = email.toLowerCase().trim();
  if (db.users.find((u) => u.email === normalEmail)) { res.status(409).json({ error: 'Email already registered' }); return; }

  const id = uuidv4();
  const password_hash = await bcrypt.hash(password, 12);
  const colors = ['#6366f1','#8b5cf6','#ec4899','#f97316','#10b981','#3b82f6','#f59e0b','#ef4444'];
  const avatar_color = colors[Math.floor(Math.random() * colors.length)];
  const now = new Date().toISOString();

  db.users.push({ id, email: normalEmail, name, password_hash, avatar_color, created_at: now, email_verified: false });

  // Auto-create a "Welcome" board so the user lands on something real
  // instead of an empty dashboard. The canvas content is hand-crafted
  // fabric.js JSON — see welcomeBoard.ts.
  const welcomeBoardId = uuidv4();
  db.boards.push({
    id:             welcomeBoardId,
    name:           'Welcome to Peekboard',
    owner_id:       id,
    canvas_data:    makeWelcomeCanvas(name),
    width:          1440, height: 900,
    created_at:     now, updated_at: now,
    last_edited_by: id, last_edited_at: now,
  });

  // Issue an email-verification token (24h TTL) and stash it.
  const verifyToken = uuidv4().replace(/-/g, '');
  db.email_verifies!.push({ token: verifyToken, user_id: id, expires_at: Date.now() + 24*60*60*1000 });
  db.email_verifies = db.email_verifies!.filter(v => v.expires_at > Date.now());

  writeDb(db);

  // Fire-and-forget welcome + verify emails; failure does not block account creation.
  sendMail({ ...welcomeEmail(name, APP_URL), to: normalEmail })
    .catch(err => console.warn('[peekboard] welcome mail failed', err));
  sendMail({ ...verifyEmail(name, `${APP_URL}/verify-email?token=${verifyToken}`), to: normalEmail })
    .catch(err => console.warn('[peekboard] verify mail failed', err));

  const token = jwt.sign({ id, email: normalEmail, name, avatar_color }, JWT_SECRET, { expiresIn: '365d' });
  res.status(201).json({ token, user: { id, email: normalEmail, name, avatar_color, email_verified: false } });
});

// Verify email token. We use GET so the link in the email can be clicked
// directly without JavaScript on the receiving side.
app.get('/api/auth/verify-email', (req, res) => {
  const token = String(req.query.token ?? '');
  if (!token) { res.status(400).json({ error: 'Missing token' }); return; }
  const db = readDb();
  const entry = db.email_verifies!.find(v => v.token === token);
  if (!entry || entry.expires_at < Date.now()) {
    res.status(400).json({ error: 'This verification link has expired. Sign in and resend it.' });
    return;
  }
  const user = db.users.find(u => u.id === entry.user_id);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  user.email_verified = true;
  db.email_verifies = db.email_verifies!.filter(v => v.token !== token);
  writeDb(db);
  res.json({ success: true });
});

// Resend the verification email for the currently-authenticated user.
// Lightweight, unauthenticated status endpoint so the UI can tell users
// upfront whether email delivery is actually configured on this server.
app.get('/api/system/status', (_req, res) => {
  res.json({ mail_configured: isMailConfigured() });
});

app.post('/api/auth/verify-email/resend', authenticate, async (req: any, res) => {
  const db = readDb();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  if (user.email_verified) { res.json({ success: true, already: true, mail_configured: isMailConfigured() }); return; }
  const verifyToken = uuidv4().replace(/-/g, '');
  db.email_verifies!.push({ token: verifyToken, user_id: user.id, expires_at: Date.now() + 24*60*60*1000 });
  db.email_verifies = db.email_verifies!.filter(v => v.expires_at > Date.now());
  writeDb(db);
  // Await the real send so we can tell the UI whether it actually went out.
  const result = await sendMail({ ...verifyEmail(user.name, `${APP_URL}/verify-email?token=${verifyToken}`), to: user.email });
  res.json({ success: true, mail_configured: isMailConfigured(), delivered: result.delivered });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) { res.status(400).json({ error: 'Email and password required' }); return; }

  const db = readDb();
  const user = db.users.find((u) => u.email === email.toLowerCase().trim());
  if (!user) { res.status(401).json({ error: 'Invalid credentials' }); return; }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) { res.status(401).json({ error: 'Invalid credentials' }); return; }

  // 2FA: if enrolled, hand the client a short-lived "pre-auth" token and
  // make them POST a TOTP code to /api/auth/2fa/login before we issue the
  // real JWT.
  if (user.totp_enabled) {
    const preToken = jwt.sign({ id: user.id, step: '2fa' }, JWT_SECRET, { expiresIn: '5m' });
    res.json({ requires_2fa: true, token: preToken });
    return;
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, avatar_color: user.avatar_color },
    JWT_SECRET, { expiresIn: '365d' }
  );
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, avatar_color: user.avatar_color, email_verified: !!user.email_verified, avatar_url: user.avatar_url, use_case: user.use_case } });
});

// ── Google Sign-In ─────────────────────────────────────────────────────────
// Accepts a Google ID token from the frontend's GIS button, verifies it by
// calling Google's tokeninfo endpoint (no SDK needed), then either creates
// a new user or signs in an existing one. Returns our usual JWT so the rest
// of the app is unchanged.
app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body as { credential?: string };
  if (!credential) { res.status(400).json({ error: 'Missing Google credential' }); return; }

  try {
    // Verify the ID token with Google. tokeninfo returns the decoded claims
    // only if the signature and expiry are valid; any issue ⇒ non-200.
    const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!resp.ok) { res.status(401).json({ error: 'Invalid Google token' }); return; }
    const payload = await resp.json() as {
      aud: string; sub: string; email: string; email_verified?: string | boolean;
      name?: string; given_name?: string; iss: string;
    };

    // Audience guard — token must be minted for our client ID, otherwise an
    // attacker could replay a token from any other Google project.
    const expectedAud = process.env.GOOGLE_CLIENT_ID;
    if (expectedAud && payload.aud !== expectedAud) {
      res.status(401).json({ error: 'Token audience mismatch' }); return;
    }
    if (!/^https:\/\/accounts\.google\.com|^accounts\.google\.com/.test(payload.iss)) {
      res.status(401).json({ error: 'Bad issuer' }); return;
    }
    const verified = payload.email_verified === true || payload.email_verified === 'true';
    if (!verified) { res.status(401).json({ error: 'Google email not verified' }); return; }

    const db = readDb();
    const normalEmail = payload.email.toLowerCase().trim();
    let user = db.users.find((u) => u.email === normalEmail);

    if (!user) {
      // First time: create a passwordless account linked by email.
      const id = uuidv4();
      const colors = ['#6366f1','#8b5cf6','#ec4899','#f97316','#10b981','#3b82f6','#f59e0b','#ef4444'];
      const avatar_color = colors[Math.floor(Math.random() * colors.length)];
      const now = new Date().toISOString();
      user = {
        id, email: normalEmail,
        name: payload.name || payload.given_name || normalEmail.split('@')[0],
        password_hash: '',          // no password — Google-only login
        avatar_color, created_at: now,
      } as User;
      db.users.push(user);
      writeDb(db);
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, avatar_color: user.avatar_color },
      JWT_SECRET, { expiresIn: '365d' }
    );
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, avatar_color: user.avatar_color, email_verified: !!user.email_verified, avatar_url: user.avatar_url, use_case: user.use_case } });
  } catch (err: any) {
    console.error('Google auth failed:', err);
    res.status(500).json({ error: 'Google sign-in failed' });
  }
});

app.get('/api/auth/me', authenticate, (req: any, res) => {
  const db = readDb();
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  const { password_hash: _, ...safe } = user;
  res.json({ user: safe });
});

// ── Update profile (display name + avatar colour) ──────────────────────────
app.put('/api/auth/me', authenticate, (req: any, res) => {
  const { name, avatar_color, avatar_url, use_case } = req.body as {
    name?: string; avatar_color?: string; avatar_url?: string | null; use_case?: string;
  };
  const db = readDb();
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  if (typeof name === 'string'         && name.trim())         user.name         = name.trim();
  if (typeof avatar_color === 'string' && /^#[0-9a-f]{6}$/i.test(avatar_color)) user.avatar_color = avatar_color;
  // `null` clears the photo back to the letter-on-color circle.
  if (avatar_url === null) delete user.avatar_url;
  else if (typeof avatar_url === 'string' && avatar_url.startsWith('/uploads/')) user.avatar_url = avatar_url;
  if (typeof use_case === 'string' && ['work','personal','design-review','moodboard','other'].includes(use_case)) {
    user.use_case = use_case as User['use_case'];
  }
  writeDb(db);
  const { password_hash: _, ...safe } = user;
  res.json({ user: safe });
});

// ── Change password (must know current) ────────────────────────────────────
app.post('/api/auth/password', authenticate, async (req: any, res) => {
  const { current, next } = req.body as { current?: string; next?: string };
  if (!next || next.length < 6) { res.status(400).json({ error: 'New password must be at least 6 characters' }); return; }

  const db = readDb();
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  // Google-only accounts have an empty password_hash — they set their first
  // password without proving an old one. Everyone else must prove the
  // current password before we'll change it.
  if (user.password_hash) {
    if (!current) { res.status(400).json({ error: 'Current password required' }); return; }
    const ok = await bcrypt.compare(current, user.password_hash);
    if (!ok) { res.status(401).json({ error: 'Current password is incorrect' }); return; }
  }

  user.password_hash = await bcrypt.hash(next, 12);
  writeDb(db);
  res.json({ success: true });
});

// ── Forgot password — issue token + email link ─────────────────────────────
app.post('/api/auth/forgot', async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email) { res.status(400).json({ error: 'Email required' }); return; }

  const db = readDb();
  const user = db.users.find((u) => u.email === email.toLowerCase().trim());
  // Always return success to avoid leaking which emails are registered.
  if (!user) { res.json({ success: true }); return; }

  const token = uuidv4().replace(/-/g, '');
  const expires_at = Date.now() + 60 * 60 * 1000;   // 1 hour
  db.password_resets!.push({ token, user_id: user.id, expires_at });
  // Garbage-collect expired tokens at the same time.
  db.password_resets = db.password_resets!.filter(r => r.expires_at > Date.now());
  writeDb(db);

  const resetUrl = `${APP_URL}/reset-password?token=${token}`;
  await sendMail({ ...resetEmail(user.name, resetUrl), to: user.email });
  res.json({ success: true });
});

// ── Reset password (no auth — uses one-time token) ─────────────────────────
app.post('/api/auth/reset', async (req, res) => {
  const { token, password } = req.body as { token?: string; password?: string };
  if (!token || !password || password.length < 6) {
    res.status(400).json({ error: 'Token + new password (>=6 chars) required' }); return;
  }
  const db = readDb();
  const reset = db.password_resets!.find(r => r.token === token);
  if (!reset || reset.expires_at < Date.now()) {
    res.status(400).json({ error: 'This reset link has expired. Request a new one.' }); return;
  }
  const user = db.users.find(u => u.id === reset.user_id);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  user.password_hash = await bcrypt.hash(password, 12);
  // Burn the token so it can't be reused.
  db.password_resets = db.password_resets!.filter(r => r.token !== token);
  writeDb(db);

  const newToken = jwt.sign(
    { id: user.id, email: user.email, name: user.name, avatar_color: user.avatar_color },
    JWT_SECRET, { expiresIn: '365d' }
  );
  res.json({ token: newToken, user: { id: user.id, email: user.email, name: user.name, avatar_color: user.avatar_color, email_verified: !!user.email_verified, avatar_url: user.avatar_url, use_case: user.use_case } });
});

// ── Magic-link login ──────────────────────────────────────────────────────────
// Request a one-time sign-in link. Always returns success so the endpoint
// doesn't leak which addresses are registered.
app.post('/api/auth/magic', async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email) { res.status(400).json({ error: 'Email required' }); return; }
  const db = readDb();
  const user = db.users.find(u => u.email === email.toLowerCase().trim());
  if (!user) { res.json({ success: true }); return; }

  const token = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, ''); // 64 chars
  const expires_at = Date.now() + 15 * 60 * 1000;   // 15 minutes
  db.magic_links!.push({ token, user_id: user.id, expires_at });
  // GC anything past its TTL.
  db.magic_links = db.magic_links!.filter(m => m.expires_at > Date.now());
  writeDb(db);

  const url = `${APP_URL}/magic-link?token=${token}`;
  await sendMail({ ...magicLinkEmail(user.name, url), to: user.email });
  res.json({ success: true });
});

// Consume a magic-link token. POST so it can't be triggered by a preload.
app.post('/api/auth/magic/verify', (req, res) => {
  const { token } = req.body as { token?: string };
  if (!token) { res.status(400).json({ error: 'Missing token' }); return; }
  const db = readDb();
  const entry = db.magic_links!.find(m => m.token === token);
  if (!entry || entry.expires_at < Date.now()) {
    res.status(400).json({ error: 'This sign-in link is invalid or expired.' });
    return;
  }
  const user = db.users.find(u => u.id === entry.user_id);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  // Burn the token so it can't be reused.
  db.magic_links = db.magic_links!.filter(m => m.token !== token);
  writeDb(db);

  const jwtToken = jwt.sign(
    { id: user.id, email: user.email, name: user.name, avatar_color: user.avatar_color },
    JWT_SECRET, { expiresIn: '365d' }
  );
  res.json({
    token: jwtToken,
    user: { id: user.id, email: user.email, name: user.name, avatar_color: user.avatar_color, email_verified: !!user.email_verified, avatar_url: user.avatar_url, use_case: user.use_case },
  });
});

// ── Boards ────────────────────────────────────────────────────────────────────
app.get('/api/boards', authenticate, (req: any, res) => {
  const db = readDb();
  // Build a lookup of the user's starred board ids and a tiny user-info
  // helper so we can attach edit + star metadata to every row.
  const myStars = new Set((db.stars ?? []).filter(s => s.user_id === req.user.id).map(s => s.board_id));
  const userInfo = (uid?: string) => {
    if (!uid) return null;
    const u = db.users.find(u => u.id === uid);
    return u ? { id: u.id, name: u.name, avatar_color: u.avatar_color } : null;
  };
  const decorate = (b: Board, role: string) => ({
    ...b,
    role,
    owner_name:         userInfo(b.owner_id)?.name ?? '',
    starred:            myStars.has(b.id),
    last_edited_by_name: userInfo(b.last_edited_by ?? b.owner_id)?.name ?? '',
    last_edited_by_color: userInfo(b.last_edited_by ?? b.owner_id)?.avatar_color ?? '#888',
    project_id:          b.project_id ?? null,
    thumbnail_url:       b.thumbnail_url ?? null,
  });

  const owned = db.boards
    .filter((b) => b.owner_id === req.user.id)
    .map((b) => decorate(b, 'owner'))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const shared = db.board_access
    .filter((a) => a.user_id === req.user.id && a.accepted)
    .flatMap((a) => {
      const board = db.boards.find((b) => b.id === a.board_id);
      if (!board) return [];
      return [decorate(board, a.role)];
    })
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  res.json({ boards: [...owned, ...shared] });
});

// Star / unstar a board.
app.post('/api/boards/:id/star', authenticate, requireBoardRole(['owner','editor','commenter','viewer']), (req: any, res) => {
  const db = readDb();
  const exists = db.stars!.some(s => s.user_id === req.user.id && s.board_id === req.params.id);
  if (!exists) db.stars!.push({ user_id: req.user.id, board_id: req.params.id });
  writeDb(db);
  res.json({ success: true, starred: true });
});
app.delete('/api/boards/:id/star', authenticate, (req: any, res) => {
  const db = readDb();
  db.stars = db.stars!.filter(s => !(s.user_id === req.user.id && s.board_id === req.params.id));
  writeDb(db);
  res.json({ success: true, starred: false });
});

app.post('/api/boards', authenticate, (req: any, res) => {
  const { name, width = 1920, height = 1080 } = req.body;
  if (!name?.trim()) { res.status(400).json({ error: 'Board name required' }); return; }

  const db = readDb();
  const now = new Date().toISOString();
  const board: Board = {
    id: uuidv4(), name: name.trim(), owner_id: req.user.id,
    canvas_data: '{"fabricData":{"objects":[]},"mediaItems":[]}',
    width, height, created_at: now, updated_at: now,
  };
  db.boards.push(board);
  writeDb(db);
  res.status(201).json({ board: { ...board, owner_name: req.user.name, role: 'owner' } });
});

app.get('/api/boards/:id', authenticate, requireBoardRole(['owner','editor','commenter','viewer']), (req: any, res) => {
  const db = readDb();
  const board = req.boardCtx.board;
  const owner_name = db.users.find((u: User) => u.id === board.owner_id)?.name ?? '';
  res.json({ board: { ...board, owner_name, role: req.boardCtx.role } });
});

app.put('/api/boards/:id', authenticate, requireBoardRole(['owner','editor']), (req: any, res) => {
  const db = readDb();
  const board = db.boards.find((b) => b.id === req.params.id)!;
  const { name, canvas_data, width, height } = req.body;
  if (name !== undefined) board.name = name;
  if (canvas_data !== undefined) board.canvas_data = canvas_data;
  if (width !== undefined) board.width = width;
  if (height !== undefined) board.height = height;
  const now = new Date().toISOString();
  board.updated_at = now;
  // Track who last edited this board so the dashboard can show an
  // "Edited by …" avatar next to the timestamp.
  if (canvas_data !== undefined || name !== undefined || width !== undefined || height !== undefined) {
    board.last_edited_by = req.user.id;
    board.last_edited_at = now;
  }
  writeDb(db);
  // Side-effect after persist: throttled version-history snapshot if this
  // save changed the canvas content.
  if (canvas_data !== undefined) maybeSnapshot(board, req.user.id);
  res.json({ success: true });
});

app.delete('/api/boards/:id', authenticate, (req: any, res) => {
  const db = readDb();
  const board = db.boards.find((b) => b.id === req.params.id && b.owner_id === req.user.id);
  if (!board) { res.status(403).json({ error: 'Only owner can delete a board' }); return; }
  db.boards = db.boards.filter((b) => b.id !== req.params.id);
  db.board_access = db.board_access.filter((a) => a.board_id !== req.params.id);
  db.comments = db.comments.filter((c) => c.board_id !== req.params.id);
  writeDb(db);
  res.json({ success: true });
});

// Duplicate a board (clones canvas_data, gives the copy a new owner-only id).
// Any role with at least viewer access can duplicate into their own account —
// matching Figma's "Duplicate to your drafts" behaviour. Comments and member
// access are intentionally NOT copied; the duplicate is a fresh personal copy.
app.post('/api/boards/:id/duplicate',
  authenticate,
  requireBoardRole(['owner','editor','commenter','viewer']),
  (req: any, res) => {
    const db = readDb();
    const src = db.boards.find((b) => b.id === req.params.id)!;
    const now = new Date().toISOString();
    const copy: Board = {
      id:           uuidv4(),
      name:         `${src.name} (copy)`,
      owner_id:     req.user.id,
      canvas_data:  src.canvas_data,
      width:        src.width,
      height:       src.height,
      created_at:   now,
      updated_at:   now,
    };
    db.boards.push(copy);
    writeDb(db);
    res.status(201).json({ board: copy });
  }
);

// ── Sharing ───────────────────────────────────────────────────────────────────
app.get('/api/boards/:id/members', authenticate, requireBoardRole(['owner','editor','commenter','viewer']), (req: any, res) => {
  const db = readDb();
  const members = db.board_access
    .filter((a) => a.board_id === req.params.id)
    .map((a) => {
      const u = a.user_id ? db.users.find((u) => u.id === a.user_id) : null;
      return { ...a, name: u?.name ?? null, avatar_color: u?.avatar_color ?? null };
    });
  const ownerUser = db.users.find((u) => u.id === req.boardCtx.board.owner_id);
  res.json({
    members,
    owner: ownerUser
      ? { id: ownerUser.id, email: ownerUser.email, name: ownerUser.name, avatar_color: ownerUser.avatar_color, role: 'owner' }
      : null,
  });
});

app.post('/api/boards/:id/share', authenticate, (req: any, res) => {
  const db = readDb();
  const board = db.boards.find((b) => b.id === req.params.id);
  if (!board || board.owner_id !== req.user.id) { res.status(403).json({ error: 'Only the owner can share this board' }); return; }

  const { email, role = 'viewer' } = req.body;
  if (!email?.trim()) { res.status(400).json({ error: 'Email required' }); return; }
  if (!['viewer','commenter','editor'].includes(role)) { res.status(400).json({ error: 'Invalid role' }); return; }

  const normalEmail = email.toLowerCase().trim();
  if (normalEmail === req.user.email) { res.status(400).json({ error: 'Cannot share with yourself' }); return; }

  const invitedUser = db.users.find((u) => u.email === normalEmail);
  const existing = db.board_access.find((a) => a.board_id === req.params.id && a.email === normalEmail);

  if (existing) {
    existing.role = role;
    if (invitedUser && !existing.user_id) { existing.user_id = invitedUser.id; existing.accepted = true; }
    writeDb(db);
    return res.json({ success: true, message: 'Access updated' });
  }

  const invite_token = uuidv4();
  db.board_access.push({
    id: uuidv4(), board_id: req.params.id, email: normalEmail,
    user_id: invitedUser?.id ?? null, role, invite_token,
    accepted: !!invitedUser, created_at: new Date().toISOString(),
  });
  writeDb(db);

  const share_url = `${APP_URL}/invite/${invite_token}`;

  // Fire-and-forget invite email. We still always return the share_url so
  // the owner can copy it manually if mail isn't configured.
  sendMail({ ...inviteEmail(board.name, req.user.name, role, share_url), to: normalEmail })
    .catch(err => console.warn('[peekboard] invite mail failed', err));

  res.json({ success: true, invite_token, share_url, message: invitedUser ? 'User added to board' : 'Invite link created' });
});

app.put('/api/boards/:id/members/:memberId', authenticate, (req: any, res) => {
  const db = readDb();
  const board = db.boards.find((b) => b.id === req.params.id);
  if (!board || board.owner_id !== req.user.id) { res.status(403).json({ error: 'Only owner can change roles' }); return; }
  const access = db.board_access.find((a) => a.id === req.params.memberId && a.board_id === req.params.id);
  if (!access) { res.status(404).json({ error: 'Member not found' }); return; }
  const { role } = req.body;
  if (!['viewer','commenter','editor'].includes(role)) { res.status(400).json({ error: 'Invalid role' }); return; }
  access.role = role;
  writeDb(db);
  res.json({ success: true });
});

app.delete('/api/boards/:id/members/:memberId', authenticate, (req: any, res) => {
  const db = readDb();
  const board = db.boards.find((b) => b.id === req.params.id);
  if (!board || board.owner_id !== req.user.id) { res.status(403).json({ error: 'Only owner can remove members' }); return; }
  db.board_access = db.board_access.filter((a) => !(a.id === req.params.memberId && a.board_id === req.params.id));
  writeDb(db);
  res.json({ success: true });
});

app.post('/api/invite/:token/accept', authenticate, (req: any, res) => {
  const db = readDb();
  const invite = db.board_access.find((a) => a.invite_token === req.params.token);
  if (!invite) { res.status(404).json({ error: 'Invalid or expired invite link' }); return; }
  if (invite.accepted) { res.json({ success: true, board_id: invite.board_id, already_accepted: true }); return; }
  invite.user_id = req.user.id;
  invite.accepted = true;
  writeDb(db);
  res.json({ success: true, board_id: invite.board_id });
});

// ── Comments ──────────────────────────────────────────────────────────────────
app.get('/api/boards/:id/comments', authenticate, requireBoardRole(['owner','editor','commenter','viewer']), (req: any, res) => {
  const db = readDb();
  const enriched = db.comments
    .filter((c) => c.board_id === req.params.id)
    .map((c) => {
      const u = db.users.find((u) => u.id === c.user_id);
      return { ...c, user_name: u?.name ?? 'Unknown', avatar_color: u?.avatar_color ?? '#6366f1' };
    });
  const comments = enriched.filter((c) => !c.parent_id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const replies = enriched.filter((c) => c.parent_id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  res.json({ comments, replies });
});

app.post('/api/boards/:id/comments', authenticate, requireBoardRole(['owner','editor','commenter']), (req: any, res) => {
  const { x, y, content, parent_id } = req.body;
  if (!content?.trim()) { res.status(400).json({ error: 'Comment content required' }); return; }

  const db = readDb();
  const comment: Comment = {
    id: uuidv4(), board_id: req.params.id, user_id: req.user.id,
    x: x ?? 0, y: y ?? 0, content: content.trim(),
    parent_id: parent_id ?? null, resolved: false, created_at: new Date().toISOString(),
  };
  db.comments.push(comment);
  writeDb(db);

  const u = db.users.find((u) => u.id === req.user.id)!;

  // ── @mention notifications ────────────────────────────────────────────────
  // Build the candidate list of "mentionable" users on this board: the
  // owner plus everyone with accepted board access. Then for every
  // "@Name" / "@First Last" substring in the comment, resolve to a user
  // and fire the mention email. Self-mentions are skipped so you don't
  // get an email for tagging yourself.
  const board = db.boards.find(b => b.id === req.params.id);
  if (board) {
    const recipients = new Map<string, { id: string; email: string; name: string }>();
    const owner = db.users.find(u => u.id === board.owner_id);
    if (owner) recipients.set(owner.id, { id: owner.id, email: owner.email, name: owner.name });
    db.board_access
      .filter(a => a.board_id === board.id && a.accepted && a.user_id)
      .forEach(a => {
        const m = db.users.find(u => u.id === a.user_id);
        if (m) recipients.set(m.id, { id: m.id, email: m.email, name: m.name });
      });

    const mentioned = new Set<string>();
    const mentionRe = /@([A-Za-z][\w'-]*(?:\s[A-Z][\w'-]*)?)/g;
    let m: RegExpExecArray | null;
    while ((m = mentionRe.exec(comment.content)) !== null) {
      const name = m[1].trim().toLowerCase();
      for (const r of recipients.values()) {
        if (r.id === u.id) continue;             // skip self
        if (r.name.toLowerCase() === name)       mentioned.add(r.id);
        if (r.name.toLowerCase().split(' ')[0] === name) mentioned.add(r.id);
      }
    }
    const boardUrl = `${APP_URL}/board/${board.id}`;
    const snippet = comment.content.length > 140 ? comment.content.slice(0, 140) + '…' : comment.content;
    for (const id of mentioned) {
      const r = recipients.get(id)!;
      sendMail({ ...mentionEmail(u.name, board.name, comment.content, boardUrl), to: r.email })
        .catch(err => console.warn('[peekboard] mention mail failed', err));
      // In-app notification — surfaced in the bell icon.
      db.notifications!.push({
        id: uuidv4(), user_id: id, type: 'mention', from_user_id: u.id,
        board_id: board.id, comment_id: comment.id, text: snippet,
        read: false, created_at: new Date().toISOString(),
      });
    }

    // Reply notification: ping the original comment's author (unless it's
    // the same person replying or already covered by an @mention).
    if (comment.parent_id) {
      const parent = db.comments.find(c => c.id === comment.parent_id);
      if (parent && parent.user_id !== u.id && !mentioned.has(parent.user_id)) {
        db.notifications!.push({
          id: uuidv4(), user_id: parent.user_id, type: 'reply', from_user_id: u.id,
          board_id: board.id, comment_id: comment.id, text: snippet,
          read: false, created_at: new Date().toISOString(),
        });
      }
    }
    writeDb(db);
  }

  res.status(201).json({ comment: { ...comment, user_name: u.name, avatar_color: u.avatar_color } });
});

// ── Notifications inbox ───────────────────────────────────────────────────────
app.get('/api/notifications', authenticate, (req: any, res) => {
  const db = readDb();
  const items = (db.notifications ?? [])
    .filter(n => n.user_id === req.user.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 100)
    .map(n => {
      const from = n.from_user_id ? db.users.find(u => u.id === n.from_user_id) : null;
      const board = n.board_id    ? db.boards.find(b => b.id === n.board_id)    : null;
      return {
        ...n,
        from_name:        from?.name ?? '',
        from_avatar:      from?.avatar_color ?? '#888',
        from_avatar_url:  from?.avatar_url,
        board_name:       board?.name ?? '',
      };
    });
  res.json({ notifications: items, unread: items.filter(n => !n.read).length });
});

app.post('/api/notifications/read', authenticate, (req: any, res) => {
  const { ids } = req.body as { ids?: string[] };
  const db = readDb();
  const target = Array.isArray(ids) && ids.length ? new Set(ids) : null;
  (db.notifications ?? []).forEach(n => {
    if (n.user_id !== req.user.id) return;
    if (target && !target.has(n.id)) return;
    n.read = true;
  });
  writeDb(db);
  res.json({ success: true });
});

// ── Board version history (file-backed snapshots) ────────────────────────────
// Snapshots are stored as JSON files under DATA_DIR/snapshots/<board_id>/
// keyed by ISO timestamp so listing them is just a directory read. We keep
// at most SNAPSHOT_CAP per board — older snapshots are pruned automatically.
const SNAPSHOTS_DIR = path.join(DATA_DIR, 'snapshots');
const SNAPSHOT_CAP  = 40;
fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });

const snapshotDirFor = (boardId: string) => {
  const p = path.join(SNAPSHOTS_DIR, boardId);
  fs.mkdirSync(p, { recursive: true });
  return p;
};

// Helper: write a new snapshot. Called from the board PUT handler after a
// canvas_data save, throttled to once every 60 s per board so dragging
// objects doesn't fill the disk.
const lastSnapAt = new Map<string, number>();
const maybeSnapshot = (board: Board, userId: string) => {
  const now = Date.now();
  const prev = lastSnapAt.get(board.id) ?? 0;
  if (now - prev < 60_000) return;
  lastSnapAt.set(board.id, now);

  const dir = snapshotDirFor(board.id);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${stamp}_${userId}.json`;
  try {
    fs.writeFileSync(path.join(dir, filename), board.canvas_data ?? '');
  } catch (err) {
    console.warn('[peekboard] snapshot write failed', err);
    return;
  }
  // Cap retention — newest 40 wins.
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
    while (files.length > SNAPSHOT_CAP) {
      const drop = files.shift()!;
      try { fs.unlinkSync(path.join(dir, drop)); } catch { /* */ }
    }
  } catch { /* */ }
};

app.get('/api/boards/:id/history',
  authenticate, requireBoardRole(['owner','editor','commenter','viewer']),
  (req: any, res) => {
    const dir = snapshotDirFor(req.params.id);
    let files: string[] = [];
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse(); }
    catch { /* */ }
    const db = readDb();
    const items = files.map(f => {
      // filename = ISO-stamp-with-dashes _userId.json
      const base = f.replace(/\.json$/, '');
      const idx  = base.lastIndexOf('_');
      const stampRaw = base.slice(0, idx);
      const userId   = base.slice(idx + 1);
      const iso = stampRaw.replace(/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/, '$1-$2-$3T$4:$5:$6.$7Z');
      const u = db.users.find(u => u.id === userId);
      return {
        id: f, created_at: iso, by_user_id: userId,
        by_name: u?.name ?? 'Unknown', by_avatar_color: u?.avatar_color ?? '#888',
      };
    });
    res.json({ snapshots: items });
  }
);

app.post('/api/boards/:id/history/restore',
  authenticate, requireBoardRole(['owner','editor']),
  (req: any, res) => {
    const { snapshot_id } = req.body as { snapshot_id?: string };
    if (!snapshot_id || !/^[\w.-]+\.json$/.test(snapshot_id)) {
      res.status(400).json({ error: 'Bad snapshot id' }); return;
    }
    const file = path.join(snapshotDirFor(req.params.id), snapshot_id);
    if (!fs.existsSync(file)) { res.status(404).json({ error: 'Snapshot not found' }); return; }
    const data = fs.readFileSync(file, 'utf-8');
    const db = readDb();
    const board = db.boards.find(b => b.id === req.params.id)!;
    // Take a "pre-restore" snapshot first so the action itself is undoable.
    maybeSnapshot(board, req.user.id);
    lastSnapAt.delete(board.id);   // force a fresh snapshot on next save
    board.canvas_data    = data;
    board.last_edited_by = req.user.id;
    board.last_edited_at = new Date().toISOString();
    board.updated_at     = board.last_edited_at;
    writeDb(db);
    res.json({ success: true, board });
  }
);

// ── 2FA (TOTP) ───────────────────────────────────────────────────────────────
// Lightweight RFC 6238 implementation so we avoid an extra npm dep. Backed
// by Node's built-in crypto. Compatible with Google Authenticator, 1Password,
// Authy, etc.
function base32Encode(buf: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0, out = '';
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(s: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of s.toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    value = (value << 5) | alphabet.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}
function totp(secretBase32: string, step = 30, digits = 6): string {
  const crypto = require('crypto');
  const counter = Math.floor(Date.now() / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secretBase32)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24)
             | ((hmac[offset + 1] & 0xff) << 16)
             | ((hmac[offset + 2] & 0xff) <<  8)
             | (hmac[offset + 3] & 0xff);
  return String(code % 10 ** digits).padStart(digits, '0');
}
function totpVerify(secret: string, code: string): boolean {
  // Allow ±1 step of clock drift.
  const crypto = require('crypto');
  for (const drift of [-1, 0, 1]) {
    const counter = Math.floor(Date.now() / 1000 / 30) + drift;
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(counter));
    const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const v = ((hmac[offset] & 0x7f) << 24)
            | ((hmac[offset + 1] & 0xff) << 16)
            | ((hmac[offset + 2] & 0xff) <<  8)
            | (hmac[offset + 3] & 0xff);
    if (String(v % 1_000_000).padStart(6, '0') === code) return true;
  }
  return false;
}

// Start 2FA setup: generate a new secret + return the otpauth:// URL the
// authenticator app can scan. The secret isn't persisted as "enabled" yet;
// the user must confirm by typing a code via /confirm below.
app.post('/api/auth/2fa/setup', authenticate, (req: any, res) => {
  const crypto = require('crypto');
  const secret = base32Encode(crypto.randomBytes(20));
  const db = readDb();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  user.totp_secret = secret;
  user.totp_enabled = false;
  writeDb(db);
  const label   = encodeURIComponent(`Peekboard:${user.email}`);
  const issuer  = encodeURIComponent('Peekboard');
  const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
  res.json({ otpauth, secret });
});

// Confirm a generated code, flip totp_enabled, and return one-time backup
// codes. The codes are stored as bcrypt hashes so a server compromise
// doesn't leak them.
app.post('/api/auth/2fa/confirm', authenticate, async (req: any, res) => {
  const { code } = req.body as { code?: string };
  if (!code) { res.status(400).json({ error: 'Code required' }); return; }
  const db = readDb();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user?.totp_secret) { res.status(400).json({ error: 'Run setup first' }); return; }
  if (!totpVerify(user.totp_secret, code)) { res.status(401).json({ error: 'Code is incorrect' }); return; }
  // Issue 8 backup codes.
  const crypto = require('crypto');
  const backup: string[] = [];
  user.totp_backup_codes = [];
  for (let i = 0; i < 8; i++) {
    const raw = crypto.randomBytes(5).toString('hex');
    backup.push(raw);
    user.totp_backup_codes.push(await bcrypt.hash(raw, 8));
  }
  user.totp_enabled = true;
  writeDb(db);
  res.json({ success: true, backup_codes: backup });
});

// Turn 2FA off. Requires either the user's current TOTP code or one of the
// backup codes to prevent a hijacked session from silently disabling it.
app.post('/api/auth/2fa/disable', authenticate, async (req: any, res) => {
  const { code } = req.body as { code?: string };
  if (!code) { res.status(400).json({ error: 'Code required' }); return; }
  const db = readDb();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user?.totp_enabled || !user.totp_secret) { res.status(400).json({ error: '2FA not enabled' }); return; }
  let ok = totpVerify(user.totp_secret, code);
  if (!ok && user.totp_backup_codes) {
    for (let i = 0; i < user.totp_backup_codes.length; i++) {
      if (await bcrypt.compare(code, user.totp_backup_codes[i])) {
        ok = true; user.totp_backup_codes.splice(i, 1); break;
      }
    }
  }
  if (!ok) { res.status(401).json({ error: 'Code is incorrect' }); return; }
  user.totp_enabled = false;
  delete user.totp_secret;
  delete user.totp_backup_codes;
  writeDb(db);
  res.json({ success: true });
});

// Step-up verification at login. When /login or /magic/verify detects that
// the user has 2FA enabled it returns `requires_2fa: true` + a short-lived
// 2fa-only JWT; the client POSTs that token + the 6-digit code here to get
// the real JWT.
app.post('/api/auth/2fa/login', async (req, res) => {
  const { token: pre, code } = req.body as { token?: string; code?: string };
  if (!pre || !code) { res.status(400).json({ error: 'Token and code required' }); return; }
  let payload: { id: string; step: string };
  try { payload = jwt.verify(pre, JWT_SECRET) as any; }
  catch { res.status(401).json({ error: 'Pre-auth token expired' }); return; }
  if ((payload as any).step !== '2fa') { res.status(401).json({ error: 'Wrong token type' }); return; }
  const db = readDb();
  const user = db.users.find(u => u.id === payload.id);
  if (!user?.totp_enabled || !user.totp_secret) { res.status(400).json({ error: '2FA not enabled' }); return; }
  let ok = totpVerify(user.totp_secret, code);
  if (!ok && user.totp_backup_codes) {
    for (let i = 0; i < user.totp_backup_codes.length; i++) {
      if (await bcrypt.compare(code, user.totp_backup_codes[i])) {
        ok = true; user.totp_backup_codes.splice(i, 1); writeDb(db); break;
      }
    }
  }
  if (!ok) { res.status(401).json({ error: 'Code is incorrect' }); return; }
  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, avatar_color: user.avatar_color },
    JWT_SECRET, { expiresIn: '365d' }
  );
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, avatar_color: user.avatar_color, email_verified: !!user.email_verified, avatar_url: user.avatar_url, use_case: user.use_case } });
});

// "Sign out of all devices" — bumps tokens_valid_after, invalidating every
// JWT that was issued before this moment.
app.post('/api/auth/sign-out-all', authenticate, (req: any, res) => {
  const db = readDb();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  user.tokens_valid_after = Date.now();
  writeDb(db);
  // Issue the caller a fresh token so they aren't immediately logged out.
  const fresh = jwt.sign(
    { id: user.id, email: user.email, name: user.name, avatar_color: user.avatar_color },
    JWT_SECRET, { expiresIn: '365d' }
  );
  res.json({ success: true, token: fresh });
});

app.patch('/api/comments/:id/resolve', authenticate, (req: any, res) => {
  const db = readDb();
  const c = db.comments.find((c) => c.id === req.params.id);
  if (c) { c.resolved = true; writeDb(db); }
  res.json({ success: true });
});

app.delete('/api/comments/:id', authenticate, (req: any, res) => {
  const db = readDb();
  const c = db.comments.find((c) => c.id === req.params.id);
  if (!c || c.user_id !== req.user.id) { res.status(403).json({ error: 'Cannot delete this comment' }); return; }
  db.comments = db.comments.filter((c) => c.id !== req.params.id);
  writeDb(db);
  res.json({ success: true });
});

// ── File upload ───────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/gif','video/mp4','video/webm','image/png','image/jpeg','image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

app.post('/api/upload', authenticate, upload.single('file'), (req: any, res) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded or unsupported type' }); return; }
  res.json({
    url: `/uploads/${req.file.filename}`,
    filename: req.file.filename,
    originalName: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
  });
});

// ── Avatar upload ─────────────────────────────────────────────────────────────
// Re-uses the same multer pipeline as media uploads. Saves the file path to
// the user record so /me etc. return it. We don't enforce dimensions; the
// client can pre-crop if it wants to.
const avatarUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png','image/jpeg','image/webp','image/gif'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Avatar must be PNG, JPEG, WebP or GIF.'));
  },
});
app.post('/api/auth/avatar', authenticate, avatarUpload.single('file'), (req: any, res) => {
  if (!req.file) { res.status(400).json({ error: 'No avatar file uploaded' }); return; }
  const db = readDb();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  user.avatar_url = `/uploads/${req.file.filename}`;
  writeDb(db);
  const { password_hash: _, ...safe } = user;
  res.json({ user: safe });
});

// ── Board thumbnail (base64 PNG from canvas.toDataURL) ────────────────────────
// We accept base64 in JSON rather than multipart to make the client-side
// flush trivial (just an extra fetch after save). The payload is capped at
// roughly 2 MB compressed JPEG which is plenty for a 320-px-wide preview.
app.post('/api/boards/:id/thumbnail',
  authenticate,
  requireBoardRole(['owner','editor']),
  (req: any, res) => {
    const { image } = req.body as { image?: string };
    if (!image || !image.startsWith('data:image/')) {
      res.status(400).json({ error: 'Image data URL required' });
      return;
    }
    const m = image.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
    if (!m) { res.status(400).json({ error: 'Unsupported image format' }); return; }
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 2 * 1024 * 1024) { res.status(413).json({ error: 'Thumbnail too large' }); return; }

    const filename = `thumb-${req.params.id}.${m[1] === 'jpg' ? 'jpeg' : m[1]}`;
    const filepath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(filepath, buf);

    const db = readDb();
    const board = db.boards.find(b => b.id === req.params.id);
    if (board) {
      // Append a cache-busting `?v=<ms>` so freshly uploaded thumbnails
      // override any cached version in the dashboard.
      board.thumbnail_url = `/uploads/${filename}?v=${Date.now()}`;
      writeDb(db);
    }
    res.json({ success: true, thumbnail_url: board?.thumbnail_url });
  }
);

// ── Projects (folders) ────────────────────────────────────────────────────────
app.get('/api/projects', authenticate, (req: any, res) => {
  const db = readDb();
  const projects = (db.projects ?? [])
    .filter(p => p.owner_id === req.user.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  res.json({ projects });
});

app.post('/api/projects', authenticate, (req: any, res) => {
  const { name, color = '#7b68ee' } = req.body as { name?: string; color?: string };
  if (!name?.trim()) { res.status(400).json({ error: 'Project name required' }); return; }
  const db = readDb();
  const project: Project = {
    id: uuidv4(), owner_id: req.user.id,
    name: name.trim(), color,
    created_at: new Date().toISOString(),
  };
  db.projects!.push(project);
  writeDb(db);
  res.status(201).json({ project });
});

app.patch('/api/projects/:id', authenticate, (req: any, res) => {
  const db = readDb();
  const project = db.projects!.find(p => p.id === req.params.id && p.owner_id === req.user.id);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  const { name, color } = req.body as { name?: string; color?: string };
  if (typeof name === 'string' && name.trim()) project.name = name.trim();
  if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) project.color = color;
  writeDb(db);
  res.json({ project });
});

app.delete('/api/projects/:id', authenticate, (req: any, res) => {
  const db = readDb();
  const idx = db.projects!.findIndex(p => p.id === req.params.id && p.owner_id === req.user.id);
  if (idx === -1) { res.status(404).json({ error: 'Project not found' }); return; }
  db.projects!.splice(idx, 1);
  // Boards filed into this project drop back to top-level rather than being deleted.
  db.boards = db.boards.map(b => b.project_id === req.params.id ? { ...b, project_id: null } : b);
  writeDb(db);
  res.json({ success: true });
});

// Move a board into / out of a project (null = top-level).
app.post('/api/boards/:id/move',
  authenticate,
  requireBoardRole(['owner','editor']),
  (req: any, res) => {
    const { project_id } = req.body as { project_id?: string | null };
    const db = readDb();
    const board = db.boards.find(b => b.id === req.params.id);
    if (!board) { res.status(404).json({ error: 'Board not found' }); return; }
    if (project_id) {
      const proj = db.projects!.find(p => p.id === project_id && p.owner_id === req.user.id);
      if (!proj) { res.status(404).json({ error: 'Project not found' }); return; }
      board.project_id = project_id;
    } else {
      board.project_id = null;
    }
    board.updated_at = new Date().toISOString();
    writeDb(db);
    res.json({ success: true, board });
  }
);

// ── LinkedIn Ad Scorer ────────────────────────────────────────────────────────
// Accepts a base64 canvas screenshot and returns a structured score using
// Claude Vision + published LinkedIn performance benchmarks.
app.post('/api/analyse/linkedin', authenticate, async (req: any, res) => {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
  if (!ANTHROPIC_API_KEY) {
    res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured on this server.' });
    return;
  }

  const { image, context } = req.body as { image?: string; context?: string };
  if (!image || !image.startsWith('data:image/')) {
    res.status(400).json({ error: 'image must be a base64 data URL' });
    return;
  }

  // Strip the data URL header to get raw base64 + media type
  const match = image.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!match) { res.status(400).json({ error: 'Invalid image format' }); return; }
  const [, mediaType, base64Data] = match;

  const brandContext = context?.trim() || '';

  const prompt = `You are a LinkedIn content strategist specialising in B2B enterprise brands.${brandContext ? `\n\nBRAND CONTEXT:\n${brandContext}` : ''}

Analyse this creative image for LinkedIn performance. Before scoring, first detect the visual style:
- Is it a PHOTOGRAPH (real people/places)?
- Is it an ILLUSTRATION or ABSTRACT ART (drawn, digital art, flat design, conceptual)?
- Is it a DATA/TEXT graphic (charts, stats, quote cards)?

CRITICAL RULE: Never penalise intentional illustration or abstract art for lacking human faces. Illustrations are a legitimate and effective brand strategy — score them on conceptual clarity and visual storytelling instead.

Return ONLY valid JSON — no markdown, no prose outside the JSON object.

{
  "overall": <0-100 integer>,
  "grade": <"A"|"B"|"C"|"D"|"F">,
  "visual_style": <"photograph"|"illustration"|"data_graphic"|"mixed">,
  "content_type": <"case_study"|"thought_leadership"|"event_promotion"|"culture"|"product"|"other">,
  "verdict": "<2 sentences: what this creative does well and its single biggest opportunity on LinkedIn>",
  "categories": [
    {
      "name": "Audience Fit",
      "score": <0-20>,
      "max": 20,
      "benchmark": "B2B creatives that speak directly to a specific role (CTO, VP, Head of X) see 58% higher engagement than generic messaging",
      "note": "<does this creative clearly speak to a senior enterprise decision-maker? what signals suggest this?>"
    },
    {
      "name": "Visual Impact & Scroll-Stop",
      "score": <0-20>,
      "max": 20,
      "benchmark": "You have 1.7 seconds to stop a scroll. Strong contrast, a clear focal point and visual hierarchy are the top predictors of thumb-stopping power",
      "note": "<assess contrast, focal clarity, and whether this would stop a scroll in a busy LinkedIn feed — if illustration, assess conceptual boldness>"
    },
    {
      "name": "Message Clarity",
      "score": <0-20>,
      "max": 20,
      "benchmark": "LinkedIn posts where the value proposition is clear within 3 seconds perform 2.4× better. The viewer should immediately know what this is about",
      "note": "<can you understand the core message in 3 seconds? is the headline/hook strong?>"
    },
    {
      "name": "Brand Consistency",
      "score": <0-15>,
      "max": 15,
      "benchmark": "Consistent visual identity across posts builds 23% higher brand recall. Enterprise buyers need to immediately recognise whose content this is",
      "note": "<does this feel like a consistent, professional brand? comment on colour, typography, visual style coherence>"
    },
    {
      "name": "Trust & Credibility Signals",
      "score": <0-15>,
      "max": 15,
      "benchmark": "Enterprise buyers are risk-averse. Creatives with social proof (client logos, stats, outcomes, credentials) see 3× higher CTR from senior decision-makers",
      "note": "<are there trust signals: client names, outcome stats, credentials, recognisable logos? what's present or missing?>"
    },
    {
      "name": "Call to Action",
      "score": <0-10>,
      "max": 10,
      "benchmark": "B2B creatives with a clear next step (read, watch, download, apply) see 2× higher click-through — even a subtle CTA outperforms none",
      "note": "<is there a visible CTA or implied next step? how clear and compelling is it?>"
    }
  ],
  "suggestions": [
    "<most impactful specific improvement — be concrete, e.g. 'Add a client outcome stat like 40% faster deployment' not just 'add social proof'>",
    "<second improvement — equally specific>",
    "<third improvement>"
  ],
  "content_type_tips": "<1-2 sentences of advice specific to the detected content type — e.g. if it's thought leadership, what makes enterprise thought leadership land on LinkedIn>"
}`;

  // Call Anthropic with automatic retry on transient failures.
  const callClaude = async (maxTokens: number): Promise<string> => {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            { type: 'text',  text: prompt },
          ],
        }],
      }),
    });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`Anthropic ${r.status}: ${body.slice(0, 200)}`);
    }
    const data = await r.json() as any;
    return data?.content?.[0]?.text ?? '';
  };

  // Attempt to extract valid JSON from Claude's response. Claude sometimes
  // wraps JSON in markdown fences or adds prose — this strips both.
  const extractJson = (raw: string): any => {
    // Strip markdown code fences if present
    const stripped = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    const start = stripped.indexOf('{');
    const end   = stripped.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON object found in response');
    return JSON.parse(stripped.slice(start, end + 1));
  };

  try {
    // First attempt with 2048 tokens. If JSON parse fails (truncated response),
    // retry once with 3072 tokens before giving up.
    let raw = '';
    let result: any = null;

    for (const tokens of [2048, 3072]) {
      try {
        raw = await callClaude(tokens);
        result = extractJson(raw);
        break;
      } catch (parseErr: any) {
        console.warn(`[linkedin-score] parse failed at ${tokens} tokens, retrying…`, parseErr.message);
        if (tokens === 3072) throw parseErr;
      }
    }

    res.json(result);
  } catch (err: any) {
    console.error('[linkedin-score] error', err);
    res.status(500).json({ error: 'Analysis failed', detail: String(err?.message ?? err) });
  }
});

// ── Public board view (no auth) ───────────────────────────────────────────────

// Fetch board data by public token — no authentication required
app.get('/api/boards/public/:token', (req, res) => {
  const db = readDb();
  const board = db.boards.find(b => b.public_token === req.params.token);
  if (!board) { res.status(404).json({ error: 'Board not found or link disabled' }); return; }
  const owner = db.users.find(u => u.id === board.owner_id);
  res.json({
    board: {
      id:          board.id,
      name:        board.name,
      canvas_data: board.canvas_data,
      width:       board.width,
      height:      board.height,
      thumbnail_url: board.thumbnail_url,
      owner_name:  owner?.name ?? 'Unknown',
      updated_at:  board.updated_at,
    },
  });
});

// Toggle public link on/off — owner only
app.post('/api/boards/:id/public-link', authenticate, (req: any, res) => {
  const db = readDb();
  const board = db.boards.find(b => b.id === req.params.id && b.owner_id === req.user.id);
  if (!board) { res.status(404).json({ error: 'Not found' }); return; }
  const { enabled } = req.body;
  if (enabled && !board.public_token) board.public_token = uuidv4();
  if (!enabled) delete board.public_token;
  writeDb(db);
  res.json({ success: true, public_token: board.public_token ?? null });
});

// Return existing public token for a board (owner only)
app.get('/api/boards/:id/public-link', authenticate, (req: any, res) => {
  const db = readDb();
  const board = db.boards.find(b => b.id === req.params.id && b.owner_id === req.user.id);
  if (!board) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ public_token: board.public_token ?? null });
});

// ── Mockup snapshots ──────────────────────────────────────────────────────────

// List all saved mockups for the current user
app.get('/api/mockups', authenticate, (req: any, res) => {
  const db = readDb();
  const list = (db.mockup_snapshots ?? [])
    .filter(m => m.owner_id === req.user.id)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  res.json({ mockups: list });
});

// Save a new mockup snapshot
app.post('/api/mockups', authenticate, (req: any, res) => {
  const { name, template_id, profile, creatives, thumbnail_url } = req.body;
  if (!name || !template_id) {
    res.status(400).json({ error: 'name and template_id are required' }); return;
  }
  const db = readDb();
  db.mockup_snapshots ??= [];
  const snap: MockupSnapshot = {
    id:           uuidv4(),
    owner_id:     req.user.id,
    name,
    template_id,
    profile:      typeof profile  === 'string' ? profile  : JSON.stringify(profile  ?? {}),
    creatives:    typeof creatives === 'string' ? creatives : JSON.stringify(creatives ?? {}),
    thumbnail_url,
    created_at:   new Date().toISOString(),
    updated_at:   new Date().toISOString(),
  };
  db.mockup_snapshots.push(snap);
  writeDb(db);
  res.status(201).json({ mockup: snap });
});

// Update an existing mockup snapshot
app.put('/api/mockups/:id', authenticate, (req: any, res) => {
  const db = readDb();
  db.mockup_snapshots ??= [];
  const snap = db.mockup_snapshots.find(m => m.id === req.params.id && m.owner_id === req.user.id);
  if (!snap) { res.status(404).json({ error: 'Not found' }); return; }
  const { name, profile, creatives, thumbnail_url } = req.body;
  if (name !== undefined)      snap.name      = name;
  if (profile !== undefined)   snap.profile   = typeof profile   === 'string' ? profile   : JSON.stringify(profile);
  if (creatives !== undefined) snap.creatives = typeof creatives === 'string' ? creatives : JSON.stringify(creatives);
  if (thumbnail_url !== undefined) snap.thumbnail_url = thumbnail_url;
  snap.updated_at = new Date().toISOString();
  writeDb(db);
  res.json({ mockup: snap });
});

// Delete a mockup snapshot
app.delete('/api/mockups/:id', authenticate, (req: any, res) => {
  const db = readDb();
  db.mockup_snapshots ??= [];
  const idx = db.mockup_snapshots.findIndex(m => m.id === req.params.id && m.owner_id === req.user.id);
  if (idx === -1) { res.status(404).json({ error: 'Not found' }); return; }
  db.mockup_snapshots.splice(idx, 1);
  writeDb(db);
  res.json({ success: true });
});

app.use((err: Error, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── SPA catch-all (production) ────────────────────────────────────────────────
if (IS_PROD) {
  const PUBLIC_DIR = path.join(__dirname, '..', 'public');
  const BASE_URL   = process.env.APP_URL ?? 'https://peekboard-production.up.railway.app';

  // Helper: read index.html and inject OG tags before </head>
  const serveWithOg = (res: any, tags: string) => {
    const raw  = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
    const html = raw.replace('</head>', `${tags}\n  </head>`);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  };

  // ── Homepage / all non-board routes — Peekboard brand OG tags ──────────────
  const homeTags = `
    <meta property="og:type"         content="website" />
    <meta property="og:url"          content="${BASE_URL}/" />
    <meta property="og:title"        content="Peekboard — Preview your motion creatives in context" />
    <meta property="og:description"  content="See your GIFs in real social feeds, leave feedback, and get sign-off before publishing." />
    <meta property="og:image"        content="${BASE_URL}/og-image.jpg" />
    <meta property="og:image:width"  content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card"        content="summary_large_image" />
    <meta name="twitter:title"       content="Peekboard — Preview your motion creatives in context" />
    <meta name="twitter:description" content="See your GIFs in real social feeds, leave feedback, and get sign-off before publishing." />
    <meta name="twitter:image"       content="${BASE_URL}/og-image.jpg" />
    <meta name="description"         content="See your GIFs in real social feeds, leave feedback, and get sign-off before publishing." />
    <title>Peekboard — Preview your motion creatives in context</title>`;

  // ── Public board view — board-specific OG tags ──────────────────────────────
  app.get('/view/:token', (req, res) => {
    const db    = readDb();
    const board = db.boards.find((b: any) => b.public_token === req.params.token);
    if (!board) { serveWithOg(res, homeTags); return; }

    const owner     = db.users.find((u: any) => u.id === board.owner_id);
    const ownerName = owner?.name ?? 'Someone';
    const title     = `${board.name} — Peekboard`;
    const desc      = `View this board by ${ownerName} on Peekboard`;
    const pageUrl   = `${BASE_URL}/view/${req.params.token}`;
    const image     = board.thumbnail_url
      ? (board.thumbnail_url.startsWith('http') ? board.thumbnail_url : `${BASE_URL}${board.thumbnail_url}`)
      : `${BASE_URL}/og-image.jpg`;

    const boardTags = `
    <meta property="og:type"        content="website" />
    <meta property="og:url"         content="${pageUrl}" />
    <meta property="og:title"       content="${title.replace(/"/g, '&quot;')}" />
    <meta property="og:description" content="${desc.replace(/"/g, '&quot;')}" />
    <meta property="og:image"       content="${image}" />
    <meta name="twitter:card"       content="summary_large_image" />
    <meta name="twitter:title"      content="${title.replace(/"/g, '&quot;')}" />
    <meta name="twitter:description" content="${desc.replace(/"/g, '&quot;')}" />
    <meta name="twitter:image"      content="${image}" />
    <title>${title.replace(/</g, '&lt;')}</title>`;

    serveWithOg(res, boardTags);
  });

  // ── All other routes — inject brand OG tags ─────────────────────────────────
  app.get('*', (_req, res) => serveWithOg(res, homeTags));
}

app.listen(PORT, () => {
  console.log(`\n👀  Peekboard API → http://localhost:${PORT}\n`);
});
