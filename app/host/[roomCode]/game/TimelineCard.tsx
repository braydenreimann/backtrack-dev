import type { CSSProperties } from 'react';
import type { TimelineItem } from '@/lib/game-types';

export type TimelineCardProps = {
  item: TimelineItem;
  accentColor?: string;
};

export default function TimelineCard({ item, accentColor }: TimelineCardProps) {
  return (
    <div
      className={`timeline-card ${item.faceDown ? 'face-down' : ''} ${
        item.highlight ? `reveal-${item.highlight}` : ''
      } ${item.isCurrent ? 'current' : ''} ${item.isExiting ? 'exiting' : ''}`}
      data-timeline-key={item.key}
      style={
        accentColor
          ? ({ ['--timeline-card-accent' as string]: accentColor } as CSSProperties)
          : undefined
      }
    >
      <div className="timeline-card-inner">
        <div className="timeline-card-face front">
          {item.card ? (
            <>
              <div className="timeline-card-year">{item.card.year}</div>
              <div className="timeline-card-title">{item.card.title}</div>
              <div className="timeline-card-artist">{item.card.artist}</div>
            </>
          ) : (
            <div className="timeline-card-year">????</div>
          )}
        </div>
        <div className="timeline-card-face back">
          <div className="timeline-card-mystery">?</div>
          <div className="timeline-card-label">Mystery</div>
        </div>
      </div>
    </div>
  );
}
