import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-peekboard-2024';
const APP_URL = process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`;
const IS_PROD = process.env.NODE_ENV === 'production';

// ── Storage paths ─────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '..', 'data');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const DB_PATH = path.join(DATA_DIR, 'peekboard.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ── JSON file database ────────────────────────────────────────────────────────
interface User {
  id: string; email: string; name: string;
  password_hash: string; avatar_color: string; created_at: string;
}
interface Board {
  id: string; name: string; owner_id: string; canvas_data: string;
  width: number; height: number; created_at: string; updated_at: string;
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
interface DbSchema {
  users: User[]; boards: Board[]; board_access: BoardAccess[]; comments: Comment[];
}

const readDb = (): DbSchema => {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); }
  catch { return { users: [], boards: [], board_access: [], comments: [] }; }
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

  db.users.push({ id, email: normalEmail, name, password_hash, avatar_color, created_at: now });
  writeDb(db);

  const token = jwt.sign({ id, email: normalEmail, name, avatar_color }, JWT_SECRET, { expiresIn: '365d' });
  res.status(201).json({ token, user: { id, email: normalEmail, name, avatar_color } });
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
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, avatar_color: user.avatar_color } });
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
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, avatar_color: user.avatar_color } });
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

// ── Boards ────────────────────────────────────────────────────────────────────
app.get('/api/boards', authenticate, (req: any, res) => {
  const db = readDb();
  const owned = db.boards
    .filter((b) => b.owner_id === req.user.id)
    .map((b) => ({ ...b, owner_name: db.users.find((u) => u.id === b.owner_id)?.name ?? '', role: 'owner' }))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const shared = db.board_access
    .filter((a) => a.user_id === req.user.id && a.accepted)
    .flatMap((a) => {
      const board = db.boards.find((b) => b.id === a.board_id);
      if (!board) return [];
      return [{ ...board, owner_name: db.users.find((u) => u.id === board.owner_id)?.name ?? '', role: a.role }];
    })
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  res.json({ boards: [...owned, ...shared] });
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
  board.updated_at = new Date().toISOString();
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
