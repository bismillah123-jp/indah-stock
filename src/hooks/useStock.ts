'use client';
/**
 * Hook utama data stok.
 *
 * Strategi:
 *  1. Baca localStorage dulu -> UI langsung tampil (tidak nunggu jaringan)
 *  2. Kalau Firebase aktif -> subscribe realtime, data dari server menimpa
 *     state lokal
 *  3. Setiap perubahan: tulis ke localStorage (cache offline) DAN Firestore
 *
 * Dengan begitu app tetap jalan tanpa internet, dan tetap sinkron saat online.
 *
 * storeId: ID acak per device (lihat lib/device.ts). Semua device yang memakai
 * storeId sama akan saling sinkron.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { HistoryLog, StockItem } from '@/lib/types';
import {
  SEED_ITEMS,
  loadItems,
  loadHistory,
  saveAll,
  storageAvailable,
} from '@/lib/storage';
import * as remote from '@/lib/firestore';
import { firebaseEnabled } from '@/lib/firebase';

export interface SyncState {
  /** Sedang memuat data dari server. */
  loading: boolean;
  /** Pesan error terakhir (kalau ada). */
  error: string | null;
  /** Firebase aktif. */
  online: boolean;
  /** Data baru saja dikirim ke server. */
  syncing: boolean;
}

export function useStock(storeId: string) {
  const [items, setItems] = useState<StockItem[]>([]);
  const [history, setHistory] = useState<HistoryLog[]>([]);
  const [mounted, setMounted] = useState(false);
  const [sync, setSync] = useState<SyncState>({
    loading: false,
    error: null,
    online: false,
    syncing: false,
  });

  const unsubRef = useRef<(() => void) | null>(null);
  // Simpan data terbaru buat dipakai di callback tanpa bikin dependency baru.
  const itemsRef = useRef<StockItem[]>([]);
  const histRef = useRef<HistoryLog[]>([]);
  itemsRef.current = items;
  histRef.current = history;

  // ---------------------------------------------------------- 1. load lokal
  useEffect(() => {
    if (!storageAvailable()) {
      setItems(SEED_ITEMS);
      setMounted(true);
      setSync((s) => ({ ...s, error: 'Browser memblokir penyimpanan. Data tidak akan tersimpan.' }));
      return;
    }
    const localItems = loadItems();
    const localHist = loadHistory();
    if (localItems) {
      setItems(localItems);
    } else {
      setItems(SEED_ITEMS);
      saveAll(SEED_ITEMS, []);
    }
    setHistory(localHist);
    setMounted(true);
  }, []);

  // ------------------------------------------------------- 2. realtime sync
  useEffect(() => {
    if (!mounted) return;
    if (!firebaseEnabled || !storeId) {
      setSync((s) => ({ ...s, online: false, loading: false }));
      return;
    }

    setSync((s) => ({ ...s, loading: true, online: true }));
    const unsub = remote.subscribeAll(
      storeId,
      (data) => {
        if (data.items) setItems(data.items);
        if (data.history) setHistory(data.history);
        setSync((s) => ({ ...s, loading: false, error: null }));
      },
      (e) => {
        setSync((s) => ({ ...s, loading: false, error: `Gagal sinkron: ${e.message}` }));
      },
    );
    unsubRef.current = unsub;
    return () => {
      unsub?.();
      unsubRef.current = null;
    };
  }, [mounted, storeId]);

  /**
   * Simpan perubahan.
   *
   * cache  : selalu tulis ke localStorage
   * remote : kirim ke Firestore kalau online
   */
  const persist = useCallback(
    (
      nextItems: StockItem[],
      nextHistory: HistoryLog[],
      remoteChanges?: Parameters<typeof remote.saveBatch>[1],
    ) => {
      setItems(nextItems);
      setHistory(nextHistory);

      const res = saveAll(nextItems, nextHistory);
      if (!res.ok) {
        const msg = res.error;
        setSync((s) => ({ ...s, error: msg }));
      }

      if (firebaseEnabled && storeId && remoteChanges) {
        setSync((s) => ({ ...s, syncing: true }));
        remote
          .saveBatch(storeId, remoteChanges)
          .catch((e: Error) => {
            setSync((s) => ({ ...s, error: `Gagal kirim ke server: ${e.message}` }));
          })
          .finally(() => setSync((s) => ({ ...s, syncing: false })));
      }
    },
    [storeId],
  );

  /** Upload seluruh data lokal ke Firestore. */
  const pushLocalToCloud = useCallback(async () => {
    if (!firebaseEnabled || !storeId) {
      setSync((s) => ({ ...s, error: 'Firebase belum aktif.' }));
      return false;
    }
    setSync((s) => ({ ...s, syncing: true }));
    try {
      await remote.pushAll(storeId, itemsRef.current, histRef.current);
      setSync((s) => ({ ...s, syncing: false, error: null }));
      return true;
    } catch (e) {
      setSync((s) => ({ ...s, syncing: false, error: `Gagal upload: ${(e as Error).message}` }));
      return false;
    }
  }, [storeId]);

  /** Ambil data dari Firestore dan timpa data lokal. */
  const pullCloudToLocal = useCallback(async () => {
    if (!firebaseEnabled || !storeId) {
      setSync((s) => ({ ...s, error: 'Firebase belum aktif.' }));
      return false;
    }
    setSync((s) => ({ ...s, syncing: true }));
    try {
      const data = await remote.fetchAll(storeId);
      setItems(data.items);
      setHistory(data.history);
      saveAll(data.items, data.history);
      setSync((s) => ({ ...s, syncing: false, error: null }));
      return true;
    } catch (e) {
      setSync((s) => ({ ...s, syncing: false, error: `Gagal ambil data: ${(e as Error).message}` }));
      return false;
    }
  }, [storeId]);

  return {
    items,
    history,
    mounted,
    sync,
    persist,
    setItems,
    setHistory,
    pushLocalToCloud,
    pullCloudToLocal,
    setSyncError: (msg: string | null) => setSync((s) => ({ ...s, error: msg })),
  };
}
