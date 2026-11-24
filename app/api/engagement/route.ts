import {NextRequest, NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {
  adjustBookLoveInStore,
  getEngagementMap,
  incrementBookViewInStore,
} from '@/lib/admin-store';
import {getServerPublicSupabaseConfig} from '@/lib/supabase-server';

type EngagementAction = 'view' | 'love' | 'unlove';

const ALLOWED_ACTIONS = new Set<EngagementAction>(['view', 'love', 'unlove']);

export async function GET() {
  return NextResponse.json({
    engagement: getEngagementMap(),
  });
}

export async function POST(req: NextRequest) {
  let body: {bookId?: string; action?: string};
  try {
    body = (await req.json()) as {bookId?: string; action?: string};
  } catch {
    return NextResponse.json({error: 'Invalid request body.'}, {status: 400});
  }

  const bookId = typeof body.bookId === 'string' ? body.bookId.trim() : '';
  const action = body.action as EngagementAction;

  if (!bookId || bookId.length > 120 || !ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json(
      {error: 'Valid bookId and action (view, love, unlove) are required.'},
      {status: 400},
    );
  }

  const storeRecord =
    action === 'view'
      ? incrementBookViewInStore(bookId)
      : adjustBookLoveInStore(bookId, action === 'love' ? 1 : -1);

  let dbCounts: {views_count?: number; loves_count?: number} | null = null;
  const {url, publishableKey} = getServerPublicSupabaseConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || publishableKey;

  if (url && key) {
    try {
      const client = createClient(url, key, {
        auth: {persistSession: false, autoRefreshToken: false},
      });
      if (action === 'view') {
        const {data} = await client.rpc('increment_book_view', {
          p_book_id: bookId,
        });
        if (Array.isArray(data) && data[0]) {
          dbCounts = data[0] as {views_count?: number; loves_count?: number};
        }
      } else {
        const {data} = await client.rpc('toggle_book_love', {
          p_book_id: bookId,
          p_delta: action === 'love' ? 1 : -1,
        });
        if (Array.isArray(data) && data[0]) {
          dbCounts = data[0] as {views_count?: number; loves_count?: number};
        }
      }
    } catch {
      // Server engagement store already updated
    }
  }

  return NextResponse.json({
    ok: true,
    bookId,
    views:
      typeof dbCounts?.views_count === 'number'
        ? Math.max(dbCounts.views_count, storeRecord.views)
        : storeRecord.views,
    loves:
      typeof dbCounts?.loves_count === 'number'
        ? Math.max(dbCounts.loves_count, storeRecord.loves)
        : storeRecord.loves,
  });
}
