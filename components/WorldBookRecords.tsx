'use client';

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Camera,
  Check,
  Download,
  FileText,
  ImagePlus,
  Menu,
  Minus,
  Moon,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  User,
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
import {
  createBrowserSupabaseClient,
  PublicSupabaseConfig,
} from '@/lib/supabase';
import PdfCanvasReader from '@/components/PdfCanvasReader';
import {extractPdfCoverAndMeta} from '@/lib/pdf-client';

type FilterOption = 'All' | BookCategory | BookAccessType;
type AuthModalMode = 'login' | 'signup' | 'publish';

interface SignedInUser {
  id: string;
  name: string;
  email?: string;
  role: string;
  avatarUrl?: string;
}

interface LocalAccountRecord {
  id: string;
  name: string;
  email: string;
  password: string;
  role: string;
  avatarUrl?: string;
}

const LOCAL_USERS_KEY = 'wbr_local_users_v1';
const LOCAL_SESSION_KEY = 'wbr_local_session_v1';
const LOCAL_BOOKS_KEY = 'wbr_local_books_v1';
const AVATAR_CACHE_PREFIX = 'wbr_avatar_v1_';
const BOOK_COVER_CACHE_PREFIX = 'wbr_book_cover_v1_';
const BOOK_FILE_CACHE_PREFIX = 'wbr_book_file_v1_';
const READER_PREFS_KEY = 'wbr_reader_prefs_v1';
const READING_PROGRESS_KEY = 'wbr_reading_progress_v1';
const UNLOCKED_BOOKS_KEY = 'wbr_unlocked_books_v1';

type ReaderTheme = 'dark' | 'sepia' | 'light';

const BLOCKED_MEDIA_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'svg',
  'bmp',
  'ico',
  'tif',
  'tiff',
  'heic',
  'heif',
  'avif',
  'raw',
  'cr2',
  'nef',
  'psd',
  'mp4',
  'mov',
  'avi',
  'mkv',
  'webm',
  'flv',
  'wmv',
  'm4v',
  '3gp',
  '3g2',
  'mpeg',
  'mpg',
  'ts',
  'mts',
  'vob',
  'ogv',
]);

function isBlockedMediaFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  if (mime.startsWith('image/') || mime.startsWith('video/')) {
    return true;
  }
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  return BLOCKED_MEDIA_EXTENSIONS.has(ext);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileExtensionLabel(fileName?: string): string {
  if (!fileName) return 'FILE';
  const ext = fileName.split('.').pop()?.trim().toUpperCase();
  return ext && ext.length <= 6 ? ext : 'FILE';
}

function isPdfBookFile(fileName?: string, fileUrl?: string): boolean {
  return Boolean(
    fileName?.toLowerCase().endsWith('.pdf') ||
      fileUrl?.toLowerCase().startsWith('data:application/pdf'),
  );
}

function isReadableTextBookFile(fileName?: string, fileUrl?: string): boolean {
  const nameLower = (fileName || '').toLowerCase();
  const urlLower = (fileUrl || '').toLowerCase();
  return Boolean(
    nameLower.endsWith('.txt') ||
      nameLower.endsWith('.md') ||
      nameLower.endsWith('.markdown') ||
      nameLower.endsWith('.csv') ||
      nameLower.endsWith('.json') ||
      nameLower.endsWith('.log') ||
      urlLower.startsWith('data:text/'),
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

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

function getCachedBookCover(bookId: string): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage.getItem(`${BOOK_COVER_CACHE_PREFIX}${bookId}`) || undefined;
  } catch {
    return undefined;
  }
}

function getCachedBookFile(
  bookId: string,
): {url?: string; name?: string; size?: string} {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(`${BOOK_FILE_CACHE_PREFIX}${bookId}`);
    if (!raw) return {};
    return JSON.parse(raw) as {url?: string; name?: string; size?: string};
  } catch {
    return {};
  }
}

function mapDbBook(row: DbBookRow): BookItem {
  const cachedFile = getCachedBookFile(row.id);
  return {
    id: row.id,
    userId: row.user_id || undefined,
    title: row.title,
    titleLines: [row.title_line_1, row.title_line_2],
    author: row.author_name,
    category: row.category,
    type: row.access_type,
    priceLabel: row.price_label,
    coverImageUrl: row.cover_image_url || getCachedBookCover(row.id),
    bookFileUrl: row.book_file_url || cachedFile.url,
    bookFileName: row.book_file_name || cachedFile.name,
    bookFileSize: row.book_file_size || cachedFile.size,
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'W';
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

async function resizeImageToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported image format.'));
      img.onload = () => {
        const size = 180;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result || ''));
          return;
        }
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

async function resizeBookCoverImage(file: File): Promise<{
  dataUrl: string;
  originalWidth: number;
  originalHeight: number;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read cover image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported cover image format.'));
      img.onload = () => {
        const targetWidth = 480;
        const targetHeight = 720; // 2:3 vertical book cover ratio
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({
            dataUrl: String(reader.result || ''),
            originalWidth: img.width,
            originalHeight: img.height,
          });
          return;
        }

        // Center-crop to 2:3 portrait aspect ratio
        const targetRatio = targetWidth / targetHeight;
        const sourceRatio = img.width / img.height;
        let sx = 0;
        let sy = 0;
        let sw = img.width;
        let sh = img.height;

        if (sourceRatio > targetRatio) {
          sw = img.height * targetRatio;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / targetRatio;
          sy = (img.height - sh) / 2;
        }

        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
        resolve({
          dataUrl: canvas.toDataURL('image/jpeg', 0.82),
          originalWidth: img.width,
          originalHeight: img.height,
        });
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

function readLocalJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocalJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

interface WorldBookRecordsProps {
  initialBooks?: BookItem[];
  initialAuthors?: AuthorItem[];
  initialRecords?: MilestoneRecord[];
  supabaseConfig?: PublicSupabaseConfig | null;
}

export default function WorldBookRecords({
  initialBooks = INITIAL_BOOKS,
  initialAuthors = AUTHORS,
  initialRecords = LITERARY_RECORDS,
  supabaseConfig = null,
}: WorldBookRecordsProps) {
  const supabaseClient = useMemo(
    () => createBrowserSupabaseClient(supabaseConfig),
    [supabaseConfig],
  );

  const [books, setBooks] = useState<BookItem[]>(initialBooks);
  const [authors, setAuthors] = useState<AuthorItem[]>(initialAuthors);
  const [records, setRecords] = useState<MilestoneRecord[]>(initialRecords);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterOption>('All');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Modals
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [selectedBook, setSelectedBook] = useState<BookItem | null>(null);
  const [authorsDirectoryOpen, setAuthorsDirectoryOpen] = useState(false);
  const [selectedInfoPage, setSelectedInfoPage] = useState<InfoPageItem | null>(null);

  // Account & Publish form state
  const [signedInUser, setSignedInUser] = useState<SignedInUser | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [avatarDraft, setAvatarDraft] = useState<string>('');
  const [accountType, setAccountType] = useState<'Reader account' | 'Author account'>(
    'Author account',
  );
  const [bookTitleInput, setBookTitleInput] = useState('');
  const [bookDescriptionInput, setBookDescriptionInput] = useState('');
  const [bookContentInput, setBookContentInput] = useState('');
  const [bookCoverDraft, setBookCoverDraft] = useState<string>('');
  const [bookCoverMeta, setBookCoverMeta] = useState<string>('');
  const [bookCoverErrors, setBookCoverErrors] = useState<Record<string, boolean>>({});
  const [bookFileDraft, setBookFileDraft] = useState<string>('');
  const [bookFileNameDraft, setBookFileNameDraft] = useState<string>('');
  const [bookFileSizeDraft, setBookFileSizeDraft] = useState<string>('');
  const [bookPdfPagesDraft, setBookPdfPagesDraft] = useState<number | null>(null);
  const [editingBook, setEditingBook] = useState<BookItem | null>(null);
  const [deleteConfirmBookId, setDeleteConfirmBookId] = useState<string | null>(null);
  const [deletingBookId, setDeletingBookId] = useState<string | null>(null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [readerBook, setReaderBook] = useState<BookItem | null>(null);
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>('dark');
  const [readerFontSize, setReaderFontSize] = useState<number>(18);
  const [readingProgress, setReadingProgress] = useState<Record<string, number>>({});
  const [unlockedBookIds, setUnlockedBookIds] = useState<Record<string, boolean>>({});
  const [readerTextContent, setReaderTextContent] = useState<{
    bookId: string;
    text: string;
  } | null>(null);
  const [bookCategoryInput, setBookCategoryInput] = useState<BookCategory>('Fiction');
  const [bookAccessInput, setBookAccessInput] = useState<BookAccessType>('Free');
  const [bookPriceInput, setBookPriceInput] = useState('$4.99');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [avatarLoadError, setAvatarLoadError] = useState(false);

  const signupFileInputRef = useRef<HTMLInputElement | null>(null);
  const profileFileInputRef = useRef<HTMLInputElement | null>(null);
  const bookCoverFileInputRef = useRef<HTMLInputElement | null>(null);
  const bookFileInputRef = useRef<HTMLInputElement | null>(null);
  const readerScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAuthModalMode(null);
        setProfileModalOpen(false);
        setPdfPreviewOpen(false);
        setSelectedBook(null);
        setReaderBook(null);
        setAuthorsDirectoryOpen(false);
        setSelectedInfoPage(null);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      const savedPrefs = readLocalJson<{theme?: ReaderTheme; fontSize?: number}>(
        READER_PREFS_KEY,
        {},
      );
      if (savedPrefs.theme) setReaderTheme(savedPrefs.theme);
      if (
        typeof savedPrefs.fontSize === 'number' &&
        savedPrefs.fontSize >= 15 &&
        savedPrefs.fontSize <= 24
      ) {
        setReaderFontSize(savedPrefs.fontSize);
      }
      const savedProgress = readLocalJson<Record<string, number>>(
        READING_PROGRESS_KEY,
        {},
      );
      if (Object.keys(savedProgress).length > 0) {
        setReadingProgress(savedProgress);
      }
      const savedUnlocked = readLocalJson<Record<string, boolean>>(
        UNLOCKED_BOOKS_KEY,
        {},
      );
      if (Object.keys(savedUnlocked).length > 0) {
        setUnlockedBookIds(savedUnlocked);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!readerBook?.bookFileUrl) return;
    const bookId = readerBook.id;
    const fileName = readerBook.bookFileName;
    const sourceUrl = readerBook.bookFileUrl;
    let revoked = false;

    if (isReadableTextBookFile(fileName, sourceUrl)) {
      fetch(sourceUrl)
        .then((res) => res.text())
        .then((text) => {
          if (!revoked) setReaderTextContent({bookId, text});
        })
        .catch(() => {
          // Fallback to excerpt text
        });
    }

    return () => {
      revoked = true;
    };
  }, [readerBook]);

  const activeReaderPdfSource =
    readerBook?.bookFileUrl &&
    isPdfBookFile(readerBook.bookFileName, readerBook.bookFileUrl)
      ? readerBook.bookFileUrl
      : null;

  const activeReaderFileText =
    readerBook?.bookFileUrl &&
    isReadableTextBookFile(readerBook.bookFileName, readerBook.bookFileUrl) &&
    readerTextContent?.bookId === readerBook.id
      ? readerTextContent.text
      : null;

  useEffect(() => {
    if (!feedbackBanner) return;
    const timer = setTimeout(() => setFeedbackBanner(null), 5000);
    return () => clearTimeout(timer);
  }, [feedbackBanner]);

  // Sync data & session (Supabase when active, or browser localStorage fallback)
  useEffect(() => {
    let isMounted = true;

    const loadProfileDetails = async (
      userId: string,
      fallbackName: string,
      fallbackEmail: string | undefined,
      fallbackRole: string,
    ): Promise<SignedInUser> => {
      let cachedAvatar = '';
      try {
        cachedAvatar = window.localStorage.getItem(`${AVATAR_CACHE_PREFIX}${userId}`) || '';
      } catch {
        cachedAvatar = '';
      }

      if (supabaseClient) {
        try {
          const {data: profileRow} = await supabaseClient
            .from('profiles')
            .select('full_name, account_role, avatar_url')
            .eq('id', userId)
            .maybeSingle();

          if (profileRow) {
            const avatarUrl =
              (profileRow.avatar_url as string | null) || cachedAvatar || undefined;
            if (avatarUrl) {
              try {
                window.localStorage.setItem(`${AVATAR_CACHE_PREFIX}${userId}`, avatarUrl);
              } catch {
                // Ignore
              }
            }
            return {
              id: userId,
              name: (profileRow.full_name as string | null) || fallbackName,
              email: fallbackEmail,
              role: (profileRow.account_role as string | null) || fallbackRole,
              avatarUrl,
            };
          }
        } catch {
          // Use auth metadata + cached avatar fallback
        }
      }

      return {
        id: userId,
        name: fallbackName,
        email: fallbackEmail,
        role: fallbackRole,
        avatarUrl: cachedAvatar || undefined,
      };
    };

    if (!supabaseClient) {
      const restoreLocal = async () => {
        await Promise.resolve();
        if (!isMounted) return;
        const savedSession = readLocalJson<SignedInUser | null>(LOCAL_SESSION_KEY, null);
        if (savedSession) {
          setSignedInUser(savedSession);
        }
        const localBooks = readLocalJson<BookItem[]>(LOCAL_BOOKS_KEY, []);
        if (localBooks.length > 0) {
          setBooks((prev) => {
            const existingIds = new Set(prev.map((b) => b.id));
            const uniqueLocal = localBooks.filter((b) => !existingIds.has(b.id));
            return [...uniqueLocal, ...prev];
          });
        } else {
          setBooks((prev) =>
            prev.map((book) => ({
              ...book,
              coverImageUrl: book.coverImageUrl || getCachedBookCover(book.id),
            })),
          );
        }
      };
      restoreLocal();
      return () => {
        isMounted = false;
      };
    }

    const loadCatalog = async () => {
      try {
        const [booksRes, authorsRes, recordsRes] = await Promise.all([
          supabaseClient
            .from('books')
            .select('*')
            .order('created_at', {ascending: false}),
          supabaseClient
            .from('authors')
            .select('*')
            .order('published_count', {ascending: false}),
          supabaseClient
            .from('literary_records')
            .select('*')
            .order('sort_order', {ascending: true}),
        ]);

        if (!isMounted) return;

        if (!booksRes.error && booksRes.data) {
          setBooks((booksRes.data as DbBookRow[]).map(mapDbBook));
        }
        if (!authorsRes.error && authorsRes.data) {
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
        // Keep server-provided catalog
      }
    };

    const syncSession = async () => {
      const {data} = await supabaseClient.auth.getSession();
      if (!isMounted) return;
      const user = data.session?.user;
      if (user) {
        const resolved = await loadProfileDetails(
          user.id,
          (user.user_metadata?.full_name as string | undefined) ||
            user.email?.split('@')[0] ||
            'Member',
          user.email,
          (user.user_metadata?.account_role as string | undefined) || 'Reader account',
        );
        if (isMounted) {
          setAvatarLoadError(false);
          setSignedInUser(resolved);
        }
      }
    };

    loadCatalog();
    syncSession();

    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') {
        loadCatalog();
      }
    };
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnFocus);

    const realtimeChannel = supabaseClient
      .channel('wbr_books_live')
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'books'},
        () => {
          loadCatalog();
        },
      )
      .subscribe();

    const {data: authSub} = supabaseClient.auth.onAuthStateChange(
      async (_event, session) => {
        if (!isMounted) return;
        const user = session?.user;
        if (user) {
          const resolved = await loadProfileDetails(
            user.id,
            (user.user_metadata?.full_name as string | undefined) ||
              user.email?.split('@')[0] ||
              'Member',
            user.email,
            (user.user_metadata?.account_role as string | undefined) ||
              'Reader account',
          );
          if (isMounted) {
            setAvatarLoadError(false);
            setSignedInUser(resolved);
          }
        } else {
          setSignedInUser(null);
        }
      },
    );

    return () => {
      isMounted = false;
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnFocus);
      supabaseClient.removeChannel(realtimeChannel);
      authSub.subscription.unsubscribe();
    };
  }, [supabaseClient]);

  const myPublishedBooks = useMemo(() => {
    if (!signedInUser) return [];
    const userNameLower = signedInUser.name.trim().toLowerCase();
    return books.filter(
      (book) =>
        (book.userId && book.userId === signedInUser.id) ||
        book.author.trim().toLowerCase() === userNameLower,
    );
  }, [books, signedInUser]);

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

  const resetBookForm = () => {
    setEditingBook(null);
    setBookTitleInput('');
    setBookDescriptionInput('');
    setBookContentInput('');
    setBookCoverDraft('');
    setBookCoverMeta('');
    setBookFileDraft('');
    setBookFileNameDraft('');
    setBookFileSizeDraft('');
    setBookPdfPagesDraft(null);
    setBookCategoryInput('Fiction');
    setBookAccessInput('Free');
    setBookPriceInput('$4.99');
  };

  const openAuthModal = (mode: AuthModalMode) => {
    setFormError(null);
    if (mode === 'publish') {
      resetBookForm();
      setAccountType('Author account');
    }
    setAuthModalMode(mode);
    setMobileMenuOpen(false);
  };

  const openEditBookModal = (book: BookItem) => {
    setFormError(null);
    setEditingBook(book);
    setBookTitleInput(book.title);
    setBookDescriptionInput(book.synopsis);
    setBookContentInput(book.excerpt === book.synopsis ? '' : book.excerpt);
    setBookCoverDraft(book.coverImageUrl || '');
    setBookCoverMeta(
      book.coverImageUrl ? 'Current cover photo (keep or replace)' : '',
    );
    setBookFileDraft(book.bookFileUrl || '');
    setBookFileNameDraft(book.bookFileName || '');
    setBookFileSizeDraft(book.bookFileSize || '');
    setBookPdfPagesDraft(book.pages || null);
    setBookCategoryInput(book.category);
    setBookAccessInput(book.type);
    setBookPriceInput(book.type === 'Paid' ? book.priceLabel : '$4.99');
    setProfileModalOpen(false);
    setSelectedBook(null);
    setAuthModalMode('publish');
  };

  const isOwnedByCurrentUser = (book: BookItem): boolean => {
    if (!signedInUser) return false;
    if (book.userId && book.userId === signedInUser.id) return true;
    return (
      book.author.trim().toLowerCase() === signedInUser.name.trim().toLowerCase()
    );
  };

  const handleDeleteBook = async (book: BookItem) => {
    setDeletingBookId(book.id);
    try {
      if (supabaseClient) {
        const {data: deletedRows, error: deleteError} = await supabaseClient
          .from('books')
          .delete()
          .eq('id', book.id)
          .select('id');

        if (deleteError) {
          setFeedbackBanner(`Could not delete "${book.title}": ${deleteError.message}`);
          return;
        }
        if (!deletedRows || deletedRows.length === 0) {
          setFeedbackBanner(
            `Could not delete "${book.title}". Make sure you are signed in with the account that published this book.`,
          );
          return;
        }
      }

      try {
        window.localStorage.removeItem(`${BOOK_COVER_CACHE_PREFIX}${book.id}`);
        window.localStorage.removeItem(`${BOOK_FILE_CACHE_PREFIX}${book.id}`);
      } catch {
        // Ignore storage errors
      }

      const existingLocalBooks = readLocalJson<BookItem[]>(LOCAL_BOOKS_KEY, []);
      if (existingLocalBooks.some((b) => b.id === book.id)) {
        writeLocalJson(
          LOCAL_BOOKS_KEY,
          existingLocalBooks.filter((b) => b.id !== book.id),
        );
      }

      setBooks((prev) => prev.filter((b) => b.id !== book.id));
      if (selectedBook?.id === book.id) {
        setSelectedBook(null);
      }
      if (readerBook?.id === book.id) {
        setReaderBook(null);
      }
      setDeleteConfirmBookId(null);
      setFeedbackBanner(`Deleted "${book.title}".`);
    } finally {
      setDeletingBookId(null);
    }
  };

  const scrollToProfile = () => {
    setProfileModalOpen(true);
  };

  const handleSignupAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await resizeImageToAvatar(file);
      setAvatarDraft(compressed);
      setFormError(null);
    } catch {
      setFormError('Could not process that image. Please choose a JPG or PNG photo.');
    }
  };

  const handleBookCoverPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setFormError('Cover image must be 5 MB or smaller.');
      return;
    }
    try {
      const {dataUrl, originalWidth, originalHeight} =
        await resizeBookCoverImage(file);
      const sizeKb = Math.max(1, Math.round(file.size / 1024));
      setBookCoverDraft(dataUrl);
      setBookCoverMeta(
        `Original: ${originalWidth} × ${originalHeight} px (${sizeKb} KB) · Saved as 480 × 720 px (2:3)`,
      );
      setFormError(null);
    } catch {
      setFormError(
        'Could not process that cover image. Please upload a JPG, PNG, or WebP file.',
      );
    }
  };

  const handleBookFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (isBlockedMediaFile(file)) {
      e.target.value = '';
      setFormError(
        'Images and videos are not allowed here. Please upload a PDF, EPUB, DOCX, TXT, or other document file.',
      );
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      e.target.value = '';
      setFormError('Book file must be 10 MB or smaller.');
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setBookFileDraft(dataUrl);
      setBookFileNameDraft(file.name);
      setBookFileSizeDraft(formatFileSize(file.size));
      setBookPdfPagesDraft(null);
      setFormError(null);

      if (isPdfBookFile(file.name, dataUrl)) {
        const pdfMeta = await extractPdfCoverAndMeta(dataUrl);
        if (pdfMeta) {
          setBookPdfPagesDraft(pdfMeta.numPages);
          if (!bookCoverDraft && pdfMeta.coverDataUrl) {
            setBookCoverDraft(pdfMeta.coverDataUrl);
            setBookCoverMeta(
              `Auto-captured from PDF Page 1 · ${pdfMeta.numPages} ${
                pdfMeta.numPages === 1 ? 'page' : 'pages'
              }`,
            );
          }
        }
      }
    } catch {
      setFormError('Could not read that book file. Please try another file.');
    }
  };

  const handleDownloadBookFile = async (book: BookItem) => {
    if (!book.bookFileUrl) return;
    const filename = book.bookFileName || `${book.title.replace(/\s+/g, '_')}.pdf`;
    try {
      const res = await fetch(book.bookFileUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    } catch {
      const link = document.createElement('a');
      link.href = book.bookFileUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleProfileAvatarUpdate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !signedInUser) return;
    try {
      const compressed = await resizeImageToAvatar(file);
      setAvatarLoadError(false);
      const updatedUser: SignedInUser = {...signedInUser, avatarUrl: compressed};
      setSignedInUser(updatedUser);

      try {
        window.localStorage.setItem(`${AVATAR_CACHE_PREFIX}${signedInUser.id}`, compressed);
      } catch {
        // Ignore
      }

      if (supabaseClient) {
        await supabaseClient
          .from('profiles')
          .upsert({
            id: signedInUser.id,
            full_name: signedInUser.name,
            account_role:
              signedInUser.role === 'Author account'
                ? 'Author account'
                : 'Reader account',
            avatar_url: compressed,
          });
      } else {
        writeLocalJson(LOCAL_SESSION_KEY, updatedUser);
        const localUsers = readLocalJson<LocalAccountRecord[]>(LOCAL_USERS_KEY, []);
        writeLocalJson(
          LOCAL_USERS_KEY,
          localUsers.map((u) =>
            u.id === signedInUser.id ? {...u, avatarUrl: compressed} : u,
          ),
        );
      }

      setFeedbackBanner('Profile photo updated.');
    } catch {
      setFeedbackBanner('Could not update profile photo.');
    }
  };

  const handleSignOut = async () => {
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    } else {
      window.localStorage.removeItem(LOCAL_SESSION_KEY);
    }
    setProfileModalOpen(false);
    setSignedInUser(null);
    setFeedbackBanner('Signed out of your account.');
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const trimmedEmail = email.trim().toLowerCase();
      const displayName =
        signedInUser?.name || fullName.trim() || trimmedEmail.split('@')[0] || 'Author';

      // 1. SUPABASE AUTH + DATABASE MODE
      if (supabaseClient) {
        let activeUserId = signedInUser?.id;

        if (authModalMode === 'login') {
          const {data, error} = await supabaseClient.auth.signInWithPassword({
            email: trimmedEmail,
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
          const resolvedRole =
            (user.user_metadata?.account_role as string | undefined) ||
            'Reader account';

          let avatarUrl: string | undefined;
          try {
            const {data: prof} = await supabaseClient
              .from('profiles')
              .select('full_name, account_role, avatar_url')
              .eq('id', user.id)
              .maybeSingle();
            if (prof?.avatar_url) {
              avatarUrl = prof.avatar_url as string;
            }
          } catch {
            // Ignore if profiles table doesn't have avatar_url yet
          }

          if (!avatarUrl) {
            try {
              avatarUrl =
                window.localStorage.getItem(`${AVATAR_CACHE_PREFIX}${user.id}`) ||
                undefined;
            } catch {
              avatarUrl = undefined;
            }
          }

          setAvatarLoadError(false);
          setSignedInUser({
            id: user.id,
            name: resolvedName,
            email: user.email,
            role: resolvedRole,
            avatarUrl,
          });
          setFeedbackBanner(`Welcome back, ${resolvedName}.`);
          setAuthModalMode(null);
          setPassword('');
          scrollToProfile();
          setSubmitting(false);
          return;
        }

        if (authModalMode === 'signup') {
          const {data, error} = await supabaseClient.auth.signUp({
            email: trimmedEmail,
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

          if (data.user) {
            if (avatarDraft) {
              try {
                window.localStorage.setItem(
                  `${AVATAR_CACHE_PREFIX}${data.user.id}`,
                  avatarDraft,
                );
              } catch {
                // Ignore
              }
            }

            if (data.session) {
              await supabaseClient.from('profiles').upsert({
                id: data.user.id,
                full_name: displayName,
                account_role: accountType,
                avatar_url: avatarDraft || null,
              });

              setAvatarLoadError(false);
              setSignedInUser({
                id: data.user.id,
                name: displayName,
                email: data.user.email,
                role: accountType,
                avatarUrl: avatarDraft || undefined,
              });
              setFeedbackBanner(`Welcome to World Book Records, ${displayName}.`);
              setAuthModalMode(null);
              setPassword('');
              setAvatarDraft('');
              scrollToProfile();
            } else {
              setFeedbackBanner(
                'Account created. Check your email to confirm before signing in.',
              );
              setAuthModalMode(null);
              setPassword('');
              setAvatarDraft('');
            }
          }

          setSubmitting(false);
          return;
        }

        if (authModalMode === 'publish') {
          if (!activeUserId) {
            const signInAttempt = await supabaseClient.auth.signInWithPassword({
              email: trimmedEmail,
              password,
            });
            if (!signInAttempt.error && signInAttempt.data.user) {
              activeUserId = signInAttempt.data.user.id;
            } else {
              const signUpAttempt = await supabaseClient.auth.signUp({
                email: trimmedEmail,
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

          if (!bookTitleInput.trim()) {
            setFormError('Please enter your book title.');
            setSubmitting(false);
            return;
          }
          if (!bookDescriptionInput.trim()) {
            setFormError('Please write a description for your book.');
            setSubmitting(false);
            return;
          }
          if (bookAccessInput === 'Paid' && !bookPriceInput.trim()) {
            setFormError('Please enter a price for your paid edition.');
            setSubmitting(false);
            return;
          }

          const words = bookTitleInput.trim().split(/\s+/);
          const splitIdx = Math.ceil(words.length / 2);
          const line1 = words.slice(0, splitIdx).join(' ');
          const line2 = words.slice(splitIdx).join(' ') || 'Edition';
          const variants: BookCoverVariant[] = ['c1', 'c2', 'c3', 'c4'];
          const variant = editingBook
            ? editingBook.coverVariant
            : variants[books.length % variants.length];
          const priceLabel =
            bookAccessInput === 'Free' ? 'Free' : bookPriceInput.trim() || '$4.99';
          const descriptionText = bookDescriptionInput.trim();
          const readingText = bookContentInput.trim() || descriptionText;
          const computedPages =
            bookPdfPagesDraft ||
            Math.max(12, Math.ceil(readingText.split(/\s+/).length / 180) * 12 || 210);

          if (editingBook) {
            const updateBase = {
              title: bookTitleInput.trim(),
              title_line_1: line1,
              title_line_2: line2,
              category: bookCategoryInput,
              access_type: bookAccessInput,
              price_label: priceLabel,
              pages: computedPages,
              synopsis: descriptionText,
              excerpt: readingText,
            };

            let {data: updatedRow, error: updateError} = await supabaseClient
              .from('books')
              .update({
                ...updateBase,
                cover_image_url: bookCoverDraft || null,
                book_file_url: bookFileDraft || null,
                book_file_name: bookFileNameDraft || null,
                book_file_size: bookFileSizeDraft || null,
              })
              .eq('id', editingBook.id)
              .select()
              .single();

            let strippedOptionalColumn = false;
            if (
              updateError &&
              (updateError.message.toLowerCase().includes('cover_image_url') ||
                updateError.message.toLowerCase().includes('book_file_'))
            ) {
              strippedOptionalColumn = true;
              const retryPayload: Record<string, unknown> = {...updateBase};
              const errLower = updateError.message.toLowerCase();
              if (!errLower.includes('cover_image_url')) {
                retryPayload.cover_image_url = bookCoverDraft || null;
              }
              const retryRes = await supabaseClient
                .from('books')
                .update(retryPayload)
                .eq('id', editingBook.id)
                .select()
                .single();
              updatedRow = retryRes.data;
              updateError = retryRes.error;
            }

            if (updateError) {
              setFormError(updateError.message);
              setSubmitting(false);
              return;
            }
            if (!updatedRow) {
              setFormError(
                'Could not update this book. Make sure you are signed in with the account that published it.',
              );
              setSubmitting(false);
              return;
            }

            try {
              if (bookCoverDraft) {
                window.localStorage.setItem(
                  `${BOOK_COVER_CACHE_PREFIX}${editingBook.id}`,
                  bookCoverDraft,
                );
              } else {
                window.localStorage.removeItem(
                  `${BOOK_COVER_CACHE_PREFIX}${editingBook.id}`,
                );
              }
              if (bookFileDraft && bookFileDraft.length <= 2_500_000) {
                window.localStorage.setItem(
                  `${BOOK_FILE_CACHE_PREFIX}${editingBook.id}`,
                  JSON.stringify({
                    url: bookFileDraft,
                    name: bookFileNameDraft,
                    size: bookFileSizeDraft,
                  }),
                );
              } else if (!bookFileDraft) {
                window.localStorage.removeItem(
                  `${BOOK_FILE_CACHE_PREFIX}${editingBook.id}`,
                );
              }
            } catch {
              // Ignore localStorage quota errors
            }

            const mapped = mapDbBook(updatedRow as DbBookRow);
            if (bookCoverDraft && !mapped.coverImageUrl) {
              mapped.coverImageUrl = bookCoverDraft;
            }
            if (bookFileDraft && !mapped.bookFileUrl) {
              mapped.bookFileUrl = bookFileDraft;
              mapped.bookFileName = bookFileNameDraft;
              mapped.bookFileSize = bookFileSizeDraft;
            }
            setBooks((prev) =>
              prev.map((b) => (b.id === editingBook.id ? mapped : b)),
            );
            setFeedbackBanner(
              strippedOptionalColumn
                ? `Updated "${mapped.title}", but run the ALTER TABLE SQL in Supabase so everyone sees attached files.`
                : `Updated "${mapped.title}".`,
            );
            resetBookForm();
            setAuthModalMode(null);
            setPassword('');
            scrollToProfile();
            setSubmitting(false);
            return;
          }

          const newId = `book-${Date.now()}`;
          const basePayload = {
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
            pages: computedPages,
            published_year: 2026,
            synopsis: descriptionText,
            excerpt: readingText,
          };

          let {data: insertedBook, error: insertError} = await supabaseClient
            .from('books')
            .insert({
              ...basePayload,
              cover_image_url: bookCoverDraft || null,
              book_file_url: bookFileDraft || null,
              book_file_name: bookFileNameDraft || null,
              book_file_size: bookFileSizeDraft || null,
            })
            .select()
            .single();

          let strippedOptionalColumn = false;
          if (
            insertError &&
            (insertError.message.toLowerCase().includes('cover_image_url') ||
              insertError.message.toLowerCase().includes('book_file_'))
          ) {
            strippedOptionalColumn = true;
            const retryPayload: Record<string, unknown> = {...basePayload};
            const errLower = insertError.message.toLowerCase();
            if (!errLower.includes('cover_image_url') && bookCoverDraft) {
              retryPayload.cover_image_url = bookCoverDraft;
            }
            const retryRes = await supabaseClient
              .from('books')
              .insert(retryPayload)
              .select()
              .single();
            insertedBook = retryRes.data;
            insertError = retryRes.error;
          }

          if (insertError) {
            setFormError(insertError.message);
            setSubmitting(false);
            return;
          }

          if (bookCoverDraft) {
            try {
              window.localStorage.setItem(
                `${BOOK_COVER_CACHE_PREFIX}${newId}`,
                bookCoverDraft,
              );
            } catch {
              // Ignore localStorage quota errors
            }
          }

          if (bookFileDraft && bookFileDraft.length <= 2_500_000) {
            try {
              window.localStorage.setItem(
                `${BOOK_FILE_CACHE_PREFIX}${newId}`,
                JSON.stringify({
                  url: bookFileDraft,
                  name: bookFileNameDraft,
                  size: bookFileSizeDraft,
                }),
              );
            } catch {
              // Ignore localStorage quota errors
            }
          }

          if (insertedBook) {
            const mapped = mapDbBook(insertedBook as DbBookRow);
            if (!mapped.coverImageUrl && bookCoverDraft) {
              mapped.coverImageUrl = bookCoverDraft;
            }
            if (!mapped.bookFileUrl && bookFileDraft) {
              mapped.bookFileUrl = bookFileDraft;
              mapped.bookFileName = bookFileNameDraft;
              mapped.bookFileSize = bookFileSizeDraft;
            }
            setBooks((prev) => [mapped, ...prev]);
          }

          if (
            activeUserId &&
            !authors.some((a) => a.name.toLowerCase() === displayName.toLowerCase())
          ) {
            const initials = getInitials(displayName);
            const {data: insertedAuthor} = await supabaseClient
              .from('authors')
              .insert({
                id: `author-${activeUserId}`,
                user_id: activeUserId,
                initials,
                name: displayName,
                verified: false,
                country: 'Global',
                genre: bookCategoryInput,
                published_count: 1,
                bio: descriptionText.slice(0, 160),
              })
              .select()
              .single();
            if (insertedAuthor) {
              setAuthors((prev) => [mapDbAuthor(insertedAuthor as DbAuthorRow), ...prev]);
            }
          }

          setFeedbackBanner(
            strippedOptionalColumn && (bookCoverDraft || bookFileDraft)
              ? `"${bookTitleInput.trim()}" published, but run the ALTER TABLE SQL in Supabase so everyone can see the attached file.`
              : `"${bookTitleInput.trim()}" has been published to World Book Records.`,
          );
          resetBookForm();
          setAuthModalMode(null);
          setPassword('');
          scrollToProfile();
          setSubmitting(false);
          return;
        }
      }

      // 2. BROWSER PERSISTENCE MODE (when Supabase Secrets are not yet configured)
      const localUsers = readLocalJson<LocalAccountRecord[]>(LOCAL_USERS_KEY, []);

      if (authModalMode === 'login') {
        const matched = localUsers.find((u) => u.email === trimmedEmail);
        if (!matched) {
          setFormError('No account found with that email. Switch to Sign up to join.');
          setSubmitting(false);
          return;
        }
        if (matched.password !== password) {
          setFormError('Incorrect password. Please try again.');
          setSubmitting(false);
          return;
        }
        const sessionUser: SignedInUser = {
          id: matched.id,
          name: matched.name,
          email: matched.email,
          role: matched.role,
          avatarUrl: matched.avatarUrl,
        };
        writeLocalJson(LOCAL_SESSION_KEY, sessionUser);
        setAvatarLoadError(false);
        setSignedInUser(sessionUser);
        setFeedbackBanner(`Welcome back, ${matched.name}.`);
        setAuthModalMode(null);
        setPassword('');
        scrollToProfile();
        setSubmitting(false);
        return;
      }

      if (authModalMode === 'signup') {
        if (localUsers.some((u) => u.email === trimmedEmail)) {
          setFormError('An account with this email already exists. Please log in.');
          setSubmitting(false);
          return;
        }
        const newAccount: LocalAccountRecord = {
          id: `user-${Date.now()}`,
          name: displayName,
          email: trimmedEmail,
          password,
          role: accountType,
          avatarUrl: avatarDraft || undefined,
        };
        writeLocalJson(LOCAL_USERS_KEY, [...localUsers, newAccount]);
        const sessionUser: SignedInUser = {
          id: newAccount.id,
          name: newAccount.name,
          email: newAccount.email,
          role: newAccount.role,
          avatarUrl: newAccount.avatarUrl,
        };
        writeLocalJson(LOCAL_SESSION_KEY, sessionUser);
        setAvatarLoadError(false);
        setSignedInUser(sessionUser);
        setFeedbackBanner(`Welcome to World Book Records, ${displayName}.`);
        setAuthModalMode(null);
        setPassword('');
        setAvatarDraft('');
        scrollToProfile();
        setSubmitting(false);
        return;
      }

      if (authModalMode === 'publish') {
        if (!bookTitleInput.trim()) {
          setFormError('Please enter your book title.');
          setSubmitting(false);
          return;
        }
        if (!bookDescriptionInput.trim()) {
          setFormError('Please write a description for your book.');
          setSubmitting(false);
          return;
        }
        if (bookAccessInput === 'Paid' && !bookPriceInput.trim()) {
          setFormError('Please enter a price for your paid edition.');
          setSubmitting(false);
          return;
        }

        let currentSession = signedInUser;
        if (!currentSession) {
          const existing = localUsers.find((u) => u.email === trimmedEmail);
          if (existing) {
            if (existing.password !== password) {
              setFormError('Incorrect password for this email.');
              setSubmitting(false);
              return;
            }
            currentSession = {
              id: existing.id,
              name: existing.name,
              email: existing.email,
              role: existing.role,
              avatarUrl: existing.avatarUrl,
            };
          } else {
            const newAccount: LocalAccountRecord = {
              id: `user-${Date.now()}`,
              name: displayName,
              email: trimmedEmail,
              password,
              role: 'Author account',
              avatarUrl: avatarDraft || undefined,
            };
            writeLocalJson(LOCAL_USERS_KEY, [...localUsers, newAccount]);
            currentSession = {
              id: newAccount.id,
              name: newAccount.name,
              email: newAccount.email,
              role: newAccount.role,
              avatarUrl: newAccount.avatarUrl,
            };
          }
          writeLocalJson(LOCAL_SESSION_KEY, currentSession);
          setSignedInUser(currentSession);
        }

        const words = bookTitleInput.trim().split(/\s+/);
        const splitIdx = Math.ceil(words.length / 2);
        const line1 = words.slice(0, splitIdx).join(' ');
        const line2 = words.slice(splitIdx).join(' ') || 'Edition';
        const variants: BookCoverVariant[] = ['c1', 'c2', 'c3', 'c4'];
        const variant = editingBook
          ? editingBook.coverVariant
          : variants[books.length % variants.length];
        const priceLabel =
          bookAccessInput === 'Free' ? 'Free' : bookPriceInput.trim() || '$4.99';
        const descriptionText = bookDescriptionInput.trim();
        const readingText = bookContentInput.trim() || descriptionText;
        const computedPages =
          bookPdfPagesDraft ||
          Math.max(12, Math.ceil(readingText.split(/\s+/).length / 180) * 12 || 210);

        if (editingBook) {
          const updatedBook: BookItem = {
            ...editingBook,
            titleLines: [line1, line2],
            title: bookTitleInput.trim(),
            category: bookCategoryInput,
            type: bookAccessInput,
            priceLabel,
            coverImageUrl: bookCoverDraft || undefined,
            bookFileUrl: bookFileDraft || undefined,
            bookFileName: bookFileNameDraft || undefined,
            bookFileSize: bookFileSizeDraft || undefined,
            pages: computedPages,
            synopsis: descriptionText,
            excerpt: readingText,
          };

          const existingLocalBooks = readLocalJson<BookItem[]>(LOCAL_BOOKS_KEY, []);
          writeLocalJson(
            LOCAL_BOOKS_KEY,
            existingLocalBooks.some((b) => b.id === editingBook.id)
              ? existingLocalBooks.map((b) =>
                  b.id === editingBook.id ? updatedBook : b,
                )
              : [updatedBook, ...existingLocalBooks],
          );
          setBooks((prev) =>
            prev.map((b) => (b.id === editingBook.id ? updatedBook : b)),
          );
          setFeedbackBanner(`Updated "${updatedBook.title}".`);
          resetBookForm();
          setAuthModalMode(null);
          setPassword('');
          scrollToProfile();
          return;
        }

        const newBook: BookItem = {
          id: `book-${Date.now()}`,
          userId: currentSession.id,
          titleLines: [line1, line2],
          title: bookTitleInput.trim(),
          author: currentSession.name,
          category: bookCategoryInput,
          type: bookAccessInput,
          priceLabel,
          coverImageUrl: bookCoverDraft || undefined,
          bookFileUrl: bookFileDraft || undefined,
          bookFileName: bookFileNameDraft || undefined,
          bookFileSize: bookFileSizeDraft || undefined,
          coverVariant: variant,
          coverKicker: 'WORLD BOOK RECORDS',
          coverFooter: `BY ${currentSession.name.toUpperCase()}`,
          pages: computedPages,
          publishedYear: 2026,
          synopsis: descriptionText,
          excerpt: readingText,
        };

        const existingLocalBooks = readLocalJson<BookItem[]>(LOCAL_BOOKS_KEY, []);
        writeLocalJson(LOCAL_BOOKS_KEY, [newBook, ...existingLocalBooks]);
        setBooks((prev) => [newBook, ...prev]);
        setFeedbackBanner(
          `"${newBook.title}" saved in this browser only. Connect Supabase Secrets so everyone can see it.`,
        );
        resetBookForm();
        setAuthModalMode(null);
        setPassword('');
        scrollToProfile();
      }
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
      desc: 'Sign in to view your profile and published books.',
    },
    signup: {
      title: 'Join World Book Records',
      desc: 'Create your reader or author account.',
    },
    publish: editingBook
      ? {
          title: 'Update book',
          desc: 'Edit your book cover, title, description, price, or attached file.',
        }
      : {
          title: 'Upload & publish a book',
          desc: 'Add your cover photo, book title, description, and price.',
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
                <button
                  type="button"
                  onClick={() => setProfileModalOpen(true)}
                  className="flex items-center gap-2 rounded-[9px] px-2 py-1 bg-transparent border-0 hover:bg-[#1b1a1c] transition-colors cursor-pointer"
                >
                  <span className="w-7 h-7 rounded-full border border-[#d8b35d] overflow-hidden grid place-items-center bg-[#242018] text-[#ffe6a8] font-serif text-[12px] shrink-0">
                    {signedInUser.avatarUrl && !avatarLoadError ? (
                      <img
                        src={signedInUser.avatarUrl}
                        alt={signedInUser.name}
                        referrerPolicy="no-referrer"
                        onError={() => setAvatarLoadError(true)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      getInitials(signedInUser.name)
                    )}
                  </span>
                  <span className="hidden sm:inline text-[12px] text-[#d8b35d] font-semibold max-w-[120px] truncate">
                    {signedInUser.name}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="hidden min-[541px]:inline-flex border border-[#302c25] rounded-[9px] px-3 py-2 text-[#d2cec5] bg-transparent hover:border-[#d8b35d] hover:text-[#d8b35d] text-[13px] cursor-pointer transition-colors whitespace-nowrap"
                >
                  Sign out
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
                {signedInUser && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setProfileModalOpen(true);
                    }}
                    className="py-1.5 text-[#d8b35d] font-semibold text-left bg-transparent border-0 p-0 cursor-pointer"
                  >
                    My Profile ({signedInUser.name})
                  </button>
                )}
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
                  onClick={() =>
                    signedInUser ? setProfileModalOpen(true) : openAuthModal('publish')
                  }
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
                      className={`h-[165px] sm:h-[205px] rounded-[7px] flex flex-col justify-between shadow-[inset_5px_0_rgba(255,255,255,0.08)] relative overflow-hidden ${COVER_GRADIENTS[book.coverVariant]} ${
                        book.coverImageUrl && !bookCoverErrors[book.id]
                          ? ''
                          : 'p-[13px] sm:p-[17px]'
                      }`}
                    >
                      {book.coverImageUrl && !bookCoverErrors[book.id] ? (
                        <>
                          <img
                            src={book.coverImageUrl}
                            alt={`${book.title} cover`}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setBookCoverErrors((prev) => ({...prev, [book.id]: true}))
                            }
                            className="w-full h-full object-cover"
                          />
                          <div
                            aria-hidden="true"
                            className="absolute inset-0 shadow-[inset_6px_0_12px_rgba(0,0,0,0.45)] pointer-events-none"
                          />
                        </>
                      ) : (
                        <>
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
                        </>
                      )}
                    </div>

                    <div className="pt-[12px] px-[2px] pb-[3px]">
                      <h3 className="font-serif text-[16px] sm:text-[18px] m-0 mb-1 font-normal">
                        {book.title}
                      </h3>
                      <div className="text-[12px] text-[#a7a3a0]">by {book.author}</div>
                      <div className="flex justify-between items-center mt-3 text-[12px] gap-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="border border-[#4a402d] text-[#d7c18e] rounded-[20px] px-2 py-[3px] text-[10px]">
                            {book.category}
                          </span>
                          {book.bookFileName && (
                            <span className="border border-[#383328] bg-[#1b1914] text-[#f2d58b] rounded-[20px] px-2 py-[3px] text-[9px] font-bold tracking-wide">
                              {getFileExtensionLabel(book.bookFileName)}
                            </span>
                          )}
                        </div>
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
                onClick={() =>
                  signedInUser ? setProfileModalOpen(true) : openAuthModal('publish')
                }
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

      {/* Profile Modal: Photo on top -> Name below -> Published Books below */}
      <AnimatePresence>
        {profileModalOpen && signedInUser && (
          <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.16}}
            onClick={(e) => {
              if (e.target === e.currentTarget) setProfileModalOpen(false);
            }}
            className="fixed inset-0 z-30 bg-black/80 grid place-items-center p-[18px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-modal-title"
          >
            <motion.div
              initial={{opacity: 0, scale: 0.97, y: 8}}
              animate={{opacity: 1, scale: 1, y: 0}}
              exit={{opacity: 0, scale: 0.97, y: 8}}
              transition={{duration: 0.16}}
              className="w-[min(860px,100%)] max-h-[90vh] overflow-y-auto bg-[#141417] border border-[#66512d] rounded-[18px] p-6 sm:p-8 relative"
            >
              <button
                type="button"
                onClick={() => setProfileModalOpen(false)}
                aria-label="Close profile"
                className="absolute right-[16px] top-[14px] bg-transparent border-0 text-[#aaa] hover:text-white cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Top: Centered Photo */}
              <div className="flex flex-col items-center text-center">
                <div className="relative">
                  <div
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 border-[#d8b35d] overflow-hidden grid place-items-center text-[#ffe6a8] font-serif text-[34px] shadow-[0_12px_30px_rgba(0,0,0,0.6)]"
                    style={{
                      background: 'linear-gradient(145deg, #76572b, #242018)',
                    }}
                  >
                    {signedInUser.avatarUrl && !avatarLoadError ? (
                      <img
                        src={signedInUser.avatarUrl}
                        alt={signedInUser.name}
                        referrerPolicy="no-referrer"
                        onError={() => setAvatarLoadError(true)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span>{getInitials(signedInUser.name)}</span>
                    )}
                  </div>

                  <input
                    ref={profileFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleProfileAvatarUpdate}
                    className="hidden"
                    aria-label="Update profile photo"
                  />
                  <button
                    type="button"
                    onClick={() => profileFileInputRef.current?.click()}
                    title="Change profile photo"
                    aria-label="Change profile photo"
                    className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#d8b35d] hover:bg-[#f2d58b] text-[#16130c] border-2 border-[#141417] grid place-items-center cursor-pointer transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                </div>

                {/* Middle: Name */}
                <h2
                  id="profile-modal-title"
                  className="font-serif text-[28px] sm:text-[34px] mt-4 mb-1 font-normal text-[#f7f4ed]"
                >
                  {signedInUser.name}
                </h2>
                <p className="text-[13px] text-[#a7a3a0] m-0">
                  {signedInUser.role}
                  {signedInUser.email ? ` · ${signedInUser.email}` : ''}
                  {' · '}
                  <span className="text-[#d8b35d] tabular-nums">
                    {myPublishedBooks.length}{' '}
                    {myPublishedBooks.length === 1 ? 'published book' : 'published books'}
                  </span>
                </p>

                <div className="flex items-center gap-3 mt-4 flex-wrap justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileModalOpen(false);
                      openAuthModal('publish');
                    }}
                    className="inline-flex items-center gap-1.5 border border-[#d8b35d] rounded-[9px] px-4 py-2 text-[#16130c] bg-[#d8b35d] hover:bg-[#f2d58b] font-bold text-[13px] cursor-pointer transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Upload &amp; publish book</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => profileFileInputRef.current?.click()}
                    className="border border-[#302c25] rounded-[9px] px-4 py-2 text-[#d2cec5] bg-[#0b0b0d] hover:border-[#d8b35d] hover:text-[#d8b35d] font-semibold text-[13px] cursor-pointer transition-colors"
                  >
                    Change photo
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="border border-[#302c25] rounded-[9px] px-4 py-2 text-[#a7a3a0] bg-transparent hover:border-[#d8b35d] hover:text-[#d8b35d] font-semibold text-[13px] cursor-pointer transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              </div>

              {/* Bottom: Published Books */}
              <div className="mt-7 pt-6 border-t border-[#302c25]">
                <div className="mb-4">
                  <div className="text-[#d8b35d] text-[10px] font-extrabold tracking-[2.5px] uppercase">
                    Author Shelf
                  </div>
                  <h3 className="font-serif text-[22px] m-0 mt-1 font-normal">
                    Published books by {signedInUser.name}
                  </h3>
                </div>

                {myPublishedBooks.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                    {myPublishedBooks.map((book) => (
                      <article
                        key={book.id}
                        onClick={() => {
                          setProfileModalOpen(false);
                          setSelectedBook(book);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setProfileModalOpen(false);
                            setSelectedBook(book);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`Read preview of ${book.title}`}
                        className="bg-[#0d0d10] border border-[#292621] rounded-[13px] p-3 transition duration-200 hover:-translate-y-1 hover:border-[#806633] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#d8b35d]"
                      >
                        <div
                          className={`h-[155px] sm:h-[185px] rounded-[7px] flex flex-col justify-between shadow-[inset_5px_0_rgba(255,255,255,0.08)] relative overflow-hidden ${COVER_GRADIENTS[book.coverVariant]} ${
                            book.coverImageUrl && !bookCoverErrors[book.id]
                              ? ''
                              : 'p-3.5'
                          }`}
                        >
                          {book.coverImageUrl && !bookCoverErrors[book.id] ? (
                            <>
                              <img
                                src={book.coverImageUrl}
                                alt={`${book.title} cover`}
                                referrerPolicy="no-referrer"
                                onError={() =>
                                  setBookCoverErrors((prev) => ({
                                    ...prev,
                                    [book.id]: true,
                                  }))
                                }
                                className="w-full h-full object-cover"
                              />
                              <div
                                aria-hidden="true"
                                className="absolute inset-0 shadow-[inset_6px_0_12px_rgba(0,0,0,0.45)] pointer-events-none"
                              />
                            </>
                          ) : (
                            <>
                              <span
                                aria-hidden="true"
                                className="absolute w-[140px] h-[140px] border border-white/15 rounded-full -right-[50px] -bottom-[45px] pointer-events-none"
                              />
                              <small className="text-[8px] tracking-[2px] opacity-80">
                                {book.coverKicker}
                              </small>
                              <strong className="font-serif text-[19px] sm:text-[22px] leading-[1.08] max-w-[140px] font-normal">
                                {book.titleLines[0]}
                                <br />
                                {book.titleLines[1]}
                              </strong>
                              <span className="text-[8px] tracking-[1.5px]">
                                {book.coverFooter}
                              </span>
                            </>
                          )}
                        </div>

                        <div className="pt-2.5 px-0.5 pb-0.5">
                          <h4 className="font-serif text-[16px] m-0 mb-1 font-normal">
                            {book.title}
                          </h4>
                          <div className="text-[12px] text-[#a7a3a0]">by {book.author}</div>
                          <div className="flex justify-between items-center mt-2.5 text-[12px]">
                            <span className="text-[#d7c18e] text-[11px]">
                              {book.category}
                              {book.bookFileName
                                ? ` · ${getFileExtensionLabel(book.bookFileName)}`
                                : ''}
                            </span>
                            <span className="text-[#d8b35d] font-extrabold tabular-nums">
                              {book.priceLabel}
                            </span>
                          </div>

                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="mt-3 pt-2.5 border-t border-[#24211c] flex items-center gap-1.5 flex-wrap"
                          >
                            {deleteConfirmBookId === book.id ? (
                              <>
                                <button
                                  type="button"
                                  disabled={deletingBookId === book.id}
                                  onClick={() => handleDeleteBook(book)}
                                  className="flex-1 inline-flex items-center justify-center gap-1 rounded-[7px] px-2 py-1.5 text-[11px] font-bold bg-red-600 hover:bg-red-500 text-white border-0 cursor-pointer disabled:opacity-60 transition-colors"
                                >
                                  {deletingBookId === book.id ? 'Deleting…' : 'Confirm'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirmBookId(null)}
                                  className="flex-1 rounded-[7px] px-2 py-1.5 text-[11px] font-semibold bg-[#17161b] border border-[#302c25] text-[#d2cec5] hover:border-[#d8b35d] cursor-pointer transition-colors"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditBookModal(book)}
                                  className="flex-1 inline-flex items-center justify-center gap-1 rounded-[7px] px-2 py-1.5 text-[11px] font-semibold bg-[#17161b] border border-[#302c25] text-[#f7f4ed] hover:border-[#d8b35d] hover:text-[#d8b35d] cursor-pointer transition-colors"
                                >
                                  <Pencil className="w-3 h-3" />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirmBookId(book.id)}
                                  className="inline-flex items-center justify-center gap-1 rounded-[7px] px-2.5 py-1.5 text-[11px] font-semibold bg-[#17161b] border border-[#302c25] text-red-300 hover:border-red-500/60 hover:text-red-200 cursor-pointer transition-colors"
                                  aria-label={`Delete ${book.title}`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Delete</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="bg-[#0d0d10] border border-[#292621] rounded-[13px] p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <p className="font-serif text-[18px] text-[#f7f4ed] m-0">
                        You haven&apos;t published a book yet.
                      </p>
                      <p className="text-[13px] text-[#a7a3a0] mt-1 mb-0">
                        Publish your first book and it will appear right here under your
                        profile.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileModalOpen(false);
                        openAuthModal('publish');
                      }}
                      className="border border-[#d8b35d] rounded-[9px] px-4 py-2.5 text-[#16130c] bg-[#d8b35d] hover:bg-[#f2d58b] font-bold text-[13px] cursor-pointer transition-colors whitespace-nowrap"
                    >
                      Publish your first book
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auth / Publish Modal */}
      <AnimatePresence>
        {authModalMode && (
          <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.16}}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setAuthModalMode(null);
                setEditingBook(null);
              }
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
              className={`${
                authModalMode === 'publish' ? 'w-[min(560px,100%)]' : 'w-[min(480px,100%)]'
              } max-h-[90vh] overflow-y-auto bg-[#171619] border border-[#66512d] rounded-[16px] p-[25px] relative`}
            >
              <button
                type="button"
                onClick={() => {
                  setAuthModalMode(null);
                  setEditingBook(null);
                }}
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

              {/* Login / Sign Up Switcher */}
              {authModalMode !== 'publish' && (
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#0d0d0f] border border-[#302c25] rounded-[10px] mb-4">
                  <button
                    type="button"
                    onClick={() => {
                      setFormError(null);
                      setAuthModalMode('signup');
                    }}
                    className={`py-2 text-[13px] font-bold rounded-[7px] cursor-pointer transition-colors ${
                      authModalMode === 'signup'
                        ? 'bg-[#d8b35d] text-[#16130c]'
                        : 'text-[#a7a3a0] hover:text-white'
                    }`}
                  >
                    Sign up
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormError(null);
                      setAuthModalMode('login');
                    }}
                    className={`py-2 text-[13px] font-bold rounded-[7px] cursor-pointer transition-colors ${
                      authModalMode === 'login'
                        ? 'bg-[#d8b35d] text-[#16130c]'
                        : 'text-[#a7a3a0] hover:text-white'
                    }`}
                  >
                    Log in
                  </button>
                </div>
              )}

              {formError && (
                <div className="mb-3 rounded-[8px] border border-red-500/40 bg-red-950/40 px-3 py-2 text-[12px] text-red-200">
                  {formError}
                </div>
              )}

              <form onSubmit={handleFormSubmit} className="space-y-2.5">
                {/* Profile Photo Picker on Sign Up */}
                {authModalMode === 'signup' && (
                  <div className="flex items-center gap-3.5 pb-1">
                    <div
                      className="w-16 h-16 rounded-full border border-[#d8b35d] overflow-hidden grid place-items-center text-[#ffe6a8] font-serif text-[22px] shrink-0"
                      style={{
                        background: 'linear-gradient(145deg, #76572b, #242018)',
                      }}
                    >
                      {avatarDraft ? (
                        <img
                          src={avatarDraft}
                          alt="Profile preview"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : fullName.trim() ? (
                        getInitials(fullName)
                      ) : (
                        <User className="w-6 h-6 text-[#d8b35d]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <input
                        ref={signupFileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleSignupAvatarPick}
                        className="hidden"
                        aria-label="Choose profile photo"
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => signupFileInputRef.current?.click()}
                          className="inline-flex items-center gap-1.5 border border-[#302c25] hover:border-[#d8b35d] rounded-[8px] px-3 py-1.5 text-[12px] text-[#f7f4ed] bg-[#0d0d0f] cursor-pointer transition-colors"
                        >
                          <Camera className="w-3.5 h-3.5 text-[#d8b35d]" />
                          <span>{avatarDraft ? 'Change photo' : 'Upload photo'}</span>
                        </button>
                        {avatarDraft && (
                          <button
                            type="button"
                            onClick={() => setAvatarDraft('')}
                            className="text-[11px] text-[#a7a3a0] hover:text-white cursor-pointer bg-transparent border-0 p-1"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-[#a7a3a0] mt-1 mb-0">
                        Your photo appears at the top of your author profile.
                      </p>
                    </div>
                  </div>
                )}

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
                  <div className="space-y-3">
                    {/* Book Cover Upload + Size Guidance */}
                    <div className="bg-[#0d0d10] border border-[#302c25] rounded-[12px] p-3.5">
                      <div className="flex items-start gap-3.5">
                        <div
                          onClick={() => bookCoverFileInputRef.current?.click()}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              bookCoverFileInputRef.current?.click();
                            }
                          }}
                          aria-label="Choose book cover image"
                          className="w-[92px] h-[138px] shrink-0 rounded-[7px] border border-dashed border-[#66512d] hover:border-[#d8b35d] bg-[#141417] overflow-hidden relative cursor-pointer grid place-items-center transition-colors"
                        >
                          {bookCoverDraft ? (
                            <img
                              src={bookCoverDraft}
                              alt="Book cover preview"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="p-2 text-center flex flex-col items-center gap-1.5">
                              <ImagePlus className="w-5 h-5 text-[#d8b35d]" />
                              <span className="text-[10px] leading-tight text-[#d2cec5]">
                                Cover 2:3
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-bold text-[#f7f4ed] mb-1">
                            Book Cover Photo
                          </div>
                          <div className="text-[11px] text-[#d8b35d] font-semibold">
                            Recommended size: 600 × 900 px (2:3 portrait)
                          </div>
                          <p className="text-[11px] text-[#a7a3a0] mt-0.5 mb-2.5 leading-snug">
                            Supports JPG, PNG, or WebP up to 5 MB. Automatically cropped
                            &amp; resized to 480 × 720 px for crisp library cards.
                          </p>

                          <input
                            ref={bookCoverFileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/*"
                            onChange={handleBookCoverPick}
                            className="hidden"
                            aria-label="Upload book cover photo"
                          />

                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => bookCoverFileInputRef.current?.click()}
                              className="inline-flex items-center gap-1.5 border border-[#d8b35d] rounded-[8px] px-3 py-1.5 text-[12px] font-semibold text-[#16130c] bg-[#d8b35d] hover:bg-[#f2d58b] cursor-pointer transition-colors"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              <span>
                                {bookCoverDraft ? 'Change cover' : 'Upload cover'}
                              </span>
                            </button>
                            {bookCoverDraft && (
                              <button
                                type="button"
                                onClick={() => {
                                  setBookCoverDraft('');
                                  setBookCoverMeta('');
                                }}
                                className="text-[11px] text-[#a7a3a0] hover:text-white cursor-pointer bg-transparent border-0 p-1"
                              >
                                Remove
                              </button>
                            )}
                          </div>

                          {bookCoverMeta && (
                            <p className="text-[10.5px] text-[#d7c18e] mt-2 mb-0">
                              {bookCoverMeta}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Title */}
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-[1.5px] text-[#d7c18e] mb-1">
                        Book Title *
                      </label>
                      <input
                        type="text"
                        required
                        value={bookTitleInput}
                        onChange={(e) => setBookTitleInput(e.target.value)}
                        placeholder="e.g. Echoes of Dawn"
                        className="w-full p-3 bg-[#0d0d0f] border border-[#302c25] focus:border-[#d8b35d] rounded-[8px] text-white outline-none"
                      />
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-[1.5px] text-[#d7c18e] mb-1">
                        Book Description *
                      </label>
                      <textarea
                        required
                        rows={2}
                        value={bookDescriptionInput}
                        onChange={(e) => setBookDescriptionInput(e.target.value)}
                        placeholder="Write a short summary or description of your book..."
                        className="w-full p-3 bg-[#0d0d0f] border border-[#302c25] focus:border-[#d8b35d] rounded-[8px] text-white outline-none resize-y text-[13.5px] leading-relaxed"
                      />
                    </div>

                    {/* Optional Story / Full Reading Text */}
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-[1.5px] text-[#d7c18e] mb-1">
                        Book Story / Text{' '}
                        <span className="font-normal text-[#a7a3a0] normal-case tracking-normal">
                          (optional — readers can read directly on the site)
                        </span>
                      </label>
                      <textarea
                        rows={4}
                        value={bookContentInput}
                        onChange={(e) => setBookContentInput(e.target.value)}
                        placeholder="Write or paste chapters / story text here so readers can read right inside the reader..."
                        className="w-full p-3 bg-[#0d0d0f] border border-[#302c25] focus:border-[#d8b35d] rounded-[8px] text-white outline-none resize-y text-[13.5px] leading-relaxed"
                      />
                    </div>

                    {/* Category & Pricing */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-[1.5px] text-[#d7c18e] mb-1">
                          Category
                        </label>
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
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-[1.5px] text-[#d7c18e] mb-1">
                          Price Option
                        </label>
                        <select
                          value={bookAccessInput}
                          onChange={(e) =>
                            setBookAccessInput(e.target.value as BookAccessType)
                          }
                          aria-label="Price option"
                          className="w-full p-3 bg-[#0d0d0f] border border-[#302c25] focus:border-[#d8b35d] rounded-[8px] text-white outline-none"
                        >
                          <option value="Free">Free (Open access)</option>
                          <option value="Paid">Paid edition (Set price)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-[1.5px] text-[#d7c18e] mb-1">
                        {bookAccessInput === 'Paid' ? 'Price *' : 'Price'}
                      </label>
                      {bookAccessInput === 'Paid' ? (
                        <input
                          type="text"
                          required
                          value={bookPriceInput}
                          onChange={(e) => setBookPriceInput(e.target.value)}
                          placeholder="Enter price (e.g. $4.99 or ৳250)"
                          className="w-full p-3 bg-[#0d0d0f] border border-[#302c25] focus:border-[#d8b35d] rounded-[8px] text-white outline-none"
                        />
                      ) : (
                        <div className="w-full px-3 py-2.5 bg-[#0d0d0f] border border-[#302c25] rounded-[8px] text-[13px] text-[#d8b35d] flex items-center justify-between">
                          <span>Free ($0)</span>
                          <button
                            type="button"
                            onClick={() => setBookAccessInput('Paid')}
                            className="text-[11px] text-[#f2d58b] underline underline-offset-2 cursor-pointer bg-transparent border-0 p-0"
                          >
                            Set a paid price
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Book File Upload (PDF or any non-image, non-video file) */}
                    <div className="bg-[#0d0d10] border border-[#302c25] rounded-[12px] p-3.5">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] font-bold text-[#f7f4ed] mb-0.5 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-[#d8b35d]" />
                            <span>Book File (PDF or any document)</span>
                          </div>
                          <p className="text-[11px] text-[#a7a3a0] m-0 leading-snug">
                            Upload PDF, EPUB, DOCX, TXT, ZIP or any file up to 10 MB.
                            <span className="text-[#d7c18e]">
                              {' '}
                              Images &amp; videos are excluded.
                            </span>
                          </p>
                        </div>

                        <input
                          ref={bookFileInputRef}
                          type="file"
                          accept=".pdf,.epub,.doc,.docx,.txt,.rtf,.odt,.mobi,.azw,.azw3,.djvu,.md,.csv,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.7z,application/*,text/*"
                          onChange={handleBookFilePick}
                          className="hidden"
                          aria-label="Upload book file"
                        />

                        <button
                          type="button"
                          onClick={() => bookFileInputRef.current?.click()}
                          className="inline-flex items-center gap-1.5 border border-[#d8b35d] rounded-[8px] px-3 py-1.5 text-[12px] font-semibold text-[#d8b35d] bg-transparent hover:bg-[#d8b35d]/10 cursor-pointer transition-colors shrink-0"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>{bookFileNameDraft ? 'Change file' : 'Choose file'}</span>
                        </button>
                      </div>

                      {bookFileNameDraft && (
                        <div className="mt-2.5 flex items-center justify-between gap-2 bg-[#141417] border border-[#3d3524] rounded-[8px] px-3 py-2">
                          <div className="min-w-0 flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded bg-[#d8b35d]/15 border border-[#d8b35d]/40 text-[#f2d58b] text-[10px] font-bold shrink-0">
                              {getFileExtensionLabel(bookFileNameDraft)}
                            </span>
                            <span className="text-[12px] text-[#f7f4ed] truncate">
                              {bookFileNameDraft}
                            </span>
                            {bookFileSizeDraft && (
                              <span className="text-[11px] text-[#a7a3a0] shrink-0">
                                ({bookFileSizeDraft})
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setBookFileDraft('');
                              setBookFileNameDraft('');
                              setBookFileSizeDraft('');
                              setBookPdfPagesDraft(null);
                              if (bookFileInputRef.current) {
                                bookFileInputRef.current.value = '';
                              }
                            }}
                            className="text-[11px] text-[#a7a3a0] hover:text-white cursor-pointer bg-transparent border-0 p-1 shrink-0"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
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
                      <option value="Author account">Author account</option>
                      <option value="Reader account">Reader account</option>
                    </select>
                  )
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full mt-2 border border-[#d8b35d] rounded-[9px] px-4 py-2.5 text-[#16130c] bg-[#d8b35d] hover:bg-[#f2d58b] disabled:opacity-60 font-bold cursor-pointer transition-colors"
                >
                  {submitting
                    ? 'Please wait…'
                    : authModalMode === 'login'
                      ? 'Log in'
                      : authModalMode === 'signup'
                        ? 'Create account'
                        : editingBook
                          ? 'Save changes'
                          : 'Upload & publish book'}
                </button>
              </form>

              <p className="text-[11px] text-[#a99b7b] mt-3 mb-0">
                {authModalMode === 'publish'
                  ? supabaseClient
                    ? editingBook
                      ? 'Changes will immediately update across your profile and the global library.'
                      : 'Your newly published title will appear under your profile and for all visitors in the global library.'
                    : 'Browser-only mode: Connect NEXT_PUBLIC_SUPABASE_URL & NEXT_PUBLIC_SUPABASE_ANON_KEY (sb_publishable_...) in Secrets so everyone can see your uploaded books.'
                  : authModalMode === 'login'
                    ? 'Sign in to view your photo, name, and published books.'
                    : 'Sign up to set your profile photo, name, and publish your books.'}
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
              if (e.target === e.currentTarget) {
                setPdfPreviewOpen(false);
                setSelectedBook(null);
              }
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
              className="w-[min(640px,100%)] max-h-[90vh] overflow-y-auto bg-[#171619] border border-[#66512d] rounded-[16px] p-[25px] relative"
            >
              <button
                type="button"
                onClick={() => {
                  setPdfPreviewOpen(false);
                  setSelectedBook(null);
                }}
                aria-label="Close book preview"
                className="absolute right-[15px] top-[12px] bg-transparent border-0 text-[#aaa] hover:text-white cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex flex-col sm:flex-row gap-5">
                <div
                  className={`w-[150px] h-[225px] shrink-0 rounded-[7px] flex flex-col justify-between shadow-[inset_5px_0_rgba(255,255,255,0.08)] relative overflow-hidden ${COVER_GRADIENTS[selectedBook.coverVariant]} ${
                    selectedBook.coverImageUrl && !bookCoverErrors[selectedBook.id]
                      ? ''
                      : 'p-4'
                  }`}
                >
                  {selectedBook.coverImageUrl && !bookCoverErrors[selectedBook.id] ? (
                    <>
                      <img
                        src={selectedBook.coverImageUrl}
                        alt={`${selectedBook.title} cover`}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setBookCoverErrors((prev) => ({
                            ...prev,
                            [selectedBook.id]: true,
                          }))
                        }
                        className="w-full h-full object-cover"
                      />
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 shadow-[inset_6px_0_12px_rgba(0,0,0,0.45)] pointer-events-none"
                      />
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
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

              {/* Attached Book File (PDF / Document) */}
              {selectedBook.bookFileUrl && (
                <div className="mt-4 bg-[#101013] border border-[#3d3524] rounded-[12px] p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-[8px] bg-[#d8b35d]/15 border border-[#d8b35d]/40 grid place-items-center shrink-0">
                        <FileText className="w-4 h-4 text-[#d8b35d]" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-semibold text-[#f7f4ed] truncate">
                          {selectedBook.bookFileName || 'Attached Book File'}
                        </div>
                        <div className="text-[11px] text-[#a7a3a0]">
                          {getFileExtensionLabel(selectedBook.bookFileName)}
                          {selectedBook.bookFileSize
                            ? ` · ${selectedBook.bookFileSize}`
                            : ''}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {isPdfBookFile(
                        selectedBook.bookFileName,
                        selectedBook.bookFileUrl,
                      ) && (
                        <button
                          type="button"
                          onClick={() => {
                            const targetBook = selectedBook;
                            setPdfPreviewOpen(false);
                            setSelectedBook(null);
                            setReaderBook(targetBook);
                          }}
                          className="inline-flex items-center gap-1.5 border border-[#d8b35d] rounded-[8px] px-3 py-1.5 text-[12px] font-bold text-[#d8b35d] bg-transparent hover:bg-[#d8b35d]/10 cursor-pointer transition-colors"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>Read PDF</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDownloadBookFile(selectedBook)}
                        className="inline-flex items-center gap-1.5 border border-[#d8b35d] rounded-[8px] px-3 py-1.5 text-[12px] font-bold text-[#16130c] bg-[#d8b35d] hover:bg-[#f2d58b] cursor-pointer transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download file</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-[#302c25]">
                <div className="flex items-center gap-2 text-[11px] text-[#d8b35d] uppercase tracking-[2px] font-bold mb-2">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Opening Excerpt</span>
                </div>
                <blockquote className="m-0 font-serif italic text-[14px] text-[#e7e1d5] leading-relaxed">
                  “{selectedBook.excerpt}”
                </blockquote>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-[#d8b35d] font-extrabold text-[16px] tabular-nums">
                    {selectedBook.priceLabel}
                  </span>
                  {readingProgress[selectedBook.id] ? (
                    <span className="ml-2.5 text-[11px] text-[#a7a3a0]">
                      · {readingProgress[selectedBook.id]}% read
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {isOwnedByCurrentUser(selectedBook) && (
                    <>
                      <button
                        type="button"
                        onClick={() => openEditBookModal(selectedBook)}
                        className="inline-flex items-center gap-1.5 border border-[#302c25] hover:border-[#d8b35d] rounded-[9px] px-3 py-2 text-[#f7f4ed] bg-[#0d0d10] font-semibold text-[13px] cursor-pointer transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5 text-[#d8b35d]" />
                        <span>Edit</span>
                      </button>
                      {deleteConfirmBookId === selectedBook.id ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={deletingBookId === selectedBook.id}
                            onClick={() => handleDeleteBook(selectedBook)}
                            className="inline-flex items-center gap-1 rounded-[9px] px-3 py-2 text-[12.5px] font-bold bg-red-600 hover:bg-red-500 text-white border-0 cursor-pointer disabled:opacity-60 transition-colors"
                          >
                            {deletingBookId === selectedBook.id
                              ? 'Deleting…'
                              : 'Confirm delete'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmBookId(null)}
                            className="border border-[#302c25] hover:border-[#d8b35d] rounded-[9px] px-2.5 py-2 text-[#d2cec5] bg-[#0d0d10] font-semibold text-[12.5px] cursor-pointer transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmBookId(selectedBook.id)}
                          className="inline-flex items-center gap-1.5 border border-[#302c25] hover:border-red-500/60 rounded-[9px] px-3 py-2 text-red-300 hover:text-red-200 bg-[#0d0d10] font-semibold text-[13px] cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      )}
                    </>
                  )}
                  {selectedBook.bookFileUrl && (
                    <button
                      type="button"
                      onClick={() => handleDownloadBookFile(selectedBook)}
                      className="inline-flex items-center gap-1.5 border border-[#302c25] hover:border-[#d8b35d] rounded-[9px] px-3.5 py-2 text-[#f7f4ed] bg-[#0d0d10] font-semibold text-[13px] cursor-pointer transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-[#d8b35d]" />
                      <span>
                        Download ({getFileExtensionLabel(selectedBook.bookFileName)})
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const targetBook = selectedBook;
                      setPdfPreviewOpen(false);
                      setSelectedBook(null);
                      setReaderBook(targetBook);
                    }}
                    className="inline-flex items-center gap-1.5 border border-[#d8b35d] rounded-[9px] px-4 py-2 text-[#16130c] bg-[#d8b35d] hover:bg-[#f2d58b] font-bold text-[13px] cursor-pointer transition-colors"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>
                      {selectedBook.type === 'Free' ||
                      unlockedBookIds[selectedBook.id] ||
                      isOwnedByCurrentUser(selectedBook)
                        ? 'Read book'
                        : 'Read sample'}
                    </span>
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-Screen Book Reader (Full-page PDF only when reading PDF) */}
      <AnimatePresence>
        {readerBook &&
          (() => {
            const isAuthorOwner = Boolean(
              signedInUser &&
                (readerBook.userId === signedInUser.id ||
                  readerBook.author.trim().toLowerCase() ===
                    signedInUser.name.trim().toLowerCase()),
            );
            const hasFullAccess =
              readerBook.type === 'Free' ||
              isAuthorOwner ||
              Boolean(unlockedBookIds[readerBook.id]);
            const isFullPagePdf = Boolean(hasFullAccess && activeReaderPdfSource);

            return (
              <motion.div
                initial={{opacity: 0}}
                animate={{opacity: 1}}
                exit={{opacity: 0}}
                transition={{duration: 0.16}}
                className={`fixed inset-0 z-40 flex flex-col ${
                  isFullPagePdf
                    ? 'bg-[#111114] text-[#efeadd]'
                    : readerTheme === 'sepia'
                      ? 'bg-[#f4ecd8] text-[#2b2118]'
                      : readerTheme === 'light'
                        ? 'bg-[#faf9f6] text-[#1a1a1c]'
                        : 'bg-[#0b0b0d] text-[#efeadd]'
                }`}
                role="dialog"
                aria-modal="true"
                aria-label={`Reading ${readerBook.title}`}
              >
                {isFullPagePdf && activeReaderPdfSource ? (
                  <PdfCanvasReader
                    fileUrl={activeReaderPdfSource}
                    title={readerBook.title}
                    fullPage
                    onClose={() => setReaderBook(null)}
                    onDownload={() => handleDownloadBookFile(readerBook)}
                    onScrollProgress={(pct) => {
                      setReadingProgress((prev) => {
                        if (prev[readerBook.id] === pct) return prev;
                        const next = {...prev, [readerBook.id]: pct};
                        writeLocalJson(READING_PROGRESS_KEY, next);
                        return next;
                      });
                    }}
                  />
                ) : (
                  <>
                    {/* Reader Top Controls Bar */}
                    <div
                      className={`border-b px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap ${
                        readerTheme === 'sepia'
                          ? 'border-[#dfd2b5] bg-[#ede2c8]'
                          : readerTheme === 'light'
                            ? 'border-[#e5e2dc] bg-[#ffffff]'
                            : 'border-[#2b2720] bg-[#121215]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => setReaderBook(null)}
                          className={`inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold border cursor-pointer transition-colors shrink-0 ${
                            readerTheme === 'dark'
                              ? 'border-[#3a3326] text-[#f7f4ed] hover:border-[#d8b35d]'
                              : 'border-[#c8bba0] text-inherit hover:border-[#9e7d32]'
                          }`}
                        >
                          <ArrowLeft className="w-4 h-4" />
                          <span>Back</span>
                        </button>
                        <div className="min-w-0">
                          <div className="font-serif text-[16px] sm:text-[18px] truncate font-medium">
                            {readerBook.title}
                          </div>
                          <div className="text-[11.5px] opacity-75 truncate">
                            by {readerBook.author} · {readerBook.category} ·{' '}
                            <span className="tabular-nums">
                              {readingProgress[readerBook.id] || 0}% read
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Font Size Controls */}
                        <div
                          className={`inline-flex items-center rounded-[8px] border overflow-hidden ${
                            readerTheme === 'dark' ? 'border-[#3a3326]' : 'border-[#c8bba0]'
                          }`}
                        >
                          <button
                            type="button"
                            aria-label="Decrease text size"
                            onClick={() => {
                              const next = Math.max(15, readerFontSize - 1);
                              setReaderFontSize(next);
                              writeLocalJson(READER_PREFS_KEY, {
                                theme: readerTheme,
                                fontSize: next,
                              });
                            }}
                            className="px-2.5 py-1.5 hover:bg-[#d8b35d]/20 cursor-pointer bg-transparent border-0 text-inherit"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-2 text-[11px] font-bold tabular-nums opacity-85">
                            {readerFontSize}px
                          </span>
                          <button
                            type="button"
                            aria-label="Increase text size"
                            onClick={() => {
                              const next = Math.min(24, readerFontSize + 1);
                              setReaderFontSize(next);
                              writeLocalJson(READER_PREFS_KEY, {
                                theme: readerTheme,
                                fontSize: next,
                              });
                            }}
                            className="px-2.5 py-1.5 hover:bg-[#d8b35d]/20 cursor-pointer bg-transparent border-0 text-inherit"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Paper Theme Switcher */}
                        <div
                          className={`inline-flex items-center rounded-[8px] border p-0.5 gap-0.5 ${
                            readerTheme === 'dark' ? 'border-[#3a3326]' : 'border-[#c8bba0]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setReaderTheme('dark');
                              writeLocalJson(READER_PREFS_KEY, {
                                theme: 'dark',
                                fontSize: readerFontSize,
                              });
                            }}
                            title="Night mode"
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-semibold cursor-pointer border-0 transition-colors ${
                              readerTheme === 'dark'
                                ? 'bg-[#d8b35d] text-[#16130c]'
                                : 'bg-transparent text-inherit opacity-75 hover:opacity-100'
                            }`}
                          >
                            <Moon className="w-3 h-3" />
                            <span className="hidden sm:inline">Night</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReaderTheme('sepia');
                              writeLocalJson(READER_PREFS_KEY, {
                                theme: 'sepia',
                                fontSize: readerFontSize,
                              });
                            }}
                            title="Sepia paper mode"
                            className={`px-2.5 py-1 rounded-[6px] text-[11px] font-semibold cursor-pointer border-0 transition-colors ${
                              readerTheme === 'sepia'
                                ? 'bg-[#b38734] text-[#fffaf0]'
                                : 'bg-transparent text-inherit opacity-75 hover:opacity-100'
                            }`}
                          >
                            Sepia
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReaderTheme('light');
                              writeLocalJson(READER_PREFS_KEY, {
                                theme: 'light',
                                fontSize: readerFontSize,
                              });
                            }}
                            title="Day mode"
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-semibold cursor-pointer border-0 transition-colors ${
                              readerTheme === 'light'
                                ? 'bg-[#1f1e1c] text-white'
                                : 'bg-transparent text-inherit opacity-75 hover:opacity-100'
                            }`}
                          >
                            <Sun className="w-3 h-3" />
                            <span className="hidden sm:inline">Day</span>
                          </button>
                        </div>

                        {readerBook.bookFileUrl && (
                          <button
                            type="button"
                            onClick={() => handleDownloadBookFile(readerBook)}
                            className="inline-flex items-center gap-1.5 border border-[#d8b35d] rounded-[8px] px-3 py-1.5 text-[12px] font-bold text-[#16130c] bg-[#d8b35d] hover:bg-[#f2d58b] cursor-pointer transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Download</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Thin Reading Progress Bar */}
                    <div className="h-[3px] w-full bg-black/15 shrink-0">
                      <div
                        className="h-full bg-[#d8b35d] transition-all duration-150"
                        style={{
                          width: `${readingProgress[readerBook.id] || 0}%`,
                        }}
                      />
                    </div>

                    {(() => {
                      const textSource =
                        (hasFullAccess && activeReaderFileText) ||
                        readerBook.excerpt ||
                        '';
                      const paragraphs = textSource
                        .split(/\n\s*\n/)
                        .map((p) => p.trim())
                        .filter(Boolean);

                      return (
                        <div
                  ref={readerScrollRef}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const maxScroll = el.scrollHeight - el.clientHeight;
                    const pct =
                      maxScroll <= 0
                        ? 100
                        : Math.min(
                            100,
                            Math.max(1, Math.round((el.scrollTop / maxScroll) * 100)),
                          );
                    setReadingProgress((prev) => {
                      if (prev[readerBook.id] === pct) return prev;
                      const next = {...prev, [readerBook.id]: pct};
                      writeLocalJson(READING_PROGRESS_KEY, next);
                      return next;
                    });
                  }}
                  className="flex-1 overflow-y-auto px-5 sm:px-8 py-8 sm:py-12"
                >
                  <article className="max-w-[68ch] mx-auto">
                    <div className="text-center pb-8 mb-8 border-b border-current/15">
                      <div className="text-[11px] font-extrabold tracking-[2.5px] uppercase text-[#c49b3e] mb-2">
                        {readerBook.category} · {readerBook.publishedYear}
                      </div>
                      <h1 className="font-serif text-[32px] sm:text-[42px] leading-[1.12] m-0 mb-2 font-normal">
                        {readerBook.title}
                      </h1>
                      <p className="text-[14px] opacity-75 m-0 mb-4">
                        by {readerBook.author}
                      </p>
                      <p className="text-[14.5px] opacity-85 max-w-[54ch] mx-auto leading-relaxed m-0">
                        {readerBook.synopsis}
                      </p>
                    </div>

                    <div
                      className="font-serif space-y-6 leading-[1.88]"
                      style={{fontSize: `${readerFontSize}px`}}
                    >
                      {paragraphs.length > 0 ? (
                        paragraphs.map((para, idx) => (
                          <p key={idx} className="m-0 whitespace-pre-line">
                            {para}
                          </p>
                        ))
                      ) : (
                        <p className="m-0 opacity-80">{readerBook.synopsis}</p>
                      )}
                    </div>

                    {hasFullAccess &&
                      readerBook.bookFileUrl &&
                      !isPdfBookFile(
                        readerBook.bookFileName,
                        readerBook.bookFileUrl,
                      ) &&
                      !activeReaderFileText && (
                        <div
                          className={`mt-10 rounded-[14px] border p-5 flex flex-wrap items-center justify-between gap-4 ${
                            readerTheme === 'dark'
                              ? 'bg-[#141417] border-[#3d3524]'
                              : 'bg-black/5 border-[#c8bba0]'
                          }`}
                        >
                          <div>
                            <div className="font-bold text-[14px]">
                              Attached Book Document:{' '}
                              {readerBook.bookFileName || 'Book File'}
                            </div>
                            <div className="text-[12px] opacity-75 mt-0.5">
                              Download the attached{' '}
                              {getFileExtensionLabel(readerBook.bookFileName)} file to
                              read the full formatted manuscript on your device.
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDownloadBookFile(readerBook)}
                            className="inline-flex items-center gap-1.5 border border-[#d8b35d] rounded-[9px] px-4 py-2 text-[#16130c] bg-[#d8b35d] hover:bg-[#f2d58b] font-bold text-[13px] cursor-pointer transition-colors"
                          >
                            <Download className="w-4 h-4" />
                            <span>Download file</span>
                          </button>
                        </div>
                      )}

                    {!hasFullAccess && (
                      <div
                        className={`mt-10 rounded-[14px] border p-6 text-center ${
                          readerTheme === 'dark'
                            ? 'bg-[#161411] border-[#66512d]'
                            : 'bg-[#d8b35d]/10 border-[#b38734]/50'
                        }`}
                      >
                        <div className="text-[11px] font-extrabold tracking-[2px] uppercase text-[#c49b3e] mb-1">
                          Paid Edition Preview
                        </div>
                        <h3 className="font-serif text-[22px] m-0 mb-2 font-normal">
                          Continue reading “{readerBook.title}”
                        </h3>
                        <p className="text-[13.5px] opacity-80 max-w-[44ch] mx-auto mb-4">
                          Unlock the full edition ({readerBook.priceLabel}) to access the
                          complete manuscript and any attached files.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            const next = {...unlockedBookIds, [readerBook.id]: true};
                            setUnlockedBookIds(next);
                            writeLocalJson(UNLOCKED_BOOKS_KEY, next);
                            setFeedbackBanner(
                              `Unlocked "${readerBook.title}" for full reading.`,
                            );
                          }}
                          className="inline-flex items-center gap-2 border border-[#d8b35d] rounded-[9px] px-5 py-2.5 text-[#16130c] bg-[#d8b35d] hover:bg-[#f2d58b] font-bold text-[13.5px] cursor-pointer transition-colors"
                        >
                          <BookOpen className="w-4 h-4" />
                          <span>Unlock &amp; Read Full Book ({readerBook.priceLabel})</span>
                        </button>
                      </div>
                    )}
                  </article>
                </div>
                      );
                    })()}
                  </>
                )}
              </motion.div>
            );
          })()}
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
