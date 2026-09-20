import type { Metadata, Viewport } from 'next';
import { Cinzel, Manrope } from 'next/font/google';
import { SessionProvider } from '@/components/session/SessionProvider';
import { Header } from '@/components/shell/Header';
import { MobileNav } from '@/components/shell/MobileNav';
import { currentUser } from '@/lib/auth';
import './globals.css';

const display = Cinzel({ variable: '--font-display', subsets: ['latin'], weight: ['500', '600', '700'] });
const sans = Manrope({ variable: '--font-sans', subsets: ['latin'], weight: ['400', '500', '600', '700', '800'] });

const NAME = process.env.CASINO_NAME ?? 'CASINHO';

export const metadata: Metadata = {
  title: { default: `${NAME} · casino virtuel`, template: `%s · ${NAME}` },
  description: 'Casino virtuel : 50 jeux, jackpots, missions et NV Coins. Monnaie 100 % virtuelle, aucun argent réel.',
  icons: { icon: '/brand/casinho-c.png' },
};

export const viewport: Viewport = {
  themeColor: '#06070c',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="fr" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-dvh">
        <SessionProvider initial={user ? { ...user, balance: Number(user.balance) } : null}>
          <Header />
          <main className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-4 md:px-7 md:pb-14">{children}</main>
          <MobileNav />
        </SessionProvider>
      </body>
    </html>
  );
}
