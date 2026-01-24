'use client';

export type RevealButtonProps = {
  visible: boolean;
  disabled?: boolean;
  onReveal: () => void;
};

export default function RevealButton({ visible, disabled = false, onReveal }: RevealButtonProps) {
  if (!visible) {
    return null;
  }

  return (
    <button className="controller-reveal" type="button" onClick={onReveal} disabled={disabled}>
      Reveal
    </button>
  );
}
