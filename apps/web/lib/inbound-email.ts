/**
 * Mail sent to coupons@profullstack.com, turned into coupons.
 *
 * Forward Email delivers the alias to a webhook (POST /api/webhooks/email) as
 * its parsed-message JSON: `from`, `subject`, `text`, `html`, `messageId`,
 * the sender's `dkim`/`spf`/`dmarc` verdicts and the rest. The alias is fed by
 * coupon-site and store newsletters Anthony subscribes it to, so a message is
 * one of three things:
 *
 *   - an offer: a code, or a sale with a discount and a link, from a store;
 *   - a double opt-in confirmation from one of those signups, whose confirm
 *     link is followed once so the subscription goes live;
 *   - anything else (welcome mail, receipts, "we miss you"), which is logged
 *     and dropped.
 *
 * WHAT GETS POSTED
 *
 * Offers come from the model (claude-haiku-4-5, structured output) when the
 * deployment has a key and the model is not refusing; otherwise from the
 * same rules the Reddit source uses (`extractCode`, `parseDiscount`). Either
 * way an offer is kept only when it is usable: its code is a plausible code
 * that appears verbatim in the mail (a model never gets to invent one), or it
 * is a code-less sale with a discount and a link. A kept offer is dropped as
 * a duplicate when the store already has that code (any source, any case), or,
 * code-less, the same title in the last 30 days. Rows land as
 * `(source 'email', source_id '<message hash>:<n>')`.
 *
 * WHAT GETS CLICKED
 *
 * Only a link in a mail whose subject or text reads as a subscription
 * confirmation, whose href or anchor text says confirm/verify/activate/opt-in,
 * that is not an unsubscribe/preferences link, and that resolves to a public
 * address. At most two per mail, GET only.
 *
 * WHAT GETS REFUSED
 *
 * Mail whose sender passed neither DKIM nor SPF (a forged "store" handing out
 * fake codes), bounces and auto-replies from mailer daemons, and anything we
 * have already processed (Forward Email retries until it sees a 200).
 *
 * Every message is logged in `inbound_emails` with its outcome. No framework
 * imports on purpose: `test/inbound-email.test.mjs` runs this under plain
 * Node/Bun against a local libSQL file with a fake model and a fake web.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { displayName, formatDiscount, upsertStore, upsertCoupon, ensureSyncSchema, type SqlDb } from './nichedb-sync.ts';
import { extractCode, isPlausibleCode, parseDiscount, slugify } from './reddit-sync.ts';

export const SOURCE = 'email';
export const MODEL = 'claude-haiku-4-5';
export const ADDRESS = 'coupons@profullstack.com';
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

/* ----------------------------- the payload ----------------------------- */

interface AddressObject {
  value?: Array<{ address?: string; name?: string }>;
  text?: string;
}

/** The parts of Forward Email's webhook JSON (a mailparser result plus session data) this reads. */
export interface InboundMail {
  from?: AddressObject;
  to?: AddressObject;
  subject?: string;
  text?: string;
  html?: string | false;
  messageId?: string;
  date?: string;
  recipients?: string[];
  headers?: Record<string, unknown>;
  dkim?: { results?: Array<{ result?: string; status?: { result?: string }; signingDomain?: string }> } | unknown;
  spf?: { status?: { result?: string }; result?: string } | unknown;
  dmarc?: { status?: { result?: string }; result?: string } | unknown;
  session?: { sender?: string; mailFrom?: string; remoteAddress?: string } & Record<string, unknown>;
}

/**
 * Forward Email signs the body with the account's "Webhook Signature Payload
 * Verification Key" as hex HMAC-SHA256 in `X-Webhook-Signature`.
 */
export function verifySignature(rawBody: string, signature: string | null, key: string | undefined): boolean {
  if (!key || !signature) return false;
  const expected = createHmac('sha256', key).update(rawBody).digest('hex');
  return safeEqual(expected, signature.trim().toLowerCase());
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function senderAddress(mail: InboundMail): string | null {
  const a = mail.from?.value?.[0]?.address ?? mail.session?.sender ?? null;
  return a ? a.toLowerCase() : null;
}

export function senderName(mail: InboundMail): string | null {
  const n = mail.from?.value?.[0]?.name?.trim();
  return n || null;
}

/** "pass" for any of the shapes mailauth hands Forward Email for a verdict. */
function passed(v: unknown): boolean {
  const seen = JSON.stringify(v ?? null);
  return /"result"\s*:\s*"pass"/i.test(seen) || /"status"\s*:\s*"pass"/i.test(seen);
}

/** DKIM or SPF passed for the sender. */
export function authenticated(mail: InboundMail): boolean {
  return passed(mail.dkim) || passed(mail.spf);
}

/** A stable id for a message: its Message-ID, else a hash of sender, date and subject. */
export function messageKey(mail: InboundMail): string {
  const id = mail.messageId?.trim() || `${senderAddress(mail)}|${mail.date}|${mail.subject}|${(mail.text ?? '').slice(0, 500)}`;
  return createHash('sha256').update(id).digest('hex').slice(0, 24);
}

/* ------------------------------ the content ----------------------------- */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', zwnj: '', zwj: '' };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k in ENTITIES) return ENTITIES[k];
    if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16));
    if (k.startsWith('#')) return String.fromCodePoint(parseInt(k.slice(1), 10));
    return m;
  });
}

export function htmlToText(html: string): string {
  return decode(
    html
      .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|td)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[­͏​-‍⁠﻿]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/** The mail's readable text: the text part when it has one worth reading, else the HTML flattened. */
export function mailText(mail: InboundMail): string {
  const text = (mail.text ?? '').trim();
  if (text.length > 80 || !mail.html) return text;
  return htmlToText(mail.html);
}

export interface MailLink {
  href: string;
  label: string;
}

/** Every http(s) link in the mail, with its anchor text, deduplicated, in order. */
export function mailLinks(mail: InboundMail): MailLink[] {
  const out: MailLink[] = [];
  const seen = new Set<string>();
  const add = (href: string, label: string) => {
    const h = decode(href).trim().replace(/[.,;:!?)\]>]+$/, '');
    if (!/^https?:\/\//i.test(h) || seen.has(h)) return;
    seen.add(h);
    out.push({ href: h, label: label.replace(/\s+/g, ' ').trim() });
  };
  if (mail.html) {
    for (const m of mail.html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      add(m[1], htmlToText(m[2]));
    }
  }
  for (const m of (mail.text ?? '').matchAll(/https?:\/\/[^\s<>"'\]]+/gi)) add(m[0], '');
  return out;
}

/* --------------------------- opt-in confirmation --------------------------- */

const CONFIRM_MAIL =
  /\b(confirm|verify|validate|activate)\b[^.\n]{0,60}\b(subscription|subscribe|e-?mail|address|sign[- ]?up|newsletter|list|opt[- ]?in)\b|\bdouble[- ]opt[- ]?in\b|\bplease confirm\b|\bconfirm (that )?you\b|\bone more step\b/i;
const CONFIRM_LINK = /\b(confirm|verify|validate|activate|opt[-_ ]?in|subscribe me|yes,? (subscribe|sign me up|i want))/i;
const CONFIRM_HREF = /(confirm|verif|validat|activat|opt[-_]?in|double[-_]?opt)/i;
const NEVER_CLICK = /(unsub|opt[-_ ]?out|remove|preferences|manage|privacy|terms|policy|view (this )?(in|on) (your )?browser|view online|report|spam|abuse|forward|not you|wasn.?t you|delete)/i;

/** Does this mail ask its recipient to confirm a subscription? */
export function isOptInConfirmation(mail: InboundMail): boolean {
  return CONFIRM_MAIL.test(`${mail.subject ?? ''}\n${mailText(mail).slice(0, 4000)}`);
}

/** The links worth following to confirm a subscription: confirm-looking, never unsubscribe-looking. */
export function confirmationLinks(mail: InboundMail): string[] {
  if (!isOptInConfirmation(mail)) return [];
  const scored = mailLinks(mail)
    .filter((l) => !NEVER_CLICK.test(l.label) && !NEVER_CLICK.test(l.href.replace(/[?#].*$/, '')))
    .map((l) => ({ l, score: (CONFIRM_LINK.test(l.label) ? 2 : 0) + (CONFIRM_HREF.test(l.href) ? 1 : 0) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 2).map((s) => s.l.href);
}

function privateV4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return privateV4(ip);
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return privateV4(v6.slice(7));
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

/** A link is clickable when it is http(s) and its host resolves only to public addresses. */
export async function isPublicUrl(url: string, resolve: (host: string) => Promise<string[]> = defaultResolve): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return false;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) return false;
  const addrs = isIP(host) ? [host] : await resolve(host).catch(() => []);
  return addrs.length > 0 && addrs.every((a) => !privateAddress(a));
}

async function defaultResolve(host: string): Promise<string[]> {
  return (await lookup(host, { all: true })).map((a) => a.address);
}

export interface ClickResult {
  url: string;
  status: number | null;
  error?: string;
}

/** GET each link once, following redirects, refusing private hosts. */
export async function clickLinks(
  links: string[],
  opts: { fetch?: typeof fetch; resolve?: (host: string) => Promise<string[]> } = {},
): Promise<ClickResult[]> {
  const doFetch = opts.fetch ?? fetch;
  const out: ClickResult[] = [];
  for (const url of links) {
    if (!(await isPublicUrl(url, opts.resolve))) {
      out.push({ url, status: null, error: 'refused: not a public http(s) address' });
      continue;
    }
    try {
      const res = await doFetch(url, {
        redirect: 'follow',
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
        signal: AbortSignal.timeout(20_000),
      });
      out.push({ url, status: res.status });
      if (res.ok) break; // one confirmed link is enough
    } catch (err) {
      out.push({ url, status: null, error: String((err as Error)?.message ?? err).slice(0, 200) });
    }
  }
  return out;
}

/* -------------------------------- offers -------------------------------- */

export interface Offer {
  store_name: string | null;
  store_website: string | null;
  code: string | null;
  title: string;
  description: string | null;
  discount_type: 'percent' | 'fixed' | null;
  discount_value: number | null;
  expiry_date: string | null;
  url: string | null;
}

export interface Extraction {
  engine: 'model' | 'rules';
  is_confirmation: boolean;
  offers: Offer[];
}

/** A model that answers one prompt with JSON matching a schema. Injected so tests need no key. */
export type JsonModel = (prompt: string, schema: object) => Promise<unknown>;

export const OFFER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_confirmation', 'offers'],
  properties: {
    is_confirmation: { type: 'boolean' },
    offers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['store_name', 'store_website', 'code', 'title', 'description', 'discount_type', 'discount_value', 'expiry_date', 'url'],
        properties: {
          store_name: { type: ['string', 'null'] },
          store_website: { type: ['string', 'null'] },
          code: { type: ['string', 'null'] },
          title: { type: 'string' },
          description: { type: ['string', 'null'] },
          discount_type: { type: ['string', 'null'], enum: ['percent', 'fixed', null] },
          discount_value: { type: ['number', 'null'] },
          expiry_date: { type: ['string', 'null'] },
          url: { type: ['string', 'null'] },
        },
      },
    },
  },
} as const;

function promptFor(mail: InboundMail, text: string, links: MailLink[]): string {
  const linkList = links
    .slice(0, 40)
    .map((l) => `- ${l.label ? `[${l.label.slice(0, 80)}] ` : ''}${l.href.slice(0, 300)}`)
    .join('\n');
  return [
    'This email arrived at a coupon-collecting inbox subscribed to store and coupon-site newsletters.',
    'Extract every concrete, currently usable shopping offer it contains, for a public coupon site.',
    'Rules:',
    '- An offer is a promo/coupon code, or a sale with an explicit discount (percent or dollar amount) at a named store.',
    '- code: copy it EXACTLY as written in the email, or null if no code is needed. Never invent or guess a code.',
    '- Skip referral programs for the sender itself, gift-card sales, loyalty points, giveaways, surveys and vague "big savings".',
    '- store_name: the store the offer is for (on a coupon-site newsletter that is the merchant, not the newsletter).',
    '- store_website: scheme + host of the store, e.g. https://bookshop.org, if you know it; else null.',
    '- url: the link in the email that leads to the offer (from the list below), or null.',
    '- title: short, e.g. "25% off sitewide with code BBW26". description: one or two sentences of terms.',
    '- expiry_date: YYYY-MM-DD if the email states an end date, else null.',
    '- is_confirmation: true only if the email asks to confirm/verify a newsletter or list subscription.',
    'Return {"is_confirmation": ..., "offers": []} when there is nothing usable.',
    '',
    `From: ${mail.from?.text ?? senderAddress(mail) ?? ''}`,
    `Date: ${mail.date ?? ''}`,
    `Subject: ${mail.subject ?? ''}`,
    '',
    text.slice(0, 12_000),
    '',
    'Links:',
    linkList,
  ].join('\n');
}

/** The registrable-looking part of a host: "e.bookshop.org" -> "bookshop.org". */
export function siteHost(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, '').split('.');
  const twoPartTld = parts.length > 2 && /^(co|com|org|net|ac|gov)\.[a-z]{2}$/.test(parts.slice(-2).join('.'));
  return parts.slice(twoPartTld ? -3 : -2).join('.');
}

/** The store a mail is from, by sender name and domain: "Bookshop.org <news@e.bookshop.org>". */
export function storeFromSender(mail: InboundMail): { name: string; website: string } | null {
  const addr = senderAddress(mail);
  const domain = addr?.split('@')[1];
  if (!domain) return null;
  const site = siteHost(domain);
  const label = site.split('.')[0];
  const raw = senderName(mail)?.replace(/\b(team|news|newsletter|deals|offers|no-?reply|support|from|at|the)\b/gi, ' ').replace(/[^\w\s.&'-]/g, ' ').replace(/\s+/g, ' ').trim();
  const name = raw && raw.length >= 2 && raw.length <= 40 ? raw : label;
  return { name, website: `https://${site}` };
}

/** Rules-only extraction: one offer at most, the way the Reddit source reads a post. */
export function extractByRules(mail: InboundMail): Extraction {
  const text = mailText(mail);
  const subject = mail.subject ?? '';
  const code = extractCode(subject, text);
  const discount = parseDiscount(subject, text);
  const store = storeFromSender(mail);
  const links = mailLinks(mail).filter((l) => !NEVER_CLICK.test(l.label) && !NEVER_CLICK.test(l.href));
  const site = store ? siteHost(new URL(store.website).hostname) : null;
  const url = links.find((l) => site && hostOfUrl(l.href)?.endsWith(site))?.href ?? links[0]?.href ?? null;
  const offers: Offer[] = [];
  if (store && (code || discount.value != null)) {
    offers.push({
      store_name: store.name,
      store_website: store.website,
      code,
      title: subject.slice(0, 200) || `${store.name} offer`,
      description: text.slice(0, 400) || null,
      discount_type: discount.type,
      discount_value: discount.value,
      expiry_date: null,
      url,
    });
  }
  return { engine: 'rules', is_confirmation: isOptInConfirmation(mail), offers };
}

function hostOfUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function clean(s: unknown, max: number): string | null {
  if (typeof s !== 'string') return null;
  const t = s.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

/** Normalise whatever the model said into Offers, with nothing it could have made up. */
export function normaliseOffers(raw: unknown, mail: InboundMail): Offer[] {
  const list = (raw as { offers?: unknown[] })?.offers;
  if (!Array.isArray(list)) return [];
  const haystack = `${mail.subject ?? ''}\n${mail.text ?? ''}\n${mailText(mail)}\n${mail.html || ''}`;
  const sender = storeFromSender(mail);
  const out: Offer[] = [];
  for (const o of list.slice(0, 10) as Array<Record<string, unknown>>) {
    const title = clean(o.title, 200);
    if (!title) continue;
    let code = clean(o.code, 40);
    if (code && (!isPlausibleCode(code) || !haystack.includes(code))) code = null;
    const type = o.discount_type === 'percent' || o.discount_type === 'fixed' ? o.discount_type : null;
    const value = typeof o.discount_value === 'number' && Number.isFinite(o.discount_value) && o.discount_value > 0 ? o.discount_value : null;
    let website = clean(o.store_website, 200);
    if (website) {
      try {
        website = `https://${siteHost(new URL(/^https?:/i.test(website) ? website : `https://${website}`).hostname)}`;
      } catch {
        website = null;
      }
    }
    const url = clean(o.url, 1000);
    const expiry = clean(o.expiry_date, 10);
    out.push({
      store_name: clean(o.store_name, 60) ?? sender?.name ?? null,
      store_website: website ?? (o.store_name ? null : sender?.website ?? null),
      code,
      title,
      description: clean(o.description, 1000),
      discount_type: value == null ? null : type,
      discount_value: type ? value : null,
      expiry_date: expiry && /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? expiry : null,
      url: url && /^https?:\/\//i.test(url) ? url : null,
    });
  }
  return out;
}

/** A code, or a sale with a discount and somewhere to use it, at a named store. */
export function usable(o: Offer): boolean {
  if (!o.store_name) return false;
  if (o.code) return true;
  return o.discount_value != null && !!o.url;
}

export async function extractOffers(mail: InboundMail, model: JsonModel | null): Promise<Extraction> {
  if (model) {
    try {
      const raw = await model(promptFor(mail, mailText(mail), mailLinks(mail)), OFFER_SCHEMA);
      return {
        engine: 'model',
        is_confirmation: Boolean((raw as { is_confirmation?: unknown })?.is_confirmation),
        offers: normaliseOffers(raw, mail),
      };
    } catch (err) {
      console.error('inbound email: model failed, falling back to rules:', (err as Error)?.message ?? err);
    }
  }
  return extractByRules(mail);
}

/* ------------------------------- storage -------------------------------- */

export async function ensureInboundSchema(db: SqlDb): Promise<void> {
  await ensureSyncSchema(db);
  await db.sql`
    CREATE TABLE IF NOT EXISTS inbound_emails (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      message_key TEXT NOT NULL UNIQUE,
      message_id  TEXT,
      from_addr   TEXT,
      subject     TEXT,
      received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      outcome     TEXT NOT NULL,
      engine      TEXT,
      detail      TEXT
    )
  `;
}

/** "bookshop-org", "bookshop" and "bookshop-com" are one store. */
function storeKey(slug: string): string {
  return slug.replace(/-(com|org|net|co|io|shop|store|us|uk)$/, '');
}

/**
 * Same code (any case, any source) at what is the same store by slug or by
 * website, or the same code-less title at the store within 30 days.
 */
async function isDuplicate(db: SqlDb, slug: string, o: Offer): Promise<boolean> {
  if (o.code) {
    const rows = await db.sql`
      SELECT s.slug, s.website FROM coupons c JOIN stores s ON s.id = c.store_id
      WHERE UPPER(c.code) = ${o.code.toUpperCase()} LIMIT 200
    `;
    const site = o.store_website ? hostOfUrl(o.store_website) : null;
    return (rows as Array<{ slug: string; website: string | null }>).some(
      (r) =>
        storeKey(r.slug) === storeKey(slug) ||
        (!!site && !!r.website && siteHost(hostOfUrl(r.website) ?? '') === siteHost(site)),
    );
  }
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const rows = await db.sql`
    SELECT c.id FROM coupons c JOIN stores s ON s.id = c.store_id
    WHERE s.slug = ${slug} AND c.code IS NULL AND LOWER(c.title) = ${o.title.toLowerCase()} AND c.created_at >= ${since} LIMIT 1
  `;
  return rows.length > 0;
}

export type Outcome =
  | 'posted'
  | 'duplicate'
  | 'confirmed'
  | 'confirm-failed'
  | 'no-offer'
  | 'unauthenticated'
  | 'ignored'
  | 'already-processed'
  | 'error';

export interface InboundResult {
  ok: true;
  outcome: Outcome;
  message_key: string;
  engine?: Extraction['engine'];
  posted: Array<{ store: string; code: string | null; title: string }>;
  duplicates: Array<{ store: string; code: string | null }>;
  skipped: Array<{ title: string; reason: string }>;
  clicked: ClickResult[];
}

export interface InboundDeps {
  model?: JsonModel | null;
  fetch?: typeof fetch;
  resolve?: (host: string) => Promise<string[]>;
}

const DAEMON = /^(mailer-daemon|postmaster|no-?reply-?bounce|bounce[s]?)@/i;

async function log(db: SqlDb, key: string, mail: InboundMail, outcome: Outcome, engine: string | null, detail: unknown) {
  await db.sql`
    INSERT INTO inbound_emails (message_key, message_id, from_addr, subject, outcome, engine, detail)
    VALUES (${key}, ${mail.messageId ?? null}, ${senderAddress(mail)}, ${(mail.subject ?? '').slice(0, 500)},
            ${outcome}, ${engine}, ${JSON.stringify(detail).slice(0, 20_000)})
    ON CONFLICT(message_key) DO UPDATE SET outcome = excluded.outcome, engine = excluded.engine, detail = excluded.detail
  `;
}

/** One delivered message, end to end: refuse, confirm, extract, dedupe, post, log. */
export async function handleInboundEmail(db: SqlDb, mail: InboundMail, deps: InboundDeps = {}): Promise<InboundResult> {
  await ensureInboundSchema(db);
  const key = messageKey(mail);
  const result: InboundResult = { ok: true, outcome: 'no-offer', message_key: key, posted: [], duplicates: [], skipped: [], clicked: [] };

  const prior = await db.sql`SELECT outcome FROM inbound_emails WHERE message_key = ${key} LIMIT 1`;
  if (prior.length && prior[0].outcome !== 'error') {
    return { ...result, outcome: 'already-processed' };
  }

  const from = senderAddress(mail) ?? '';
  if (DAEMON.test(from) || /auto-?(reply|submitted)|out of (the )?office/i.test(mail.subject ?? '')) {
    result.outcome = 'ignored';
    await log(db, key, mail, result.outcome, null, { reason: 'bounce or auto-reply' });
    return result;
  }
  if (!authenticated(mail)) {
    result.outcome = 'unauthenticated';
    await log(db, key, mail, result.outcome, null, { reason: 'neither DKIM nor SPF passed', dkim: mail.dkim ?? null, spf: mail.spf ?? null });
    return result;
  }

  try {
    // Confirmation first: a confirm mail never carries a coupon worth posting,
    // and the click must only ever happen for one.
    const confirmLinks = confirmationLinks(mail);
    if (confirmLinks.length) {
      result.clicked = await clickLinks(confirmLinks, deps);
      result.outcome = result.clicked.some((c) => c.status != null && c.status < 400) ? 'confirmed' : 'confirm-failed';
      await log(db, key, mail, result.outcome, null, { clicked: result.clicked });
      return result;
    }

    const extraction = await extractOffers(mail, deps.model ?? null);
    result.engine = extraction.engine;
    for (const o of extraction.offers) {
      if (!usable(o)) {
        result.skipped.push({ title: o.title, reason: o.store_name ? 'no code, and no discount with a link' : 'no store' });
        continue;
      }
      const name = o.store_name!;
      const slug = slugify(name);
      if (!slug) {
        result.skipped.push({ title: o.title, reason: 'store name has no slug' });
        continue;
      }
      if (await isDuplicate(db, slug, o)) {
        result.duplicates.push({ store: name, code: o.code });
        continue;
      }
      const site = o.store_website ? new URL(o.store_website).hostname : null;
      const storeId = await upsertStore(db, {
        name: displayName(name, slug),
        slug,
        website: o.store_website,
        logo_url: site ? `https://www.google.com/s2/favicons?domain=${site}&sz=128` : null,
      });
      await upsertCoupon(db, storeId, {
        store: { name, slug, website: o.store_website, logo_url: null },
        source: SOURCE,
        source_id: `${key}:${result.posted.length}`,
        code: o.code,
        title: o.title,
        description: o.description,
        discount: formatDiscount(o.discount_type, o.discount_value),
        discount_type: o.discount_type,
        discount_value: o.discount_value,
        expiry_date: o.expiry_date,
        url: o.url,
        image_url: null,
        created_at: null,
      });
      result.posted.push({ store: name, code: o.code, title: o.title });
    }
    result.outcome = result.posted.length ? 'posted' : result.duplicates.length ? 'duplicate' : 'no-offer';
    await log(db, key, mail, result.outcome, extraction.engine, {
      posted: result.posted,
      duplicates: result.duplicates,
      skipped: result.skipped,
      model_said_confirmation: extraction.is_confirmation,
    });
    return result;
  } catch (err) {
    result.outcome = 'error';
    await log(db, key, mail, 'error', result.engine ?? null, { error: String((err as Error)?.message ?? err).slice(0, 1000) });
    throw err;
  }
}

export async function recentInbound(db: SqlDb, limit = 50) {
  await ensureInboundSchema(db);
  const n = Math.max(1, Math.min(500, Math.floor(limit) || 50));
  return db.sql`
    SELECT id, message_id, from_addr, subject, received_at, outcome, engine, detail
    FROM inbound_emails ORDER BY id DESC LIMIT ${n}
  `;
}
