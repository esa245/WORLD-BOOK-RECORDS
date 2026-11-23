import {NextRequest, NextResponse} from 'next/server';
import {
  getAdminEmail,
  getModerationMap,
  registerUserInStore,
  setBookModerationRecord,
  verifyAdminAuthorization,
  verifySupabaseJwtUser,
} from '@/lib/admin-store';

export async function GET() {
  return NextResponse.json({
    statuses: getModerationMap(),
  });
}

export async function POST(req: NextRequest) {
  let body: {
    action?: string;
    bookId?: string;
    user?: {
      id?: string;
      name?: string;
      email?: string;
      role?: string;
      avatarUrl?: string;
    };
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({error: 'Invalid request body.'}, {status: 400});
  }

  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const verifiedSbUser = bearerToken
    ? await verifySupabaseJwtUser(bearerToken)
    : null;
  const verifiedAdmin = await verifyAdminAuthorization(authHeader);

  if (body.action === 'sync_user') {
    const incoming = body.user;
    const id = verifiedSbUser?.id || incoming?.id;
    const name = verifiedSbUser?.name || incoming?.name;
    const email = verifiedSbUser?.email || incoming?.email;
    const role = verifiedSbUser?.role || incoming?.role || 'Reader account';

    if (!id || !name) {
      return NextResponse.json(
        {error: 'User id and name are required.'},
        {status: 400},
      );
    }

    registerUserInStore({
      id: id.slice(0, 120),
      name: name.slice(0, 120),
      email: email?.slice(0, 160),
      role: role.slice(0, 60),
      avatarUrl:
        typeof incoming?.avatarUrl === 'string'
          ? incoming.avatarUrl.slice(0, 120_000)
          : undefined,
    });
    return NextResponse.json({ok: true});
  }

  if (body.action === 'submit_book') {
    const bookId = typeof body.bookId === 'string' ? body.bookId.trim() : '';
    if (!bookId) {
      return NextResponse.json({error: 'bookId is required.'}, {status: 400});
    }

    const isAdminSubmitter =
      verifiedAdmin.authorized ||
      Boolean(
        verifiedSbUser?.email &&
          verifiedSbUser.email.toLowerCase() === getAdminEmail(),
      );

    // Non-admin submissions always start as pending until reviewed by Admin
    const status = isAdminSubmitter ? 'approved' : 'pending';
    const record = setBookModerationRecord(bookId, status, undefined);
    return NextResponse.json({ok: true, bookId, record});
  }

  return NextResponse.json({error: 'Unsupported action.'}, {status: 400});
}
