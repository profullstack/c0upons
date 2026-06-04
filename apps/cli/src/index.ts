#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import 'dotenv/config';

const BASE_URL = process.env.C0UPONS_API_URL ?? 'https://c0upons.com';

const program = new Command();

program
  .name('c0upons')
  .description('Search, submit, and manage coupon codes from the terminal')
  .version('0.1.0');

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
