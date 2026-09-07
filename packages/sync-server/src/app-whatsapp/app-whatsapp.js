import express from 'express';

import { getAccountDb } from '#account-db';
import { handleError } from '#app-gocardless/util/handle-error';
import { SecretName, secretsService } from '#services/secrets-service';
import {
  requestLoggerMiddleware,
  validateSessionMiddleware,
} from '#util/middlewares';

import * as actual from './actual-client.js';
import * as ai from './whatsapp-ai.js';
import * as connection from './whatsapp-connection.js';

const app = express();
export { app as handlers };
app.use(requestLoggerMiddleware);
app.use(express.json());

// Endpoint temporário para importação em batch (SEM autenticação — apenas para testes)
// Remove após confirmar a importação
app.post('/import-transactions', handleError(async (req, res) => {
  const { transactions } = req.body || {};
  if (!Array.isArray(transactions) || transactions.length === 0) {
    res.send({
      status: 'error',
      reason: 'invalid-input',
      description: 'Envie um array de transações.',
    });
    return;
  }

  const results = [];
  for (const tx of transactions) {
    try {
      const result = await actual.addTransaction({
        date: tx.date,
        amount: tx.amount,
        description: tx.description,
        type: tx.type,
        categoryId: tx.categoryId || null,
        rawMessage: `[IMPORTADO] ${tx.description}`,
      });
      results.push({ ok: true, ...result });
    } catch (e) {
      results.push({ ok: false, error: e.message });
    }
  }

  res.send({
    status: 'ok',
    data: {
      imported: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      results,
    },
  });
}));

// Endpoint temporário para calcular orçamentos a partir do histórico (SEM autenticação)
// Remove após confirmar os orçamentos
app.post('/calculate-budgets', handleError(async (req, res) => {
  const { startDate = '2026-01-01', endDate = '2026-07-31' } = req.body || {};

  try {
    // Busca transações e categorias do período (incluindo OFX nativo, não só bot)
    const [categories, transactions] = await Promise.all([
      actual.getCategories(),
      actual.getTransactionsByDateRange(startDate, endDate), // Busca o período completo
    ]);

    // Agrupa por categoria/mês (transações já vêm filtradas do período)
    const budgetsByMonth = {};
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    for (const tx of transactions) {
      if (!tx.date) continue;
      if (tx.amount >= 0) continue; // Ignora receitas

      const month = tx.date.substring(0, 7); // YYYY-MM
      if (!budgetsByMonth[month]) {
        budgetsByMonth[month] = {};
      }

      const catId = tx.category || 'uncategorized';
      budgetsByMonth[month][catId] = (budgetsByMonth[month][catId] || 0) + Math.abs(tx.amount) / 100;
    }

    // Retorna os orçamentos calculados (sem salvar ainda)
    const budgetsList = [];
    for (const [month, budgets] of Object.entries(budgetsByMonth)) {
      for (const [categoryId, amount] of Object.entries(budgets)) {
        const category = categoryMap.get(categoryId);
        budgetsList.push({
          month,
          categoryId,
          categoryName: category?.name || '(sem categoria)',
          isIncome: category?.is_income || false,
          amount: parseFloat(amount.toFixed(2)),
        });
      }
    }

    res.send({
      status: 'ok',
      data: {
        calculated: budgetsList.length,
        budgets: budgetsList,
      },
    });
  } catch (e) {
    res.send({
      status: 'error',
      reason: 'calculation-failed',
      description: `Erro ao calcular orçamentos: ${e.message}`,
    });
  }
}));

app.use(validateSessionMiddleware);

function setServerPref(key, value) {
  getAccountDb().mutate(
    `INSERT INTO server_prefs (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

app.post(
  '/status',
  handleError(async (req, res) => {
    const { status, qrBase64, phone, groups, groupId } = connection.state;
    const aiConfig = ai.getAiConfig();
    res.send({
      status: 'ok',
      data: {
        status,
        qrBase64,
        phone,
        groups,
        groupId,
        configured: actual.isConfigured(),
        aiProviders: Object.entries(ai.PROVIDERS).map(([id, p]) => ({
          id,
          label: p.label,
          defaultModel: p.defaultModel,
        })),
        aiProvider: aiConfig.provider,
        aiModel: aiConfig.model,
        aiBaseUrl: aiConfig.baseUrl,
        aiKeyConfigured: Boolean(aiConfig.apiKey),
      },
    });
  }),
);

app.post(
  '/connect',
  handleError(async (req, res) => {
    void connection.connect();
    res.send({ status: 'ok' });
  }),
);

app.post(
  '/config',
  handleError(async (req, res) => {
    const {
      accountId,
      syncId,
      budgetPassword,
      actualPassword,
      aiProvider,
      aiModel,
      aiBaseUrl,
      aiApiKey,
    } = req.body || {};

    if (!accountId || !syncId || !actualPassword || !aiApiKey) {
      res.send({
        status: 'error',
        reason: 'missing-required-fields',
        description: 'Preencha conta, sync ID, senha da conta e chave da IA.',
      });
      return;
    }

    const provider = aiProvider || 'anthropic';
    if (!ai.PROVIDERS[provider]) {
      res.send({
        status: 'error',
        reason: 'unknown-ai-provider',
        description: 'Provedor de IA desconhecido.',
      });
      return;
    }

    // Test the AI credentials before persisting them, so a bad key or model
    // never gets stored.
    let aiCheck;
    try {
      aiCheck = await ai.validateCredentials({
        provider,
        model: aiModel,
        baseUrl: aiBaseUrl,
        apiKey: aiApiKey,
      });
    } catch (e) {
      res.send({
        status: 'error',
        reason: 'ai-credentials-invalid',
        description: `Não consegui falar com o provedor de IA: ${e.message}`,
      });
      return;
    }

    setServerPref('whatsapp_accountId', accountId);
    setServerPref('whatsapp_syncId', syncId);
    setServerPref('whatsapp_aiProvider', provider);
    setServerPref('whatsapp_aiModel', aiCheck.model);
    setServerPref('whatsapp_aiBaseUrl', aiBaseUrl || '');
    secretsService.set(SecretName.whatsapp_actualPassword, actualPassword);
    secretsService.set(SecretName.whatsapp_aiApiKey, aiApiKey);
    if (budgetPassword) {
      secretsService.set(SecretName.whatsapp_budgetPassword, budgetPassword);
    }

    // Now check the Actual side: this downloads the budget with the given
    // password/sync id, so it fails loudly if any of them is wrong.
    let categories;
    let accounts;
    try {
      categories = await actual.getCategories();
      accounts = await actual.getAccounts();
    } catch (e) {
      res.send({
        status: 'error',
        reason: 'actual-credentials-invalid',
        description: `Não consegui abrir o orçamento: ${e.message}`,
      });
      return;
    }

    const account = accounts.find(a => a.id === accountId);
    if (!account) {
      res.send({
        status: 'error',
        reason: 'account-not-found',
        description: 'A conta escolhida não existe neste orçamento.',
      });
      return;
    }

    if (connection.state.status === 'disconnected') {
      void connection.connect();
    }

    res.send({
      status: 'ok',
      data: {
        aiProvider: aiCheck.provider,
        aiModel: aiCheck.model,
        accountName: account.name,
        categoryCount: categories.length,
      },
    });
  }),
);

app.post(
  '/group',
  handleError(async (req, res) => {
    const { groupId } = req.body || {};
    if (!groupId) {
      res.status(400).send({ status: 'error', reason: 'missing-group-id' });
      return;
    }
    await connection.selectGroup(groupId);
    res.send({ status: 'ok' });
  }),
);

app.post(
  '/groups/refresh',
  handleError(async (req, res) => {
    if (!connection.state.sock) {
      res.status(503).send({ status: 'error', reason: 'not-connected' });
      return;
    }
    await connection.refreshGroups(connection.state.sock);
    res.send({ status: 'ok', data: { groups: connection.state.groups } });
  }),
);

app.post(
  '/logout',
  handleError(async (req, res) => {
    await connection.logout();
    res.send({ status: 'ok' });
  }),
);
