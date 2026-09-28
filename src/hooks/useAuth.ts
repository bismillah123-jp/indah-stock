'use client';
/**
 * Hook autentikasi Firebase.
 *
 * Kalau Firebase belum dikonfigurasi, hook ini balikin user=null dan
 * ready=true supaya app tetap jalan mode lokal tanpa login.
 */
import { useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth, firebaseEnabled } from '@/lib/firebase';

export interface AuthState {
  user: User | null;
  ready: boolean;
  error: string | null;
  busy: boolean;
}

function friendlyError(code: string): string {
  const map: Record<string, string> = {
    'auth/invalid-email': 'Email tidak valid.',
    'auth/user-disabled': 'Akun ini dinonaktifkan.',
    'auth/user-not-found': 'Akun tidak ditemukan.',
    'auth/wrong-password': 'Password salah.',
    'auth/invalid-credential': 'Email atau password salah.',
    'auth/email-already-in-use': 'Email sudah terdaftar.',
    'auth/weak-password': 'Password minimal 6 karakter.',
    'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi nanti.',
    'auth/popup-closed-by-user': 'Jendela login ditutup.',
    'auth/network-request-failed': 'Tidak ada koneksi internet.',
  };
  return map[code] ?? 'Terjadi kesalahan. Coba lagi.';
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    ready: !firebaseEnabled,
    error: null,
    busy: false,
  });

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setState((s) => ({ ...s, ready: true }));
      return;
    }
    const unsub = onAuthStateChanged(auth, (user) => {
      setState((s) => ({ ...s, user, ready: true }));
    });
    return unsub;
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      await fn();
      setState((s) => ({ ...s, busy: false }));
      return true;
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      setState((s) => ({ ...s, busy: false, error: friendlyError(code) }));
      return false;
    }
  };

  return {
    ...state,
    enabled: firebaseEnabled,
    loginEmail: (email: string, password: string) => {
      const auth = getFirebaseAuth();
      if (!auth) return Promise.resolve(false);
      return run(() => signInWithEmailAndPassword(auth, email, password));
    },
    registerEmail: (email: string, password: string) => {
      const auth = getFirebaseAuth();
      if (!auth) return Promise.resolve(false);
      return run(() => createUserWithEmailAndPassword(auth, email, password));
    },
    loginGoogle: () => {
      const auth = getFirebaseAuth();
      if (!auth) return Promise.resolve(false);
      return run(() => signInWithPopup(auth, new GoogleAuthProvider()));
    },
    logout: () => {
      const auth = getFirebaseAuth();
      if (!auth) return Promise.resolve(false);
      return run(() => signOut(auth));
    },
    clearError: () => setState((s) => ({ ...s, error: null })),
  };
}
