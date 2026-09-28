/**
 * Device ID — identitas perangkat tanpa perlu login.
 *
 * Kenapa tidak pakai Firebase Auth?
 * Firebase Auth (Identity Platform) butuh billing diaktifkan. Untuk aplikasi
 * stok konter kecil, memaksa billing + layar login itu overkill.
 *
 * Pendekatan ini: setiap device punya ID unik yang disimpan di localStorage.
 * Data di Firestore dipisah per device. Untuk berbagi data antar device,
 * user memasukkan "kode sinkronisasi" (device ID device lain) di Pengaturan.
 *
 * Catatan keamanan: ini BUKAN pengganti autentikasi. Siapa pun yang tahu
 * device ID bisa mengakses datanya. Untuk konter kecil ini cukup, karena
 * device ID tidak pernah ditampilkan ke publik — hanya dibagikan manual
 * antar device milik pemilik toko yang sama.
 */
import { DATA_VERSION } from './types';

const KEY_DEVICE = `indahcell_device_${DATA_VERSION}`;

/** Buat ID acak yang cukup panjang supaya tidak ketebak. */
function generateId(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'; // tanpa karakter mirip (l, o, 0, 1)
  const len = 20;
  const arr = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  // kelompokkan biar mudah dibaca: xxxx-xxxx-xxxx-xxxx-xxxx
  return out.match(/.{1,4}/g)!.join('-');
}

/** Ambil device ID; buat baru kalau belum ada. */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = window.localStorage.getItem(KEY_DEVICE);
    if (!id) {
      id = generateId();
      window.localStorage.setItem(KEY_DEVICE, id);
    }
    return id;
  } catch {
    return '';
  }
}

/** Ganti device ID (dipakai saat "sambungkan ke kode sinkronisasi"). */
export function setDeviceId(id: string): boolean {
  const clean = normalizeSyncCode(id);
  if (!clean) return false;
  try {
    window.localStorage.setItem(KEY_DEVICE, clean);
    return true;
  } catch {
    return false;
  }
}

/**
 * Bersihkan input kode sinkronisasi.
 * Terima format apa pun yang mengandung huruf/angka, lalu seragamkan.
 */
export function normalizeSyncCode(raw: string): string {
  const s = (raw ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s.length < 12) return '';
  return s.match(/.{1,4}/g)!.join('-').slice(0, 24);
}

/** Validasi kode sinkronisasi yang dimasukkan user. */
export function isValidSyncCode(raw: string): boolean {
  return normalizeSyncCode(raw).length >= 15;
}
