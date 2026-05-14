import axios from 'axios';
import type { Board, BoardMember, Comment, Project, User } from '@/types';

const http = axios.create({ baseURL: '/api' });

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('mb_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Paths that legitimately return 401 as a form-level signal (wrong code,
// wrong password, expired magic link). For these we let the caller handle
// the error inline instead of kicking the user out of their session.
const NON_FATAL_401 = [
  '/auth/2fa/confirm',
  '/auth/2fa/disable',
  '/auth/2fa/login',
  '/auth/magic/verify',
  '/auth/password',
  '/auth/reset',
  '/auth/login',
];

http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const url: string = err.config?.url ?? '';
      const isInline = NON_FATAL_401.some(p => url.includes(p));
      if (!isInline) {
        localStorage.removeItem('mb_token');
        localStorage.removeItem('mb_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data: { email: string; name: string; password: string }) =>
    http.post<{ token: string; user: User }>('/auth/register', data).then((r) => r.data),

  login: (data: { email: string; password: string }) =>
    http.post<{ token: string; user: User }>('/auth/login', data).then((r) => r.data),

  google: (credential: string) =>
    http.post<{ token: string; user: User }>('/auth/google', { credential }).then((r) => r.data),

  me: () => http.get<{ user: User }>('/auth/me').then((r) => r.data),

  updateMe: (data: { name?: string; avatar_color?: string; avatar_url?: string | null; use_case?: string }) =>
    http.put<{ user: User }>('/auth/me', data).then((r) => r.data),

  changePassword: (data: { current?: string; next: string }) =>
    http.post<{ success: boolean }>('/auth/password', data).then((r) => r.data),

  forgot: (email: string) =>
    http.post<{ success: boolean }>('/auth/forgot', { email }).then((r) => r.data),

  reset: (data: { token: string; password: string }) =>
    http.post<{ token: string; user: User }>('/auth/reset', data).then((r) => r.data),

  verifyEmail: (token: string) =>
    http.get<{ success: boolean }>(`/auth/verify-email?token=${encodeURIComponent(token)}`).then((r) => r.data),

  resendVerifyEmail: () =>
    http.post<{ success: boolean; already?: boolean; mail_configured?: boolean; delivered?: boolean }>('/auth/verify-email/resend').then((r) => r.data),

  systemStatus: () =>
    http.get<{ mail_configured: boolean }>('/system/status').then((r) => r.data),

  // Magic-link login: request the email, then consume the token client-side.
  magicRequest: (email: string) =>
    http.post<{ success: boolean }>('/auth/magic', { email }).then((r) => r.data),
  magicVerify:  (token: string) =>
    http.post<{ token: string; user: User }>('/auth/magic/verify', { token }).then((r) => r.data),

  // Avatar upload (multipart). FormData is set by the caller.
  uploadAvatar: (form: FormData) =>
    http.post<{ user: User }>('/auth/avatar', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data),

  // 2FA / TOTP setup flow.
  twoFaSetup:    () => http.post<{ otpauth: string; secret: string }>('/auth/2fa/setup').then((r) => r.data),
  twoFaConfirm:  (code: string) => http.post<{ success: boolean; backup_codes: string[] }>('/auth/2fa/confirm', { code }).then((r) => r.data),
  twoFaDisable:  (code: string) => http.post<{ success: boolean }>('/auth/2fa/disable', { code }).then((r) => r.data),
  twoFaLogin:    (token: string, code: string) =>
    http.post<{ token: string; user: User }>('/auth/2fa/login', { token, code }).then((r) => r.data),

  signOutEverywhere: () =>
    http.post<{ success: boolean; token: string }>('/auth/sign-out-all').then((r) => r.data),
};

// ── Boards ────────────────────────────────────────────────────────────────────
export const boardsApi = {
  list: () => http.get<{ boards: Board[] }>('/boards').then((r) => r.data),

  create: (data: { name: string; width?: number; height?: number }) =>
    http.post<{ board: Board }>('/boards', data).then((r) => r.data),

  get: (id: string) => http.get<{ board: Board }>(`/boards/${id}`).then((r) => r.data),

  update: (id: string, data: Partial<{ name: string; canvas_data: string; width: number; height: number }>) =>
    http.put<{ success: boolean }>(`/boards/${id}`, data).then((r) => r.data),

  // Fire-and-forget save that survives a tab close. fetch with keepalive:true
  // tells the browser to keep the request alive even after the document is
  // unloaded — this is what makes pagehide / visibilitychange flushes
  // reliable instead of being aborted mid-flight. Capped at ~64 KB by spec.
  updateKeepAlive: (id: string, data: Partial<{ name: string; canvas_data: string; width: number; height: number }>) => {
    const token = localStorage.getItem('mb_token');
    return fetch(`/api/boards/${id}`, {
      method:    'PUT',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    });
  },

  delete: (id: string) => http.delete<{ success: boolean }>(`/boards/${id}`).then((r) => r.data),

  duplicate: (id: string) =>
    http.post<{ board: Board }>(`/boards/${id}/duplicate`).then((r) => r.data),

  star: (id: string) =>
    http.post<{ success: boolean; starred: boolean }>(`/boards/${id}/star`).then((r) => r.data),

  unstar: (id: string) =>
    http.delete<{ success: boolean; starred: boolean }>(`/boards/${id}/star`).then((r) => r.data),

  // Move into a project (or null for top-level).
  move: (id: string, project_id: string | null) =>
    http.post<{ success: boolean }>(`/boards/${id}/move`, { project_id }).then((r) => r.data),

  // Upload a canvas snapshot used as the dashboard preview.
  thumbnail: (id: string, image: string) =>
    http.post<{ success: boolean; thumbnail_url: string }>(`/boards/${id}/thumbnail`, { image }).then((r) => r.data),

  // Version history.
  history: (id: string) =>
    http.get<{ snapshots: BoardSnapshot[] }>(`/boards/${id}/history`).then((r) => r.data),
  restore: (id: string, snapshot_id: string) =>
    http.post<{ success: boolean }>(`/boards/${id}/history/restore`, { snapshot_id }).then((r) => r.data),
};

// ── Notifications ────────────────────────────────────────────────────────────
export interface AppNotification {
  id:               string;
  type:             'mention' | 'reply' | 'invite';
  read:             boolean;
  created_at:       string;
  from_name:        string;
  from_avatar:      string;
  from_avatar_url?: string;
  board_id?:        string;
  board_name?:      string;
  comment_id?:      string;
  text?:            string;
}
export const notificationsApi = {
  list:     () => http.get<{ notifications: AppNotification[]; unread: number }>('/notifications').then((r) => r.data),
  markRead: (ids?: string[]) => http.post<{ success: boolean }>('/notifications/read', { ids }).then((r) => r.data),
};

export interface BoardSnapshot {
  id:               string;
  created_at:       string;
  by_user_id:       string;
  by_name:          string;
  by_avatar_color:  string;
}

// ── Projects (folders) ────────────────────────────────────────────────────────
export const projectsApi = {
  list:   () => http.get<{ projects: Project[] }>('/projects').then((r) => r.data),
  create: (data: { name: string; color?: string }) =>
    http.post<{ project: Project }>('/projects', data).then((r) => r.data),
  rename: (id: string, data: { name?: string; color?: string }) =>
    http.patch<{ project: Project }>(`/projects/${id}`, data).then((r) => r.data),
  delete: (id: string) =>
    http.delete<{ success: boolean }>(`/projects/${id}`).then((r) => r.data),
};

// ── Sharing ───────────────────────────────────────────────────────────────────
export const sharingApi = {
  getMembers: (boardId: string) =>
    http.get<{ members: BoardMember[]; owner: User & { role: string } }>(`/boards/${boardId}/members`).then((r) => r.data),

  share: (boardId: string, data: { email: string; role: string }) =>
    http.post<{ success: boolean; invite_token?: string; share_url?: string; message: string }>(
      `/boards/${boardId}/share`,
      data
    ).then((r) => r.data),

  updateRole: (boardId: string, memberId: string, role: string) =>
    http.put<{ success: boolean }>(`/boards/${boardId}/members/${memberId}`, { role }).then((r) => r.data),

  removeMember: (boardId: string, memberId: string) =>
    http.delete<{ success: boolean }>(`/boards/${boardId}/members/${memberId}`).then((r) => r.data),

  acceptInvite: (token: string) =>
    http.post<{ success: boolean; board_id: string }>(`/invite/${token}/accept`).then((r) => r.data),
};

// ── Comments ──────────────────────────────────────────────────────────────────
export const commentsApi = {
  list: (boardId: string) =>
    http.get<{ comments: Comment[]; replies: Comment[] }>(`/boards/${boardId}/comments`).then((r) => r.data),

  create: (boardId: string, data: { x: number; y: number; content: string; parent_id?: string }) =>
    http.post<{ comment: Comment }>(`/boards/${boardId}/comments`, data).then((r) => r.data),

  resolve: (commentId: string) =>
    http.patch<{ success: boolean }>(`/comments/${commentId}/resolve`).then((r) => r.data),

  delete: (commentId: string) =>
    http.delete<{ success: boolean }>(`/comments/${commentId}`).then((r) => r.data),
};

// ── LinkedIn Ad Scorer ────────────────────────────────────────────────────────
export interface LinkedInScoreCategory {
  name:      string;
  score:     number;
  max:       number;
  benchmark: string;
  note:      string;
}
export interface LinkedInScore {
  overall:    number;
  grade:      string;
  verdict:    string;
  categories: LinkedInScoreCategory[];
  suggestions: string[];
}
export const analyseApi = {
  linkedin: (image: string) =>
    http.post<LinkedInScore>('/analyse/linkedin', { image }).then(r => r.data),
};

// ── Upload ────────────────────────────────────────────────────────────────────
export const uploadApi = {
  upload: (file: File, onProgress?: (pct: number) => void) => {
    const form = new FormData();
    form.append('file', file);
    return http.post<{ url: string; mimetype: string; originalName: string }>(
      '/upload',
      form,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
        },
      }
    ).then((r) => r.data);
  },
};
