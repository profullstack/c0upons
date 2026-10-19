// The pit.world network footer, fetched server-side from pit.world and cached
// for an hour. It is a plain HTML fragment (a scoped <style> plus one <nav>),
// so it renders as-is. Any failure (timeout, non-200, network) renders nothing:
// the network footer must never break a page.
const SNIPPET_URL = 'https://pit.world/snippets/footer.html?site=c0upons.com';

async function loadSnippet(): Promise<string | null> {
  try {
    const res = await fetch(SNIPPET_URL, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    return html.includes('data-pit-footer') ? html : null;
  } catch {
    return null;
  }
}

export default async function PitFooter() {
  const html = await loadSnippet();
  if (!html) return null;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
