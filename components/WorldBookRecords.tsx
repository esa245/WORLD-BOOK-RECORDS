'use client';

import React, {useEffect, useMemo, useState} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Menu,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import {
  AUTHORS,
  AuthorItem,
  BookAccessType,
  BookCategory,
  BookCoverVariant,
  BookItem,
  INFO_PAGES,
  InfoPageItem,
  INITIAL_BOOKS,
  LITERARY_RECORDS,
  MilestoneRecord,
} from '@/data/library';
import {supabase} from '@/lib/supabase';

type FilterOption = 'All' | BookCategory | BookAccessType;
type AuthModalMode = 'login' | 'signup' | 'publish';

const FILTER_OPTIONS: {value: FilterOption; label: string}[] = [
  {value: 'All', label: 'All books'},
  {value: 'Fiction', label: 'Fiction'},
  {value: 'History', label: 'History'},
  {value: 'Science', label: 'Science'},
  {value: 'Free', label: 'Free'},
  {value: 'Paid', label: 'Paid'},
];

const COVER_GRADIENTS: Record<BookCoverVariant, string> = {
  c1: 'bg-[linear-gradient(140deg,#49321b,#17120d)]',
  c2: 'bg-[linear-gradient(140deg,#193b3a,#0b1719)]',
  c3: 'bg-[linear-gradient(140deg,#493047,#1b1420)]',
  c4: 'bg-[linear-gradient(140deg,#3d3a20,#15160c)]',
};

interface DbBookRow {
  id: string;
  title: string;
  title_line_1: string;
  title_line_2: string;
  author_name: string;
  category: BookCategory;
  access_type: BookAccessType;
  price_label: string;
  cover_variant: BookCoverVariant;
  cover_kicker: string;
  cover_footer: string;
  pages: number;
  published_year: number;
  synopsis: string;
  excerpt: string;
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

function mapDbBook(row: DbBookRow): BookItem {
  return {
    id: row.id,
    title: row.title,
    titleLines: [row.title_line_1, row.title_line_2],
    author: row.author_name,
    category: row.category,
    type: row.access_type,
    priceLabel: row.price_label,
    coverVariant: row.cover_variant,
    coverKicker: row.cover_kicker,
    coverFooter: row.cover_footer,
    pages: row.pages,
    publishedYear: row.published_year,
    synopsis: row.synopsis,
    excerpt: row.excerpt,
  };
}

function mapDbAuthor(row: DbAuthorRow): AuthorItem {
  return {
    id: row.id,
    initials: row.initials,
    name: row.name,
    verified: row.verified,
    country: row.country,
    genre: row.genre,
    publishedCount: row.published_count,
    bio: row.bio,
  };
}

export default function WorldBookRecords() {
  const [books, setBooks] = useState<BookItem[]>(INITIAL_BOOKS);
  const [authors, setAuthors] = useState<AuthorItem[]>(AUTHORS);
  const [records, setRecords] = useState<MilestoneRecord[]>(LITERARY_RECORDS);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterOption>('All');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Modals
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode | null>(null);
  const [selectedBook, setSelectedBook] = useState<BookItem | null>(null);
  const [authorsDirectoryOpen, setAuthorsDirectoryOpen] = useState(false);
  const [selectedInfoPage, setSelectedInfoPage] = useState<InfoPageItem | null>(null);

  // Account & Publish form state
  const [signedInUser, setSignedInUser] = useState<{
    id?: string;
    name: string;
    role: string;
  } | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountType, setAccountType] = useState<'Reader account' | 'Author account'>(
    'Reader account',
  );
  const [bookTitleInput, setBookTitleInput] = useState('');
  const [bookCategoryInput, setBookCategoryInput] = useState<BookCategory>('Fiction');
  const [bookAccessInput, setBookAccessInput] = useState<BookAccessType>('Free');
  const [bookPriceInput, setBookPriceInput] = useState('$4.99');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAuthModalMode(null);
        setSelectedBook(null);
        setAuthorsDirectoryOpen(false);
        setSelectedInfoPage(null);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!feedbackBanner) return;
    const timer = setTimeout(() => setFeedbackBanner(null), 5000);
    return () => clearTimeout(timer);
  }, [feedbackBanner]);

  // Sync data and auth session with Supabase when configured
  useEffect(() => {
    const client = supabase;
    if (!client) return;

    let isMounted = true;

    const loadCatalog = async () => {
      try {
        const [booksRes, authorsRes, recordsRes] = await Promise.all([
          client
            .from('books')
            .select('*')
            .order('created_at', {ascending: false}),
          client
            .from('authors')
            .select('*')
            .order('published_count', {ascending: false}),
          client
            .from('literary_records')
            .select('*')
            .order('sort_order', {ascending: true}),
        ]);

        if (!isMounted) return;

        if (!booksRes.error && booksRes.data && booksRes.data.length > 0) {
          setBooks((booksRes.data as DbBookRow[]).map(mapDbBook));
        }
        if (!authorsRes.error && authorsRes.data && authorsRes.data.length > 0) {
          setAuthors((authorsRes.data as DbAuthorRow[]).map(mapDbAuthor));
        }
        if (!recordsRes.error && recordsRes.data && recordsRes.data.length > 0) {
          setRecords(
            (recordsRes.data as DbRecordRow[]).map((r) => ({
              number: r.record_number,
              title: r.title,
              description: r.description,
            })),
          );
        }
      } catch {
        // Keep initial curated catalog if tables are not yet initialized
      }
    };

    const syncSession = async () => {
      const {data} = await client.auth.getSession();
      if (!isMounted) return;
      const user = data.session?.user;
      if (user) {
        setSignedInUser({
          id: user.id,
          name:
            (user.user_metadata?.full_name as string | undefined) ||
            user.email?.split('@')[0] ||
            'Member',
          role:
            (user.user_metadata?.account_role as string | undefined) ||
            'Reader account',
        });
      }
    };

    loadCatalog();
    syncSession();

    const {data: authSub} = client.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      const user = session?.user;
      if (user) {
        setSignedInUser({
          id: user.id,
          name:
            (user.user_metadata?.full_name as string | undefined) ||
            user.email?.split('@')[0] ||
            'Member',
          role:
            (user.user_metadata?.account_role as string | undefined) ||
            'Reader account',
        });
      } else {
        setSignedInUser(null);
      }
    });

    return () => {
      isMounted = false;
      authSub.subscription.unsubscribe();
    };
  }, []);

  const filteredBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return books.filter((book) => {
      const searchableText =
        `${book.title} ${book.author} ${book.category} ${book.type} ${book.priceLabel} ${book.coverKicker} ${book.synopsis}`.toLowerCase();
      const matchesQuery = !q || searchableText.includes(q);
      const matchesFilter =
        activeFilter === 'All' ||
        book.category === activeFilter ||
        book.type === activeFilter;
      return matchesQuery && matchesFilter;
    });
  }, [books, searchQuery, activeFilter]);

  const openAuthModal = (mode: AuthModalMode) => {
    setFormError(null);
    setAuthModalMode(mode);
    setMobileMenuOpen(false);
    if (mode === 'publish') {
      setAccountType('Author account');
    }
  };

  const handleSignOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setSignedInUser(null);
    setFeedbackBanner('Signed out of your account.');
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const displayName =
        signedInUser?.name || fullName.trim() || email.split('@')[0] || 'Author';

      if (supabase) {
        let activeUserId = signedInUser?.id;

        if (authModalMode === 'login') {
          const {data, error} = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          if (error) {
            setFormError(error.message);
            setSubmitting(false);
            return;
          }
          const user = data.user;
          const resolvedName =
            (user.user_metadata?.full_name as string | undefined) ||
            user.email?.split('@')[0] ||
            'Member';
          setSignedInUser({
            id: user.id,
            name: resolvedName,
            role:
              (user.user_metadata?.account_role as string | undefined) ||
              'Reader account',
          });
          setFeedbackBanner(`Signed in as ${resolvedName}.`);
          setAuthModalMode(null);
          setPassword('');
          setSubmitting(false);
          return;
        }

        if (authModalMode === 'signup') {
          const {data, error} = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
              data: {
                full_name: displayName,
                account_role: accountType,
              },
            },
          });
          if (error) {
            setFormError(error.message);
            setSubmitting(false);
            return;
          }
          if (data.session && data.user) {
            setSignedInUser({
              id: data.user.id,
              name: displayName,
              role: accountType,
            });
            setFeedbackBanner(
              `Welcome to World Book Records, ${displayName} (${accountType}).`,
            );
          } else {
            setFeedbackBanner(
              'Account created. Check your email to confirm before signing in.',
            );
          }
          setAuthModalMode(null);
          setPassword('');
          setSubmitting(false);
          return;
        }

        if (authModalMode === 'publish') {
          if (!activeUserId) {
            const signInAttempt = await supabase.auth.signInWithPassword({
              email: email.trim(),
              password,
            });
            if (!signInAttempt.error && signInAttempt.data.user) {
              activeUserId = signInAttempt.data.user.id;
            } else {
              const signUpAttempt = await supabase.auth.signUp({
                email: email.trim(),
                password,
                options: {
                  data: {
                    full_name: displayName,
                    account_role: 'Author account',
                  },
                },
              });
              if (signUpAttempt.error) {
                setFormError(signUpAttempt.error.message);
                setSubmitting(false);
                return;
              }
              activeUserId = signUpAttempt.data.user?.id;
              if (!signUpAttempt.data.session) {
                setFormError(
                  'Please confirm your email address, then sign in to publish your book.',
                );
                setSubmitting(false);
                return;
              }
            }
          }

          const words = bookTitleInput.trim().split(/\s+/);
          const splitIdx = Math.ceil(words.length / 2);
          const line1 = words.slice(0, splitIdx).join(' ');
          const line2 = words.slice(splitIdx).join(' ') || 'Edition';
          const variants: BookCoverVariant[] = ['c1', 'c2', 'c3', 'c4'];
          const variant = variants[books.length % variants.length];
          const priceLabel =
            bookAccessInput === 'Free' ? 'Free' : bookPriceInput.trim() || '$4.99';
          const newId = `book-${Date.now()}`;

          const {data: insertedBook, error: insertError} = await supabase
            .from('books')
            .insert({
              id: newId,
              user_id: activeUserId,
              title: bookTitleInput.trim(),
              title_line_1: line1,
              title_line_2: line2,
              author_name: displayName,
              category: bookCategoryInput,
              access_type: bookAccessInput,
              price_label: priceLabel,
              cover_variant: variant,
              cover_kicker: 'WORLD BOOK RECORDS',
              cover_footer: `BY ${displayName.toUpperCase()}`,
              pages: 210,
              published_year: 2026,
              synopsis: `Published to the World Book Records library by ${displayName}.`,
              excerpt:
                'Every story begins with a single page shared openly with readers across borders.',
            })
            .select()
            .single();

          if (insertError) {
            setFormError(insertError.message);
            setSubmitting(false);
            return;
          }

          if (insertedBook) {
            setBooks((prev) => [mapDbBook(insertedBook as DbBookRow), ...prev]);
          }
          setFeedbackBanner(
            `"${bookTitleInput.trim()}" has been published to World Book Records.`,
          );
          setBookTitleInput('');
          setAuthModalMode(null);
          setPassword('');
          setSubmitting(false);
          return;
        }
      }

      // Fallback when Supabase environment variables are not yet configured
      if (authModalMode === 'publish' && bookTitleInput.trim()) {
        const words = bookTitleInput.trim().split(/\s+/);
        const splitIdx = Math.ceil(words.length / 2);
        const line1 = words.slice(0, splitIdx).join(' ');
        const line2 = words.slice(splitIdx).join(' ') || 'Edition';
        const variants: BookCoverVariant[] = ['c1', 'c2', 'c3', 'c4'];
        const variant = variants[books.length % variants.length];
        const priceLabel =
          bookAccessInput === 'Free' ? 'Free' : bookPriceInput.trim() || '$4.99';

        const newBook: BookItem = {
          id: `book-${Date.now()}`,
          titleLines: [line1, line2],
          title: bookTitleInput.trim(),
          author: displayName,
          category: bookCategoryInput,
          type: bookAccessInput,
          priceLabel,
          coverVariant: variant,
          coverKicker: 'WORLD BOOK RECORDS',
          coverFooter: `BY ${displayName.toUpperCase()}`,
          pages: 210,
          publishedYear: 2026,
          synopsis: `Published to the World Book Records library by ${displayName}.`,
          excerpt:
            'Every story begins with a single page shared openly with readers across borders.',
        };

        setBooks((prev) => [newBook, ...prev]);
        setSignedInUser({name: displayName, role: 'Author account'});
        setFeedbackBanner(
          `"${newBook.title}" has been added to the World Book Records library.`,
        );
        setBookTitleInput('');
      } else if (authModalMode === 'login') {
        setSignedInUser({name: displayName, role: accountType});
        setFeedbackBanner(`Signed in as ${displayName}.`);
      } else {
        setSignedInUser({name: displayName, role: accountType});
        setFeedbackBanner(
          `Welcome to World Book Records, ${displayName} (${accountType}).`,
        );
      }

      setAuthModalMode(null);
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  const filterByAuthor = (author: AuthorItem) => {
    setSearchQuery(author.name);
    setActiveFilter('All');
    setAuthorsDirectoryOpen(false);
    const el = document.getElementById('books');
    el?.scrollIntoView({behavior: 'smooth'});
  };

  const modalMeta: Record<AuthModalMode, {title: string; desc: string}> = {
    login: {
      title: 'Welcome back',
      desc: 'Sign in to continue to your library.',
    },
    signup: {
      title: 'Join World Book Records',
      desc: 'Create your reader or author account.',
    },
    publish: {
      title: 'Start your author journey',
      desc: 'Register as an author to publish your first book.',
    },
  };

  return (
    <div className="min-h-screen bg-[#0b0b0d] text-[#f7f4ed]">
      {/* Sticky Header */}
      <header className="sticky top-0 z-20 bg-[#0b0b0def] border-b border-[#302c25] backdrop-blur-[14px]">
        <div className="w-[min(1160px,92%)] mx-auto h-[66px] sm:h-[76px] flex items-center justify-between gap-5">
          <a
            href="#"
            className="flex items-center gap-[11px] font-extrabold tracking-[0.5px] shrink-0"
          >
            <span className="w-[39px] h-[39px] border border-[#d8b35d] rounded-[12px] grid place-items-center text-[#d8b35d] font-serif text-[22px] shrink-0">
              W
            </span>
            <span className="text-[13px] sm:text-[15px] leading-tight whitespace-nowrap">
              WORLD BOOK RECORDS
              <small className="block text-[#d8b35d] text-[9px] tracking-[2.2px] font-bold">
                READ · WRITE · MAKE HISTORY
              </small>
            </span>
          </a>

          <nav
            aria-label="Primary"
            className="hidden min-[851px]:flex items-center gap-6 text-[13px] text-[#d2cec5]"
          >
            <a
              href="#books"
              className="hover:text-[#d8b35d] transition-colors whitespace-nowrap"
            >
              Explore Books
            </a>
            <a
              href="#authors"
              className="hover:text-[#d8b35d] transition-colors whitespace-nowrap"
            >
              Authors
            </a>
            <a
              href="#records"
              className="hover:text-[#d8b35d] transition-colors whitespace-nowrap"
            >
              Records
            </a>
            <a
              href="#publish"
              className="hover:text-[#d8b35d] transition-colors whitespace-nowrap"
            >
              Publish
            </a>
          </nav>

          <div className="flex items-center gap-[10px] shrink-0">
            {signedInUser ? (
              <div className="flex items-center gap-2.5">
                <span className="hidden sm:inline text-[12px] text-[#d8b35d] font-semibold">
                  {signedInUser.name}
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="hidden min-[541px]:inline-flex border border-[#302c25] rounded-[9px] px-3 py-2 text-[#d2cec5] bg-transparent hover:border-[#d8b35d] hover:text-[#d8b35d] text-[13px] cursor-pointer transition-colors whitespace-nowrap"
                >
                  Sign out
                </button>
                <button
                  type="button"
                  onClick={() => openAuthModal('publish')}
                  className="border border-[#d8b35d] rounded-[9px] px-4 py-2.5 text-[#16130c] bg-[#d8b35d] hover:bg-[#f2d58b] font-bold text-[14px] cursor-pointer transition-colors whitespace-nowrap"
                >
                  Publish book
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => openAuthModal('login')}
                  className="hidden min-[541px]:inline-flex border border-[#d8b35d] rounded-[9px] px-4 py-2.5 text-[#d8b35d] bg-transparent hover:bg-[#d8b35d]/10 font-bold text-[14px] cursor-pointer transition-colors whitespace-nowrap"
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={() => openAuthModal('signup')}
                  className="border border-[#d8b35d] rounded-[9px] px-4 py-2.5 text-[#16130c] bg-[#d8b35d] hover:bg-[#f2d58b] font-bold text-[14px] cursor-pointer transition-colors whitespace-nowrap"
                >
                  Join free
                </button>
              </>
            )}

            <button
              type="button"
              aria-label="Toggle navigation menu"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="min-[851px]:hidden bg-transparent border border-[#302c25] text-white p-2 rounded-[8px] cursor-pointer hover:border-[#d8b35d] transition-colors"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav Drawer */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{opacity: 0, y: -8}}
              animate={{opacity: 1, y: 0}}
              exit={{opacity: 0, y: -8}}
              transition={{duration: 0.16}}
              className="min-[851px]:hidden border-t border-[#302c25] bg-[#0b0b0d] px-5 py-4"
            >
              <div className="flex flex-col gap-3 text-[14px] text-[#d2cec5]">
                <a
                  href="#books"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-1.5 hover:text-[#d8b35d]"
                >
                  Explore Books
                </a>
                <a
                  href="#authors"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-1.5 hover:text-[#d8b35d]"
                >
                  Authors
                </a>
                <a
                  href="#records"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-1.5 hover:text-[#d8b35d]"
                >
                  Records
                </a>
                <a
                  href="#publish"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-1.5 hover:text-[#d8b35d]"
                >
                  Publish
                </a>
                {signedInUser ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleSignOut();
                    }}
                    className="mt-1 border border-[#302c25] rounded-[9px] px-4 py-2 text-[#d2cec5] text-left font-bold cursor-pointer"
                  >
                    Sign out ({signedInUser.name})
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => openAuthModal('login')}
                    className="mt-1 border border-[#d8b35d] rounded-[9px] px-4 py-2 text-[#d8b35d] text-left font-bold cursor-pointer"
                  >
                    Log in
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Non-intrusive Feedback Toast */}
      <AnimatePresence>
        {feedbackBanner && (
          <motion.div
            initial={{opacity: 0, y: -12}}
            animate={{opacity: 1, y: 0}}
            exit={{opacity: 0, y: -12}}
            className="fixed top-20 right-4 z-40 max-w-sm bg-[#1c1a16] border border-[#65502b] rounded-[12px] px-4 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.65)] flex items-start gap-3"
          >
            <Check className="w-4 h-4 text-[#d8b35d] shrink-0 mt-0.5" />
            <p className="text-[13px] text-[#f7f4ed] m-0 flex-1">{feedbackBanner}</p>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              aria-label="Dismiss notification"
              className="text-[#a7a3a0] hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <main>
        {/* Hero Section */}
        <section
          className="py-[52px] sm:py-[76px] pb-[35px] sm:pb-[58px] overflow-hidden"
          style={{
            background:
              'radial-gradient(ellipse at 75% 30%, #49371955, transparent 42%), linear-gradient(180deg, #12100d 0%, #0b0b0d 100%)',
          }}
        >
          <div className="w-[min(1160px,92%)] mx-auto grid grid-cols-1 min-[851px]:grid-cols-[1.15fr_0.85fr] gap-[10px] min-[851px]:gap-[55px] items-center">
            <div>
              <div className="text-[#d8b35d] text-[11px] font-extrabold tracking-[3px] uppercase">
                A home for extraordinary stories
              </div>
              <h1 className="font-serif text-[46px] sm:text-[clamp(42px,6vw,72px)] leading-[1.02] mt-[18px] mb-[20px] tracking-[-1.5px] font-normal text-[#f7f4ed]">
                Every book
                <br />
                makes <em className="text-[#d8b35d] not-italic">history.</em>
              </h1>
              <p className="max-w-[580px] text-[#b9b3a8] text-[17px] leading-[1.55]">
                Discover remarkable books, meet the minds behind them, and give your
                words a place in the world. A global home for authors and readers.
              </p>

              <div className="flex gap-3 mt-[28px] flex-wrap">
                <a
                  href="#books"
                  className="inline-flex items-center gap-1.5 border border-[#d8b35d] rounded-[9px] px-4 py-2.5 text-[#16130c] bg-[#d8b35d] hover:bg-[#f2d58b] font-bold text-[15px] transition-colors whitespace-nowrap"
                >
                  Explore the library
                  <ArrowUpRight className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => openAuthModal('publish')}
                  className="border border-[#d8b35d] rounded-[9px] px-4 py-2.5 text-[#d8b35d] bg-transparent hover:bg-[#d8b35d]/10 font-bold text-[15px] cursor-pointer transition-colors whitespace-nowrap"
                >
                  Publish your book
                </button>
              </div>

              <div className="flex gap-[20px] sm:gap-[34px] mt-[42px] flex-wrap">
                <div>
                  <strong className="block font-serif text-[23px] sm:text-[28px] text-[#d8b35d] font-normal">
                    Global
                  </strong>
                  <span className="text-[#a7a3a0] text-[12px]">Author community</span>
                </div>
                <div>
                  <strong className="block font-serif text-[23px] sm:text-[28px] text-[#d8b35d] font-normal">
                    Free + Paid
                  </strong>
                  <span className="text-[#a7a3a0] text-[12px]">Open reading library</span>
                </div>
                <div>
                  <strong className="block font-serif text-[23px] sm:text-[28px] text-[#d8b35d] font-normal">
                    One world
                  </strong>
                  <span className="text-[#a7a3a0] text-[12px]">Many stories</span>
                </div>
              </div>
            </div>

            {/* 3D Tilted Dual-Book Stage */}
            <div className="h-[300px] sm:h-[330px] min-[851px]:h-[390px] relative grid place-items-center mt-6 min-[851px]:mt-0">
              <div className="absolute w-[310px] h-[310px] rounded-full bg-[#c99b3c20] blur-[30px] pointer-events-none" />

              {/* Back Book */}
              <div
                className="absolute w-[165px] h-[235px] sm:w-[205px] sm:h-[286px] rounded-[5px_14px_14px_5px] shadow-[18px_22px_35px_rgba(0,0,0,0.6)] flex flex-col justify-between px-[19px] py-[23px] border border-[#8bb0a577] translate-x-[82px] translate-y-[18px] sm:translate-x-[110px] sm:translate-y-[22px] rotate-[10deg]"
                style={{
                  background: 'linear-gradient(145deg, #172c31, #101519)',
                }}
              >
                <span className="absolute left-[8px] top-0 bottom-0 w-[2px] bg-[#e5c16b66]" />
                <div className="text-[9px] tracking-[2px] text-[#b8d3ca]">
                  WORLD BOOK RECORDS
                </div>
                <div className="font-serif text-[24px] sm:text-[30px] leading-[1.05] text-[#f4e6c5]">
                  Beyond
                  <br />
                  the Blue
                </div>
                <div className="text-[9px] tracking-[2px] text-[#b8d3ca]">
                  A WORLD OF IDEAS
                </div>
              </div>

              {/* Front Book */}
              <div
                className="absolute w-[165px] h-[235px] sm:w-[205px] sm:h-[286px] rounded-[5px_14px_14px_5px] shadow-[18px_22px_35px_rgba(0,0,0,0.6)] flex flex-col justify-between px-[19px] py-[23px] border border-[#f0d58a77] -rotate-[8deg]"
                style={{
                  background: 'linear-gradient(145deg, #3b2816, #111)',
                }}
              >
                <span className="absolute left-[8px] top-0 bottom-0 w-[2px] bg-[#e5c16b66]" />
                <div className="text-[9px] tracking-[2px] text-[#f2d58b]">
                  THE GLOBAL LIBRARY
                </div>
                <div className="font-serif text-[24px] sm:text-[30px] leading-[1.05] text-[#f4e6c5]">
                  Words
                  <br />
                  That Last
                </div>
                <div className="text-[9px] tracking-[2px] text-[#c9ad6d]">
                  AUTHOR EDITION · 2026
                </div>
              </div>

              {/* Floating Badges */}
              <div className="absolute right-0 sm:-right-[5px] top-[40px] bg-[#1c1a16] border border-[#65502b] rounded-[12px] p-[9px] sm:px-[15px] sm:py-[12px] text-[10px] sm:text-[12px] shadow-[0_12px_30px_rgba(0,0,0,0.53)]">
                ✦ <b className="text-[#d8b35d]">Author spotlight</b>
                <br />
                Stories worth discovering
              </div>
              <div className="absolute left-0 bottom-[35px] bg-[#1c1a16] border border-[#65502b] rounded-[12px] p-[9px] sm:px-[15px] sm:py-[12px] text-[10px] sm:text-[12px] shadow-[0_12px_30px_rgba(0,0,0,0.53)]">
                ◈ <b className="text-[#d8b35d]">World Records</b>
                <br />
                Celebrate literary milestones
              </div>
            </div>
          </div>
        </section>

        {/* Books Library Section */}
        <section id="books" className="py-[68px]">
          <div className="w-[min(1160px,92%)] mx-auto">
            <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-5 mb-[27px]">
              <div>
                <div className="text-[#d8b35d] text-[11px] font-extrabold tracking-[3px] uppercase">
                  The library
                </div>
                <h2 className="font-serif text-[30px] sm:text-[36px] mt-[7px] mb-0 font-normal">
                  Books to get lost in
                </h2>
              </div>
              <p className="text-[#a7a3a0] m-0 max-w-[420px]">
                Explore fresh voices, timeless ideas and stories from authors around the
                world.
              </p>
            </div>

            {/* Search Bar */}
            <form
              onSubmit={(e) => e.preventDefault()}
              className="flex flex-col min-[541px]:flex-row gap-[10px] mt-[22px] mb-[28px]"
            >
              <div className="relative flex-1 min-w-0">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search books, authors or topics…"
                  aria-label="Search books, authors or topics"
                  className="w-full bg-[#141417] border border-[#302c25] focus:border-[#d8b35d] rounded-[9px] px-4 py-[14px] text-white outline-none transition-colors"
                />
              </div>
              <button
                type="submit"
                className="border border-[#d8b35d] rounded-[9px] px-5 py-[14px] text-[#16130c] bg-[#d8b35d] hover:bg-[#f2d58b] font-bold cursor-pointer transition-colors whitespace-nowrap inline-flex items-center justify-center gap-2"
              >
                <Search className="w-4 h-4" />
                <span>Search</span>
              </button>
            </form>

            {/* Filter Pills */}
            <div className="flex gap-2 flex-wrap mb-[22px]">
              {FILTER_OPTIONS.map((filter) => {
                const isActive = activeFilter === filter.value;
                return (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setActiveFilter(filter.value)}
                    className={`rounded-[30px] px-[15px] py-2 text-[12px] cursor-pointer transition-colors border ${
                      isActive
                        ? 'bg-[#382d18] border-[#d8b35d] text-[#f2d58b]'
                        : 'bg-[#141417] border-[#302c25] text-[#c8c2b6] hover:bg-[#382d18] hover:border-[#d8b35d] hover:text-[#f2d58b]'
                    }`}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>

            {/* Book Grid */}
            {filteredBooks.length > 0 ? (
              <div className="grid grid-cols-2 min-[851px]:grid-cols-4 gap-[10px] sm:gap-[18px]">
                {filteredBooks.map((book) => (
                  <article
                    key={book.id}
                    onClick={() => setSelectedBook(book)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedBook(book);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Read preview of ${book.title} by ${book.author}`}
                    className="bg-[#141417] border border-[#292621] rounded-[13px] p-[13px] transition duration-200 hover:-translate-y-1 hover:border-[#806633] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#d8b35d]"
                  >
                    <div
                      className={`h-[165px] sm:h-[205px] rounded-[7px] p-[13px] sm:p-[17px] flex flex-col justify-between shadow-[inset_5px_0_rgba(255,255,255,0.08)] relative overflow-hidden ${COVER_GRADIENTS[book.coverVariant]}`}
                    >
                      <span
                        aria-hidden="true"
                        className="absolute w-[160px] h-[160px] border border-white/15 rounded-full -right-[60px] -bottom-[55px] pointer-events-none"
                      />
                      <small className="text-[9px] tracking-[2px] opacity-80">
                        {book.coverKicker}
                      </small>
                      <strong className="font-serif text-[21px] sm:text-[26px] leading-[1.08] max-w-[150px] font-normal">
                        {book.titleLines[0]}
                        <br />
                        {book.titleLines[1]}
                      </strong>
                      <span className="text-[9px] tracking-[1.5px]">
                        {book.coverFooter}
                      </span>
                    </div>

                    <div className="pt-[12px] px-[2px] pb-[3px]">
                      <h3 className="font-serif text-[16px] sm:text-[18px] m-0 mb-1 font-normal">
                        {book.title}
                      </h3>
                      <div className="text-[12px] text-[#a7a3a0]">by {book.author}</div>
                      <div className="flex justify-between items-center mt-3 text-[12px]">
                        <span className="border border-[#4a402d] text-[#d7c18e] rounded-[20px] px-2 py-[3px] text-[10px]">
                          {book.category}
                        </span>
                        <span className="text-[#d8b35d] font-extrabold tabular-nums">
                          {book.priceLabel}
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="py-8 text-[#a7a3a0] flex flex-wrap items-center gap-3">
                <span>No matching books found.</span>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setActiveFilter('All');
                  }}
                  className="text-[#d8b35d] underline underline-offset-4 cursor-pointer text-[13px]"
                >
                  Reset filters
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Authors Spotlight Section */}
        <section id="authors" className="py-[68px] bg-[#101012]">
          <div className="w-[min(1160px,92%)] mx-auto">
            <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-5 mb-[27px]">
              <div>
                <div className="text-[#d8b35d] text-[11px] font-extrabold tracking-[3px] uppercase">
                  Meet the minds
                </div>
                <h2 className="font-serif text-[30px] sm:text-[36px] mt-[7px] mb-0 font-normal">
                  Authors in the spotlight
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setAuthorsDirectoryOpen(true)}
                className="text-[#d8b35d] text-[13px] inline-flex items-center gap-1.5 hover:text-[#f2d58b] transition-colors cursor-pointer bg-transparent border-0 p-0"
              >
                <span>Explore all authors</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 min-[541px]:grid-cols-2 min-[851px]:grid-cols-3 gap-4">
              {authors.slice(0, 3).map((author) => (
                <div
                  key={author.id}
                  onClick={() => filterByAuthor(author)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      filterByAuthor(author);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`View books by ${author.name}`}
                  className="flex items-center gap-[14px] bg-[#141417] border border-[#292621] hover:border-[#806633] rounded-[12px] p-[17px] transition-colors cursor-pointer"
                >
                  <div
                    className="w-[56px] h-[56px] rounded-full grid place-items-center text-[#ffe6a8] font-serif text-[24px] border border-[#b08b48] shrink-0"
                    style={{
                      background: 'linear-gradient(145deg, #76572b, #242018)',
                    }}
                  >
                    {author.initials}
                  </div>
                  <div>
                    <h3 className="font-serif text-[17px] m-0 font-normal">
                      {author.name}{' '}
                      {author.verified && (
                        <span className="text-[#d8b35d] text-[10px] font-sans font-semibold tracking-wide">
                          ✓ VERIFIED
                        </span>
                      )}
                    </h3>
                    <p className="text-[#a7a3a0] text-[11px] my-[3px]">
                      {author.country} · {author.genre}
                    </p>
                    <p className="text-[#a7a3a0] text-[11px] my-[3px]">
                      {author.publishedCount} published books
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Literary Milestones Section */}
        <section id="records" className="py-[68px]">
          <div className="w-[min(1160px,92%)] mx-auto">
            <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-5 mb-[27px]">
              <div>
                <div className="text-[#d8b35d] text-[11px] font-extrabold tracking-[3px] uppercase">
                  Celebrate achievement
                </div>
                <h2 className="font-serif text-[30px] sm:text-[36px] mt-[7px] mb-0 font-normal">
                  Literary milestones
                </h2>
              </div>
              <p className="text-[#a7a3a0] m-0 max-w-[420px]">
                Recognise meaningful contributions to reading, writing and publishing.
                Records are reviewed before verification.
              </p>
            </div>

            <div className="grid grid-cols-1 min-[541px]:grid-cols-2 min-[851px]:grid-cols-3 gap-4">
              {records.map((record) => (
                <div
                  key={record.number}
                  className="border border-[#514022] rounded-[13px] p-[22px]"
                  style={{
                    background: 'linear-gradient(145deg, #211b10, #141417)',
                  }}
                >
                  <div className="font-serif text-[34px] text-[#d8b35d] tabular-nums">
                    {record.number}
                  </div>
                  <h3 className="font-serif text-[19px] my-[7px] font-normal">
                    {record.title}
                  </h3>
                  <p className="text-[#a7a3a0] text-[12px] m-0">{record.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Publish CTA Banner */}
        <section id="publish" className="py-[68px]">
          <div className="w-[min(1160px,92%)] mx-auto">
            <div
              className="border border-[#514022] rounded-[18px] p-6 sm:p-[34px] flex flex-col min-[541px]:flex-row justify-between items-start min-[541px]:items-center gap-6"
              style={{
                background: 'linear-gradient(110deg, #211a0e, #141417)',
              }}
            >
              <div>
                <div className="text-[#d8b35d] text-[11px] font-extrabold tracking-[3px] uppercase">
                  Your story belongs here
                </div>
                <h2 className="font-serif text-[32px] my-2 font-normal">
                  Ready to publish your book?
                </h2>
                <p className="text-[#a7a3a0] max-w-[560px] m-0">
                  Create your author profile, upload your manuscript, choose free or paid
                  access, and share your work with a global reading community.
                </p>
              </div>
              <button
                type="button"
                onClick={() => openAuthModal('publish')}
                className="inline-flex items-center gap-1.5 border border-[#d8b35d] rounded-[9px] px-4 py-2.5 text-[#16130c] bg-[#d8b35d] hover:bg-[#f2d58b] font-bold cursor-pointer transition-colors whitespace-nowrap shrink-0"
              >
                <span>Become an author</span>
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#302c25] py-[34px] text-[#a7a3a0] text-[12px]">
        <div className="w-[min(1160px,92%)] mx-auto flex justify-between gap-5 flex-wrap">
          <div>
            <b className="text-[#d8b35d]">WORLD BOOK RECORDS</b>
            <br />
            Every Author Has a Story. Every Book Makes History.
          </div>
          <div className="text-left sm:text-right">
            <div className="flex items-center gap-1.5 flex-wrap">
              {INFO_PAGES.map((page, index) => (
                <React.Fragment key={page.key}>
                  <button
                    type="button"
                    onClick={() => setSelectedInfoPage(page)}
                    className="hover:text-[#d8b35d] transition-colors cursor-pointer bg-transparent border-0 p-0 text-inherit"
                  >
                    {page.label}
                  </button>
                  {index < INFO_PAGES.length - 1 && <span aria-hidden="true">·</span>}
                </React.Fragment>
              ))}
            </div>
            <div>© 2026 World Book Records.</div>
          </div>
        </div>
      </footer>

      {/* Auth / Publish Modal */}
      <AnimatePresence>
        {authModalMode && (
          <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.16}}
            onClick={(e) => {
              if (e.target === e.currentTarget) setAuthModalMode(null);
            }}
            className="fixed inset-0 z-30 bg-black/75 grid place-items-center p-[18px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
          >
            <motion.div
              initial={{opacity: 0, scale: 0.97, y: 8}}
              animate={{opacity: 1, scale: 1, y: 0}}
              exit={{opacity: 0, scale: 0.97, y: 8}}
              transition={{duration: 0.16}}
              className="w-[min(480px,100%)] bg-[#171619] border border-[#66512d] rounded-[16px] p-[25px] relative"
            >
              <button
                type="button"
                onClick={() => setAuthModalMode(null)}
                aria-label="Close modal"
                className="absolute right-[15px] top-[12px] bg-transparent border-0 text-[#aaa] hover:text-white cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>

              <h2 id="auth-modal-title" className="font-serif text-[27px] m-0 mb-2 font-normal">
                {modalMeta[authModalMode].title}
              </h2>
              <p className="text-[#a7a3a0] text-[13px] mb-4">
                {modalMeta[authModalMode].desc}
              </p>

              {formError && (
                <div className="mb-3 rounded-[8px] border border-red-500/40 bg-red-950/40 px-3 py-2 text-[12px] text-red-200">
                  {formError}
                </div>
              )}

              <form onSubmit={handleFormSubmit} className="space-y-2.5">
                {authModalMode !== 'login' && !signedInUser && (
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full p-3 bg-[#0d0d0f] border border-[#302c25] focus:border-[#d8b35d] rounded-[8px] text-white outline-none"
                  />
                )}
                {!signedInUser && (
                  <>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email address"
                      className="w-full p-3 bg-[#0d0d0f] border border-[#302c25] focus:border-[#d8b35d] rounded-[8px] text-white outline-none"
                    />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        authModalMode === 'login' ? 'Password' : 'Create password'
                      }
                      className="w-full p-3 bg-[#0d0d0f] border border-[#302c25] focus:border-[#d8b35d] rounded-[8px] text-white outline-none"
                    />
                  </>
                )}

                {authModalMode === 'publish' ? (
                  <>
                    <input
                      type="text"
                      required
                      value={bookTitleInput}
                      onChange={(e) => setBookTitleInput(e.target.value)}
                      placeholder="Book title (e.g. Echoes of Dawn)"
                      className="w-full p-3 bg-[#0d0d0f] border border-[#302c25] focus:border-[#d8b35d] rounded-[8px] text-white outline-none"
                    />
                    <div className="grid grid-cols-2 gap-2.5">
                      <select
                        value={bookCategoryInput}
                        onChange={(e) =>
                          setBookCategoryInput(e.target.value as BookCategory)
                        }
                        aria-label="Book category"
                        className="w-full p-3 bg-[#0d0d0f] border border-[#302c25] focus:border-[#d8b35d] rounded-[8px] text-white outline-none"
                      >
                        <option value="Fiction">Fiction</option>
                        <option value="History">History</option>
                        <option value="Science">Science</option>
                      </select>
                      <select
                        value={bookAccessInput}
                        onChange={(e) =>
                          setBookAccessInput(e.target.value as BookAccessType)
                        }
                        aria-label="Access type"
                        className="w-full p-3 bg-[#0d0d0f] border border-[#302c25] focus:border-[#d8b35d] rounded-[8px] text-white outline-none"
                      >
                        <option value="Free">Free access</option>
                        <option value="Paid">Paid edition</option>
                      </select>
                    </div>
                    {bookAccessInput === 'Paid' && (
                      <input
                        type="text"
                        value={bookPriceInput}
                        onChange={(e) => setBookPriceInput(e.target.value)}
                        placeholder="Edition price (e.g. $4.99)"
                        className="w-full p-3 bg-[#0d0d0f] border border-[#302c25] focus:border-[#d8b35d] rounded-[8px] text-white outline-none"
                      />
                    )}
                  </>
                ) : (
                  authModalMode === 'signup' && (
                    <select
                      value={accountType}
                      onChange={(e) =>
                        setAccountType(
                          e.target.value as 'Reader account' | 'Author account',
                        )
                      }
                      aria-label="Account role"
                      className="w-full p-3 bg-[#0d0d0f] border border-[#302c25] focus:border-[#d8b35d] rounded-[8px] text-white outline-none"
                    >
                      <option value="Reader account">Reader account</option>
                      <option value="Author account">Author account</option>
                    </select>
                  )
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full mt-2 border border-[#d8b35d] rounded-[9px] px-4 py-2.5 text-[#16130c] bg-[#d8b35d] hover:bg-[#f2d58b] disabled:opacity-60 font-bold cursor-pointer transition-colors"
                >
                  {submitting ? 'Please wait…' : 'Continue'}
                </button>
              </form>

              <p className="text-[11px] text-[#a99b7b] mt-3 mb-0">
                {authModalMode === 'publish'
                  ? 'Your newly published title will appear in the library grid.'
                  : 'Create an account or sign in to publish books and manage your library.'}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Book Preview Modal */}
      <AnimatePresence>
        {selectedBook && (
          <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.16}}
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedBook(null);
            }}
            className="fixed inset-0 z-30 bg-black/75 grid place-items-center p-[18px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="book-preview-title"
          >
            <motion.div
              initial={{opacity: 0, scale: 0.97, y: 8}}
              animate={{opacity: 1, scale: 1, y: 0}}
              exit={{opacity: 0, scale: 0.97, y: 8}}
              transition={{duration: 0.16}}
              className="w-[min(560px,100%)] bg-[#171619] border border-[#66512d] rounded-[16px] p-[25px] relative"
            >
              <button
                type="button"
                onClick={() => setSelectedBook(null)}
                aria-label="Close book preview"
                className="absolute right-[15px] top-[12px] bg-transparent border-0 text-[#aaa] hover:text-white cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex flex-col sm:flex-row gap-5">
                <div
                  className={`w-[150px] h-[205px] shrink-0 rounded-[7px] p-4 flex flex-col justify-between shadow-[inset_5px_0_rgba(255,255,255,0.08)] relative overflow-hidden ${COVER_GRADIENTS[selectedBook.coverVariant]}`}
                >
                  <small className="text-[8px] tracking-[2px] opacity-80">
                    {selectedBook.coverKicker}
                  </small>
                  <strong className="font-serif text-[21px] leading-[1.08] font-normal">
                    {selectedBook.titleLines[0]}
                    <br />
                    {selectedBook.titleLines[1]}
                  </strong>
                  <span className="text-[8px] tracking-[1.5px]">
                    {selectedBook.coverFooter}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-[#d8b35d] text-[11px] font-bold tracking-[2px] uppercase">
                    {selectedBook.category} · {selectedBook.publishedYear} ·{' '}
                    {selectedBook.pages} pages
                  </div>
                  <h2
                    id="book-preview-title"
                    className="font-serif text-[26px] mt-1.5 mb-1 font-normal"
                  >
                    {selectedBook.title}
                  </h2>
                  <p className="text-[#a7a3a0] text-[13px] m-0 mb-3">
                    by {selectedBook.author}
                  </p>
                  <p className="text-[#d2cec5] text-[13.5px] leading-relaxed m-0 mb-4">
                    {selectedBook.synopsis}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-[#302c25]">
                <div className="flex items-center gap-2 text-[11px] text-[#d8b35d] uppercase tracking-[2px] font-bold mb-2">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Opening Excerpt</span>
                </div>
                <blockquote className="m-0 font-serif italic text-[14px] text-[#e7e1d5] leading-relaxed">
                  “{selectedBook.excerpt}”
                </blockquote>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <span className="text-[#d8b35d] font-extrabold text-[16px] tabular-nums">
                  {selectedBook.priceLabel}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const bookTitle = selectedBook.title;
                    const isFree = selectedBook.type === 'Free';
                    setSelectedBook(null);
                    setFeedbackBanner(
                      isFree
                        ? `Opened "${bookTitle}" in your reading list.`
                        : `Added "${bookTitle}" to your reading queue.`,
                    );
                  }}
                  className="border border-[#d8b35d] rounded-[9px] px-4 py-2 text-[#16130c] bg-[#d8b35d] hover:bg-[#f2d58b] font-bold text-[13px] cursor-pointer transition-colors"
                >
                  {selectedBook.type === 'Free' ? 'Read for free' : 'Acquire edition'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Author Directory Modal */}
      <AnimatePresence>
        {authorsDirectoryOpen && (
          <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.16}}
            onClick={(e) => {
              if (e.target === e.currentTarget) setAuthorsDirectoryOpen(false);
            }}
            className="fixed inset-0 z-30 bg-black/75 grid place-items-center p-[18px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="authors-directory-title"
          >
            <motion.div
              initial={{opacity: 0, scale: 0.97, y: 8}}
              animate={{opacity: 1, scale: 1, y: 0}}
              exit={{opacity: 0, scale: 0.97, y: 8}}
              transition={{duration: 0.16}}
              className="w-[min(600px,100%)] max-h-[85vh] overflow-y-auto bg-[#171619] border border-[#66512d] rounded-[16px] p-[25px] relative"
            >
              <button
                type="button"
                onClick={() => setAuthorsDirectoryOpen(false)}
                aria-label="Close author directory"
                className="absolute right-[15px] top-[12px] bg-transparent border-0 text-[#aaa] hover:text-white cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-[#d8b35d] text-[11px] font-extrabold tracking-[3px] uppercase">
                Author Directory
              </div>
              <h2
                id="authors-directory-title"
                className="font-serif text-[27px] mt-1 mb-4 font-normal"
              >
                Voices on World Book Records
              </h2>

              <div className="space-y-3">
                {authors.map((author) => (
                  <div
                    key={author.id}
                    className="flex items-start gap-3.5 bg-[#141417] border border-[#292621] rounded-[12px] p-4"
                  >
                    <div
                      className="w-12 h-12 rounded-full grid place-items-center text-[#ffe6a8] font-serif text-[20px] border border-[#b08b48] shrink-0"
                      style={{
                        background: 'linear-gradient(145deg, #76572b, #242018)',
                      }}
                    >
                      {author.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <h3 className="font-serif text-[17px] m-0 font-normal">
                          {author.name}{' '}
                          {author.verified && (
                            <span className="text-[#d8b35d] text-[10px] font-sans font-semibold">
                              ✓ VERIFIED
                            </span>
                          )}
                        </h3>
                        <button
                          type="button"
                          onClick={() => filterByAuthor(author)}
                          className="text-[12px] text-[#d8b35d] hover:text-[#f2d58b] cursor-pointer bg-transparent border-0 p-0"
                        >
                          View books →
                        </button>
                      </div>
                      <p className="text-[11px] text-[#a7a3a0] my-1">
                        {author.country} · {author.genre} · {author.publishedCount} published
                        books
                      </p>
                      <p className="text-[12.5px] text-[#d2cec5] m-0">{author.bio}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Info Modal */}
      <AnimatePresence>
        {selectedInfoPage && (
          <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.16}}
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedInfoPage(null);
            }}
            className="fixed inset-0 z-30 bg-black/75 grid place-items-center p-[18px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="info-modal-title"
          >
            <motion.div
              initial={{opacity: 0, scale: 0.97, y: 8}}
              animate={{opacity: 1, scale: 1, y: 0}}
              exit={{opacity: 0, scale: 0.97, y: 8}}
              transition={{duration: 0.16}}
              className="w-[min(460px,100%)] bg-[#171619] border border-[#66512d] rounded-[16px] p-[25px] relative"
            >
              <button
                type="button"
                onClick={() => setSelectedInfoPage(null)}
                aria-label="Close information dialog"
                className="absolute right-[15px] top-[12px] bg-transparent border-0 text-[#aaa] hover:text-white cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2 text-[#d8b35d] text-[11px] font-bold tracking-[2px] uppercase mb-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>World Book Records</span>
              </div>
              <h2
                id="info-modal-title"
                className="font-serif text-[25px] m-0 mb-3 font-normal"
              >
                {selectedInfoPage.title}
              </h2>
              <p className="text-[#d2cec5] text-[14px] leading-relaxed m-0">
                {selectedInfoPage.body}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
