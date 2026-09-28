'use client';
import { useEffect } from 'react';
import { TAG_COLORS } from '@/lib/types';

/** Notifikasi kecil di atas layar, hilang sendiri setelah 3 detik. */
export function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] animate-in fade-in slide-in-from-top-4 duration-300">
      <div
        className={`px-4 py-2.5 rounded-full shadow-lg text-sm font-medium border flex items-center gap-2 ${
          type === 'success'
            ? 'bg-gray-900 text-white border-gray-800'
            : 'bg-red-600 text-white border-red-700'
        }`}
      >
        <span>{message}</span>
      </div>
    </div>
  );
}

export function TagBadge({ tag }: { tag: string }) {
  const color = TAG_COLORS[tag] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-block px-2 py-0.5 text-[11px] font-medium rounded-sm ${color}`}>
      {tag}
    </span>
  );
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-xl shadow-xl overflow-hidden flex flex-col scale-in-95 duration-200">
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="text-gray-400 hover:text-gray-700 text-lg leading-none"
          >
            &times;
          </button>
        </div>
        <div className="p-5 overflow-y-auto max-h-[80vh]">{children}</div>
      </div>
    </div>
  );
}

/** Badge status sinkronisasi di navbar. */
export function SyncBadge({
  online,
  syncing,
  loading,
}: {
  online: boolean;
  syncing: boolean;
  loading: boolean;
}) {
  if (!online) {
    return (
      <span
        title="Data disimpan di browser ini saja"
        className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200"
      >
        Lokal
      </span>
    );
  }
  if (syncing || loading) {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
        Sinkron…
      </span>
    );
  }
  return (
    <span
      title="Data tersinkron ke cloud"
      className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
    >
      Tersinkron
    </span>
  );
}
