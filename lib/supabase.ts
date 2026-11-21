import {createClient, SupabaseClient} from '@supabase/supabase-js';

export interface PublicSupabaseConfig {
  url: string;
  publishableKey: string;
}

export function isValidBrowserSupabaseKey(key?: string | null): key is string {
  return Boolean(key && !key.startsWith('sb_secret_'));
}

export function createBrowserSupabaseClient(
  config?: PublicSupabaseConfig | null,
): SupabaseClient | null {
  const url = config?.url || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = config?.publishableKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  if (key.startsWith('sb_secret_')) {
    if (typeof window !== 'undefined') {
      console.warn(
        'Supabase Config Warning: Secret API key (sb_secret_...) cannot be used in the browser. Use the publishable key (sb_publishable_...) instead.',
      );
    }
    return null;
  }

  try {
    return createClient(url, key, {
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
