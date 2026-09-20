import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';

export const metadata = { title: 'Administration' };

const TABS = [
  ['/admin', 'Tableau de bord'],
  ['/admin/jeux', 'Jeux'],
  ['/admin/simulateur', 'Simulateur'],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN') redirect('/');

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-center gap-3 p-4">
        <h1 className="display text-lg tracking-[0.18em]">Administration</h1>
        <nav className="ml-auto flex gap-2">
          {TABS.map(([href, label]) => (
            <Link key={href} href={href} className="btn px-4 py-2 text-xs">
              {label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
