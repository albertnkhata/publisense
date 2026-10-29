/**
 * GET /api/og?kind=post|board&key=<id|slug> — the preview image a shared link
 * shows (api/share.ts points og:image here). Draws the product's logo, name and
 * the post's title (api/_lib/ogCard.ts). Anything it can't find or draw falls
 * back to the site-wide /og.png, so a preview never shows a broken image.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from '@vercel/og';
import { OG_HEIGHT, OG_WIDTH, ogCard } from './_lib/ogCard.js';
import { cardData } from './_lib/ogData.js';
import { SITE } from './_lib/shareMeta.js';

const fallback = () => Response.redirect(`${SITE}/og.png`, 302);

let fonts: Promise<Array<{ name: string; data: ArrayBuffer; weight: 500 | 700; style: 'normal' }>> | null = null;
function loadFonts() {
  fonts ??= Promise.all(
    ([500, 700] as const).map(async (weight) => {
      const buf = await readFile(join(process.cwd(), 'api', '_fonts', `jakarta-${weight}.ttf`));
      return { name: 'Jakarta', data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, weight, style: 'normal' as const };
    }),
  );
  return fonts;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const data = await cardData(url.searchParams.get('kind') ?? '', url.searchParams.get('key') ?? '');
    if (!data) return fallback();
    const image = new ImageResponse(ogCard(data) as unknown as ConstructorParameters<typeof ImageResponse>[0], {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      fonts: await loadFonts(),
      headers: { 'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' },
    });
    // Render now, so a drawing failure falls back instead of sending a broken image.
    const body = await image.arrayBuffer();
    return new Response(body, { status: 200, headers: image.headers });
  } catch {
    return fallback();
  }
}
