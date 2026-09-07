// Script descartável para importar transações de agosto de 2026
// Roda uma única vez e pode ser deletado depois
// Uso: node -e "$(cat packages/sync-server/src/app-whatsapp/scripts/import-agosto.mjs)" --input-type=module
// OU: copiar e rodar via curl contra endpoints do servidor

import http from 'node:http';

const TRANSACTIONS = [
  // RECEITAS
  { date: '2026-08-05', amount: 3700.00, description: 'PIX recebido - salário', type: 'income' },
  { date: '2026-08-06', amount: 200.00, description: 'PIX recebido', type: 'income' },
  { date: '2026-08-20', amount: 1332.00, description: 'PIX recebido', type: 'income' },

  // ALIMENTAÇÃO E RESTAURANTES
  { date: '2026-08-03', amount: 70.00, description: 'JIM COM SAMUEL', type: 'expense' },
  { date: '2026-08-03', amount: 35.97, description: 'EPACABA Rondonópolis', type: 'expense' },
  { date: '2026-08-03', amount: 25.28, description: 'COMPER', type: 'expense' },
  { date: '2026-08-03', amount: 36.00, description: 'Jaime Rezende Pires', type: 'expense' },
  { date: '2026-08-07', amount: 27.00, description: 'Restaurante D Rosa', type: 'expense' },
  { date: '2026-08-10', amount: 123.22, description: 'ASSAI Atacadista', type: 'expense' },
  { date: '2026-08-10', amount: 30.00, description: 'Restaurante', type: 'expense' },
  { date: '2026-08-10', amount: 68.00, description: 'Casa de Carne', type: 'expense' },
  { date: '2026-08-10', amount: 150.00, description: 'Pizzaria Fiorella', type: 'expense' },
  { date: '2026-08-20', amount: 27.00, description: 'Restaurante D Rosa', type: 'expense' },
  { date: '2026-08-21', amount: 22.00, description: 'Restaurante D Rosa', type: 'expense' },
  { date: '2026-08-24', amount: 74.50, description: 'Casa de Carnes Ipanema', type: 'expense' },

  // COMBUSTÍVEL E TRANSPORTE
  { date: '2026-08-03', amount: 50.00, description: 'Auto Posto Gina', type: 'expense' },
  { date: '2026-08-06', amount: 165.00, description: 'Moto Prime', type: 'expense' },
  { date: '2026-08-27', amount: 98.59, description: 'Posto Shopping', type: 'expense' },

  // SERVIÇOS E ASSINATURAS
  { date: '2026-08-05', amount: 20.00, description: 'Recarga Celular', type: 'expense' },
  { date: '2026-08-05', amount: 23.90, description: 'Spotify', type: 'expense' },
  { date: '2026-08-06', amount: 110.00, description: 'JIM COM HUMANAS', type: 'expense' },
  { date: '2026-08-10', amount: 198.00, description: 'Interfibras (Internet)', type: 'expense' },
  { date: '2026-08-10', amount: 155.43, description: 'Energisa (Energia)', type: 'expense' },
  { date: '2026-08-11', amount: 117.00, description: 'Microcenter', type: 'expense' },
  { date: '2026-08-14', amount: 129.98, description: 'Studio Z', type: 'expense' },
  { date: '2026-08-24', amount: 149.90, description: 'Academia Líder', type: 'expense' },
  { date: '2026-08-20', amount: 86.05, description: 'Simples Nacional', type: 'expense' },
  { date: '2026-08-31', amount: 58.99, description: 'Telefônica Bras', type: 'expense' },
];

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:5006';
const API_TOKEN = process.env.API_TOKEN || 'test-token';

async function postToWhatsApp(path, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const url = new URL(path, SERVER_URL);

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'X-ACTUAL-TOKEN': API_TOKEN,
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('🔄 Iniciando importação de transações de agosto/2026...\n');
  console.log(`   Servidor: ${SERVER_URL}\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < TRANSACTIONS.length; i++) {
    const tx = TRANSACTIONS[i];

    try {
      const result = await postToWhatsApp('/whatsapp/add-transaction', {
        date: tx.date,
        amount: tx.amount,
        description: tx.description,
        type: tx.type,
        categoryId: null, // Deixa o bot decidir (ou pedir interação)
        rawMessage: `[IMPORTADO] ${tx.description}`,
      });

      if (result.status === 200 || (result.data && result.data.status === 'ok')) {
        const icon = tx.type === 'income' ? '💰' : '💸';
        console.log(
          `${icon} [${i + 1}/${TRANSACTIONS.length}] ${tx.date} ${tx.description.padEnd(40)} R$${tx.amount.toFixed(2).padStart(8)} ✓`
        );
        successCount++;
      } else {
        console.error(
          `❌ [${i + 1}/${TRANSACTIONS.length}] ${tx.date} ${tx.description} — Status: ${result.status}`
        );
        errorCount++;
      }
    } catch (err) {
      console.error(
        `❌ [${i + 1}/${TRANSACTIONS.length}] ${tx.date} ${tx.description} — Erro: ${err.message}`
      );
      errorCount++;
    }

    // Pequena pausa entre requisições para não sobrecarregar
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\n✅ Importação completa!`);
  console.log(`   Sucesso: ${successCount} transações`);
  if (errorCount > 0) console.log(`   Falhas: ${errorCount} transações`);
  console.log(`\n💡 Dica: Abra "Orçamento" no Actual Budget para ver as transações aparecerem!`);
  process.exit(errorCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\n❌ Erro fatal:', err.message);
  process.exit(1);
});
