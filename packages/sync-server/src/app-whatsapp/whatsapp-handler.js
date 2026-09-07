// whatsapp-handler.js — business logic for incoming WhatsApp messages.
// Sessions (pending category choice) are kept in memory: short-lived and
// fine to lose on a server restart.
import dayjs from 'dayjs';

import * as actual from './actual-client.js';
import * as ai from './whatsapp-ai.js';

let _sock = null;
let _groupId = null;
const sessions = new Map(); // phone -> { pendingData }

// The bot connects using the user's own WhatsApp number (Baileys mirrors
// WhatsApp Web), so messages the user types themselves in the group also
// arrive with fromMe: true — same as the bot's own automated replies. We
// track the IDs of messages *we* sent so we can tell them apart from real
// fromMe input and only ignore our own echoes.
const ownMessageIds = new Set();

export function init(sock, groupId) {
  _sock = sock;
  _groupId = groupId;
}

export async function send(text) {
  if (!_sock || !_groupId) return;
  const result = await _sock.sendMessage(_groupId, { text });
  const id = result?.key?.id;
  if (id) {
    ownMessageIds.add(id);
    // Keep the set small; ids are only needed for the brief window until
    // the corresponding messages.upsert event fires.
    setTimeout(() => ownMessageIds.delete(id), 60_000);
  }
}

export async function handleMessage(msg) {
  if (!_sock || !_groupId) return;

  try {
    const remoteJid = msg.key?.remoteJid || '';
    const fromMe = msg.key?.fromMe || false;
    const messageId = msg.key?.id;

    if (fromMe && ownMessageIds.has(messageId)) return;
    if (remoteJid !== _groupId) return;

    const senderPhone = msg.key?.participant || remoteJid;
    const today = dayjs().format('YYYY-MM-DD');
    const thisMonth = dayjs().format('YYYY-MM');

    const content = msg.message;
    if (!content) return;

    if (!actual.isConfigured()) {
      await send(
        '⚠️ Ainda não configurei onde registrar seus gastos. Abra o Actual Budget → WhatsApp e preencha a configuração (conta, orçamento e chave da IA) primeiro.',
      );
      return;
    }

    const hasText = !!(
      content.conversation || content.extendedTextMessage?.text
    );
    const hasImage = !!content.imageMessage;
    const hasDocument = !!content.documentMessage;
    const hasAudio = !!content.audioMessage;
    const hasVideo = !!content.videoMessage;
    const hasSticker = !!content.stickerMessage;

    const text = (
      content.conversation ||
      content.extendedTextMessage?.text ||
      ''
    ).trim();

    const pendingData = sessions.get(senderPhone);
    if (pendingData) {
      return onCategoryChoice(senderPhone, text, pendingData);
    }

    // Rejeitar arquivos não suportados
    if (hasDocument) {
      const fileName = content.documentMessage?.filename || 'arquivo';
      await send(
        `❌ Não aceito arquivos de documentos (${fileName}).\n\n` +
          `Tente:\n` +
          `💸 _"gastei 50 no mercado"_\n` +
          `🖼️ Foto de cupom ou comprovante`,
      );
      return;
    }

    if (hasAudio) {
      await send(
        `❌ Não aceito áudio.\n\n` +
          `Tente:\n` +
          `💸 _"gastei 50 no mercado"_\n` +
          `🖼️ Foto de cupom ou comprovante`,
      );
      return;
    }

    if (hasVideo || hasSticker) {
      await send(
        `❌ Tipo de arquivo não suportado.\n\n` +
          `Tente:\n` +
          `💸 _"gastei 50 no mercado"_\n` +
          `🖼️ Foto de cupom ou comprovante`,
      );
      return;
    }

    if (hasImage) return onImage(senderPhone, content.imageMessage, today);
    if (hasText && text.length > 0) {
      return onText(senderPhone, text, today, thisMonth);
    }
  } catch (e) {
    console.error('Message handler error:', e.message);
    try {
      await send('⚠️ Algo deu errado. Tente novamente.');
    } catch (sendErr) {
      console.error('Failed to send error message:', sendErr.message);
    }
  }
}

async function onText(phone, text, today, thisMonth) {
  try {
    const categories = await actual.getCategories();
    let parsed;

    try {
      parsed = await ai.interpretText(text, categories, today);
    } catch (e) {
      console.error('AI error:', e.message);
      await send('⚠️ Não consegui entender. Tente novamente.');
      return;
    }

    if (!parsed) {
      await send('⚠️ Não consegui processar sua mensagem. Tente novamente.');
      return;
    }

    switch (parsed.action) {
      case 'register':
        return onRegister(phone, parsed, text);
      case 'report_month':
        return onReportMonth(parsed.month || thisMonth);
      case 'report_recent':
        return onReportRecent();
      case 'undo':
        return onUndo();
      case 'non_financial':
        await send(
          `👋 *Finance Bot* — o que posso fazer:\n\n` +
            `💸 Lançar gasto: _"gastei 50 no mercado"_\n` +
            `💰 Lançar receita: _"recebi 3000 salário"_\n` +
            `🖼️ Foto de cupom ou comprovante\n` +
            `📊 Relatório: _"relatório de outubro"_\n` +
            `🔄 Recentes: _"últimos gastos"_\n` +
            `↩️ Desfazer: _"cancela o último"_`,
        );
        break;
      default:
        console.warn('Unknown action:', parsed.action);
        await send('⚠️ Ação desconhecida. Tente novamente.');
        break;
    }
  } catch (e) {
    console.error('Text handler error:', e.message);
    try {
      await send('⚠️ Algo deu errado. Tente novamente.');
    } catch (sendErr) {
      console.error('Failed to send text error message:', sendErr.message);
    }
  }
}

async function onImage(phone, imageMsg, today) {
  try {
    await send('🔍 Analisando imagem...');

    let base64, mimeType;
    try {
      const { downloadMediaMessage } = await import('@whiskeysockets/baileys');
      const buffer = await downloadMediaMessage(
        { message: { imageMessage: imageMsg } },
        'buffer',
        {},
      );

      if (!buffer || buffer.length === 0) {
        await send(
          '❌ Imagem vazia ou corrompida. Tente enviar o valor manualmente.',
        );
        return;
      }

      base64 = buffer.toString('base64');
      mimeType = imageMsg.mimetype || 'image/jpeg';
    } catch (e) {
      console.error('Download image error:', e.message);
      await send(
        '❌ Não consegui processar a imagem. Tente enviar o valor manualmente.',
      );
      return;
    }

    const categories = await actual.getCategories();
    let parsed;
    try {
      parsed = await ai.interpretImage(base64, mimeType, categories, today);
    } catch (e) {
      console.error('Image interpretation error:', e.message);
      await send(
        '⚠️ Não identifiquei informações financeiras na imagem. Mande o valor manualmente.',
      );
      return;
    }

    if (parsed?.action === 'register') {
      return onRegister(phone, parsed, '[imagem]');
    }
    await send('🤔 Não identifiquei um gasto nessa imagem.');
  } catch (e) {
    console.error('Image handler error:', e.message);
    try {
      await send('⚠️ Algo deu errado ao processar a imagem. Tente novamente.');
    } catch (sendErr) {
      console.error('Failed to send image error message:', sendErr.message);
    }
  }
}

async function onRegister(phone, parsed, rawMessage) {
  try {
    const { amount, description, type, date } = parsed;
    const { category_id, category_confidence } = parsed;

    if (!amount || !type || !date) {
      await send('⚠️ Dados incompletos. Tente novamente.');
      return;
    }

    if (!category_id || category_confidence < 0.7) {
      return askCategory(phone, parsed, rawMessage);
    }

    const categories = await actual.getCategories();
    const category = categories.find(c => c.id === category_id);
    const tx = await actual.addTransaction({
      amount,
      description,
      type,
      date,
      categoryId: category_id,
      rawMessage,
    });

    if (!tx) {
      await send('❌ Não consegui registrar o lançamento. Tente novamente.');
      return;
    }

    const sign = type === 'income' ? '+' : '-';
    const icon = type === 'income' ? '✅' : '💸';
    await send(
      `${icon} *${description || 'Lançamento'}*\n` +
        `${sign} R$ ${fmtVal(amount)}\n` +
        `${category?.name || 'Sem categoria'} · ${fmtDate(tx.date)}\n\n` +
        `_↩️ "cancela o último" para desfazer_`,
    );
  } catch (e) {
    console.error('Register error:', e.message);
    try {
      await send('❌ Erro ao registrar lançamento. Tente novamente.');
    } catch (sendErr) {
      console.error('Failed to send register error:', sendErr.message);
    }
  }
}

async function askCategory(phone, parsed, rawMessage) {
  try {
    const categories = await actual.getCategories();
    if (!categories?.length) {
      await send('❌ Sem categorias disponíveis. Configure o Actual Budget primeiro.');
      return;
    }

    const filtered = categories.filter(c =>
      parsed.type === 'income' ? c.is_income : !c.is_income,
    );

    if (!filtered.length) {
      await send(`❌ Sem categorias de ${parsed.type === 'income' ? 'receita' : 'despesa'} disponíveis.`);
      return;
    }

    const list = filtered
      .map((c, i) => `*${i + 1}* — ${c.name}`)
      .join('\n');

    sessions.set(phone, {
      ...parsed,
      rawMessage,
      categoryOptions: filtered.map(c => c.id),
    });

    await send(
      `🤔 Não identifiquei a categoria de *"${parsed.description || rawMessage}"* (R$ ${fmtVal(parsed.amount)}).\n\n` +
        `Qual categoria?\n\n${list}\n\n` +
        `_Responda com o número ou "cancela"_`,
    );
  } catch (e) {
    console.error('Ask category error:', e.message);
    try {
      await send('⚠️ Erro ao listar categorias. Tente novamente.');
    } catch (sendErr) {
      console.error('Failed to send category error:', sendErr.message);
    }
  }
}

async function onCategoryChoice(phone, text, pendingData) {
  try {
    const lower = text.toLowerCase().trim();
    if (['cancela', 'cancelar', 'não', 'nao', 'n'].includes(lower)) {
      sessions.delete(phone);
      await send('↩️ Lançamento cancelado.');
      return;
    }

    const num = parseInt(text, 10);
    const opts = pendingData.categoryOptions || [];
    if (isNaN(num) || num < 1 || num > opts.length) {
      await send(`⚠️ Responda com número de 1 a ${opts.length}, ou "cancela".`);
      return;
    }

    const categoryId = opts[num - 1];
    sessions.delete(phone);
    await onRegister(
      phone,
      { ...pendingData, category_id: categoryId, category_confidence: 1 },
      pendingData.rawMessage,
    );
  } catch (e) {
    console.error('Category choice error:', e.message);
    sessions.delete(phone);
    try {
      await send('❌ Erro ao processar categoria. Tente novamente.');
    } catch (sendErr) {
      console.error('Failed to send choice error:', sendErr.message);
    }
  }
}

async function onReportMonth(month) {
  try {
    const { summary, income } = await actual.getMonthSummary(month);

    if (!summary?.length && !income) {
      await send(`📭 Sem lançamentos em ${fmtMonth(month)}.`);
      return;
    }

    const text = await ai.generateReport(summary, income, month);
    if (!text) {
      await send(`⚠️ Não consegui gerar o relatório. Tente novamente.`);
      return;
    }
    await send(text);
  } catch (e) {
    console.error('Report month error:', e.message);
    try {
      await send('❌ Erro ao gerar relatório. Tente novamente.');
    } catch (sendErr) {
      console.error('Failed to send report error:', sendErr.message);
    }
  }
}

async function onReportRecent() {
  try {
    const recent = await actual.getRecentTransactions(5);
    if (!recent?.length) {
      await send('📭 Sem transações.');
      return;
    }

    const lines = recent.map(
      t =>
        `💸 *${t.payee_name || t.notes || 'Lançamento'}* — R$ ${fmtVal(Math.abs(t.amount) / 100)} (${fmtDate(t.date)})`,
    );
    await send(`🔄 *Últimas transações:*\n\n${lines.join('\n')}`);
  } catch (e) {
    console.error('Report recent error:', e.message);
    try {
      await send('❌ Erro ao listar transações. Tente novamente.');
    } catch (sendErr) {
      console.error('Failed to send recent error:', sendErr.message);
    }
  }
}

async function onUndo() {
  try {
    const deleted = await actual.deleteLastTransaction();
    if (!deleted) {
      await send('🤷 Nenhum lançamento recente para desfazer.');
      return;
    }
    await send(
      `↩️ Removido: *${deleted.payee_name || deleted.notes || 'Lançamento'}* — R$ ${fmtVal(Math.abs(deleted.amount) / 100)}`,
    );
  } catch (e) {
    console.error('Undo error:', e.message);
    try {
      await send('❌ Erro ao desfazer. Tente novamente.');
    } catch (sendErr) {
      console.error('Failed to send undo error:', sendErr.message);
    }
  }
}

function fmtVal(v) {
  return Number(v).toFixed(2).replace('.', ',');
}
function fmtDate(d) {
  return dayjs(d).format('DD/MM');
}
function fmtMonth(m) {
  const months = [
    'jan',
    'fev',
    'mar',
    'abr',
    'mai',
    'jun',
    'jul',
    'ago',
    'set',
    'out',
    'nov',
    'dez',
  ];
  const [y, mo] = m.split('-');
  return `${months[parseInt(mo, 10) - 1]}/${y}`;
}
