/**
 * Layer Firestore — sinkronisasi data stok.
 *
 * Model akses: per-"store" (bukan per-user). storeId adalah ID acak 20
 * karakter yang dibuat di device (lihat lib/device.ts) dan dibagikan manual
 * antar device milik toko yang sama lewat menu Pengaturan.
 *
 * Kenapa bukan Firebase Auth? Auth (Identity Platform) butuh billing aktif.
 * Untuk aplikasi stok konter kecil, ID acak + rules panjang-minimum sudah
 * memadai dan tidak memaksa pemilik toko mendaftarkan kartu kredit.
 *
 * Semua fungsi di sini no-op kalau Firebase belum dikonfigurasi, supaya app
 * tetap jalan mode lokal.
 */
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  getDocs,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb, firebaseEnabled } from './firebase';
import type { HistoryLog, StockItem } from './types';

export { firebaseEnabled };

/**
 * Path data:
 *   stores/{storeId}/items/{itemId}
 *   stores/{storeId}/history/{logId}
 */
export function storePaths(storeId: string) {
  return {
    items: `stores/${storeId}/items`,
    history: `stores/${storeId}/history`,
  };
}

/** Simpan satu barang (create atau update). */
export async function saveItem(storeId: string, item: StockItem): Promise<void> {
  const db = getDb();
  if (!db) return;
  const { items } = storePaths(storeId);
  await setDoc(doc(db, items, item.id), item, { merge: true });
}

/** Hapus satu barang. */
export async function removeItem(storeId: string, itemId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const { items } = storePaths(storeId);
  await deleteDoc(doc(db, items, itemId));
}

/** Simpan satu log riwayat. */
export async function saveLog(storeId: string, log: HistoryLog): Promise<void> {
  const db = getDb();
  if (!db) return;
  const { history } = storePaths(storeId);
  await setDoc(doc(db, history, log.id), log, { merge: true });
}

export async function removeLog(storeId: string, logId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const { history } = storePaths(storeId);
  await deleteDoc(doc(db, history, logId));
}

/**
 * Tulis banyak perubahan sekaligus (batch).
 * Dipakai saat satu transaksi mengubah item + history bersamaan.
 * Firestore membatasi 500 operasi per batch — di sini jauh di bawah itu.
 */
export async function saveBatch(
  storeId: string,
  changes: {
    items?: StockItem[];
    history?: HistoryLog[];
    deletedItemIds?: string[];
    deletedLogIds?: string[];
  },
): Promise<void> {
  const db = getDb();
  if (!db) return;
  const paths = storePaths(storeId);
  const batch = writeBatch(db);

  changes.items?.forEach((it) => batch.set(doc(db, paths.items, it.id), it, { merge: true }));
  changes.history?.forEach((l) => batch.set(doc(db, paths.history, l.id), l, { merge: true }));
  changes.deletedItemIds?.forEach((id) => batch.delete(doc(db, paths.items, id)));
  changes.deletedLogIds?.forEach((id) => batch.delete(doc(db, paths.history, id)));

  await batch.commit();
}

/** Upload seluruh data lokal ke Firestore (migrasi pertama kali). */
export async function pushAll(
  storeId: string,
  items: StockItem[],
  history: HistoryLog[],
): Promise<void> {
  const db = getDb();
  if (!db) return;
  const paths = storePaths(storeId);

  let batch = writeBatch(db);
  let count = 0;
  const flush = async () => {
    if (count > 0) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    }
  };

  for (const it of items) {
    batch.set(doc(db, paths.items, it.id), it, { merge: true });
    if (++count >= 450) await flush();
  }
  for (const l of history) {
    batch.set(doc(db, paths.history, l.id), l, { merge: true });
    if (++count >= 450) await flush();
  }
  await flush();
}

/** Ambil semua data dari Firestore sekali (tanpa realtime). */
export async function fetchAll(
  storeId: string,
): Promise<{ items: StockItem[]; history: HistoryLog[] }> {
  const db = getDb();
  if (!db) return { items: [], history: [] };
  const paths = storePaths(storeId);
  const [itemSnap, histSnap] = await Promise.all([
    getDocs(collection(db, paths.items)),
    getDocs(collection(db, paths.history)),
  ]);
  return {
    items: itemSnap.docs.map((d) => d.data() as StockItem),
    history: histSnap.docs.map((d) => d.data() as HistoryLog),
  };
}

/**
 * Dengarkan perubahan realtime.
 *
 * onSnapshot dipanggil setiap kali ada perubahan dari device mana pun yang
 * memakai storeId sama. Callback menerima data lengkap.
 */
export function subscribeAll(
  storeId: string,
  onData: (data: { items?: StockItem[]; history?: HistoryLog[] }) => void,
  onError?: (e: Error) => void,
): Unsubscribe | null {
  const db = getDb();
  if (!db) return null;
  const paths = storePaths(storeId);

  const unsubItems = onSnapshot(
    collection(db, paths.items),
    (snap) => onData({ items: snap.docs.map((d) => d.data() as StockItem) }),
    (e) => onError?.(e as Error),
  );
  const unsubHist = onSnapshot(
    collection(db, paths.history),
    (snap) => onData({ history: snap.docs.map((d) => d.data() as HistoryLog) }),
    (e) => onError?.(e as Error),
  );

  return () => {
    unsubItems();
    unsubHist();
  };
}
