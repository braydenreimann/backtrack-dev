export type TimelineCardColor = {
  background: string;
  text: string;
  border?: string;
};

const TIMELINE_CARD_COLORS: TimelineCardColor[] = [
  { background: '#e55050', text: '#ffffff' },
  { background: '#d79a1d', text: '#1f1300' },
  { background: '#3c66e0', text: '#ffffff' },
  { background: '#2f9e44', text: '#ffffff' },
  { background: '#9b5de5', text: '#ffffff' },
  { background: '#0ea5a4', text: '#ffffff' },
];

export const getTimelineCardColor = (index: number): TimelineCardColor => {
  const safeIndex = Number.isFinite(index) ? Math.abs(index) : 0;
  return TIMELINE_CARD_COLORS[safeIndex % TIMELINE_CARD_COLORS.length];
};
