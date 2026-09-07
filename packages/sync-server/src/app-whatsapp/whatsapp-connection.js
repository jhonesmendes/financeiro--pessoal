// whatsapp-connection.js — manages the Baileys WhatsApp connection.
// Ported from the standalone finance-whatsapp-bot, adapted to store its
// small amount of state in the sync-server's own account.sqlite instead of
// a separate Postgres database.
import path from 'node:path';

import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';

import { getAccountDb } from '#account-db';
import { config } from '#load-config';

import * as handler from './whatsapp-handler.js';

const authDir = path.join(config.get('serverFiles'), 'whatsapp-auth');

export const state = {
  status: 'disconnected', // disconnected | qr | connecting | connected
  qrBase64: null,
  phone: null,
  groups: [],
  groupId: null,
  sock: null,
};

const logger = pino({ level: 'silent' });

function getGroupPref() {
  const row = getAccountDb().first(
    "SELECT value FROM server_prefs WHERE key = 'whatsapp_groupId'",
  );
  return row?.value || null;
}

function setGroupPref(groupId) {
  getAccountDb().mutate(
    `INSERT INTO server_prefs (key, value) VALUES ('whatsapp_groupId', ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [groupId],
  );
}

export async function connect() {
  if (state.status === 'connecting' || state.status === 'connected') {
    return;
  }

  state.status = 'connecting';
  state.qrBase64 = null;

  try {
    await connectInner();
  } catch (e) {
    console.error('[whatsapp] connect() failed:', e);
    state.status = 'disconnected';
  }
}

async function connectInner() {
  const { version } = await fetchLatestBaileysVersion();
  const { state: authState, saveCreds } =
    await useMultiFileAuthState(authDir);

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: authState.creds,
      keys: makeCacheableSignalKeyStore(authState.keys, logger),
    },
    browser: ['Actual Budget', 'Chrome', '1.0.0'],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });

  state.sock = sock;

  sock.ev.on('connection.update', async update => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      state.status = 'qr';
      state.qrBase64 = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
    }

    if (connection === 'open') {
      state.status = 'connected';
      state.qrBase64 = null;

      const jid = sock.user?.id || '';
      state.phone = jid.split(':')[0].split('@')[0];

      await refreshGroups(sock);

      const savedGroup = getGroupPref();
      if (savedGroup) {
        state.groupId = savedGroup;
        handler.init(sock, savedGroup);
      }
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;

      state.status = 'disconnected';
      state.sock = null;

      if (shouldReconnect) {
        setTimeout(connect, 5000);
      } else {
        const fs = await import('node:fs');
        fs.rmSync(authDir, { recursive: true, force: true });
        state.phone = null;
        state.groups = [];
        setTimeout(connect, 2000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        await handler.handleMessage(msg);
      } catch (err) {
        console.error('Handler error:', err.message);
      }
    }
  });
}

export async function refreshGroups(sock) {
  try {
    const groupMap = await sock.groupFetchAllParticipating();
    state.groups = Object.values(groupMap).map(g => ({
      id: g.id,
      name: g.subject,
      members: g.participants?.length || 0,
    }));
  } catch (e) {
    console.error('Erro ao listar grupos:', e.message);
  }
}

export async function selectGroup(groupId) {
  state.groupId = groupId;
  setGroupPref(groupId);

  if (state.sock) {
    handler.init(state.sock, groupId);
    await handler.send(
      `✅ *Bot financeiro ativado neste grupo!*\n\n` +
        `Mande seus gastos aqui e eu registro automaticamente no seu orçamento.\n\n` +
        `Exemplos:\n` +
        `💸 _"gastei 54 no mercado"_\n` +
        `🖼️ Foto de cupom ou comprovante\n` +
        `📊 _"relatório de novembro"_\n\n` +
        `Boa organização! 💰`,
    );
  }
}

export async function logout() {
  if (state.sock) {
    await state.sock.logout();
  }
}
