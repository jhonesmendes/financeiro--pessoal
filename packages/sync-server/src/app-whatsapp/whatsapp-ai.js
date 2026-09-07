// whatsapp-ai.js — an LLM interprets free-text/image WhatsApp messages and
// turns them into structured transactions against the user's real categories.
// Anthropic uses its own SDK; every other provider is reached through the
// OpenAI-compatible /chat/completions shape, which OpenAI, Google, Groq and
// OpenRouter all speak — so new providers need no new dependency.
import Anthropic from '@anthropic-ai/sdk';

import { getAccountDb } from '#account-db';
import { SecretName, secretsService } from '#services/secrets-service';

export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic (Claude)',
    defaultModel: 'claude-sonnet-4-5',
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  google: {
    label: 'Google (Gemini)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.0-flash',
  },
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
  },
  custom: {
    label: 'Outro (compatível com OpenAI)',
    defaultModel: '',
  },
};

function getPref(key) {
  const row = getAccountDb().first(
    'SELECT value FROM server_prefs WHERE key = ?',
    [key],
  );
  return row?.value || null;
}

export function getAiConfig() {
  const provider = getPref('whatsapp_aiProvider') || 'anthropic';
  const spec = PROVIDERS[provider] || PROVIDERS.anthropic;

  return {
    provider,
    model: getPref('whatsapp_aiModel') || spec.defaultModel,
    baseUrl: getPref('whatsapp_aiBaseUrl') || spec.baseUrl || null,
    apiKey: secretsService.get(SecretName.whatsapp_aiApiKey),
  };
}

function buildSystem(categories) {
  const list = categories
    .map(c => `  ID ${c.id}: ${c.name} (${c.group_name})`)
    .join('\n');

  return `Você é o assistente financeiro pessoal integrado ao WhatsApp.
Interprete mensagens e retorne SOMENTE JSON válido, sem markdown.

CATEGORIAS:
${list}

AÇÕES: register | report_month | report_recent | undo | non_financial

REGRAS:
- amount: número sem R$ (ex: 54.20)
- category_id: null se confiança < 0.70
- date: YYYY-MM-DD (hoje se não informado)
- type: expense | income

EXEMPLOS:
"gastei 54 reais no mercado" → {"action":"register","type":"expense","amount":54.00,"description":"Mercado","category_id":"<id da categoria de alimentação>","category_confidence":0.95,"date":"hoje"}
"recebi 3000 salário"        → {"action":"register","type":"income","amount":3000,"description":"Salário","category_id":"<id da categoria de receita>","category_confidence":0.99,"date":"hoje"}
"coisa de 200 ontem"         → {"action":"register","type":"expense","amount":200,"description":"Gasto","category_id":null,"category_confidence":0,"date":"ontem"}
"relatório de outubro"       → {"action":"report_month","month":"2026-10"}
"últimos gastos"             → {"action":"report_recent"}
"cancela o último"           → {"action":"undo"}
"oi tudo bem"                → {"action":"non_financial"}`;
}

// Models other than Claude routinely wrap JSON in ```json fences.
function parseJson(text) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

async function callOpenAiCompatible({ system, content, maxTokens, config }) {
  const { model, baseUrl, apiKey } = config;
  if (!baseUrl) {
    throw new Error('whatsapp-missing-ai-base-url');
  }

  const messages = [];
  if (system) {
    messages.push({ role: 'system', content: system });
  }
  messages.push({ role: 'user', content });

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
  });

  if (!res.ok) {
    throw new Error(`whatsapp-ai-request-failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function callAnthropic({ system, content, maxTokens, config }) {
  const { model, apiKey } = config;
  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content }],
  });
  return res.content[0].text;
}

// Each provider family expects a different shape for the user turn, so
// callers describe the turn abstractly and this picks the right encoding.
async function complete({ system, text, image, maxTokens, config }) {
  const cfg = config || getAiConfig();
  const { provider, apiKey } = cfg;
  if (!apiKey) {
    throw new Error('whatsapp-missing-ai-key');
  }

  if (provider === 'anthropic') {
    const content = image
      ? [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: image.mimeType,
              data: image.base64,
            },
          },
          { type: 'text', text },
        ]
      : text;
    return callAnthropic({ system, content, maxTokens, config: cfg });
  }

  const content = image
    ? [
        { type: 'text', text },
        {
          type: 'image_url',
          image_url: {
            url: `data:${image.mimeType};base64,${image.base64}`,
          },
        },
      ]
    : text;
  return callOpenAiCompatible({ system, content, maxTokens, config: cfg });
}

// Sends the smallest possible real request so bad keys, bad models and
// unreachable endpoints all surface before the config is saved.
export async function validateCredentials({
  provider,
  model,
  baseUrl,
  apiKey,
}) {
  const spec = PROVIDERS[provider];
  if (!spec) {
    throw new Error('Provedor de IA desconhecido.');
  }

  const config = {
    provider,
    model: model || spec.defaultModel,
    baseUrl: baseUrl || spec.baseUrl || null,
    apiKey,
  };

  if (provider !== 'anthropic' && !config.baseUrl) {
    throw new Error('Informe a URL base da API para este provedor.');
  }

  await complete({ text: 'Responda apenas: ok', maxTokens: 16, config });
  return { provider, model: config.model };
}

export async function interpretText(text, categories, today) {
  const out = await complete({
    system: buildSystem(categories),
    text: `Hoje: ${today}\nMensagem: "${text}"`,
    maxTokens: 512,
  });
  return parseJson(out);
}

export async function interpretImage(base64, mimeType, categories, today) {
  const out = await complete({
    system: buildSystem(categories),
    text: `Hoje: ${today}\nAnalise este cupom/comprovante e extraia as informações financeiras.`,
    image: { base64, mimeType: mimeType || 'image/jpeg' },
    maxTokens: 768,
  });
  return parseJson(out);
}

export async function generateReport(summary, income, month) {
  const out = await complete({
    text: `Gere um relatório mensal financeiro amigável para WhatsApp (sem markdown, use emojis).
Mês: ${month} | Receita: R$${income} | Categorias: ${JSON.stringify(summary)}
Inclua: total gasto, maior gasto, saldo e uma frase curta no final.`,
    maxTokens: 350,
  });
  return out.trim();
}
