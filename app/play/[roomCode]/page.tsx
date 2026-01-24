import { redirect } from 'next/navigation';

type PageProps = {
  params: { roomCode: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

const buildQuery = (searchParams?: PageProps['searchParams']) => {
  if (!searchParams) {
    return '';
  }
  const query = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => query.append(key, entry));
    } else if (value !== undefined) {
      query.set(key, value);
    }
  });
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
};

export default function PlayRoomIndexPage({ params, searchParams }: PageProps) {
  redirect(`/play/${params.roomCode}/lobby${buildQuery(searchParams)}`);
}
