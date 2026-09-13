#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import 'dotenv/config';

// Read the version rather than repeating it. A literal here is a second source
// of truth that nothing checks, and it had already drifted: package.json said
// 0.1.0 while the shipped CLI was on 1.2.0. Resolved relative to this module,
// so it works from src/ under tsx and from dist/ after a build.
const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
) as { version: string };

const BASE_URL = process.env.C0UPONS_API_URL ?? 'https://c0upons.com';

const program = new Command();

program
  .name('c0upons')
  .description('Search, submit, and manage coupon codes from the terminal')
  .version(version);

program
  .command('search <query>')
  .description('Search for coupons by store or keyword')
  .action(async (query: string) => {
    const spinner = ora(`Searching for "${query}"...`).start();
    try {
      const res = await fetch(`${BASE_URL}/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      spinner.stop();

      if (!data.length) {
        console.log(chalk.yellow('No coupons found.'));
        return;
      }

      data.forEach((c: Record<string, unknown>) => {
        console.log(
          chalk.green(`[${c.discount ?? 'DEAL'}]`) +
          ` ${chalk.bold(String(c.title))} — ${chalk.cyan(String(c.store_name))}` +
          (c.code ? chalk.gray(` | Code: ${chalk.white(String(c.code))}`) : '')
        );
      });
    } catch {
      spinner.fail('Search failed. Check your connection.');
    }
  });

program
  .command('top')
  .description('List top trending coupons')
  .option('-n, --limit <n>', 'Number of results', '10')
  .action(async (opts: { limit: string }) => {
    const spinner = ora('Fetching top coupons...').start();
    try {
      const res = await fetch(`${BASE_URL}/api/coupons?limit=${opts.limit}`);
      const data = await res.json();
      spinner.stop();

      if (!data.length) {
        console.log(chalk.yellow('No coupons yet.'));
        return;
      }

      data.forEach((c: Record<string, unknown>, i: number) => {
        console.log(
          chalk.gray(`${i + 1}.`) +
          ` ${chalk.bold(String(c.title))} — ${chalk.cyan(String(c.store_name))}` +
          (c.discount ? chalk.green(` ${String(c.discount)}`) : '') +
          (c.code ? chalk.gray(` [${String(c.code)}]`) : '')
        );
      });
    } catch {
      spinner.fail('Failed to fetch coupons.');
    }
  });

program
  .command('stores')
  .description('List all stores')
  .action(async () => {
    const spinner = ora('Fetching stores...').start();
    try {
      const res = await fetch(`${BASE_URL}/api/stores`);
      const data = await res.json();
      spinner.stop();

      data.forEach((s: Record<string, unknown>) => {
        console.log(chalk.bold(String(s.name)) + chalk.gray(` — ${s.coupon_count} coupons`));
      });
    } catch {
      spinner.fail('Failed to fetch stores.');
    }
  });

program
  .command('reveal <id>')
  .description('Read a coupon\'s deal page with a browser to find its hidden code')
  .action(async (id: string) => {
    const spinner = ora(`Reading the deal page for coupon ${id}...`).start();
    try {
      const res = await fetch(`${BASE_URL}/api/coupons/${encodeURIComponent(id)}/reveal`, { method: 'POST' });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        spinner.fail(String(data.error ?? res.statusText));
        return;
      }
      if (data.code) {
        spinner.succeed(`Code: ${chalk.white.bold(String(data.code))}` + (data.engine ? chalk.gray(` (${String(data.engine)})`) : ''));
      } else {
        spinner.info(chalk.yellow('No code on the page.') + (data.notes ? chalk.gray(` ${String(data.notes)}`) : ''));
      }
    } catch {
      spinner.fail('Failed to reach c0upons.');
    }
  });

program
  .command('sync')
  .description('Pull the next deals from nichedb.dev and read the pages of coupons without a code')
  .option('--reveal-only', 'Skip the nichedb pull and only reveal codes')
  .option('--sync-only', 'Only pull from nichedb, do not reveal codes')
  .action(async (opts: { revealOnly?: boolean; syncOnly?: boolean }) => {
    if (!opts.revealOnly) {
      const spinner = ora('Pulling deals from nichedb.dev...').start();
      try {
        const res = await fetch(`${BASE_URL}/api/sync/nichedb`, { method: 'POST' });
        const data = (await res.json()) as Record<string, unknown>;
        if (!res.ok) spinner.fail(String(data.error ?? res.statusText));
        else if (data.skipped) spinner.info(chalk.gray('Synced recently; skipped.'));
        else spinner.succeed(`${String(data.upserted)} coupons across ${String(data.stores)} stores from ${String(data.fetched)} deals`);
      } catch {
        spinner.fail('Failed to reach c0upons.');
      }
    }
    if (!opts.syncOnly) {
      const spinner = ora('Reading deal pages for coupons without a code...').start();
      try {
        const res = await fetch(`${BASE_URL}/api/sync/reveal`, { method: 'POST' });
        const data = (await res.json()) as { error?: string; checked?: { id: number; code: string | null }[]; found?: number; remaining?: number };
        if (!res.ok) spinner.fail(String(data.error ?? res.statusText));
        else {
          spinner.succeed(`Read ${data.checked?.length ?? 0} page(s), found ${data.found ?? 0} code(s), ${data.remaining ?? 0} left`);
          for (const c of data.checked ?? []) console.log(chalk.gray(`  #${c.id}`), c.code ? chalk.white.bold(c.code) : chalk.gray('no code'));
        }
      } catch {
        spinner.fail('Failed to reach c0upons.');
      }
    }
  });

program
  .command('submit')
  .description('Submit a new coupon')
  .requiredOption('--store-id <id>', 'Store ID')
  .requiredOption('--title <title>', 'Coupon title')
  .option('--code <code>', 'Coupon code')
  .option('--discount <discount>', 'Discount amount (e.g. "20% OFF")')
  .option('--description <desc>', 'Description')
  .option('--expiry <date>', 'Expiry date (YYYY-MM-DD)')
  .option('--url <url>', 'Deal URL')
  .action(async (opts: Record<string, string>) => {
    const spinner = ora('Submitting coupon...').start();
    try {
      const res = await fetch(`${BASE_URL}/api/coupons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: parseInt(opts.storeId),
          title: opts.title,
          code: opts.code,
          discount: opts.discount,
          description: opts.description,
          expiry_date: opts.expiry,
          url: opts.url,
        }),
      });
      if (res.ok) {
        spinner.succeed(chalk.green('Coupon submitted!'));
      } else {
        spinner.fail(`Failed: ${res.statusText}`);
      }
    } catch {
      spinner.fail('Failed to submit coupon.');
    }
  });

program.parse();
