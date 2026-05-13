import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { sendMail, welcomeEmail, inviteEmail, resetEmail, verifyEmail, mentionEmail } from './mailer';
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
}
interface Board {
  id: string; name: string; owner_id: string; canvas_data: string;
  width: number; height: number; created_at: string; updated_at: string;
  // Tracks who last touched the board so cards can show "Edited by …"
  // without needing the canvas history. Optional for back-compat.
  last_edited_by?: string;   // user id
  last_edited_at?: string;   // ISO timestamp
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
interface DbSchema {
  users: User[]; boards: Board[]; board_access: BoardAccess[]; comments: Comment[];
  password_resets?: PasswordReset[];
  email_verifies?:  EmailVerify[];
  stars?:           BoardStar[];
}

const readDb = (): DbSchema => {
  try {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')) as DbSchema;
    db.password_resets ??= [];
    db.email_verifies  ??= [];
    db.stars           ??= [];
    return db;
  } catch {
    return {
      users: [], boards: [], board_access: [], comments: [],
      password_resets: [], email_verifies: [], stars: [],
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

// ── Static frontend (production) ──────────────────────────────────────────────
if (IS_PROD) {
  const PUBLIC_DIR = path.join(__dirname, '..', 'public');
  app.use(express.static(PUBLIC_DIR));
}

// ── Auth middleware ───────────────────────────────────────────────────────────
interface JwtPayload { id: string; email: string; name: string; avatar_color: string; }

const authenticate = (req: any, res: any, next: any): void => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try { req.user = jwt.verify(token, JWT_SECRET) as JwtPayload; next(); }
  catch { res.status(401).json({ error: 'Invalid or expired token' }); }
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
app.post('/api/auth/verify-email/resend', authenticate, (req: any, res) => {
  const db = readDb();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  if (user.email_verified) { res.json({ success: true, already: true }); return; }
  const verifyToken = uuidv4().replace(/-/g, '');
  db.email_verifies!.push({ token: verifyToken, user_id: user.id, expires_at: Date.now() + 24*60*60*1000 });
  db.email_verifies = db.email_verifies!.filter(v => v.expires_at > Date.now());
  writeDb(db);
  sendMail({ ...verifyEmail(user.name, `${APP_URL}/verify-email?token=${verifyToken}`), to: user.email })
    .catch(err => console.warn('[peekboard] verify resend failed', err));
  res.json({ success: true });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) { res.status(400).json({ error: 'Email and password required' }); return; }

  const db = readDb();
  const user = db.users.find((u) => u.email === email.toLowerCase().trim());
  if (!user) { res.status(401).json({ error: 'Invalid credentials' }); return; }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) { res.status(401).json({ error: 'Invalid credentials' }); return; }

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, avatar_color: user.avatar_color },
    JWT_SECRET, { expiresIn: '365d' }
  );
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, avatar_color: user.avatar_color, email_verified: !!user.email_verified } });
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
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, avatar_color: user.avatar_color, email_verified: !!user.email_verified } });
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
  const { name, avatar_color } = req.body as { name?: string; avatar_color?: string };
  const db = readDb();
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  if (typeof name === 'string'         && name.trim())         user.name         = name.trim();
  if (typeof avatar_color === 'string' && /^#[0-9a-f]{6}$/i.test(avatar_color)) user.avatar_color = avatar_color;
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
  res.json({ token: newToken, user: { id: user.id, email: user.email, name: user.name, avatar_color: user.avatar_color, email_verified: !!user.email_verified } });
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
    for (const id of mentioned) {
      const r = recipients.get(id)!;
      sendMail({ ...mentionEmail(u.name, board.name, comment.content, boardUrl), to: r.email })
        .catch(err => console.warn('[peekboard] mention mail failed', err));
    }
  }

  res.status(201).json({ comment: { ...comment, user_name: u.name, avatar_color: u.avatar_color } });
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

app.use((err: Error, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── SPA catch-all (production) ────────────────────────────────────────────────
if (IS_PROD) {
  const PUBLIC_DIR = path.join(__dirname, '..', 'public');
  app.get('*', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`\n👀  Peekboard API → http://localhost:${PORT}\n`);
});
