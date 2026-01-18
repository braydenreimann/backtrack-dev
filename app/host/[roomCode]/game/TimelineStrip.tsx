import { forwardRef } from 'react';
import type { CSSProperties } from 'react';
import type { TimelineItem, TurnReveal } from './types';
import TimelineCard from './TimelineCard';

export type TimelineStripProps = {
  items: TimelineItem[];
  revealDisplay: TurnReveal | null;
  style?: CSSProperties;
};

const TimelineStrip = forwardRef<HTMLElement, TimelineStripProps>(
  ({ items, revealDisplay, style }, ref) => {
    return (
      <section className="timeline-stage" ref={ref} style={style}>
      <div className="timeline-axis" />
      <div className="timeline-label left">Oldest</div>
      <div className="timeline-label right">Newest</div>
      <div className="timeline-strip hide-scroll">
        {items.length === 0 ? (
          <div className="status">Timeline will appear here on the first turn.</div>
        ) : (
          items.map((item) => <TimelineCard key={item.key} item={item} />)
        )}
      </div>

      {revealDisplay ? (
        <div className={`host-reveal ${revealDisplay.correct ? 'good' : 'bad'}`}>
          <span>{revealDisplay.correct ? 'Correct!' : 'Incorrect'}</span>
          <span>
            {revealDisplay.card.title} — {revealDisplay.card.artist} ({revealDisplay.card.year})
          </span>
        </div>
      ) : null}
      </section>
    );
  }
);

TimelineStrip.displayName = 'TimelineStrip';

export default TimelineStrip;
