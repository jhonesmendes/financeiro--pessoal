import { useCallback, useEffect, useRef, useState } from 'react';

import { send } from '@actual-app/core/platform/client/connection';

export type WhatsAppGroup = { id: string; name: string; members: number };

export type WhatsAppAiProvider = {
  id: string;
  label: string;
  defaultModel: string;
};

export type WhatsAppStatusData = {
  status: 'disconnected' | 'connecting' | 'qr' | 'connected';
  qrBase64: string | null;
  phone: string | null;
  groups: WhatsAppGroup[];
  groupId: string | null;
  configured: boolean;
  aiProviders: WhatsAppAiProvider[];
  aiProvider: string;
  aiModel: string;
  aiBaseUrl: string | null;
  aiKeyConfigured: boolean;
};

const emptyStatus: WhatsAppStatusData = {
  status: 'disconnected',
  qrBase64: null,
  phone: null,
  groups: [],
  groupId: null,
  configured: false,
  aiProviders: [],
  aiProvider: 'anthropic',
  aiModel: '',
  aiBaseUrl: null,
  aiKeyConfigured: false,
};

export function useWhatsAppStatus() {
  const [data, setData] = useState<WhatsAppStatusData>(emptyStatus);
  const [isLoading, setIsLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await send('whatsapp-status');
      if (result && !('error' in result)) {
        setData(result);
      }
    } catch (e) {
      console.error('whatsapp-status failed:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    pollRef.current = setInterval(() => void refresh(), 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  const connect = useCallback(async () => {
    try {
      await send('whatsapp-connect');
    } catch (e) {
      console.error('whatsapp-connect failed:', e);
    }
    await refresh();
  }, [refresh]);

  const saveConfig = useCallback(
    async (config: {
      accountId: string;
      syncId: string;
      budgetPassword?: string;
      actualPassword: string;
      aiProvider: string;
      aiModel?: string;
      aiBaseUrl?: string;
      aiApiKey: string;
    }) => {
      const result = await send('whatsapp-save-config', config);
      await refresh();
      return result;
    },
    [refresh],
  );

  const selectGroup = useCallback(
    async (groupId: string) => {
      try {
        await send('whatsapp-select-group', groupId);
      } catch (e) {
        console.error('whatsapp-select-group failed:', e);
      }
      await refresh();
    },
    [refresh],
  );

  const refreshGroups = useCallback(async () => {
    try {
      await send('whatsapp-refresh-groups');
    } catch (e) {
      console.error('whatsapp-refresh-groups failed:', e);
    }
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await send('whatsapp-logout');
    } catch (e) {
      console.error('whatsapp-logout failed:', e);
    }
    await refresh();
  }, [refresh]);

  return {
    ...data,
    isLoading,
    connect,
    saveConfig,
    selectGroup,
    refreshGroups,
    logout,
  };
}
