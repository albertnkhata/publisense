import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useNavigate, useParams } from 'react-router';
import {
  avatarSrc,
  DM_MAX,
  shortAge,
  useAcceptRequest,
  useConversations,
  useDeleteConversation,
  useMarkConversationRead,
  useMessages,
  useMessagesEnabled,
  useMuteConversation,
  usePerson,
  useSendMessage,
  useSetPersonBlocked,
  useStartConversation,
  type Conversation,
  type DmMessage,
  type PersonRef,
} from '../api';
import { cx } from '../lib/cx';
import { usePageTitle } from '../lib/usePageTitle';
import { useViewer } from '../lib/viewer';
import { LoadError } from '../posts/PostList';
import { useAuthDialog } from '../shell/auth';
import { Button, EmptyState, Icon, IconButton, Menu, MenuItem, MenuSeparator, Spinner, Tabs, Textarea, UserAvatar, useToast } from '../ui';
import { NotFound } from './NotFound';

/*
 * Direct messages (0058, X's model). One screen tall (MESSAGES_PAGE, shell/layout.ts):
 * from lg up, the conversation list and the open conversation sit side by side, as
 * on X; below lg, /messages is the list and /messages/:id is the conversation alone.
 * The list has two tabs, Inbox and Requests. /messages/:id is one conversation; a request shows Accept,
 * Delete and Block above the composer, and the sender sees that they can send more
 * once it is accepted. /messages/to/:handle opens the conversation with that person,
 * or an empty one whose first send starts it.
 *
 * On for every signed-in person (useMessagesEnabled). New messages arrive over Realtime
 * (useDmLive); a slow poll backs it up.
 */

type Tab = 'inbox' | 'requests';

function useGate() {
  const { viewer, ready } = useViewer();
  const enabled = useMessagesEnabled(viewer?.id ?? null);
  return { viewer, ready, enabled };
}

function SignedOut() {
  const { openAuth } = useAuthDialog();
  return (
    <div className="rounded-md border border-line bg-card">
      <EmptyState icon="mail" title="Sign in to see your messages" action={<Button onClick={() => openAuth('signin', 'see your messages')}>Sign in</Button>}>
        Conversations with other people on Publisense show up here.
      </EmptyState>
    </div>
  );
}

// ------------------------------------------------------------------ list

/** /messages and its children: the list beside an <Outlet /> for the open conversation. */
export function MessagesPage() {
  const { viewer, ready, enabled } = useGate();
  const { id, handle } = useParams();
  const open = Boolean(id || handle);
  usePageTitle(open ? null : 'Messages');
  if (ready && viewer && !enabled) return <NotFound />;
  if (!ready) {
    return (
      <div className="grid flex-1 place-items-center">
        <Spinner />
      </div>
    );
  }
  if (!viewer) {
    return (
      <section aria-labelledby="page-title" className="pt-6 max-sm:px-3 max-sm:pt-4">
        <h1 id="page-title" className="mt-0 mb-4 text-2xl font-bold text-ink">
          Messages
        </h1>
        <SignedOut />
      </section>
    );
  }
  if (!enabled) return null;
  return (
    <div className="flex min-h-0 flex-1 bg-card">
      <section
        aria-labelledby="page-title"
        className={cx('flex min-h-0 w-list-pane shrink-0 flex-col border-r border-line max-lg:w-full max-lg:border-r-0', open && 'max-lg:hidden')}
      >
        <ConversationList viewerId={viewer.id} activeId={id ?? null} />
      </section>
      <div className={cx('flex min-h-0 min-w-0 flex-1 flex-col', !open && 'max-lg:hidden')}>
        <Outlet />
      </div>
    </div>
  );
}

/** The right pane with nothing open (desktop only; below lg the list fills the screen). */
export function NoConversationPage() {
  return (
    <div className="grid flex-1 place-items-center">
      <EmptyState icon="mail" title="Select a message">
        Choose a conversation, or open someone’s profile and tap Message to start one.
      </EmptyState>
    </div>
  );
}

function ConversationList({ viewerId, activeId }: { viewerId: string; activeId: string | null }) {
  const list = useConversations(viewerId);
  const all = list.data ?? [];
  const inbox = all.filter((c) => c.state === 'inbox');
  const requests = all.filter((c) => c.state === 'request');
  const [tab, setTab] = useState<Tab>('inbox');
  // Show the tab the open conversation is in (a request lives under Requests; once
  // accepted it moves to the Inbox, and the list follows it).
  const activeState = all.find((c) => c.id === activeId)?.state ?? null;
  useEffect(() => {
    if (activeState) setTab(activeState === 'request' ? 'requests' : 'inbox');
  }, [activeId, activeState]);
  const shown = tab === 'inbox' ? inbox : requests;
  const unreadInbox = inbox.filter((c) => c.unread > 0).length;

  return (
    <>
      <div className="shrink-0 px-4 pt-4">
        <h1 id="page-title" className="mt-0 mb-2 text-xl font-bold text-ink">
          Messages
        </h1>
        <Tabs
          idBase="messages"
          label="Messages"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'inbox', label: 'Inbox', ...(unreadInbox ? { count: unreadInbox } : {}) },
            { value: 'requests', label: 'Requests', ...(requests.length ? { count: requests.length } : {}) },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.isPending ? (
          <div className="grid place-items-center py-8">
            <Spinner />
          </div>
        ) : list.isError ? (
          <div className="p-4">
            <LoadError title="We couldn’t load your messages" onRetry={() => void list.refetch()} retrying={list.isRefetching} />
          </div>
        ) : shown.length === 0 ? (
          tab === 'inbox' ? (
            <EmptyState icon="mail" title="No messages yet">
              Open someone’s profile and tap Message to start a conversation.
            </EmptyState>
          ) : (
            <EmptyState icon="mail" title="No message requests">
              Messages from people you don’t follow wait here until you accept them.
            </EmptyState>
          )
        ) : (
          <>
            {tab === 'requests' ? <p className="m-0 px-4 pt-3 pb-1 text-sm text-ink-muted">They won’t know you’ve seen their message until you accept.</p> : null}
            <ul className="m-0 list-none p-0" aria-label={tab === 'inbox' ? 'Inbox' : 'Requests'}>
              {shown.map((c) => (
                <li key={c.id}>
                  <ConversationRow c={c} viewerId={viewerId} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}

function ConversationRow({ c, viewerId }: { c: Conversation; viewerId: string }) {
  const unread = c.unread > 0;
  const name = c.other.name || `@${c.other.handle}`;
  return (
    <NavLink
      to={`/messages/${c.id}`}
      className={({ isActive }) =>
        cx(
          'relative flex items-center gap-3 border-r-2 border-transparent py-3 pr-4 pl-5 text-ink no-underline transition-colors duration-120 hover:bg-subtle',
          unread && 'bg-brand-soft',
          isActive && 'border-brand bg-subtle',
        )
      }
    >
      {unread ? <span aria-hidden="true" className="absolute top-1/2 left-2 size-2 -translate-y-1/2 rounded-pill bg-brand" /> : null}
      <UserAvatar size="lg" name={name} src={avatarSrc(c.other)} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className={cx('truncate text-base', unread ? 'font-bold' : 'font-semibold')}>{name}</span>
          <span className="truncate text-sm text-ink-muted">@{c.other.handle}</span>
          <span className="ml-auto shrink-0 text-sm text-ink-muted">{shortAge(c.last_at)}</span>
        </span>
        <span className={cx('truncate text-sm', unread ? 'font-medium text-ink' : 'text-ink-secondary')}>
          {c.last_sender === viewerId ? 'You: ' : ''}
          {c.last_body}
        </span>
      </span>
      {c.muted ? <span role="img" aria-label="Muted" className="flex shrink-0 text-ink-muted"><Icon name="bell-off" size={16} /></span> : null}
      {unread ? (
        <>
          <span
            aria-hidden="true"
            className="min-w-5 shrink-0 rounded-pill bg-brand px-2 text-center font-mono text-xs leading-4 font-semibold text-on-brand tabular-nums"
          >
            {c.unread > 99 ? '99+' : c.unread}
          </span>
          <span className="sr-only">{c.unread === 1 ? '1 unread message' : `${c.unread} unread messages`}</span>
        </>
      ) : null}
    </NavLink>
  );
}

// ------------------------------------------------------------------ thread

export function ConversationPage() {
  const { id } = useParams();
  const { viewer, ready, enabled } = useGate();
  const list = useConversations(viewer?.id ?? null, enabled);
  const conv = useMemo(() => (list.data ?? []).find((c) => c.id === id) ?? null, [list.data, id]);
  usePageTitle(conv ? conv.other.name || `@${conv.other.handle}` : 'Messages');
  if (!ready || !viewer || !enabled || list.isPending) {
    return (
      <div className="grid flex-1 place-items-center">
        <Spinner />
      </div>
    );
  }
  if (!conv) return <MissingConversation />;
  return <Thread key={conv.id} conv={conv} viewerId={viewer.id} />;
}

/** /messages/to/:handle: the existing conversation with that person, or a new one. */
export function NewConversationPage() {
  const { handle } = useParams();
  const { viewer, ready, enabled } = useGate();
  const person = usePerson(handle);
  const list = useConversations(viewer?.id ?? null, enabled);
  usePageTitle('New message');
  if (!ready || !viewer || !enabled || person.isPending || list.isPending) {
    return (
      <div className="grid flex-1 place-items-center">
        <Spinner />
      </div>
    );
  }
  const p = person.data;
  if (!p || p.id === viewer.id) return <MissingConversation />;
  const existing = (list.data ?? []).find((c) => c.other.id === p.id);
  if (existing) return <Navigate to={`/messages/${existing.id}`} replace />;
  return (
    <section aria-label={`New message to ${p.name || `@${p.handle}`}`} className="flex min-h-0 flex-1 flex-col">
      <ThreadHeader person={p} />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-y-auto px-4 text-center">
        <UserAvatar size="2xl" name={p.name || p.handle} src={avatarSrc(p)} />
        <p className="m-0 text-lg font-bold text-ink">{p.name || `@${p.handle}`}</p>
        <p className="m-0 text-sm text-ink-muted">If @{p.handle} doesn’t follow you, your message arrives as a request.</p>
      </div>
      <div className="shrink-0 border-t border-line px-4 max-sm:px-3">
        <FirstMessageComposer recipientId={p.id} />
      </div>
    </section>
  );
}

function MissingConversation() {
  return (
    <div className="grid flex-1 place-items-center p-4">
      <EmptyState
        icon="mail"
        title="This conversation isn’t available"
        action={
          <Link
            to="/messages"
            className="inline-flex h-8 items-center rounded-md border border-line-strong bg-card px-4 text-base font-semibold text-ink no-underline transition-colors duration-120 hover:bg-subtle"
          >
            Back to messages
          </Link>
        }
      >
        It may have been deleted.
      </EmptyState>
    </div>
  );
}

function ThreadHeader({ person, muted = false, menu }: { person: PersonRef; muted?: boolean; menu?: ReactNode }) {
  const name = person.name || `@${person.handle}`;
  return (
    <header className="flex h-10 shrink-0 items-center gap-3 border-b border-line px-4 max-sm:px-3">
      <Link
        to="/messages"
        aria-label="Back to messages"
        className="grid size-8 place-items-center rounded-md text-ink-secondary no-underline transition-colors duration-120 hover:bg-subtle hover:text-ink lg:hidden"
      >
        <Icon name="arrow-left" size={18} />
      </Link>
      <Link to={`/u/${person.handle}`} className="flex min-w-0 flex-1 items-center gap-2 text-ink no-underline">
        <UserAvatar size="md" name={name} src={avatarSrc(person)} />
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2">
            <h1 className="m-0 truncate text-md font-bold">{name}</h1>
            {muted ? (
              <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-pill border border-line bg-subtle px-2 text-xs text-ink-muted">
                <Icon name="bell-off" size={11} />
                Muted
              </span>
            ) : null}
          </span>
          <span className="truncate text-sm text-ink-muted">@{person.handle}</span>
        </span>
      </Link>
      {menu}
    </header>
  );
}

function Thread({ conv, viewerId }: { conv: Conversation; viewerId: string }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const messages = useMessages(conv.id);
  const markRead = useMarkConversationRead();
  const accept = useAcceptRequest();
  const del = useDeleteConversation();
  const block = useSetPersonBlocked();
  const mute = useMuteConversation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const items = messages.data ?? [];
  const lastId = items.at(-1)?.id;
  const isRequest = conv.state === 'request';
  const iSentOnlyOne = !isRequest && items.length > 0 && items.every((m) => m.sender === viewerId);

  // Reading a conversation marks it read; a request is not marked (they won't know you saw it).
  const markReadMutate = markRead.mutate;
  useEffect(() => {
    if (!isRequest && conv.unread > 0) markReadMutate(conv.id);
  }, [conv.id, conv.unread, isRequest, lastId, markReadMutate]);
  // Newest at the bottom, scrolled into view as messages arrive.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId, messages.isPending]);

  const handle = conv.other.handle;
  const onDelete = () =>
    del.mutate(conv.id, {
      onSuccess: () => {
        toast('Conversation deleted');
        void navigate('/messages', { replace: true });
      },
      onError: (e) => toast(e.message),
    });
  const onBlock = (on: boolean) =>
    block.mutate(
      { userId: conv.other.id, on },
      { onSuccess: () => toast(on ? `Blocked @${handle}` : `Unblocked @${handle}`), onError: (e) => toast(e.message) },
    );

  const menu = (
    <Menu label="Conversation options" align="end" trigger={(p) => <IconButton {...p} icon="more" label="Conversation options" />}>
      <MenuItem icon="user" to={`/u/${handle}`}>
        View profile
      </MenuItem>
      {isRequest ? null : (
        <MenuItem
          icon={conv.muted ? 'bell' : 'bell-off'}
          description={conv.muted ? undefined : 'No badge or email for new messages'}
          onSelect={() =>
            mute.mutate(
              { conversationId: conv.id, muted: !conv.muted },
              { onSuccess: () => toast(conv.muted ? 'Conversation unmuted' : 'Conversation muted'), onError: (e) => toast(e.message) },
            )
          }
        >
          {conv.muted ? 'Unmute conversation' : 'Mute conversation'}
        </MenuItem>
      )}
      <MenuSeparator />
      <MenuItem icon="shield" danger={!conv.blocked} onSelect={() => onBlock(!conv.blocked)}>
        {conv.blocked ? `Unblock @${handle}` : `Block @${handle}`}
      </MenuItem>
      <MenuItem icon="trash" danger description="Removes it for you only" onSelect={onDelete}>
        Delete conversation
      </MenuItem>
    </Menu>
  );

  return (
    <section aria-label={`Conversation with @${handle}`} className="flex min-h-0 flex-1 flex-col">
      <ThreadHeader person={conv.other} muted={conv.muted} menu={menu} />
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 max-sm:px-3">
        {messages.isPending ? (
          <div className="grid flex-1 place-items-center">
            <Spinner />
          </div>
        ) : messages.isError ? (
          <div className="grid flex-1 place-items-center py-4">
            <LoadError title="We couldn’t load these messages" onRetry={() => void messages.refetch()} retrying={messages.isRefetching} />
          </div>
        ) : (
          // mt-auto: a short conversation sits at the bottom, by the composer, as in any chat app.
          <ol className="m-0 mx-auto mt-auto flex w-full max-w-wide list-none flex-col gap-2 p-0 py-4" aria-label="Messages">
            {items.map((m, i) => (
              <Bubble key={m.id} m={m} mine={m.sender === viewerId} showTime={showTime(items, i)} />
            ))}
          </ol>
        )}
      </div>

      <div className="shrink-0 border-t border-line px-4 max-sm:px-3">
        {isRequest ? (
          <div className="py-4 text-center">
            <p className="mt-0 mb-3 text-sm text-ink-secondary">@{handle} wants to message you. They won’t know you’ve seen this until you accept.</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button loading={accept.isPending} onClick={() => accept.mutate(conv.id, { onError: (e) => toast(e.message) })}>
                Accept
              </Button>
              <Button variant="secondary" onClick={onDelete}>
                Delete
              </Button>
              <Button variant="danger" onClick={() => onBlock(true)}>
                Block
              </Button>
            </div>
          </div>
        ) : conv.blocked ? (
          <p className="m-0 py-4 text-center text-sm text-ink-secondary">You blocked @{handle}. Unblock them to send a message.</p>
        ) : (
          <>
            {iSentOnlyOne ? <p className="mt-3 mb-0 text-center text-sm text-ink-muted">If @{handle} doesn’t follow you, this is a request until they accept.</p> : null}
            <ThreadComposer conversationId={conv.id} />
          </>
        )}
      </div>
    </section>
  );
}

/** A time label when the gap from the previous message is over 15 minutes. */
function showTime(items: DmMessage[], i: number): boolean {
  if (i === 0) return true;
  const prev = items[i - 1];
  const cur = items[i];
  if (!prev || !cur) return true;
  return new Date(cur.created_at).getTime() - new Date(prev.created_at).getTime() > 15 * 60_000;
}

function Bubble({ m, mine, showTime: time }: { m: DmMessage; mine: boolean; showTime: boolean }) {
  return (
    <li className={cx('flex flex-col', mine ? 'items-end' : 'items-start')}>
      {time ? (
        <time dateTime={m.created_at} className="my-2 self-center text-xs text-ink-muted">
          {shortAge(m.created_at)}
        </time>
      ) : null}
      <p
        className={cx(
          'm-0 max-w-4/5 rounded-lg px-3 py-2 text-base whitespace-pre-line wrap-break-word',
          mine ? 'bg-brand text-on-brand' : 'bg-subtle text-ink',
        )}
      >
        {m.body}
      </p>
    </li>
  );
}

// ------------------------------------------------------------------ composers

function ComposerForm({ onSend, pending }: { onSend: (body: string, clear: () => void) => void; pending: boolean }) {
  const [body, setBody] = useState('');
  const trimmed = body.trim();
  const over = trimmed.length > DM_MAX;
  const showCount = trimmed.length >= DM_MAX - 200;
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!trimmed || over || pending) return;
    onSend(trimmed, () => setBody(''));
  };
  // Enter sends, Shift+Enter is a new line (as on X and most chat apps).
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };
  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-wide flex-col gap-1 py-3">
      <div className="flex items-end gap-2">
        <Textarea
          aria-label="Message"
          placeholder="Write a message"
          rows={body.includes('\n') ? 3 : 1}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          className="max-h-list flex-1 resize-none"
          {...(over ? { 'aria-invalid': true } : {})}
        />
        <Button type="submit" disabled={!trimmed || over} loading={pending} aria-label="Send">
          Send
        </Button>
      </div>
      <div className={cx('items-center justify-between gap-2 text-xs text-ink-muted', showCount ? 'flex' : 'hidden sm:flex')}>
        <span className="max-sm:hidden">Enter to send · Shift+Enter for new line</span>
        {showCount ? (
          <span className={cx('ml-auto font-mono tabular-nums', over && 'font-semibold text-danger')}>
            {trimmed.length} / {DM_MAX}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function ThreadComposer({ conversationId }: { conversationId: string }) {
  const { toast } = useToast();
  const send = useSendMessage(conversationId);
  return <ComposerForm pending={send.isPending} onSend={(body, clear) => send.mutate(body, { onSuccess: clear, onError: (e) => toast(e.message) })} />;
}

function FirstMessageComposer({ recipientId }: { recipientId: string }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const start = useStartConversation();
  return (
    <ComposerForm
      pending={start.isPending}
      onSend={(body, clear) =>
        start.mutate(
          { recipientId, body },
          {
            onSuccess: (id) => {
              clear();
              void navigate(`/messages/${id}`, { replace: true });
            },
            onError: (e) => toast(e.message),
          },
        )
      }
    />
  );
}
