import WorldBookRecords from '@/components/WorldBookRecords';
import {loadInitialLibraryFromServer} from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const {books, authors, records, supabaseConfig} =
    await loadInitialLibraryFromServer();

  return (
    <WorldBookRecords
      initialBooks={books}
      initialAuthors={authors}
      initialRecords={records}
      supabaseConfig={supabaseConfig}
    />
  );
}
