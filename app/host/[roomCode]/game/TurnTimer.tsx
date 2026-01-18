export type TurnTimerProps = {
  remainingSeconds: number | null;
  progressPct: number;
};

const formatSeconds = (seconds: number | null) => {
  if (seconds === null) {
    return '--';
  }
  return `${Math.max(0, seconds)}s`;
};

export default function TurnTimer({ remainingSeconds, progressPct }: TurnTimerProps) {
  return (
    <>
      <div className="host-timer-text">Time: {formatSeconds(remainingSeconds)}</div>
      <div className="host-timer-track">
        <div className="host-timer-fill" style={{ width: `${progressPct}%` }} />
      </div>
    </>
  );
}
