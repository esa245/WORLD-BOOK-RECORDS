'use client';

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Lock,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import type {
  BookCoverVariant,
  BookItem,
  BookModerationStatus,
} from '@/data/library';

interface AdminUserRow {
  id: string;
  name: string;
  email?: string;
  role: string;
  avatarUrl?: string;
  createdAt: string;
  booksCount?: number;
}

interface AdminAuthInfo {
  envPasscodeConfigured: boolean;
  claimed: boolean;
  adminEmail: string;
  authorized: boolean;
}

interface AdminPanelModalProps {
  open: boolean;
  onClose: () => void;
  books: BookItem[];
  signedInUser: {
    id: string;
    name: string;
    email?: string;
    role: string;
    avatarUrl?: string;
  } | null;
  supabaseClient: SupabaseClient | null;
  adminToken: string | null;
  onAdminTokenChange: (token: string | null) => void;
  onModerateBook: (
    book: BookItem,
    status: BookModerationStatus,
    rejectionReason?: string,
  ) => Promise<void>;
  onPreviewBook: (book: BookItem) => void;
  localUsersFallback?: {
    id: string;
    name: string;
    email: string;
    role: string;
    avatarUrl?: string;
  }[];
}

const COVER_GRADIENTS: Record<BookCoverVariant, string> = {
  c1: 'bg-[linear-gradient(140deg,#49321b,#17120d)]',
  c2: 'bg-[linear-gradient(140deg,#193b3a,#0b1719)]',
  c3: 'bg-[linear-gradient(140deg,#493047,#1b1420)]',
  c4: 'bg-[linear-gradient(140deg,#3d3a20,#15160c)]',
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

export default function AdminPanelModal({
  open,
  onClose,
  books,
  signedInUser,
  supabaseClient,
  adminToken,
  onAdminTokenChange,
  onModerateBook,
  onPreviewBook,
  localUsersFallback = [],
}: AdminPanelModalProps) {
  const [activeTab, setActiveTab] = useState<'books' | 'users'>('books');
  const [bookFilter, setBookFilter] = useState<BookModerationStatus | 'all'>('pending');
  const [authInfo, setAuthInfo] = useState<AdminAuthInfo | null>(null);
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  const [rejectingBookId, setRejectingBookId] = useState<string | null>(null);
  const [rejectionInput, setRejectionInput] = useState('');
  const [moderatingBookId, setModeratingBookId] = useState<string | null>(null);

  const fetchAuthStatusAndAutoVerify = useCallback(async () => {
    await Promise.resolve();
    setAuthError(null);
    try {
      const headers: Record<string, string> = {};
      if (adminToken) {
        headers.Authorization = `Bearer ${adminToken}`;
      }
      const res = await fetch('/api/admin/auth', {headers, cache: 'no-store'});
      const info = (await res.json()) as AdminAuthInfo;
      setAuthInfo(info);

      // Auto-verify if signed into Supabase with the designated admin email
      if (
        !adminToken &&
        supabaseClient &&
        signedInUser?.email &&
        signedInUser.email.toLowerCase() === info.adminEmail.toLowerCase()
      ) {
        const {data} = await supabaseClient.auth.getSession();
        const sbJwt = data.session?.access_token;
        if (sbJwt) {
          const verifyRes = await fetch('/api/admin/auth', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              action: 'verify_supabase',
              supabaseAccessToken: sbJwt,
            }),
          });
          if (verifyRes.ok) {
            const payload = (await verifyRes.json()) as {token?: string};
            if (payload.token) {
              onAdminTokenChange(payload.token);
            }
          }
        }
      }
    } catch {
      // Keep UI interactive even if offline
    }
  }, [adminToken, onAdminTokenChange, signedInUser, supabaseClient]);

  const loadUsers = useCallback(async () => {
    if (!adminToken) return;
    await Promise.resolve();
    setUsersLoading(true);
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${adminToken}`,
      };
      if (supabaseClient) {
        const {data} = await supabaseClient.auth.getSession();
        if (data.session?.access_token) {
          headers['x-supabase-token'] = data.session.access_token;
        }
      }

      const res = await fetch('/api/admin/users', {headers, cache: 'no-store'});
      if (res.status === 401) {
        onAdminTokenChange(null);
        return;
      }
      const data = (await res.json()) as {users?: AdminUserRow[]};
      const merged = new Map<string, AdminUserRow>();

      for (const u of data.users || []) {
        merged.set(u.id, u);
      }

      // Include local browser accounts if running in browser-only fallback
      for (const lu of localUsersFallback) {
        if (!merged.has(lu.id)) {
          merged.set(lu.id, {
            id: lu.id,
            name: lu.name,
            email: lu.email,
            role: lu.role,
            avatarUrl: lu.avatarUrl,
            createdAt: new Date().toISOString(),
          });
        }
      }

      // Compute book counts from current catalog
      const result = Array.from(merged.values()).map((u) => {
        const count = books.filter(
          (b) =>
            (b.userId && b.userId === u.id) ||
            b.author.trim().toLowerCase() === u.name.trim().toLowerCase(),
        ).length;
        return {
          ...u,
          booksCount: typeof u.booksCount === 'number' && u.booksCount > count ? u.booksCount : count,
        };
      });

      setUsers(result);
    } catch {
      // Ignore transient error
    } finally {
      setUsersLoading(false);
    }
  }, [adminToken, books, localUsersFallback, onAdminTokenChange, supabaseClient]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      void fetchAuthStatusAndAutoVerify();
    }, 0);
    return () => clearTimeout(timer);
  }, [open, fetchAuthStatusAndAutoVerify]);

  useEffect(() => {
    if (!open || !adminToken) return;
    const timer = setTimeout(() => {
      void loadUsers();
    }, 0);
    return () => clearTimeout(timer);
  }, [open, adminToken, loadUsers]);

  const handleAdminPasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const action =
        authInfo && !authInfo.envPasscodeConfigured && !authInfo.claimed
          ? 'setup'
          : 'login';
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action, password: authPassword}),
      });
      const data = (await res.json()) as {token?: string; error?: string};
      if (!res.ok || !data.token) {
        setAuthError(data.error || 'Authentication failed.');
        return;
      }
      onAdminTokenChange(data.token);
      setAuthPassword('');
    } catch {
      setAuthError('Could not verify admin access. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const counts = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    for (const book of books) {
      const st = book.status || 'approved';
      if (st === 'pending') pending += 1;
      else if (st === 'rejected') rejected += 1;
      else approved += 1;
    }
    return {pending, approved, rejected, all: books.length};
  }, [books]);

  const filteredBooks = useMemo(() => {
    if (bookFilter === 'all') return books;
    return books.filter((b) => (b.status || 'approved') === bookFilter);
  }, [books, bookFilter]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      `${u.name} ${u.email || ''} ${u.role}`.toLowerCase().includes(q),
    );
  }, [users, userSearch]);

  const triggerModeration = async (
    book: BookItem,
    status: BookModerationStatus,
    reason?: string,
  ) => {
    setModeratingBookId(book.id);
    try {
      await onModerateBook(book, status, reason);
      setRejectingBookId(null);
      setRejectionInput('');
    } finally {
      setModeratingBookId(null);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          exit={{opacity: 0}}
          transition={{duration: 0.16}}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-40 bg-black/80 grid place-items-center p-3 sm:p-[18px] overscroll-contain"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-panel-title"
        >
          <motion.div
            initial={{opacity: 0, scale: 0.97, y: 8}}
            animate={{opacity: 1, scale: 1, y: 0}}
            exit={{opacity: 0, scale: 0.97, y: 8}}
            transition={{duration: 0.16}}
            className="w-[min(920px,100%)] max-h-[90dvh] overflow-y-auto overscroll-contain bg-[#141417] border border-[#66512d] rounded-[16px] sm:rounded-[18px] p-4 sm:p-7 relative"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close admin panel"
              className="absolute right-3 top-3 sm:right-4 sm:top-4 bg-transparent border-0 text-[#aaa] hover:text-white cursor-pointer p-2 min-w-[40px] min-h-[40px] grid place-items-center"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-[#d8b35d] text-[10.5px] font-extrabold tracking-[2.5px] uppercase">
              <ShieldCheck className="w-4 h-4" />
              <span>Admin Panel</span>
            </div>
            <h2
              id="admin-panel-title"
              className="font-serif text-[24px] sm:text-[30px] mt-1 mb-1 font-normal text-[#f7f4ed]"
            >
              Moderation &amp; User Directory
            </h2>
            <p className="text-[12.5px] sm:text-[13.5px] text-[#a7a3a0] m-0">
              View registered users and accept or reject submitted books before they are
              published publicly.
            </p>

            {!adminToken ? (
              <div className="mt-6 bg-[#0d0d10] border border-[#302c25] rounded-[14px] p-4 sm:p-6 max-w-[460px]">
                <div className="flex items-center gap-2 text-[#d8b35d] font-semibold text-[13px] mb-2">
                  <Lock className="w-4 h-4" />
                  <span>
                    {authInfo && !authInfo.envPasscodeConfigured && !authInfo.claimed
                      ? 'First-Run Admin Password Setup'
                      : 'Admin Authentication Required'}
                  </span>
                </div>
                <p className="text-[12.5px] text-[#a7a3a0] m-0 mb-4 leading-relaxed">
                  {authInfo && !authInfo.envPasscodeConfigured && !authInfo.claimed
                    ? `Create an admin password to lock your Admin Panel, or sign in with ${authInfo.adminEmail}.`
                    : `Sign in with the admin password or log in with ${authInfo?.adminEmail || 'the admin email'} to review books and view users.`}
                </p>

                <form onSubmit={handleAdminPasscodeSubmit} className="space-y-3">
                  <div>
                    <label
                      htmlFor="admin-passcode-input"
                      className="block text-[12px] text-[#c8c2b6] mb-1.5"
                    >
                      {authInfo && !authInfo.envPasscodeConfigured && !authInfo.claimed
                        ? 'Set admin password (min 6 characters)'
                        : 'Admin password'}
                    </label>
                    <input
                      id="admin-passcode-input"
                      type="password"
                      required
                      minLength={
                        authInfo && !authInfo.envPasscodeConfigured && !authInfo.claimed
                          ? 6
                          : 1
                      }
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="Enter admin password"
                      className="w-full bg-[#141417] border border-[#302c25] focus:border-[#d8b35d] rounded-[9px] px-3.5 py-2.5 text-[16px] sm:text-[14px] text-white outline-none"
                    />
                  </div>

                  {authError && (
                    <p
                      role="alert"
                      className="text-[12.5px] text-red-400 bg-red-950/40 border border-red-900/60 rounded-[8px] px-3 py-2 m-0"
                    >
                      {authError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-[#d8b35d] rounded-[9px] px-5 py-2.5 text-[#16130c] bg-[#d8b35d] hover:bg-[#f2d58b] font-bold text-[13.5px] cursor-pointer disabled:opacity-60 min-h-[42px]"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>
                      {authLoading
                        ? 'Verifying…'
                        : authInfo && !authInfo.envPasscodeConfigured && !authInfo.claimed
                          ? 'Claim & Open Admin Panel'
                          : 'Unlock Admin Panel'}
                    </span>
                  </button>
                </form>
              </div>
            ) : (
              <div className="mt-5">
                {/* Admin Top Navigation Tabs */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#302c25]">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('books')}
                      className={`inline-flex items-center gap-1.5 rounded-[9px] px-3.5 py-2 text-[13px] font-semibold border cursor-pointer transition-colors min-h-[40px] ${
                        activeTab === 'books'
                          ? 'bg-[#382d18] border-[#d8b35d] text-[#f2d58b]'
                          : 'bg-[#0d0d10] border-[#302c25] text-[#c8c2b6] hover:border-[#806633]'
                      }`}
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>Book Approvals</span>
                      {counts.pending > 0 && (
                        <span className="ml-0.5 px-1.5 py-0.5 text-[10.5px] font-bold rounded bg-[#d8b35d] text-[#16130c] tabular-nums">
                          {counts.pending}
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('users')}
                      className={`inline-flex items-center gap-1.5 rounded-[9px] px-3.5 py-2 text-[13px] font-semibold border cursor-pointer transition-colors min-h-[40px] ${
                        activeTab === 'users'
                          ? 'bg-[#382d18] border-[#d8b35d] text-[#f2d58b]'
                          : 'bg-[#0d0d10] border-[#302c25] text-[#c8c2b6] hover:border-[#806633]'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                      <span>Users ({users.length})</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={loadUsers}
                      className="inline-flex items-center gap-1.5 rounded-[9px] px-3 py-2 text-[12px] font-semibold bg-[#0d0d10] border border-[#302c25] text-[#d2cec5] hover:border-[#d8b35d] cursor-pointer min-h-[38px]"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${usersLoading ? 'animate-spin' : ''}`}
                      />
                      <span>Refresh</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onAdminTokenChange(null)}
                      className="inline-flex items-center gap-1.5 rounded-[9px] px-3 py-2 text-[12px] font-semibold bg-[#0d0d10] border border-[#302c25] text-[#a7a3a0] hover:border-red-500/60 hover:text-red-300 cursor-pointer min-h-[38px]"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Lock</span>
                    </button>
                  </div>
                </div>

                {/* TAB 1: BOOK ACCEPT / REJECT */}
                {activeTab === 'books' && (
                  <div className="mt-4">
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-4">
                      {(
                        [
                          {key: 'pending', label: `Pending (${counts.pending})`},
                          {key: 'approved', label: `Accepted (${counts.approved})`},
                          {key: 'rejected', label: `Rejected (${counts.rejected})`},
                          {key: 'all', label: `All (${counts.all})`},
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setBookFilter(tab.key)}
                          className={`rounded-[9px] px-3 py-1.5 text-[12px] font-semibold border cursor-pointer whitespace-nowrap shrink-0 min-h-[36px] transition-colors ${
                            bookFilter === tab.key
                              ? 'bg-[#382d18] border-[#d8b35d] text-[#f2d58b]'
                              : 'bg-[#0d0d10] border-[#302c25] text-[#c8c2b6] hover:border-[#806633]'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {filteredBooks.length > 0 ? (
                      <div className="space-y-3">
                        {filteredBooks.map((book) => {
                          const status = book.status || 'approved';
                          const isBusy = moderatingBookId === book.id;
                          const isRejecting = rejectingBookId === book.id;

                          return (
                            <div
                              key={book.id}
                              className="bg-[#0d0d10] border border-[#292621] rounded-[13px] p-3 sm:p-4"
                            >
                              <div className="flex gap-3 sm:gap-4 items-start">
                                <div
                                  className={`w-16 sm:w-20 aspect-[2/3] rounded-[7px] shrink-0 overflow-hidden relative flex flex-col justify-between ${COVER_GRADIENTS[book.coverVariant]} ${
                                    book.coverImageUrl ? '' : 'p-2'
                                  }`}
                                >
                                  {book.coverImageUrl ? (
                                    <img
                                      src={book.coverImageUrl}
                                      alt={`${book.title} cover`}
                                      referrerPolicy="no-referrer"
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <>
                                      <small className="text-[6px] tracking-[1px] opacity-80 truncate">
                                        {book.coverKicker}
                                      </small>
                                      <strong className="font-serif text-[11px] leading-tight font-normal line-clamp-2">
                                        {book.title}
                                      </strong>
                                      <span className="text-[6px] opacity-75 truncate">
                                        {book.author}
                                      </span>
                                    </>
                                  )}
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h3 className="font-serif text-[17px] sm:text-[19px] m-0 font-normal text-[#f7f4ed] truncate">
                                      {book.title}
                                    </h3>
                                    <span
                                      className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.8px] ${
                                        status === 'approved'
                                          ? 'text-emerald-400'
                                          : status === 'rejected'
                                            ? 'text-red-400'
                                            : 'text-amber-300'
                                      }`}
                                    >
                                      {status === 'approved' ? (
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                      ) : status === 'rejected' ? (
                                        <XCircle className="w-3.5 h-3.5" />
                                      ) : (
                                        <Clock className="w-3.5 h-3.5" />
                                      )}
                                      <span>
                                        {status === 'approved'
                                          ? 'Accepted'
                                          : status === 'rejected'
                                            ? 'Rejected'
                                            : 'Pending'}
                                      </span>
                                    </span>
                                  </div>

                                  <div className="text-[12px] text-[#a7a3a0] mt-0.5">
                                    by <strong className="text-[#e7e1d5]">{book.author}</strong>{' '}
                                    · {book.category} · {book.priceLabel} · {book.pages}{' '}
                                    pages
                                    {book.bookFileName ? ` · ${book.bookFileName}` : ''}
                                  </div>

                                  <p className="text-[12.5px] text-[#c8c2b6] mt-2 mb-0 line-clamp-2 leading-relaxed">
                                    {book.synopsis}
                                  </p>

                                  {status === 'rejected' && book.rejectionReason && (
                                    <div className="mt-2 text-[12px] text-red-300 bg-red-950/35 border border-red-900/50 rounded-[8px] px-2.5 py-1.5">
                                      Rejection note: {book.rejectionReason}
                                    </div>
                                  )}

                                  <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => onPreviewBook(book)}
                                      className="inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12px] font-semibold bg-[#171619] border border-[#302c25] text-[#f7f4ed] hover:border-[#d8b35d] cursor-pointer min-h-[36px]"
                                    >
                                      <BookOpen className="w-3.5 h-3.5 text-[#d8b35d]" />
                                      <span>Inspect</span>
                                    </button>

                                    {status !== 'approved' && (
                                      <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() =>
                                          triggerModeration(book, 'approved')
                                        }
                                        className="inline-flex items-center gap-1.5 rounded-[8px] px-3.5 py-1.5 text-[12px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white border-0 cursor-pointer disabled:opacity-60 min-h-[36px]"
                                      >
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        <span>{isBusy ? 'Saving…' : 'Accept & Publish'}</span>
                                      </button>
                                    )}

                                    {status !== 'rejected' && !isRejecting && (
                                      <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() => {
                                          setRejectingBookId(book.id);
                                          setRejectionInput(book.rejectionReason || '');
                                        }}
                                        className="inline-flex items-center gap-1.5 rounded-[8px] px-3.5 py-1.5 text-[12px] font-bold bg-[#1c1315] hover:bg-red-950/70 border border-red-800/70 text-red-300 cursor-pointer disabled:opacity-60 min-h-[36px]"
                                      >
                                        <XCircle className="w-3.5 h-3.5" />
                                        <span>Reject</span>
                                      </button>
                                    )}
                                  </div>

                                  {isRejecting && (
                                    <div className="mt-3 pt-3 border-t border-[#24211c] flex flex-col sm:flex-row gap-2">
                                      <input
                                        type="text"
                                        value={rejectionInput}
                                        onChange={(e) =>
                                          setRejectionInput(e.target.value)
                                        }
                                        placeholder="Optional reason shown to the author (e.g. Missing manuscript)"
                                        className="flex-1 bg-[#141417] border border-[#302c25] focus:border-red-500 rounded-[8px] px-3 py-2 text-[16px] sm:text-[13px] text-white outline-none"
                                      />
                                      <div className="flex items-center gap-2 shrink-0">
                                        <button
                                          type="button"
                                          disabled={isBusy}
                                          onClick={() =>
                                            triggerModeration(
                                              book,
                                              'rejected',
                                              rejectionInput,
                                            )
                                          }
                                          className="flex-1 sm:flex-initial rounded-[8px] px-3.5 py-2 text-[12px] font-bold bg-red-600 hover:bg-red-500 text-white border-0 cursor-pointer disabled:opacity-60 min-h-[38px]"
                                        >
                                          {isBusy ? 'Rejecting…' : 'Confirm Reject'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setRejectingBookId(null);
                                            setRejectionInput('');
                                          }}
                                          className="rounded-[8px] px-3 py-2 text-[12px] font-semibold bg-[#171619] border border-[#302c25] text-[#d2cec5] cursor-pointer min-h-[38px]"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="bg-[#0d0d10] border border-[#292621] rounded-[13px] p-6 text-center text-[#a7a3a0] text-[13.5px]">
                        No books in this moderation queue right now.
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: READ-ONLY USERS VIEW */}
                {activeTab === 'users' && (
                  <div className="mt-4">
                    <div className="relative mb-4">
                      <Search className="w-4 h-4 text-[#a7a3a0] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Search users by name, email, or role…"
                        aria-label="Search users"
                        className="w-full bg-[#0d0d10] border border-[#302c25] focus:border-[#d8b35d] rounded-[9px] pl-10 pr-3.5 py-2.5 text-[16px] sm:text-[13.5px] text-white outline-none"
                      />
                    </div>

                    {filteredUsers.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {filteredUsers.map((user) => (
                          <div
                            key={user.id}
                            className="bg-[#0d0d10] border border-[#292621] rounded-[12px] p-3.5 flex items-center gap-3"
                          >
                            <div
                              className="w-11 h-11 rounded-full border border-[#b08b48] overflow-hidden grid place-items-center text-[#ffe6a8] font-serif text-[17px] shrink-0"
                              style={{
                                background: 'linear-gradient(145deg, #76572b, #242018)',
                              }}
                            >
                              {user.avatarUrl ? (
                                <img
                                  src={user.avatarUrl}
                                  alt={user.name}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                getInitials(user.name)
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-serif text-[16px] text-[#f7f4ed] truncate">
                                {user.name}
                              </div>
                              {user.email && (
                                <div className="text-[11.5px] text-[#d8b35d] truncate">
                                  {user.email}
                                </div>
                              )}
                              <div className="text-[11.5px] text-[#a7a3a0] mt-0.5 truncate">
                                {user.role} · {user.booksCount ?? 0}{' '}
                                {(user.booksCount ?? 0) === 1 ? 'book' : 'books'}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-[#0d0d10] border border-[#292621] rounded-[13px] p-6 text-center text-[#a7a3a0] text-[13.5px]">
                        {usersLoading
                          ? 'Loading users…'
                          : 'No registered users recorded yet.'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
