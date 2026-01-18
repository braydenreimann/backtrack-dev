export type HostStatusBannersProps = {
  status: string | null;
  error: string | null;
};

export default function HostStatusBanners({ status, error }: HostStatusBannersProps) {
  return (
    <>
      {status ? <div className="status">{status}</div> : null}
      {error ? <div className="status bad">{error}</div> : null}
    </>
  );
}
