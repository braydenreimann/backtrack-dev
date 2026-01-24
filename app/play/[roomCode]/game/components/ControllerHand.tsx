'use client';

export type ControllerHandProps = {
  placementIndex: number | null;
};

export default function ControllerHand({ placementIndex }: ControllerHandProps) {
  if (placementIndex !== null) {
    return (
      <div className="controller-hand">
        <div className="controller-hand-empty">Mystery card placed</div>
      </div>
    );
  }

  return (
    <div className="controller-hand">
      <div className="controller-hand-card">?</div>
      <div className="controller-hand-label">Mystery card</div>
    </div>
  );
}
