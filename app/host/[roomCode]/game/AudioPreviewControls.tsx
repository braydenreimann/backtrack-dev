type PreviewState = 'idle' | 'loading' | 'ready' | 'blocked' | 'unavailable';

export type AudioPreviewControlsProps = {
  phase: string | undefined;
  previewState: PreviewState;
  previewUrl: string | null;
  isPlaying: boolean;
  isPaused: boolean;
  onAttemptPlay: () => void;
  onTogglePlay: () => void;
};

export default function AudioPreviewControls({
  phase,
  previewState,
  previewUrl,
  isPlaying,
  isPaused,
  onAttemptPlay,
  onTogglePlay,
}: AudioPreviewControlsProps) {
  if (phase === 'LOBBY') {
    return null;
  }

  const isDisabled = isPaused;

  return (
    <div className="host-audio">
      {previewState === 'loading' ? <div className="status">Searching iTunes preview...</div> : null}
      {previewState === 'unavailable' ? (
        <div className="status bad">Preview unavailable - continue without audio</div>
      ) : null}
      {previewState === 'blocked' ? (
        <button className="button small" onClick={onAttemptPlay} disabled={isDisabled}>
          Tap to Play Preview
        </button>
      ) : null}
      {previewUrl && previewState === 'ready' ? (
        <button className="button secondary small" onClick={onTogglePlay} disabled={isDisabled}>
          {isPlaying ? 'Pause preview' : 'Play preview'}
        </button>
      ) : null}
    </div>
  );
}
