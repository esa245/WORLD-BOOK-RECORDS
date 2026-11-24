import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createClient} from '@supabase/supabase-js';
import type {BookModerationStatus} from '@/data/library';
import {getServerPublicSupabaseConfig} from '@/lib/supabase-server';

export interface BookModerationRecord {
  status: BookModerationStatus;
  rejectionReason?: string;
  updatedAt: string;
  reviewedBy?: string;
}

export interface RegisteredUserSummary {
  id: string;
  name: string;
  email?: string;
  role: string;
  avatarUrl?: string;
  createdAt: string;
  booksCount?: number;
}

export interface BookEngagementRecord {
  views: number;
  loves: number;
}

interface AdminStoreData {
  adminPasswordHash?: string;
  moderation: Record<string, BookModerationRecord>;
  users: Record<string, RegisteredUserSummary>;
  engagement: Record<string, BookEngagementRecord>;
}

const STORE_PATH = path.join(os.tmpdir(), 'wbr-admin-store-v1.json');

const globalForAdmin = globalThis as unknown as {
  __wbrAdminStore?: AdminStoreData;
  __wbrSessionSecret?: string;
};

function getSessionSecret(): string {
  const envSecret = process.env.ADMIN_SESSION_SECRET?.trim();
  if (envSecret) return envSecret;
  if (!globalForAdmin.__wbrSessionSecret) {
    globalForAdmin.__wbrSessionSecret = crypto.randomBytes(32).toString('hex');
  }
  return globalForAdmin.__wbrSessionSecret;
}

export function getAdminEmail(): string {
  return process.env.ADMIN_EMAIL?.trim().toLowerCase() || 'itsesa544@gmail.com';
}

export function getEnvAdminPasscode(): string {
  return process.env.ADMIN_PASSCODE?.trim() || '';
}

function readStore(): AdminStoreData {
  if (globalForAdmin.__wbrAdminStore) {
    return globalForAdmin.__wbrAdminStore;
  }

  let loaded: AdminStoreData = {moderation: {}, users: {}, engagement: {}};
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<AdminStoreData>;
      loaded = {
        adminPasswordHash: parsed.adminPasswordHash,
        moderation: parsed.moderation || {},
        users: parsed.users || {},
        engagement: parsed.engagement || {},
      };
    }
  } catch {
    loaded = {moderation: {}, users: {}, engagement: {}};
  }

  globalForAdmin.__wbrAdminStore = loaded;
  return loaded;
}

function writeStore(next: AdminStoreData) {
  globalForAdmin.__wbrAdminStore = next;
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(next), 'utf8');
  } catch {
    // Keep working in memory if tmp directory is read-only
  }
}

export function hashAdminPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyScryptHash(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  if (!salt || !originalHex) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const original = Buffer.from(originalHex, 'hex');
    if (derived.length !== original.length) return false;
    return crypto.timingSafeEqual(derived, original);
  } catch {
    return false;
  }
}

export function verifyConstantTimeText(input: string, expected: string): boolean {
  const a = Buffer.from(input, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export function getAdminAuthStatus(): {
  envPasscodeConfigured: boolean;
  claimed: boolean;
  adminEmail: string;
} {
  const store = readStore();
  return {
    envPasscodeConfigured: Boolean(getEnvAdminPasscode()),
    claimed: Boolean(store.adminPasswordHash),
    adminEmail: getAdminEmail(),
  };
}

export function claimInitialAdminPassword(password: string): {
  ok: boolean;
  error?: string;
} {
  if (getEnvAdminPasscode()) {
    return {
      ok: false,
      error: 'Admin passcode is already managed via server environment secrets.',
    };
  }
  const store = readStore();
  if (store.adminPasswordHash) {
    return {
      ok: false,
      error: 'Admin password has already been claimed. Please sign in with it.',
    };
  }
  if (password.trim().length < 6) {
    return {
      ok: false,
      error: 'Admin password must be at least 6 characters long.',
    };
  }
  store.adminPasswordHash = hashAdminPassword(password);
  writeStore(store);
  return {ok: true};
}

export function verifyAdminPassword(password: string): boolean {
  const envPass = getEnvAdminPasscode();
  if (envPass) {
    return verifyConstantTimeText(password, envPass);
  }
  const store = readStore();
  if (!store.adminPasswordHash) return false;
  return verifyScryptHash(password, store.adminPasswordHash);
}

export function signAdminToken(subject: string): string {
  const payload = {
    sub: subject,
    role: 'admin',
    exp: Date.now() + 1000 * 60 * 60 * 12, // 12 hours
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyAdminToken(token: string): {valid: boolean; subject?: string} {
  const parts = token.split('.');
  if (parts.length !== 2) return {valid: false};
  const [encoded, sig] = parts;
  if (!encoded || !sig) return {valid: false};

  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length) return {valid: false};
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return {valid: false};

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      sub?: string;
      role?: string;
      exp?: number;
    };
    if (parsed.role !== 'admin' || !parsed.exp || Date.now() > parsed.exp) {
      return {valid: false};
    }
    return {valid: true, subject: parsed.sub || getAdminEmail()};
  } catch {
    return {valid: false};
  }
}

export async function verifySupabaseJwtUser(accessToken: string): Promise<{
  id: string;
  email?: string;
  name?: string;
  role?: string;
} | null> {
  if (!accessToken) return null;
  const config = getServerPublicSupabaseConfig();
  if (!config.url || !config.publishableKey) return null;

  try {
    const client = createClient(config.url, config.publishableKey, {
      auth: {persistSession: false, autoRefreshToken: false},
    });
    const {data, error} = await client.auth.getUser(accessToken);
    if (error || !data.user) return null;
    return {
      id: data.user.id,
      email: data.user.email,
      name:
        (data.user.user_metadata?.full_name as string | undefined) ||
        data.user.email?.split('@')[0],
      role: data.user.user_metadata?.account_role as string | undefined,
    };
  } catch {
    return null;
  }
}

export async function verifyAdminAuthorization(authHeader: string | null): Promise<{
  authorized: boolean;
  adminEmail?: string;
}> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {authorized: false};
  }
  const token = authHeader.slice(7).trim();
  if (!token) return {authorized: false};

  // 1. Check HMAC Admin Session Token
  const hmacCheck = verifyAdminToken(token);
  if (hmacCheck.valid) {
    return {authorized: true, adminEmail: hmacCheck.subject};
  }

  // 2. Check Supabase JWT for Admin email
  const sbUser = await verifySupabaseJwtUser(token);
  if (sbUser?.email && sbUser.email.toLowerCase() === getAdminEmail()) {
    return {authorized: true, adminEmail: sbUser.email};
  }

  return {authorized: false};
}

export function getModerationMap(): Record<string, BookModerationRecord> {
  return {...readStore().moderation};
}

export function setBookModerationRecord(
  bookId: string,
  status: BookModerationStatus,
  rejectionReason?: string,
  reviewedBy?: string,
): BookModerationRecord {
  const store = readStore();
  const cleanReason =
    status === 'rejected' && rejectionReason?.trim()
      ? rejectionReason.trim().slice(0, 300)
      : undefined;

  const record: BookModerationRecord = {
    status,
    rejectionReason: cleanReason,
    updatedAt: new Date().toISOString(),
    reviewedBy,
  };
  store.moderation[bookId] = record;
  writeStore(store);
  return record;
}

export function registerUserInStore(user: {
  id: string;
  name: string;
  email?: string;
  role: string;
  avatarUrl?: string;
}) {
  if (!user.id || !user.name) return;
  const store = readStore();
  const existing = store.users[user.id];
  store.users[user.id] = {
    id: user.id,
    name: user.name.slice(0, 120),
    email: user.email?.slice(0, 160) || existing?.email,
    role: user.role.slice(0, 60),
    avatarUrl: user.avatarUrl || existing?.avatarUrl,
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
  writeStore(store);
}

export function getStoredUsers(): RegisteredUserSummary[] {
  return Object.values(readStore().users).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export function getEngagementMap(): Record<string, BookEngagementRecord> {
  return {...readStore().engagement};
}

export function incrementBookViewInStore(bookId: string): BookEngagementRecord {
  const store = readStore();
  const prev = store.engagement[bookId] || {views: 0, loves: 0};
  const next: BookEngagementRecord = {
    views: prev.views + 1,
    loves: prev.loves,
  };
  store.engagement[bookId] = next;
  writeStore(store);
  return next;
}

export function adjustBookLoveInStore(
  bookId: string,
  delta: 1 | -1,
): BookEngagementRecord {
  const store = readStore();
  const prev = store.engagement[bookId] || {views: 0, loves: 0};
  const next: BookEngagementRecord = {
    views: prev.views,
    loves: Math.max(0, prev.loves + delta),
  };
  store.engagement[bookId] = next;
  writeStore(store);
  return next;
}
