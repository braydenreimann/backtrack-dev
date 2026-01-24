import type { CSSProperties } from 'react';
import type { TimelineItem } from '@/lib/game-types';
import type { TimelineCardColor } from '@/lib/timeline-colors';

export type TimelineCardProps = {
  item: TimelineItem;
  color?: TimelineCardColor;
};

export default function TimelineCard({ item, color }: TimelineCardProps) {
  const style = color
    ? ({
        ['--timeline-card-bg' as string]: color.background,
        ['--timeline-card-text' as string]: color.text,
        ...(color.border ? { ['--timeline-card-border' as string]: color.border } : {}),
      } as CSSProperties)
    : undefined;

  return (
    <div
      className={`timeline-card ${item.faceDown ? 'face-down' : ''} ${
        item.highlight ? `reveal-${item.highlight}` : ''
      } ${item.isCurrent ? 'current' : ''} ${item.isExiting ? 'exiting' : ''}`}
      data-timeline-key={item.key}
      style={style}
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
