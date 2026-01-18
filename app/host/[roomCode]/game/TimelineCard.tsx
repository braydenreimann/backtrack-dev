import type { TimelineItem } from './types';

export type TimelineCardProps = {
  item: TimelineItem;
};

export default function TimelineCard({ item }: TimelineCardProps) {
  return (
    <div
      className={`timeline-card ${item.faceDown ? 'face-down' : ''} ${
        item.highlight ? `reveal-${item.highlight}` : ''
      } ${item.isCurrent ? 'current' : ''}`}
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
