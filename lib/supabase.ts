import {createClient, SupabaseClient} from '@supabase/supabase-js';

export interface PublicSupabaseConfig {
  url: string;
  publishableKey: string;
}

export const DEFAULT_SUPABASE_URL = 'https://cwqpnkibptgoqhwkoipx.supabase.co';
export const DEFAULT_SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_ztmMOz8NltN9O9UtSxt6Sg_1-oSnyCt';

export function isValidBrowserSupabaseKey(key?: string | null): key is string {
  return Boolean(key && !key.startsWith('sb_secret_'));
}

export function createBrowserSupabaseClient(
  config?: PublicSupabaseConfig | null,
): SupabaseClient | null {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  const url = config?.url || envUrl || DEFAULT_SUPABASE_URL;
  const candidateKey =
    (isValidBrowserSupabaseKey(config?.publishableKey)
      ? config.publishableKey
      : '') ||
    (isValidBrowserSupabaseKey(envKey) ? envKey : '') ||
    DEFAULT_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !isValidBrowserSupabaseKey(candidateKey)) {
    return null;
  }

  try {
    return createClient(url, candidateKey, {
      global: {
        fetch: (input, init) => fetch(input, {...init, cache: 'no-store'}),
      },
    });
  } catch (error) {
    console.warn('Could not initialize Supabase client:', error);
    return null;
  }
}

export const supabase: SupabaseClient | null = createBrowserSupabaseClient();
