import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/review') ||
    pathname.startsWith('/api/review') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/api/media') ||
    pathname.startsWith('/api/v1') ||
    pathname.startsWith('/api/mcp');

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Client reviewers: read + review only. API routes are enforced again by
  // requireOperator(); this gate keeps operator pages out of reach entirely.
  if (user?.app_metadata?.role === 'client') {
    const operatorPage =
      pathname.startsWith('/settings') ||
      pathname.startsWith('/videos/new') ||
      pathname.startsWith('/docs') ||
      pathname.startsWith('/guide');
    const operatorApi =
      pathname.startsWith('/api/settings') ||
      pathname.startsWith('/api/keys') ||
      pathname.startsWith('/api/brand-assets') ||
      pathname.startsWith('/api/users');
    if (operatorApi) return new NextResponse('forbidden', { status: 403 });
    if (operatorPage) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
