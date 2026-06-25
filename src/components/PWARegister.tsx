'use client';

import { useEffect } from 'react';

/**
 * Registers the PWA service worker on mount.
 * Renders nothing – purely a side-effect component.
 */
export default function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('[PWA] Service worker registered:', reg.scope);
      })
      .catch((err) => {
        console.warn('[PWA] Service worker registration failed:', err);
      });
  }, []);

  return null;
}
