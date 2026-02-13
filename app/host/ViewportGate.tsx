'use client';

import { useViewportGate } from '@/lib/useViewportGate';
import { useEffect, useRef } from 'react';

export function ViewportGate() {
  const isBlocked = useViewportGate();
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isBlocked && overlayRef.current) {
      overlayRef.current.focus();
    }
  }, [isBlocked]);

  if (!isBlocked) return null;

  return (
    <div
      ref={overlayRef}
      className="game-pause-overlay"
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      style={{
        position: 'fixed',
        zIndex: 9999,
        background: 'var(--bg)',
        cursor: 'default',
        outline: 'none',
      }}
    >
      <h1 className="game-pause-title" style={{ fontSize: 'clamp(2rem, 5vw, 4rem)' }}>
        Please expand your window
      </h1>
      <p
        className="subtitle"
        style={{ fontSize: '1.2rem', textAlign: 'center', maxWidth: '600px' }}
      >
        Backtrack works best in a wide, full-screen window.
      </p>
    </div>
  );
}
