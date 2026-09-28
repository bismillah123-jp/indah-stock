/**
 * Firebase — init + konfigurasi.
 *
 * PENTING: file ini TIDAK boleh bikin app crash kalau config belum diisi.
 * App harus tetap jalan pakai localStorage (mode lokal). Firebase nyala
 * hanya kalau semua env var tersedia.
 *
 * Isi `.env.local`:
 *   NEXT_PUBLIC_FIREBASE_API_KEY=...
 *   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
 *   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
 *   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
 *   NEXT_PUBLIC_FIREBASE_APP_ID=...
 */
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Firebase hanya aktif kalau config inti terisi. */
export const firebaseEnabled = Boolean(cfg.apiKey && cfg.projectId && cfg.appId);

let app: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseEnabled) return null;
  if (app) return app;
  try {
    app = getApps().length ? getApp() : initializeApp(cfg as Record<string, string>);
    return app;
  } catch (e) {
    console.error('[firebase] gagal init:', e);
    return null;
  }
}

export function getDb(): Firestore | null {
  if (!firebaseEnabled) return null;
  if (dbInstance) return dbInstance;
  const a = getFirebaseApp();
  if (!a) return null;
  try {
    dbInstance = getFirestore(a);
    return dbInstance;
  } catch (e) {
    console.error('[firebase] gagal ambil firestore:', e);
    return null;
  }
}

/**
 * Path data. Data dipisah per "store" (bukan per-user) supaya satu project
 * Firebase bisa dipakai beberapa konter tanpa saling lihat.
 *
 *   stores/{storeId}/items/{itemId}
 *   stores/{storeId}/history/{logId}
 */
export function storePaths(storeId: string) {
  return {
    items: `stores/${storeId}/items`,
    history: `stores/${storeId}/history`,
  };
}
