// Lightweight Resend client. We don't pull in the npm sdk — we just POST to
// the Resend REST API. If RESEND_API_KEY isn't set the helper degrades to a
// `console.log` of the would-be email so the rest of the app keeps working
// in local dev / when no transport is configured.

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const MAIL_FROM      = process.env.MAIL_FROM      || 'Peekboard <no-reply@peekboard.app>';

export interface MailMessage {
  to:        string;
  subject:   string;
  text:      string;
  html:      string;
  replyTo?:  string;
}

export type MailResult =
  | { delivered: true }
  | { delivered: false; reason: 'no-api-key' | 'resend-error' | 'exception'; detail?: string };

// True when the operator has wired up a real transport. Used by endpoints
// so they can honestly tell the UI whether the email actually went out.
export function isMailConfigured(): boolean {
  return !!RESEND_API_KEY;
}

// Send an email. Returns `delivered: true` on success; otherwise returns the
// reason so callers can surface it to the user instead of lying about it.
export async function sendMail(msg: MailMessage): Promise<MailResult> {
  if (!RESEND_API_KEY) {
    console.log('\n[peekboard:mail] (no RESEND_API_KEY — printing only)');
    console.log('  to:      ', msg.to);
    console.log('  subject: ', msg.subject);
    console.log('  text:    ', msg.text.replace(/\n/g, '\n           '));
    console.log('');
    return { delivered: false, reason: 'no-api-key' };
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:     MAIL_FROM,
        to:       [msg.to],
        subject:  msg.subject,
        text:     msg.text,
        html:     msg.html,
        reply_to: msg.replyTo,
      }),
    });
    if (!r.ok) {
      const body = await r.text();
      console.warn('[peekboard:mail] Resend error', r.status, body);
      return { delivered: false, reason: 'resend-error', detail: `${r.status} ${body}` };
    }
    return { delivered: true };
  } catch (err: any) {
    console.warn('[peekboard:mail] send failed', err);
    return { delivered: false, reason: 'exception', detail: String(err?.message ?? err) };
  }
}

// ── Template helpers ───────────────────────────────────────────────────────
const SHELL_STYLE = `
  body { background:#f5f5f7; margin:0; padding:24px; font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif; color:#1f2024; }
  .card { background:#fff; border-radius:14px; max-width:520px; margin:0 auto; padding:32px; box-shadow:0 1px 3px rgba(0,0,0,0.06); }
  h1 { font-size:22px; margin:0 0 12px; }
  p  { font-size:14px; line-height:1.55; margin:0 0 12px; color:#3a3b3f; }
  .btn { display:inline-block; background:#7b68ee; color:#fff !important; padding:10px 18px; border-radius:8px; font-weight:600; font-size:14px; text-decoration:none; margin:14px 0; }
  .muted { font-size:12px; color:#9ca3af; margin-top:24px; }
`;

const shell = (title: string, bodyHtml: string) => `<!doctype html>
<html><head><meta charset="utf-8"/><title>${title}</title><style>${SHELL_STYLE}</style></head>
<body><div class="card">${bodyHtml}<p class="muted">— Peekboard</p></div></body></html>`;

export function welcomeEmail(name: string, appUrl: string): MailMessage {
  const first = escapeHtml(name.split(' ')[0] || 'there');
  return {
    to:      '',
    subject: `Welcome to Peekboard, ${name.split(' ')[0] || 'there'} 👋`,
    text:
`Hi ${name.split(' ')[0] || 'there'},

Welcome to Peekboard — you're all set up.

This is a Peekboard. Drop in GIFs, images, or videos. Frame and group your content. Leave pinned comments. Share it with anyone.

Quick Tips
• Drag a file (GIF / image / video) anywhere onto the canvas.
• Press F to draw a frame and group your content inside it.
• Click the speech-bubble in the toolbar to drop a pinned comment.
• Press ? for the full keyboard shortcuts list.

Open your dashboard: ${appUrl}/dashboard

Delete this board any time — it's yours.

— Peekboard`,
    html: `<!doctype html>
<html><head>
  <meta charset="utf-8"/>
  <title>Welcome to Peekboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400&family=Inter:wght@400;600&display=swap" rel="stylesheet"/>
  <style>
    body { background:#f0f0f0; margin:0; padding:32px 16px; font-family:'Inter',system-ui,sans-serif; color:#1f2937; }
    .wrap { max-width:600px; margin:0 auto; }
    .card { background:#fff; border-radius:16px; border:1px solid #e5e7eb; padding:40px 48px 48px; }
    .cat { width:170px; height:170px; border-radius:16px; object-fit:cover; display:block; margin-bottom:28px; }
    .title { font-family:'Crimson Pro',Georgia,serif; font-size:42px; font-weight:400; color:#111827; margin:0 0 20px; line-height:1.15; }
    .body { font-size:18px; line-height:1.6; color:#1f2937; margin:0 0 36px; }
    .tips-label { font-size:18px; font-weight:600; color:#111827; margin:0 0 12px; }
    .tips-list { font-size:18px; line-height:1.8; color:#1f2937; margin:0 0 36px; padding:0; list-style:none; }
    .tips-list li::before { content:"• "; }
    .btn { display:inline-block; background:#111827; color:#fff !important; padding:12px 24px; border-radius:8px; font-weight:600; font-size:15px; text-decoration:none; }
    .callout { font-size:13px; font-style:italic; color:#2563eb; margin-top:28px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <img class="cat" src="${appUrl}/cat-welcome.gif" alt="A tuxedo cat watching butterflies" />
      <h1 class="title">Welcome, ${first} 👋</h1>
      <p class="body">This is a Peekboard. Drop in GIFs, images, or videos. Frame and group your content. Leave pinned comments. Share it with anyone.</p>
      <p class="tips-label">Quick Tips</p>
      <ul class="tips-list">
        <li>Drag a file (GIF / image / video) anywhere onto the canvas.</li>
        <li>Press F to draw a frame and group your content inside it.</li>
        <li>Click the speech-bubble in the toolbar to drop a pinned comment.</li>
        <li>Press ? for the full keyboard shortcuts list.</li>
      </ul>
      <a class="btn" href="${appUrl}/dashboard">Open your dashboard →</a>
    </div>
    <p class="callout" style="margin:16px 0 0 4px;">Delete this board any time — it's yours.</p>
  </div>
</body></html>`,
  };
}

export function inviteEmail(
  boardName: string, fromName: string, role: string, inviteUrl: string,
): MailMessage {
  return {
    to:      '',
    subject: `${fromName} invited you to "${boardName}" on Peekboard`,
    text:
`${fromName} shared "${boardName}" with you on Peekboard as a ${role}.

Open it here: ${inviteUrl}

— Peekboard`,
    html: shell('Board invite', `
      <h1>${escapeHtml(fromName)} invited you to "${escapeHtml(boardName)}"</h1>
      <p>You've been added as a <strong>${escapeHtml(role)}</strong>. Click below to open the board.</p>
      <p><a class="btn" href="${inviteUrl}">Open board</a></p>
    `),
  };
}

export function verifyEmail(name: string, verifyUrl: string): MailMessage {
  return {
    to:      '',
    subject: 'Confirm your Peekboard email',
    text:
`Hi ${name.split(' ')[0]},

Thanks for signing up. Please confirm your email by clicking the link below:

${verifyUrl}

The link expires in 24 hours. If you didn't sign up, just ignore this email.

— Peekboard`,
    html: shell('Confirm your email', `
      <h1>One quick step — confirm your email</h1>
      <p>Hi ${escapeHtml(name.split(' ')[0])}, click below to confirm <strong>${escapeHtml('your email')}</strong>. The link expires in 24 hours.</p>
      <p><a class="btn" href="${verifyUrl}">Confirm email</a></p>
      <p>If you didn't sign up, ignore this — no account will be activated.</p>
    `),
  };
}

export function mentionEmail(
  fromName: string, boardName: string, commentText: string, boardUrl: string,
): MailMessage {
  const snippet = commentText.length > 220 ? commentText.slice(0, 220) + '…' : commentText;
  return {
    to:      '',
    subject: `${fromName} mentioned you in "${boardName}"`,
    text:
`${fromName} @mentioned you on "${boardName}":

"${snippet}"

Open the thread: ${boardUrl}

— Peekboard`,
    html: shell('You were mentioned', `
      <h1>${escapeHtml(fromName)} mentioned you in "${escapeHtml(boardName)}"</h1>
      <p style="background:#f5f5f7;padding:12px 14px;border-radius:8px;border-left:3px solid #7b68ee;margin:14px 0;">${escapeHtml(snippet)}</p>
      <p><a class="btn" href="${boardUrl}">View thread</a></p>
    `),
  };
}

export function magicLinkEmail(name: string, magicUrl: string): MailMessage {
  return {
    to:      '',
    subject: 'Your Peekboard sign-in link',
    text:
`Hi ${name.split(' ')[0]},

Use the link below to sign in to Peekboard. It expires in 15 minutes and can be used once.

${magicUrl}

If you didn't request this, you can ignore the email — your account stays safe.

— Peekboard`,
    html: shell('Sign-in link', `
      <h1>Sign in to Peekboard</h1>
      <p>Hi ${escapeHtml(name.split(' ')[0])}, click below to sign in. The link is good for 15 minutes and can be used once.</p>
      <p><a class="btn" href="${magicUrl}">Sign in</a></p>
      <p>If you didn't request this, you can ignore the email — your account stays safe.</p>
    `),
  };
}

export function resetEmail(name: string, resetUrl: string): MailMessage {
  return {
    to:      '',
    subject: 'Reset your Peekboard password',
    text:
`Hi ${name.split(' ')[0]},

Someone (hopefully you) asked to reset your Peekboard password.

Reset it here: ${resetUrl}

This link expires in 1 hour. If you didn't request a reset, you can ignore this email — your password stays the same.

— Peekboard`,
    html: shell('Reset password', `
      <h1>Reset your Peekboard password</h1>
      <p>Hi ${escapeHtml(name.split(' ')[0])}, click the button below to set a new password. The link expires in 1 hour.</p>
      <p><a class="btn" href="${resetUrl}">Reset password</a></p>
      <p>If you didn't request this, you can safely ignore this email — your password won't change.</p>
    `),
  };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
