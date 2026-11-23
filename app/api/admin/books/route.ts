import {NextRequest, NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import type {BookModerationStatus} from '@/data/library';
import {
  getModerationMap,
  setBookModerationRecord,
  verifyAdminAuthorization,
} from '@/lib/admin-store';
import {getServerPublicSupabaseConfig} from '@/lib/supabase-server';

const ALLOWED_STATUSES = new Set<BookModerationStatus>([
  'pending',
  'approved',
  'rejected',
]);

export async function GET(req: NextRequest) {
  const auth = await verifyAdminAuthorization(req.headers.get('authorization'));
  if (!auth.authorized) {
    return NextResponse.json({error: 'Admin authorization required.'}, {status: 401});
  }

  return NextResponse.json({
    statuses: getModerationMap(),
    adminEmail: auth.adminEmail,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyAdminAuthorization(req.headers.get('authorization'));
  if (!auth.authorized) {
    return NextResponse.json({error: 'Admin authorization required.'}, {status: 401});
  }

  let body: {
    bookId?: string;
    status?: string;
    rejectionReason?: string;
  };
  try {
    body = (await req.json()) as {
      bookId?: string;
      status?: string;
      rejectionReason?: string;
    };
  } catch {
    return NextResponse.json({error: 'Invalid request body.'}, {status: 400});
  }

  const bookId = typeof body.bookId === 'string' ? body.bookId.trim() : '';
  const status = body.status as BookModerationStatus;

  if (!bookId || !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json(
      {error: 'Valid bookId and status (pending, approved, rejected) are required.'},
      {status: 400},
    );
  }

  const cleanReason =
    typeof body.rejectionReason === 'string'
      ? body.rejectionReason.trim().slice(0, 300)
      : undefined;

  const record = setBookModerationRecord(
    bookId,
    status,
    cleanReason,
    auth.adminEmail,
  );

  // Also sync to Supabase books table when Service Role key is configured on server
  let dbSynced = false;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const {url} = getServerPublicSupabaseConfig();

  if (url && serviceKey) {
    try {
      const adminClient = createClient(url, serviceKey, {
        auth: {persistSession: false, autoRefreshToken: false},
      });
      const {error} = await adminClient
        .from('books')
        .update({
          moderation_status: status,
          rejection_reason: status === 'rejected' ? cleanReason || null : null,
        })
        .eq('id', bookId);
      if (!error) dbSynced = true;
    } catch {
      // Fallback remains persisted in server moderation store
    }
  }

  return NextResponse.json({
    ok: true,
    bookId,
    record,
    dbSynced,
  });
}
