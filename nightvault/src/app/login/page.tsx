import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { AuthPanel } from '@/components/auth/AuthPanel';

export const metadata = { title: 'Connexion' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const user = await currentUser();
  if (user) redirect('/');
  const { mode } = await searchParams;
  return <AuthPanel initialMode={mode === 'register' ? 'register' : 'login'} />;
}
