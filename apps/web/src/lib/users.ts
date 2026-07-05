import { supabaseAdmin, type Role } from '@/lib/supabase';
import { ApiError } from '@/lib/apiAuth';

export interface DashboardUser {
  id: string;
  email: string;
  role: Role;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed: boolean;
}

/** All dashboard users (operators + client reviewers), operators first. */
export async function listDashboardUsers(): Promise<DashboardUser[]> {
  const { data, error } = await supabaseAdmin().auth.admin.listUsers({ perPage: 200 });
  if (error) throw new ApiError(500, error.message);
  return data.users
    .map((u) => ({
      id: u.id,
      email: u.email ?? '(no email)',
      role: (u.app_metadata?.role === 'client' ? 'client' : 'operator') as Role,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      confirmed: Boolean(u.email_confirmed_at ?? u.last_sign_in_at),
    }))
    .sort((a, b) =>
      a.role === b.role ? a.email.localeCompare(b.email) : a.role === 'operator' ? -1 : 1,
    );
}
