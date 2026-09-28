/**
 * Layer Firestore — sinkronisasi data stok.
 *
 * Semua fungsi di sini no-op (return null / tidak melakukan apa-apa) kalau
 * Firebase belum dikonfigurasi, supaya app tetap jalan mode lokal.
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
import { getDb, firebaseEnabled, userPaths } from './firebase';
import type { HistoryLog, StockItem } from './types';

export { firebaseEnabled };

/** Simpan satu barang (create atau update). */
export async function saveItem(uid: string, item: StockItem): Promise<void> {
  const db = getDb();
  if (!db) return;
  const { items } = userPaths(uid);
  await setDoc(doc(db, items, item.id), item, { merge: true });
}

/** Hapus satu barang. */
export async function removeItem(uid: string, itemId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const { items } = userPaths(uid);
  await deleteDoc(doc(db, items, itemId));
}

/** Simpan satu log riwayat. */
export async function saveLog(uid: string, log: HistoryLog): Promise<void> {
  const db = getDb();
  if (!db) return;
  const { history } = userPaths(uid);
  await setDoc(doc(db, history, log.id), log, { merge: true });
}

export async function removeLog(uid: string, logId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const { history } = userPaths(uid);
  await deleteDoc(doc(db, history, logId));
}

/**
 * Tulis banyak perubahan sekaligus (batch).
 * Dipakai saat transaksi mengubah item + history bersamaan.
 * Batch maksimal 500 operasi — di sini jauh di bawah itu.
 */
export async function saveBatch(
  uid: string,
  changes: {
    items?: StockItem[];
    history?: HistoryLog[];
    deletedItemIds?: string[];
    deletedLogIds?: string[];
  },
): Promise<void> {
  const db = getDb();
  if (!db) return;
  const paths = userPaths(uid);
  const batch = writeBatch(db);

  changes.items?.forEach((it) => batch.set(doc(db, paths.items, it.id), it, { merge: true }));
  changes.history?.forEach((l) => batch.set(doc(db, paths.history, l.id), l, { merge: true }));
  changes.deletedItemIds?.forEach((id) => batch.delete(doc(db, paths.items, id)));
  changes.deletedLogIds?.forEach((id) => batch.delete(doc(db, paths.history, id)));

  await batch.commit();
}

/** Upload seluruh data lokal ke Firestore (migrasi pertama kali). */
export async function pushAll(uid: string, items: StockItem[], history: HistoryLog[]): Promise<void> {
  const db = getDb();
  if (!db) return;
  const paths = userPaths(uid);

  // Firestore batch maks 500 operasi; pecah kalau lebih.
  const ops: Array<() => void> = [];
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
    count++;
    if (count >= 450) await flush();
  }
  for (const l of history) {
    batch.set(doc(db, paths.history, l.id), l, { merge: true });
    count++;
    if (count >= 450) await flush();
  }
  await flush();
}

/** Ambil semua data dari Firestore sekali (tanpa realtime). */
export async function fetchAll(
  uid: string,
): Promise<{ items: StockItem[]; history: HistoryLog[] }> {
  const db = getDb();
  if (!db) return { items: [], history: [] };
  const paths = userPaths(uid);
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
 * onSnapshot dipanggil setiap kali ada perubahan dari device mana pun.
 * Callback menerima data lengkap, jadi UI tinggal replace state.
 */
export function subscribeAll(
  uid: string,
  onData: (data: { items?: StockItem[]; history?: HistoryLog[] }) => void,
  onError?: (e: Error) => void,
): Unsubscribe | null {
  const db = getDb();
  if (!db) return null;
  const paths = userPaths(uid);

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
