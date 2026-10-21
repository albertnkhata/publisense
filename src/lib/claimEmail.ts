/**
 * The example address the claim form shows must be one the form will accept.
 *
 * The input suggested `you@${slug}.com`, while the server checks the work email
 * against the product's *website host*. For a board whose site is
 * https://wsweep.invalid the placeholder said `you@prod-wsweep.com` — type what the
 * box suggests and the answer is `domain_mismatch`, which reads like the user's
 * mistake. A hint that contradicts the rule it is hinting at is worse than no hint.
 *
 * So derive it from the same field the check reads, and fall back to the slug only
 * when there is no usable website.
 */
export function claimEmailPlaceholder(product: {
  websiteUrl?: string;
  slug: string;
}): string {
  const host = hostFromWebsite(product.websiteUrl);
  if (host) return `you@${host}`;

  const slug = (product.slug || '').trim().replace(/^@+/, '');
  return slug ? `you@${slug}.com` : 'you@company.com';
}

/** Lower-cased host, no scheme, no path, no leading www — or null if unusable. */
export function hostFromWebsite(websiteUrl: string | undefined): string | null {
  const raw = (websiteUrl || '').trim();
  if (!raw) return null;

  const withoutScheme = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const host = withoutScheme.split('/')[0].split('?')[0].split('#')[0].split('@').pop() || '';
  const cleaned = host.toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '');

  // A host needs a dot and no spaces; anything else is not a domain we can echo.
  if (!cleaned || /\s/.test(cleaned) || !cleaned.includes('.')) return null;
  return cleaned;
}
