import {NextRequest, NextResponse} from 'next/server';
import {
  claimInitialAdminPassword,
  getAdminAuthStatus,
  getAdminEmail,
  signAdminToken,
  verifyAdminAuthorization,
  verifyAdminPassword,
  verifySupabaseJwtUser,
} from '@/lib/admin-store';

export async function GET(req: NextRequest) {
  const status = getAdminAuthStatus();
  const authCheck = await verifyAdminAuthorization(req.headers.get('authorization'));
  return NextResponse.json({
    ...status,
    authorized: authCheck.authorized,
    adminSessionEmail: authCheck.adminEmail || null,
  });
}

export async function POST(req: NextRequest) {
  let body: {
    action?: string;
    password?: string;
    supabaseAccessToken?: string;
  };
  try {
    body = (await req.json()) as {
      action?: string;
      password?: string;
      supabaseAccessToken?: string;
    };
  } catch {
    return NextResponse.json({error: 'Invalid request body.'}, {status: 400});
  }

  const action = body.action || 'login';

  if (action === 'verify_supabase') {
    const token =
      body.supabaseAccessToken ||
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
      '';
    const sbUser = await verifySupabaseJwtUser(token);
    if (!sbUser?.email || sbUser.email.toLowerCase() !== getAdminEmail()) {
      return NextResponse.json(
        {error: `Admin access is restricted to ${getAdminEmail()}.`},
        {status: 403},
      );
    }
    const adminToken = signAdminToken(sbUser.email);
    return NextResponse.json({
      authorized: true,
      token: adminToken,
      adminEmail: sbUser.email,
    });
  }

  const password = typeof body.password === 'string' ? body.password : '';
  if (!password) {
    return NextResponse.json({error: 'Password is required.'}, {status: 400});
  }

  if (action === 'setup') {
    const claimRes = claimInitialAdminPassword(password);
    if (!claimRes.ok) {
      return NextResponse.json(
        {error: claimRes.error || 'Could not set admin password.'},
        {status: 400},
      );
    }
    const adminToken = signAdminToken(getAdminEmail());
    return NextResponse.json({
      authorized: true,
      token: adminToken,
      ...getAdminAuthStatus(),
    });
  }

  const valid = verifyAdminPassword(password);
  if (!valid) {
    return NextResponse.json(
      {error: 'Incorrect admin password.'},
      {status: 401},
    );
  }

  const adminToken = signAdminToken(getAdminEmail());
  return NextResponse.json({
    authorized: true,
    token: adminToken,
    ...getAdminAuthStatus(),
  });
}
