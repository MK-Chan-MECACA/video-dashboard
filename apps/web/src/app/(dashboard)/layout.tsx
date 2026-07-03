import Link from 'next/link';
import { brandInitials, getBrandName } from '@/lib/brand';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const brandName = await getBrandName();
  return (
    <>
      <header className="border-b border-neutral-800 bg-neutral-900">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:gap-6 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
            <span className="rounded bg-yellow-400 px-1.5 py-0.5 text-sm text-black">
              {brandName ? brandInitials(brandName) : '▶'}
            </span>
            <span className="hidden sm:inline">Video Dashboard</span>
          </Link>
          <nav className="ml-auto flex items-center gap-3 text-sm text-neutral-300 sm:gap-4">
            <Link href="/" className="whitespace-nowrap hover:text-white">Pipeline</Link>
            <Link href="/videos/new" className="whitespace-nowrap hover:text-white">New Video</Link>
            <Link href="/settings" className="whitespace-nowrap hover:text-white">Settings</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </>
  );
}
