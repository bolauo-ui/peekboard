import axios from 'axios';
import type { Board, BoardMember, Comment, User } from '@/types';

const http = axios.create({ baseURL: '/api' });

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('mb_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('mb_token');
      localStorage.removeItem('mb_user');
      window.location.href = '/login';
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

  me: () => http.get<{ user: User }>('/auth/me').then((r) => r.data),
};

// ── Boards ────────────────────────────────────────────────────────────────────
export const boardsApi = {
  list: () => http.get<{ boards: Board[] }>('/boards').then((r) => r.data),

  create: (data: { name: string; width?: number; height?: number }) =>
    http.post<{ board: Board }>('/boards', data).then((r) => r.data),

  get: (id: string) => http.get<{ board: Board }>(`/boards/${id}`).then((r) => r.data),

  update: (id: string, data: Partial<{ name: string; canvas_data: string; width: number; height: number }>) =>
    http.put<{ success: boolean }>(`/boards/${id}`, data).then((r) => r.data),

  delete: (id: string) => http.delete<{ success: boolean }>(`/boards/${id}`).then((r) => r.data),
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
