import { ViewportGate } from '@/app/host/ViewportGate';

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
