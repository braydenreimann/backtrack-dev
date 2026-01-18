'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import TimelineStrip from './TimelineStrip';
import type { TimelineStripProps } from './TimelineStrip';

const collectRects = (root: HTMLElement) => {
  const rects = new Map<string, DOMRect>();
  const nodes = root.querySelectorAll<HTMLElement>('[data-timeline-key]');
  nodes.forEach((node) => {
    const key = node.dataset.timelineKey;
    if (!key) {
      return;
    }
    rects.set(key, node.getBoundingClientRect());
  });
  return rects;
};

export default function TimelineStripAnimated({ items, revealDisplay }: TimelineStripProps) {
  const stripRef = useRef<HTMLElement | null>(null);
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const timelineCount = useMemo(() => Math.max(items.length, 1), [items.length]);

  useLayoutEffect(() => {
    const root = stripRef.current;
    if (!root) {
      return;
    }
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const nextRects = collectRects(root);

    if (prefersReducedMotion) {
      prevRectsRef.current = nextRects;
      return;
    }

    if (prevRectsRef.current.size > 0) {
      const nodes = root.querySelectorAll<HTMLElement>('[data-timeline-key]');
      nodes.forEach((node) => {
        const key = node.dataset.timelineKey;
        if (!key) {
          return;
        }
        const prevRect = prevRectsRef.current.get(key);
        const nextRect = nextRects.get(key);
        if (!prevRect || !nextRect) {
          return;
        }
        const dx = prevRect.left - nextRect.left;
        const dy = prevRect.top - nextRect.top;
        if (dx === 0 && dy === 0) {
          return;
        }
        node.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
          {
            duration: 220,
            easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
            fill: 'both',
          }
        );
      });
    }

    prevRectsRef.current = nextRects;
  }, [items]);

  return (
    <TimelineStrip
      ref={stripRef}
      items={items}
      revealDisplay={revealDisplay}
      style={{ '--timeline-count': timelineCount } as CSSProperties}
    />
  );
}
