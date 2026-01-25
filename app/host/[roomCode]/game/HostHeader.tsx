'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { RoomPlayer } from '@/lib/game-types';

export type HostHeaderProps = {
  players: RoomPlayer[];
  activePlayerId: string | null;
  isFullscreen: boolean;
  isFullscreenSupported: boolean;
  fullscreenError: string | null;
  onToggleFullscreen: () => void;
  isPaused: boolean;
  onTogglePause: () => void;
  pauseDisabled: boolean;
  onRequestEndGame: () => void;
  endGameDisabled: boolean;
};

function FullscreenIcon() {
  return (
    <svg className="host-header-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 3H3v4h2V5h2V3zm14 0h-4v2h2v2h2V3zM5 17H3v4h4v-2H5v-2zm16 0h-2v2h-2v2h4v-4z" />
    </svg>
  );
}

function OverflowIcon() {
  return (
    <svg className="host-header-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

export default function HostHeader({
  players,
  activePlayerId,
  isFullscreen,
  isFullscreenSupported,
  fullscreenError,
  onToggleFullscreen,
  isPaused,
  onTogglePause,
  pauseDisabled,
  onRequestEndGame,
  endGameDisabled,
}: HostHeaderProps) {
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const overflowMenuId = useId();
  const overflowRef = useRef<HTMLDivElement | null>(null);
  const fullscreenLabel = isFullscreen ? 'Exit full screen' : 'Full screen';
  const pauseLabel = isPaused ? 'Resume game' : 'Pause game';
  const fullscreenTitle = fullscreenError
    ? fullscreenError
    : isFullscreenSupported
      ? fullscreenLabel
      : 'Fullscreen is unavailable.';

  useEffect(() => {
    if (!isOverflowOpen) {
      return undefined;
    }

    const handleClick = (event: MouseEvent) => {
      if (!overflowRef.current) {
        return;
      }

      if (!overflowRef.current.contains(event.target as Node)) {
        setIsOverflowOpen(false);
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOverflowOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOverflowOpen]);

  const handleEndGame = () => {
    setIsOverflowOpen(false);
    onRequestEndGame();
  };

  const handlePause = () => {
    setIsOverflowOpen(false);
    onTogglePause();
  };

  return (
    <header className="host-game-header">
      <div className="host-brand">
        <div className="host-title">Backtrack</div>
        <div className="host-deck">Classic</div>
      </div>
      <div className="host-score-row">
        {players.map((player) => (
          <div
            key={player.id}
            className={`host-score-chip ${player.id === activePlayerId ? 'active' : ''} ${
              player.connected ? '' : 'disconnected'
            }`}
          >
            <div className="host-score-name">{player.name}</div>
            <div className="host-score-count">{player.cardCount}</div>
          </div>
        ))}
      </div>
      <div className="host-header-controls">
        <div className="host-header-actions">
          <button
            type="button"
            className="button secondary small host-icon-button host-fullscreen-toggle"
            onClick={onToggleFullscreen}
            aria-pressed={isFullscreen}
            aria-label={fullscreenLabel}
            title={fullscreenTitle}
            disabled={!isFullscreenSupported && !isFullscreen}
          >
            <FullscreenIcon />
          </button>
          <div className="host-overflow" ref={overflowRef}>
            <button
              type="button"
              className="button secondary small host-icon-button host-overflow-toggle"
              onClick={() => setIsOverflowOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={isOverflowOpen}
              aria-controls={overflowMenuId}
              title="Session actions"
            >
              <OverflowIcon />
            </button>
            {isOverflowOpen ? (
              <div className="host-overflow-menu" role="menu" id={overflowMenuId}>
                <button
                  type="button"
                  className="host-overflow-item"
                  role="menuitem"
                  onClick={handlePause}
                  disabled={pauseDisabled}
                >
                  {pauseLabel}
                </button>
                <button
                  type="button"
                  className="host-overflow-item danger"
                  role="menuitem"
                  onClick={handleEndGame}
                  disabled={endGameDisabled}
                >
                  End game
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {fullscreenError ? (
          <div className="host-fullscreen-message" role="status">
            {fullscreenError}
          </div>
        ) : null}
      </div>
    </header>
  );
}
