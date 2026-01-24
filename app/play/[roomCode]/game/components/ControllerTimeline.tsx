'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { Card } from '@/lib/game-types';
import { getTimelineCardColor } from '@/lib/timeline-colors';

type TimelineRenderItem = {
  key: string;
  type: 'card' | 'mystery' | 'placeholder';
  slotIndex: number;
  card?: Card;
};

export type ControllerTimelineProps = {
  timeline: Card[];
  placementIndex: number | null;
  onPlace: (index: number) => void;
  onRemove: () => void;
  disabled?: boolean;
};

export default function ControllerTimeline({
  timeline,
  placementIndex,
  onPlace,
  onRemove,
  disabled = false,
}: ControllerTimelineProps) {
  const stripRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo<TimelineRenderItem[]>(() => {
    const rows: TimelineRenderItem[] = [];
    timeline.forEach((card, index) => {
      if (placementIndex === index) {
        rows.push({ key: `mystery-${index}`, type: 'mystery', slotIndex: index });
      }
      rows.push({ key: `card-${index}`, type: 'card', slotIndex: index, card });
    });
    if (placementIndex === timeline.length) {
      rows.push({ key: 'mystery-end', type: 'mystery', slotIndex: timeline.length });
    }
    rows.push({ key: 'placeholder-end', type: 'placeholder', slotIndex: timeline.length });
    return rows;
  }, [placementIndex, timeline]);

  useEffect(() => {
    if (placementIndex === null) {
      return;
    }
    const root = stripRef.current;
    if (!root) {
      return;
    }
    const target = root.querySelector<HTMLElement>('[data-mystery="true"]');
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [placementIndex, timeline.length]);

  return (
    <div className="controller-timeline-area">
      <div className="controller-strip hide-scroll" ref={stripRef}>
        {items.map((item) => {
          if (item.type === 'card' && item.card) {
            const color = getTimelineCardColor(item.slotIndex);
            return (
              <button
                key={item.key}
                type="button"
                className="controller-card"
                style={{ backgroundColor: color.background, color: color.text }}
                onClick={() => {
                  if (disabled || placementIndex !== null) {
                    return;
                  }
                  onPlace(item.slotIndex);
                }}
                aria-disabled={disabled || placementIndex !== null}
              >
                <div>{item.card.year}</div>
                <div className="controller-card-meta">
                  <div className="controller-card-title">{item.card.title}</div>
                  <div className="controller-card-artist">{item.card.artist}</div>
                </div>
              </button>
            );
          }

          if (item.type === 'mystery') {
            return (
              <button
                key={item.key}
                type="button"
                className="controller-card mystery"
                data-mystery="true"
                onClick={() => {
                  if (disabled || placementIndex === null) {
                    return;
                  }
                  onRemove();
                }}
                aria-disabled={disabled}
              >
                <div>?</div>
                <div className="controller-card-badge">YOURS</div>
              </button>
            );
          }

          return (
            <button
              key={item.key}
              type="button"
              className="controller-card placeholder"
              onClick={() => {
                if (disabled || placementIndex !== null) {
                  return;
                }
                onPlace(item.slotIndex);
              }}
              aria-disabled={disabled || placementIndex !== null}
            >
              End
            </button>
          );
        })}
      </div>
    </div>
  );
}
