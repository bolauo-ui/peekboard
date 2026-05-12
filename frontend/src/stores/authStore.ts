import { create } from 'zustand';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
  setLoading: (v: boolean) => void;
}

const stored = (() => {
  try {
    return {
      user: JSON.parse(localStorage.getItem('mb_user') || 'null') as User | null,
      token: localStorage.getItem('mb_token'),
    };
  } catch {
    return { user: null, token: null };
  }
})();

export const useAuthStore = create<AuthState>((set) => ({
  user: stored.user,
  token: stored.token,
  isLoading: false,

  setAuth: (user, token) => {
    localStorage.setItem('mb_token', token);
    localStorage.setItem('mb_user', JSON.stringify(user));
    set({ user, token });
  },

  clearAuth: () => {
    localStorage.removeItem('mb_token');
    localStorage.removeItem('mb_user');
    set({ user: null, token: null });
  },

  setLoading: (isLoading) => set({ isLoading }),
}));
