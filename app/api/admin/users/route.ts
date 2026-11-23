import {NextRequest, NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {
  getStoredUsers,
  RegisteredUserSummary,
  verifyAdminAuthorization,
} from '@/lib/admin-store';
import {getServerPublicSupabaseConfig} from '@/lib/supabase-server';

interface ProfileRow {
  id: string;
  full_name: string | null;
  email?: string | null;
  account_role: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
}

export async function GET(req: NextRequest) {
  const auth = await verifyAdminAuthorization(req.headers.get('authorization'));
  if (!auth.authorized) {
    return NextResponse.json({error: 'Admin authorization required.'}, {status: 401});
  }

  const usersMap = new Map<string, RegisteredUserSummary>();

  // 1. Seed from server user registry
  for (const user of getStoredUsers()) {
    usersMap.set(user.id, {...user});
  }

  // 2. Query Supabase profiles if service role key OR forwarded Supabase admin JWT is available
  const {url, publishableKey} = getServerPublicSupabaseConfig();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const supabaseUserJwt = req.headers.get('x-supabase-token')?.trim();

  if (url && (serviceKey || (publishableKey && supabaseUserJwt))) {
    try {
      const client = serviceKey
        ? createClient(url, serviceKey, {
            auth: {persistSession: false, autoRefreshToken: false},
          })
        : createClient(url, publishableKey, {
            auth: {persistSession: false, autoRefreshToken: false},
            global: {
              headers: {
                Authorization: `Bearer ${supabaseUserJwt}`,
              },
            },
          });

      const [profilesRes, booksRes] = await Promise.all([
        client
          .from('profiles')
          .select('id, full_name, email, account_role, avatar_url, created_at')
          .order('created_at', {ascending: false}),
        client.from('books').select('user_id, author_name, created_at'),
      ]);

      const bookCountsByUserId = new Map<string, number>();
      const bookCountsByAuthor = new Map<string, number>();

      if (!booksRes.error && booksRes.data) {
        for (const row of booksRes.data as {
          user_id?: string | null;
          author_name?: string | null;
          created_at?: string | null;
        }[]) {
          if (row.user_id) {
            bookCountsByUserId.set(
              row.user_id,
              (bookCountsByUserId.get(row.user_id) || 0) + 1,
            );
          }
          if (row.author_name) {
            const key = row.author_name.trim().toLowerCase();
            bookCountsByAuthor.set(key, (bookCountsByAuthor.get(key) || 0) + 1);
          }
        }
      }

      if (!profilesRes.error && profilesRes.data) {
        for (const p of profilesRes.data as ProfileRow[]) {
          const existing = usersMap.get(p.id);
          const name = p.full_name || existing?.name || 'Member';
          usersMap.set(p.id, {
            id: p.id,
            name,
            email: p.email || existing?.email,
            role: p.account_role || existing?.role || 'Reader account',
            avatarUrl: p.avatar_url || existing?.avatarUrl,
            createdAt: p.created_at || existing?.createdAt || new Date().toISOString(),
            booksCount:
              bookCountsByUserId.get(p.id) ||
              bookCountsByAuthor.get(name.trim().toLowerCase()) ||
              0,
          });
        }
      } else {
        // Fallback if profiles doesn't have email column yet
        const retryProfiles = await client
          .from('profiles')
          .select('id, full_name, account_role, avatar_url, created_at')
          .order('created_at', {ascending: false});

        if (!retryProfiles.error && retryProfiles.data) {
          for (const p of retryProfiles.data as ProfileRow[]) {
            const existing = usersMap.get(p.id);
            const name = p.full_name || existing?.name || 'Member';
            usersMap.set(p.id, {
              id: p.id,
              name,
              email: existing?.email,
              role: p.account_role || existing?.role || 'Reader account',
              avatarUrl: p.avatar_url || existing?.avatarUrl,
              createdAt: p.created_at || existing?.createdAt || new Date().toISOString(),
              booksCount:
                bookCountsByUserId.get(p.id) ||
                bookCountsByAuthor.get(name.trim().toLowerCase()) ||
                0,
            });
          }
        }
      }
    } catch {
      // Keep registry users
    }
  }

  const users = Array.from(usersMap.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  return NextResponse.json({users});
}
