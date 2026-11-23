import {createClient} from '@supabase/supabase-js';
import {
  AUTHORS,
  AuthorItem,
  BookAccessType,
  BookCategory,
  BookCoverVariant,
  BookItem,
  INITIAL_BOOKS,
  LITERARY_RECORDS,
  MilestoneRecord,
} from '@/data/library';
import {
  DEFAULT_SUPABASE_PUBLISHABLE_KEY,
  DEFAULT_SUPABASE_URL,
  isValidBrowserSupabaseKey,
  PublicSupabaseConfig,
} from '@/lib/supabase';
import {getModerationMap} from '@/lib/admin-store';
import type {BookModerationStatus} from '@/data/library';

interface DbBookRow {
  id: string;
  user_id?: string | null;
  title: string;
  title_line_1: string;
  title_line_2: string;
  author_name: string;
  category: BookCategory;
  access_type: BookAccessType;
  price_label: string;
  cover_image_url?: string | null;
  book_file_url?: string | null;
  book_file_name?: string | null;
  book_file_size?: string | null;
  cover_variant: BookCoverVariant;
  cover_kicker: string;
  cover_footer: string;
  pages: number;
  published_year: number;
  synopsis: string;
  excerpt: string;
  moderation_status?: BookModerationStatus | null;
  rejection_reason?: string | null;
}

interface DbAuthorRow {
  id: string;
  initials: string;
  name: string;
  verified: boolean;
  country: string;
  genre: string;
  published_count: number;
  bio: string;
}

interface DbRecordRow {
  record_number: string;
  title: string;
  description: string;
}

function cleanEnvValue(value?: string): string {
  if (!value) return '';
  return value.trim().replace(/^["']|["']$/g, '');
}

export function getServerPublicSupabaseConfig(): PublicSupabaseConfig {
  const envUrl = cleanEnvValue(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  );
  const envKey = cleanEnvValue(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_KEY,
  );

  return {
    url: envUrl || DEFAULT_SUPABASE_URL,
    publishableKey: isValidBrowserSupabaseKey(envKey)
      ? envKey
      : DEFAULT_SUPABASE_PUBLISHABLE_KEY,
  };
}

export async function loadInitialLibraryFromServer(): Promise<{
  books: BookItem[];
  authors: AuthorItem[];
  records: MilestoneRecord[];
  supabaseConfig: PublicSupabaseConfig;
}> {
  const supabaseConfig = getServerPublicSupabaseConfig();
  const serverReadKey =
    supabaseConfig.publishableKey || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const serverUrl = supabaseConfig.url;

  if (!serverUrl || !serverReadKey) {
    return {
      books: INITIAL_BOOKS,
      authors: AUTHORS,
      records: LITERARY_RECORDS,
      supabaseConfig,
    };
  }

  try {
    const client = createClient(serverUrl, serverReadKey, {
      auth: {persistSession: false, autoRefreshToken: false},
      global: {
        fetch: (input, init) => fetch(input, {...init, cache: 'no-store'}),
      },
    });

    const [booksRes, authorsRes, recordsRes] = await Promise.all([
      client.from('books').select('*').order('created_at', {ascending: false}),
      client
        .from('authors')
        .select('*')
        .order('published_count', {ascending: false}),
      client
        .from('literary_records')
        .select('*')
        .order('sort_order', {ascending: true}),
    ]);

    const moderationMap = getModerationMap();

    const books: BookItem[] = !booksRes.error && booksRes.data
      ? (booksRes.data as DbBookRow[]).map((row) => {
          const storeMod = moderationMap[row.id];
          const status: BookModerationStatus =
            row.moderation_status || storeMod?.status || 'approved';
          const rejectionReason =
            row.rejection_reason || storeMod?.rejectionReason || undefined;
          return {
            id: row.id,
            userId: row.user_id || undefined,
            title: row.title,
            titleLines: [row.title_line_1, row.title_line_2],
            author: row.author_name,
            category: row.category,
            type: row.access_type,
            priceLabel: row.price_label,
            coverImageUrl: row.cover_image_url || undefined,
            bookFileUrl: row.book_file_url || undefined,
            bookFileName: row.book_file_name || undefined,
            bookFileSize: row.book_file_size || undefined,
            coverVariant: row.cover_variant,
            coverKicker: row.cover_kicker,
            coverFooter: row.cover_footer,
            pages: row.pages,
            publishedYear: row.published_year,
            synopsis: row.synopsis,
            excerpt: row.excerpt,
            status,
            rejectionReason,
          };
        })
      : INITIAL_BOOKS.map((book) => {
          const storeMod = moderationMap[book.id];
          return storeMod
            ? {
                ...book,
                status: storeMod.status,
                rejectionReason: storeMod.rejectionReason,
              }
            : {...book, status: 'approved'};
        });

    const authors: AuthorItem[] = !authorsRes.error && authorsRes.data
      ? (authorsRes.data as DbAuthorRow[]).map((row) => ({
          id: row.id,
          initials: row.initials,
          name: row.name,
          verified: row.verified,
          country: row.country,
          genre: row.genre,
          publishedCount: row.published_count,
          bio: row.bio,
        }))
      : AUTHORS;

    const records: MilestoneRecord[] = !recordsRes.error && recordsRes.data
      ? (recordsRes.data as DbRecordRow[]).map((r) => ({
          number: r.record_number,
          title: r.title,
          description: r.description,
        }))
      : LITERARY_RECORDS;

    return {
      books,
      authors,
      records,
      supabaseConfig,
    };
  } catch {
    return {
      books: INITIAL_BOOKS,
      authors: AUTHORS,
      records: LITERARY_RECORDS,
      supabaseConfig,
    };
  }
}
