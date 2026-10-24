-- Publisense v2: seed data. Idempotent: safe to re-run, never overwrites edits.
--
-- 1. Shared domains that can never prove a company.
-- 2. The mockup's boards and its one hub (Figma). Every board starts UNCLAIMED: the
--    mockup's "team" flags were demo state, and v2 never shows a team that has not
--    verified a domain.
-- 3. Platform admins: the owner's accounts, by verified email, when they exist.
--    platform_admin has no client write path at all, so this is the only way in.
--
-- No posts are seeded here. Production content is decided at cutover (D-011); local
-- sample posts live in supabase/tests/v2_seed_dev.sql and are never applied to prod.

insert into public.shared_domain (domain) values
  ('gmail.com'), ('googlemail.com'), ('outlook.com'), ('hotmail.com'), ('live.com'), ('msn.com'),
  ('yahoo.com'), ('icloud.com'), ('me.com'), ('mac.com'), ('aol.com'), ('proton.me'),
  ('protonmail.com'), ('gmx.com'), ('gmx.net'), ('yandex.com'), ('zoho.com'), ('mail.com'),
  ('fastmail.com'), ('hey.com'), ('tutanota.com'),
  ('vercel.app'), ('netlify.app'), ('github.io'), ('pages.dev'), ('workers.dev'), ('herokuapp.com'),
  ('fly.dev'), ('onrender.com'), ('web.app'), ('firebaseapp.com'), ('supabase.co'), ('replit.app'),
  ('glitch.me'), ('azurewebsites.net'), ('cloudfront.net'), ('appspot.com'), ('wordpress.com'),
  ('blogspot.com'), ('substack.com'), ('notion.site'), ('framer.website'), ('webflow.io'), ('wixsite.com')
on conflict do nothing;

insert into public.hub (slug, name, description, primary_domain) values
  ('figma', 'Figma', 'Figma, FigJam and Figma Slides in one place', 'figma.com')
on conflict (slug) do nothing;

insert into public.board (slug, name, tagline, site, color, category, hub_id)
select v.slug, v.name, v.tagline, v.site, v.color, v.category,
       (select id from public.hub where slug = v.hub)
  from (values
    ('cursor',         'Cursor',         'The AI code editor',                      'cursor.com',                  '#18181B', 'code',    null),
    ('claude',         'Claude',         'AI assistant by Anthropic',               'claude.ai',                   '#C96442', 'ai',      null),
    ('supabase',       'Supabase',       'Postgres development platform',           'supabase.com',                '#1F9D6B', 'dev',     null),
    ('linear',         'Linear',         'Issue tracking and product planning',     'linear.app',                  '#5E6AD2', 'prod',    null),
    ('raycast',        'Raycast',        'Launcher and productivity tools for Mac', 'raycast.com',                 '#E5484D', 'prod',    null),
    ('figma',          'Figma',          'Collaborative interface design',          'figma.com',                   '#7B61FF', 'design',  'figma'),
    ('figjam',         'FigJam',         'Online whiteboard for teams',             'figma.com/figjam',            '#F24E1E', 'design',  'figma'),
    ('figma-slides',   'Figma Slides',   'Presentations built in Figma',            'figma.com/slides',            '#FF9F0A', 'design',  'figma'),
    ('github-copilot', 'GitHub Copilot', 'AI pair programmer',                      'github.com/features/copilot', '#24292F', 'code',    null),
    ('vercel',         'Vercel',         'Frontend cloud platform',                 'vercel.com',                  '#000000', 'dev',     null),
    ('notion',         'Notion',         'Docs, wikis and projects',                'notion.so',                   '#37352F', 'prod',    null),
    ('windsurf',       'Windsurf',       'Agentic IDE',                             'windsurf.com',                '#0B7A75', 'code',    null),
    ('chatgpt',        'ChatGPT',        'AI assistant by OpenAI',                  'chatgpt.com',                 '#10A37F', 'ai',      null),
    ('arc',            'Arc',            'Browser by The Browser Company',          'arc.net',                     '#FF5F57', 'browser', null)
  ) as v (slug, name, tagline, site, color, category, hub)
on conflict (slug) do nothing;

insert into public.platform_admin (user_id)
select p.id
  from public.profile p
  join auth.users u on u.id = p.id
 where lower(u.email) in ('albertnkhata.s@gmail.com', 'albertnkhata@hotmail.com')
on conflict do nothing;
