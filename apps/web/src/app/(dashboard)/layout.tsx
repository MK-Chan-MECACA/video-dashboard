import Link from 'next/link';
import { brandInitials, getBrandName } from '@/lib/brand';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const brandName = await getBrandName();
  return (
    <>
      <header className="studio-header">
        <div className="mx-auto flex h-full max-w-7xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight text-studio-bright">
            <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[linear-gradient(135deg,#e9b949,#c8912b)] text-xs font-bold text-studio-on-accent">
              {brandName ? brandInitials(brandName) : '▶'}
            </span>
            <span className="hidden text-[15px] sm:inline">{brandName || 'Video Dashboard'}</span>
          </Link>
          <nav className="ml-auto flex items-center gap-3 text-sm text-studio-sub sm:gap-5">
            <Link href="/" className="whitespace-nowrap hover:text-studio-bright">Pipeline</Link>
            <Link href="/videos/new" className="whitespace-nowrap hover:text-studio-bright">New Video</Link>
            <Link href="/guide" className="whitespace-nowrap hover:text-studio-bright">How to use</Link>
            <Link href="/docs" className="whitespace-nowrap hover:text-studio-bright">API &amp; MCP</Link>
            <Link href="/settings" className="whitespace-nowrap hover:text-studio-bright">Settings</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </>
  );
}
