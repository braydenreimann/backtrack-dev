import { forwardRef } from 'react';
import type { CSSProperties } from 'react';
import type { TimelineItem, TurnReveal } from '@/lib/game-types';
import TimelineCard from './TimelineCard';
import { getTimelineCardColor, TIMELINE_CARD_COLOR_COUNT } from '@/lib/timeline-colors';

export type TimelineStripProps = {
  items: TimelineItem[];
  revealDisplay: TurnReveal | null;
  style?: CSSProperties;
};

const TimelineStrip = forwardRef<HTMLElement, TimelineStripProps>(
  ({ items, revealDisplay, style }, ref) => {
    const colorSignature = (color: { background: string; text: string; border?: string }) =>
      `${color.background}|${color.text}|${color.border ?? ''}`;

    const resolveColor = (item: TimelineItem, index: number) => {
      const baseColor = getTimelineCardColor(item.slotIndex);
      if (!item.isCurrent || item.faceDown) {
        return baseColor;
      }

      const neighborSignatures = new Set<string>();
      const prevItem = items[index - 1];
      const nextItem = items[index + 1];
      if (prevItem) {
        neighborSignatures.add(colorSignature(getTimelineCardColor(prevItem.slotIndex)));
      }
      if (nextItem) {
        neighborSignatures.add(colorSignature(getTimelineCardColor(nextItem.slotIndex)));
      }

      if (!neighborSignatures.has(colorSignature(baseColor))) {
        return baseColor;
      }

      for (let offset = 1; offset <= TIMELINE_CARD_COLOR_COUNT; offset += 1) {
        const candidate = getTimelineCardColor(item.slotIndex + offset);
        if (!neighborSignatures.has(colorSignature(candidate))) {
          return candidate;
        }
      }

      return baseColor;
    };

    return (
      <section className="timeline-stage" ref={ref} style={style}>
        <div className="timeline-track-wrapper">
          <div className="timeline-axis" />
          <div className="timeline-label left">Oldest</div>
          <div className="timeline-label right">Newest</div>
          <div className="timeline-strip hide-scroll">
            {items.length === 0 ? (
              <div className="status">Timeline will appear here on the first turn.</div>
            ) : (
              items.map((item, index) => {
                const color = resolveColor(item, index);
                return (
                  <TimelineCard
                    key={item.key}
                    item={item}
                    color={color}
                  />
                );
              })
            )}
          </div>
        </div>
      </section>
    );
  }
);

TimelineStrip.displayName = 'TimelineStrip';

export default TimelineStrip;
