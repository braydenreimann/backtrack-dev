export type HostTurnBannerProps = {
  roundNumber: number;
  activePlayerName: string | null;
};

export default function HostTurnBanner({ roundNumber, activePlayerName }: HostTurnBannerProps) {
  return (
    <section className="host-turn">
      <div className="host-round">Round {roundNumber}</div>
      <div className="host-turn-name">
        {activePlayerName ? `${activePlayerName}'s turn` : 'Waiting for players'}
      </div>
    </section>
  );
}
