import { ViewportGate } from '@/app/components/ViewportGate';

export default function HostLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ViewportGate />
      {children}
    </>
  );
}
