import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="container">
      <section className="card">
        <h1 className="title">Backtrack MVP</h1>
        <p className="subtitle">Choose a role to get started.</p>
      </section>
      <section className="card row">
        <Link className="button" href="/host">
          Host a room
        </Link>
        <Link className="button secondary" href="/play">
          Join as player
        </Link>
      </section>
    </div>
  );
}
