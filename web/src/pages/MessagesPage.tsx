import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
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
import { useAuthDialog } from '../shell/auth';
import { Button, EmptyState, Icon, IconButton, Menu, MenuItem, MenuSeparator, Spinner, Tabs, Textarea, UserAvatar, useToast } from '../ui';
import { NotFound } from './NotFound';

/*
 * Direct messages (0058, X's model). /messages lists conversations in two tabs,
 * Inbox and Requests. /messages/:id is one conversation; a request shows Accept,
 * Delete and Block above the composer, and the sender sees that they can send more
 * once it is accepted. /messages/to/:handle opens the conversation with that person,
 * or an empty one whose first send starts it.
 *
 * Step 2: staff only (useMessagesEnabled). Updates poll; Realtime comes in step 3.
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

export function MessagesPage() {
  usePageTitle('Messages');
  const { viewer, ready, enabled } = useGate();
  if (ready && viewer && !enabled) return <NotFound />;
  return (
    <section aria-labelledby="page-title">
      <h1 id="page-title" className="mt-0 mb-2 text-2xl font-bold text-ink">
        Messages
      </h1>
      {!viewer ? ready ? <SignedOut /> : null : enabled ? <ConversationList viewerId={viewer.id} /> : null}
    </section>
  );
}

function ConversationList({ viewerId }: { viewerId: string }) {
  const list = useConversations(viewerId);
  const [tab, setTab] = useState<Tab>('inbox');
  const all = list.data ?? [];
  const inbox = all.filter((c) => c.state === 'inbox');
  const requests = all.filter((c) => c.state === 'request');
  const shown = tab === 'inbox' ? inbox : requests;
  const unreadInbox = inbox.filter((c) => c.unread > 0).length;

  return (
    <>
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
      <div className="mt-4">
        {list.isPending ? (
          <div className="grid place-items-center py-8">
            <Spinner />
          </div>
        ) : list.isError ? (
          <p role="alert" className="text-sm text-danger">
            We couldn’t load your messages. Try again.
          </p>
        ) : shown.length === 0 ? (
          <div className="rounded-md border border-line bg-card">
            {tab === 'inbox' ? (
              <EmptyState icon="mail" title="No messages yet">
                Open someone’s profile and tap Message to start a conversation.
              </EmptyState>
            ) : (
              <EmptyState icon="mail" title="No message requests">
                Messages from people you don’t follow wait here until you accept them.
              </EmptyState>
            )}
          </div>
        ) : (
          <>
            {tab === 'requests' ? (
              <p className="mt-0 mb-3 text-sm text-ink-muted">They won’t know you’ve seen their message until you accept.</p>
            ) : null}
            <ul className="m-0 list-none overflow-hidden rounded-md border border-line bg-card p-0" aria-label={tab === 'inbox' ? 'Inbox' : 'Requests'}>
              {shown.map((c) => (
                <li key={c.id} className="border-t border-line first:border-t-0">
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
    <Link
      to={`/messages/${c.id}`}
      className={cx('relative flex items-center gap-3 py-3 pr-4 pl-5 text-ink no-underline transition-colors duration-120 hover:bg-subtle', unread && 'bg-brand-soft')}
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
      {c.muted ? <span className="sr-only">Muted</span> : null}
      {unread ? <span className="sr-only">{c.unread === 1 ? '1 unread message' : `${c.unread} unread messages`}</span> : null}
    </Link>
  );
}

// ------------------------------------------------------------------ thread

export function ConversationPage() {
  const { id } = useParams();
  const { viewer, ready, enabled } = useGate();
  const list = useConversations(viewer?.id ?? null, enabled);
  const conv = useMemo(() => (list.data ?? []).find((c) => c.id === id) ?? null, [list.data, id]);
  usePageTitle(conv ? conv.other.name || `@${conv.other.handle}` : 'Messages');
  if (ready && viewer && !enabled) return <NotFound />;
  if (ready && !viewer) return <SignedOut />;
  if (!viewer || list.isPending) return null;
  if (!conv) return <NotFound />;
  return <Thread conv={conv} viewerId={viewer.id} />;
}

/** /messages/to/:handle: the existing conversation with that person, or a new one. */
export function NewConversationPage() {
  const { handle } = useParams();
  const { viewer, ready, enabled } = useGate();
  const person = usePerson(handle);
  const list = useConversations(viewer?.id ?? null, enabled);
  usePageTitle('New message');
  if (ready && viewer && !enabled) return <NotFound />;
  if (ready && !viewer) return <SignedOut />;
  if (!viewer || person.isPending || list.isPending) return null;
  const p = person.data;
  if (!p || p.id === viewer.id) return <NotFound />;
  const existing = (list.data ?? []).find((c) => c.other.id === p.id);
  if (existing) return <Navigate to={`/messages/${existing.id}`} replace />;
  return (
    <section aria-label={`New message to ${p.name || `@${p.handle}`}`} className="flex flex-col">
      <ThreadHeader person={p} />
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <UserAvatar size="2xl" name={p.name || p.handle} src={avatarSrc(p)} />
        <p className="m-0 text-lg font-bold text-ink">{p.name || `@${p.handle}`}</p>
        <p className="m-0 text-sm text-ink-muted">If @{p.handle} doesn’t follow you, your message arrives as a request.</p>
      </div>
      <FirstMessageComposer recipientId={p.id} />
    </section>
  );
}

function ThreadHeader({ person, menu }: { person: PersonRef; menu?: ReactNode }) {
  const name = person.name || `@${person.handle}`;
  return (
    <header className="sticky top-0 z-10 -mx-1 mb-2 flex items-center gap-3 border-b border-line bg-page px-1 py-2">
      <Link to="/messages" aria-label="Back to messages" className="grid size-7 place-items-center rounded-md text-ink-secondary no-underline hover:bg-subtle hover:text-ink">
        <Icon name="arrow-left" size={18} />
      </Link>
      <Link to={`/u/${person.handle}`} className="flex min-w-0 flex-1 items-center gap-2 text-ink no-underline">
        <UserAvatar size="md" name={name} src={avatarSrc(person)} />
        <span className="flex min-w-0 flex-col">
          <h1 className="m-0 truncate text-md font-bold">{name}</h1>
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
  const endRef = useRef<HTMLDivElement>(null);
  const items = messages.data ?? [];
  const lastId = items.at(-1)?.id;
  const isRequest = conv.state === 'request';
  const iSentOnlyOne = !isRequest && items.length > 0 && items.every((m) => m.sender === viewerId);

  // Reading a conversation marks it read; a request is not marked (they won't know you saw it).
  const markReadMutate = markRead.mutate;
  useEffect(() => {
    if (!isRequest && conv.unread > 0) markReadMutate(conv.id);
  }, [conv.id, conv.unread, isRequest, lastId, markReadMutate]);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [lastId]);

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
    <section aria-label={`Conversation with @${handle}`} className="flex flex-col">
      <ThreadHeader person={conv.other} menu={menu} />
      {messages.isPending ? (
        <div className="grid place-items-center py-8">
          <Spinner />
        </div>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-2 p-0 pb-4" aria-label="Messages">
          {items.map((m, i) => (
            <Bubble key={m.id} m={m} mine={m.sender === viewerId} showTime={showTime(items, i)} />
          ))}
        </ol>
      )}
      <div ref={endRef} />

      {isRequest ? (
        <div className="rounded-md border border-line bg-card p-4 text-center">
          <p className="mt-0 mb-3 text-sm text-ink-secondary">
            @{handle} wants to message you. They won’t know you’ve seen this until you accept.
          </p>
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
        <p className="m-0 rounded-md border border-line bg-card p-4 text-center text-sm text-ink-secondary">
          You blocked @{handle}. Unblock them to send a message.
        </p>
      ) : (
        <>
          {iSentOnlyOne ? <p className="mt-0 mb-2 text-center text-sm text-ink-muted">If @{handle} doesn’t follow you, this is a request until they accept.</p> : null}
          <ThreadComposer conversationId={conv.id} />
        </>
      )}
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
      {time ? <span className="my-2 self-center text-xs text-ink-muted">{shortAge(m.created_at)}</span> : null}
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
    <form onSubmit={submit} className="sticky bottom-0 flex items-end gap-2 border-t border-line bg-page py-3 max-sm:bottom-tabbar">
      <Textarea
        aria-label="Message"
        placeholder="Write a message"
        rows={1}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKeyDown}
        className="max-h-list flex-1 resize-none"
        {...(over ? { 'aria-invalid': true } : {})}
      />
      <Button type="submit" disabled={!trimmed || over} loading={pending} aria-label="Send">
        Send
      </Button>
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
