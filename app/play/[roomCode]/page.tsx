import { redirect } from 'next/navigation';

type PageProps = {
  params: { roomCode: string };
};

export default function PlayRoomIndexPage({ params }: PageProps) {
  redirect(`/play/${params.roomCode}/lobby`);
}
