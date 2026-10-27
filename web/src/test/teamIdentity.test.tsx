import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { publicReply } from '../api/posts';
import { PostCard } from '../posts/PostCard';
import { StatusTimeline } from '../posts/StatusTimeline';
import { TeamByline, teamLabel } from '../posts/TeamByline';
import { renderWith } from './renderApp';
import { BOARD, iso, makePost, makeReply, OTHER } from './postFixtures';

/**
 * #160 follow-up: an official reply or a team status change shows one identity
 * everywhere: the board's name, its Team badge and its logo, never the
 * teammate's personal handle.
 */
describe('team identity', () => {
  it('the byline is the board name plus the Team badge, as on the post page', () => {
    renderWith(<p data-testid="b"><TeamByline name="Cursor" /></p>);
    expect(screen.getByTestId('b').textContent).toBe('Cursor Team');
    expect(teamLabel('Cursor')).toBe('Cursor · Team');
  });

  it('the board card quotes the official reply as the board, with its logo and no handle', () => {
    const post = makePost({ official: { id: 'r1', body: 'Fixed in 2.4.', created_at: iso(1) } });
    const { container } = renderWith(<PostCard post={post} />);
    const quote = screen.getByText('Fixed in 2.4.').parentElement!;
    expect(quote.textContent).toContain('Cursor Team');
    expect(quote.textContent).not.toContain('@');
    expect(quote.textContent).not.toContain(OTHER.handle);
    expect(quote.querySelector('.bg-board')).toBeTruthy();
    expect(container.textContent).not.toContain('Cursor team ·');
  });

  it('the status timeline credits the board and its Team badge', () => {
    const post = makePost({ status: 'shipped' });
    renderWith(
      <StatusTimeline post={post} events={[{ id: 'e1', from: 'open', to: 'shipped', note: 'Live in 2.4.', actor_id: OTHER.id, at: iso(1) }]} />,
    );
    const region = screen.getByRole('region', { name: 'Status' });
    expect(region.textContent).toContain(`${BOARD.name} Team`);
    expect(region.textContent).not.toContain(OTHER.handle);
  });

  it('the api drops the teammate profile from official replies, keeps personal ones', () => {
    const post = makePost();
    const official = publicReply(makeReply(post, { is_official: true }));
    expect(official.author).toBeNull();
    expect(official.author_id).toBe(OTHER.id);
    const personal = publicReply(makeReply(post));
    expect(personal.author?.handle).toBe(OTHER.handle);
  });
});
