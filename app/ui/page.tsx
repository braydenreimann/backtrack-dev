import Link from 'next/link';

const uiLinks = [
  {
    title: 'Host lobby',
    description: 'Lobby states for the host view.',
    links: [
      { label: 'Default', href: '/host/ABC123/lobby?mock=1' },
      { label: 'Empty', href: '/host/ABC123/lobby?mock=1&state=empty' },
      { label: 'Error', href: '/host/ABC123/lobby?mock=1&state=error' },
    ],
  },
  {
    title: 'Host game',
    description: 'Active turn, waiting, and reveal states.',
    links: [
      { label: 'Default', href: '/host/ABC123/game?mock=1' },
      { label: 'Waiting', href: '/host/ABC123/game?mock=1&state=waiting' },
      { label: 'Reveal', href: '/host/ABC123/game?mock=1&state=reveal' },
      { label: 'Full timeline', href: '/host/ABC123/game?mock=1&state=full' },
    ],
  },
  {
    title: 'Player room',
    description: 'Player view for active and passive turns.',
    links: [
      { label: 'Default', href: '/play/ABC123?mock=1' },
      { label: 'Watch', href: '/play/ABC123?mock=1&state=watch' },
      { label: 'Reveal', href: '/play/ABC123?mock=1&state=reveal' },
    ],
  },
];

export default function UiIndexPage() {
  return (
    <div className="container">
      <section className="card">
        <h1 className="title">UI mock index</h1>
        <p className="subtitle">
          Quick links to mock states. Each route uses `?mock=1` and optional `state`.
        </p>
      </section>

      {uiLinks.map((section) => (
        <section className="card" key={section.title}>
          <h2 className="title" style={{ fontSize: '1.4rem' }}>
            {section.title}
          </h2>
          <p className="subtitle">{section.description}</p>
          <div className="row" style={{ marginTop: '12px' }}>
            {section.links.map((link) => (
              <Link className="button secondary" href={link.href} key={link.href}>
                {link.label}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
