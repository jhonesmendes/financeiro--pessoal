// actual-client.js — singleton wrapper around @actual-app/api used by the
// WhatsApp bot to read categories/accounts and write transactions directly
// into the user's real budget (no separate database).
import fs from 'node:fs';
import path from 'node:path';

import * as api from '@actual-app/api';

import { getAccountDb } from '#account-db';
import { config } from '#load-config';
import { SecretName, secretsService } from '#services/secrets-service';

let initialized = false;
let budgetLoaded = null; // syncId of the currently loaded budget, or null

function getConfig() {
  const accountDb = getAccountDb();
  const row = accountDb.first(
    "SELECT value FROM server_prefs WHERE key = 'whatsapp_syncId'",
  );
  const syncId = row?.value || null;
  const accountIdRow = accountDb.first(
    "SELECT value FROM server_prefs WHERE key = 'whatsapp_accountId'",
  );
  const accountId = accountIdRow?.value || null;

  return {
    syncId,
    accountId,
    actualPassword: secretsService.get(SecretName.whatsapp_actualPassword),
    budgetPassword: secretsService.get(SecretName.whatsapp_budgetPassword),
  };
}

export function isConfigured() {
  const { syncId, accountId, actualPassword } = getConfig();
  return Boolean(syncId && accountId && actualPassword);
}

export function getSelectedAccountId() {
  return getConfig().accountId;
}

async function ensureBudgetLoaded() {
  const { syncId, actualPassword, budgetPassword } = getConfig();
  if (!syncId || !actualPassword) {
    throw new Error('whatsapp-not-configured');
  }

  if (!initialized) {
    const dataDir = path.join(config.get('serverFiles'), 'whatsapp-budget-cache');
    fs.mkdirSync(dataDir, { recursive: true });
    await api.init({
      dataDir,
      serverURL: `http://127.0.0.1:${config.get('port')}`,
      password: actualPassword,
    });
    initialized = true;
  }

  if (budgetLoaded !== syncId) {
    await api.downloadBudget(syncId, {
      password: budgetPassword || undefined,
    });
    budgetLoaded = syncId;
  }
}

export async function getCategories() {
  await ensureBudgetLoaded();
  const [categories, groups] = await Promise.all([
    api.getCategories(),
    api.getCategoryGroups(),
  ]);
  const groupById = new Map(groups.map(g => [g.id, g]));

  return categories.map(c => ({
    id: c.id,
    name: c.name,
    is_income: c.is_income,
    group_name: groupById.get(c.group_id)?.name || '',
  }));
}

export async function getAccounts() {
  await ensureBudgetLoaded();
  return api.getAccounts();
}

export async function addTransaction({
  amount,
  description,
  type,
  date,
  categoryId,
  rawMessage,
}) {
  await ensureBudgetLoaded();
  const { accountId } = getConfig();
  if (!accountId) {
    throw new Error('whatsapp-no-account-configured');
  }

  const signedCents = Math.round(Math.abs(amount) * 100) * (type === 'income' ? 1 : -1);

  const [result] = await api.addTransactions(
    accountId,
    [
      {
        date: date || new Date().toISOString().slice(0, 10),
        amount: signedCents,
        payee_name: description || 'Lançamento',
        category: categoryId || null,
        notes: rawMessage,
        imported_id: `whatsapp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
    ],
    { learnCategories: false },
  );

  return {
    amount: signedCents / 100,
    date: date || new Date().toISOString().slice(0, 10),
    description,
    id: result?.transaction?.id,
  };
}

export async function getMonthSummary(month) {
  await ensureBudgetLoaded();
  const { accountId } = getConfig();
  const start = `${month}-01`;
  const [year, monthNum] = month.split('-').map(Number);
  const end = new Date(year, monthNum, 0).toISOString().slice(0, 10);

  const [transactions, categories] = await Promise.all([
    api.getTransactions(accountId, start, end),
    getCategories(),
  ]);
  const categoryById = new Map(categories.map(c => [c.id, c]));

  const totals = new Map();
  let income = 0;
  for (const t of transactions) {
    if (t.amount > 0) {
      income += t.amount;
      continue;
    }
    const cat = categoryById.get(t.category);
    const name = cat?.name || 'Sem categoria';
    totals.set(name, (totals.get(name) || 0) + Math.abs(t.amount));
  }

  const summary = Array.from(totals.entries())
    .map(([name, total]) => ({ name, total: total / 100 }))
    .sort((a, b) => b.total - a.total);

  return { summary, income: income / 100 };
}

export async function getRecentTransactions(limit = 5) {
  await ensureBudgetLoaded();
  const { accountId } = getConfig();
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const all = await api.getTransactions(accountId, start, end);
  return all
    .filter(t => (t.imported_id || '').startsWith('whatsapp-'))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, limit);
}

export async function deleteLastTransaction() {
  const recent = await getRecentTransactions(1);
  const last = recent[0];
  if (!last) return null;

  await api.deleteTransaction(last.id);
  return last;
}

export async function getTransactionsByDateRange(startDate, endDate) {
  await ensureBudgetLoaded();
  const { accountId } = getConfig();
  if (!accountId) {
    throw new Error('whatsapp-no-account-configured');
  }
  // Busca todas as transações do período, sem filtro de imported_id
  // (pega tanto transações do bot quanto do OFX nativo)
  return api.getTransactions(accountId, startDate, endDate);
}

export async function shutdown() {
  if (initialized) {
    await api.shutdown();
    initialized = false;
    budgetLoaded = null;
  }
}
