import { redirect } from 'next/navigation';

type PageProps = {
  params: { roomCode: string };
};

export default function HostRoomIndexPage({ params }: PageProps) {
  redirect(`/host/${params.roomCode}/lobby`);
}
