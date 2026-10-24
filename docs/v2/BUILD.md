# Publisense v2: build checklist

One PR per step; see [FOUNDATION.md](./FOUNDATION.md) section 11.

- [ ] 1. Foundation: spec and reference mockup
- [ ] 2. Scaffold: app, locked Tailwind theme, primitives and kit page, AppShell, routes, style gates in CI
- [ ] 3. Schema v2: additive tables, RLS, Storage, platform admin, seed
- [ ] 4. Auth and account: sign in/up, reset, password, notification preferences, unsubscribe, export, delete (Edge Function)
- [ ] 5. Feed and posts: feed, PostCard, PostPage, votes, replies, author edit/delete
- [ ] 6. Boards, hubs and discovery: board page, Roadmap, Changelog, hub page, Explore, search, composer
- [ ] 7. Claiming and teams: claim, hub claim, Manage inbox, team, join requests, disputes
- [ ] 8. Moderation: merge and unmerge, reports queue, hide, block, admin queues
- [ ] 9. Cutover: smoke tests, pg_dump, drop v1, deploy
