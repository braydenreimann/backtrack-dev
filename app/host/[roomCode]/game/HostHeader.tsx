import type { RoomPlayer } from '@/lib/game-types';

export type HostHeaderProps = {
  players: RoomPlayer[];
  activePlayerId: string | null;
};

export default function HostHeader({ players, activePlayerId }: HostHeaderProps) {
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
    </header>
  );
}
