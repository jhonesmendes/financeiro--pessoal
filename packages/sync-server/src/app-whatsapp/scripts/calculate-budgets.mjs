// Script para calcular orçamentos baseado em transações importadas
// Uso: node --conditions=node --input-type=module -e "$(cat packages/sync-server/src/app-whatsapp/scripts/calculate-budgets.mjs)"
// Ou via endpoint POST /whatsapp/calculate-budgets

import * as api from '@actual-app/api';
import { getAccountDb } from '#account-db';
import { config } from '#load-config';

async function calculateBudgets() {
  console.log('📊 Calculando orçamentos baseado no histórico importado...\n');

  try {
    // Inicializa API
    const dataDir = `${config.get('serverFiles')}/whatsapp-budget-cache`;
    const { default: fs } = await import('fs');
    fs.mkdirSync(dataDir, { recursive: true });

    const accountDb = getAccountDb();
    const syncIdRow = accountDb.first('SELECT value FROM server_prefs WHERE key = ?', ['whatsapp_syncId']);
    const accountIdRow = accountDb.first('SELECT value FROM server_prefs WHERE key = ?', ['whatsapp_accountId']);
    const passwordRow = accountDb.first('SELECT value FROM users WHERE username = ?', ['default']);

    if (!syncIdRow?.value || !accountIdRow?.value) {
      console.error('❌ WhatsApp não está configurado (faltam sync ID ou account ID)');
      return;
    }

    await api.init({
      dataDir,
      serverURL: `http://127.0.0.1:${config.get('port')}`,
      password: 'password', // Default password
    });

    await api.downloadBudget(syncIdRow.value);

    // Busca transações e categorias
    const [categories, transactions] = await Promise.all([
      api.getCategories(),
      api.getTransactions(accountIdRow.value, '2026-01-01', '2026-07-31'),
    ]);

    // Agrupa transações por categoria e mês
    const budgetsByMonth = {};
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    for (const tx of transactions) {
      const month = tx.date?.substring(0, 7); // YYYY-MM
      if (!month || tx.amount >= 0) continue; // Ignora receitas e datas inválidas

      if (!budgetsByMonth[month]) {
        budgetsByMonth[month] = {};
      }

      const catId = tx.category || 'uncategorized';
      budgetsByMonth[month][catId] = (budgetsByMonth[month][catId] || 0) + Math.abs(tx.amount) / 100;
    }

    // Aplica orçamentos via API
    let updated = 0;
    for (const [month, budgets] of Object.entries(budgetsByMonth)) {
      for (const [categoryId, amount] of Object.entries(budgets)) {
        const category = categoryMap.get(categoryId);
        if (category && category.id !== 'Transfer' && !category.is_income) {
          try {
            await api.setBudget(month, categoryId, Math.round(amount * 100));
            updated++;
            const catName = category?.name || 'Sem categoria';
            console.log(`✓ ${month} | ${catName.padEnd(25)} | Orçado: R$ ${amount.toFixed(2)}`);
          } catch (e) {
            console.error(`✗ Erro ao salvar orçamento para ${month}: ${e.message}`);
          }
        }
      }
    }

    console.log(`\n✅ Concluído! ${updated} orçamentos calculados e salvos.`);
    console.log('💡 Volte ao Orçamento e recarregue para ver os valores atualizados.');

  } catch (e) {
    console.error('❌ Erro:', e.message);
  } finally {
    try {
      await api.shutdown();
    } catch (_) {}
  }
}

calculateBudgets();
