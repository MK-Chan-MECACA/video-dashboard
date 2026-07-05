import Link from 'next/link';
import { brandInitials, getBrandName } from '@/lib/brand';
import { supabaseServer, roleOf } from '@/lib/supabase';
import { SignOutButton } from '@/components/SignOutButton';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const [brandName, userResult] = await Promise.all([getBrandName(), supabase.auth.getUser()]);
  const user = userResult.data.user;
  const isOperator = user ? roleOf(user) === 'operator' : true;
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
          <nav className="flex items-center gap-3 text-sm text-studio-sub sm:ml-2 sm:gap-[22px]">
            <Link href="/" className="whitespace-nowrap hover:text-studio-bright">Pipeline</Link>
            {isOperator && (
              <>
                <Link href="/videos/new" className="whitespace-nowrap hover:text-studio-bright">New Video</Link>
                <Link href="/guide" className="whitespace-nowrap hover:text-studio-bright">How to use</Link>
                <Link href="/docs" className="whitespace-nowrap hover:text-studio-bright">API &amp; MCP</Link>
                <Link href="/settings" className="whitespace-nowrap hover:text-studio-bright">Settings</Link>
              </>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {user && !isOperator && (
              <span className="hidden text-xs text-studio-muted sm:inline">{user.email}</span>
            )}
            {user && <SignOutButton />}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </>
  );
}
