type PreviewState = 'idle' | 'loading' | 'ready' | 'unavailable';

export type AudioPreviewControlsProps = {
  phase: string | undefined;
  previewState: PreviewState;
  isPlaying: boolean;
  isPaused: boolean;
  onTogglePlay: () => void;
};

export default function AudioPreviewControls({
  phase,
  previewState,
  isPlaying,
  isPaused,
  onTogglePlay,
}: AudioPreviewControlsProps) {
  if (phase === 'LOBBY') {
    return null;
  }

  const isDisabled = isPaused;

  return (
    <div className="host-audio">
      {previewState === 'loading' ? <div className="status">Loading Apple Music preview...</div> : null}
      {previewState === 'unavailable' ? (
        <div className="status bad">Preview unavailable - skipping card</div>
      ) : null}
      {previewState === 'ready' ? (
        <button className="button secondary small" onClick={onTogglePlay} disabled={isDisabled}>
          {isPlaying ? 'Pause preview' : 'Play preview'}
        </button>
      ) : null}
    </div>
  );
}
