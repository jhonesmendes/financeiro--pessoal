import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Select } from '@actual-app/components/select';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { Page } from '#components/Page';
import { useAccounts } from '#hooks/useAccounts';
import { useMetadataPref } from '#hooks/useMetadataPref';
import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';
import { useWhatsAppStatus } from '#hooks/useWhatsAppStatus';
import type {
  WhatsAppAiProvider,
  WhatsAppGroup,
} from '#hooks/useWhatsAppStatus';

function Card({
  title,
  right,
  children,
}: {
  title: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: theme.cardBackground,
        border: '1px solid ' + theme.cardBorder,
        borderRadius: 10,
        marginBottom: 16,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid ' + theme.tableBorder,
          fontWeight: 600,
        }}
      >
        <Text style={{ fontWeight: 600 }}>{title}</Text>
        {right}
      </View>
      <View style={{ padding: 16, gap: 12 }}>{children}</View>
    </View>
  );
}

function StatusPill({ status }: { status: string }) {
  const { t } = useTranslation();

  const styleByStatus: Record<string, { bg: string; fg: string }> = {
    connected: { bg: theme.noticeBackground, fg: theme.pageTextPositive },
    qr: { bg: theme.warningBackground, fg: theme.warningText },
    connecting: { bg: theme.warningBackground, fg: theme.warningText },
    disconnected: { bg: theme.tableBackground, fg: theme.pageTextLight },
  };
  const s = styleByStatus[status] || styleByStatus.disconnected;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        backgroundColor: s.bg,
      }}
    >
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          backgroundColor: s.fg,
        }}
      />
      <Text style={{ fontSize: 12, fontWeight: 600, color: s.fg }}>
        {statusLabels[status] || status}
      </Text>
    </View>
  );
}

const statusLabels: Record<string, string> = {
  connected: 'Conectado',
  qr: 'Aguardando leitura do QR',
  connecting: 'Conectando...',
  disconnected: 'Desconectado',
};

type ConnectionPanelProps = {
  status: string;
  qrBase64: string | null;
  phone: string | null;
  isLoading: boolean;
  configured: boolean;
  groupId: string | null;
  groups: WhatsAppGroup[];
  connect: () => void;
  logout: () => void;
};

function ConnectionPanel({
  status,
  qrBase64,
  phone,
  isLoading,
  configured,
  groupId,
  groups,
  connect,
  logout,
}: ConnectionPanelProps) {
  const { t } = useTranslation();
  const activeGroup = groups.find(g => g.id === groupId);

  return (
    <View
      style={{
        width: 280,
        flexShrink: 0,
        backgroundColor: theme.cardBackground,
        border: '1px solid ' + theme.cardBorder,
        borderRadius: 10,
        overflow: 'hidden',
        alignSelf: 'flex-start',
      }}
    >
      <View
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid ' + theme.tableBorder,
        }}
      >
        <Text style={{ fontWeight: 600 }}>{t('Conexão WhatsApp')}</Text>
      </View>

      <View style={{ padding: 16, gap: 16 }}>
        {isLoading ? (
          <Text>{t('Carregando...')}</Text>
        ) : (
          <>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text style={{ fontSize: 12, color: theme.pageTextLight }}>
                {t('Status')}
              </Text>
              <StatusPill status={status} />
            </View>

            {status === 'disconnected' && (
              <Button variant="primary" onPress={connect}>
                {t('Conectar WhatsApp')}
              </Button>
            )}

            {(status === 'connecting' || (status === 'qr' && !qrBase64)) && (
              <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
                {t('Preparando conexão...')}
              </Text>
            )}

            {status === 'qr' && qrBase64 && (
              <View style={{ alignItems: 'center', gap: 12 }}>
                <View
                  style={{
                    backgroundColor: 'white',
                    borderRadius: 10,
                    border: '3px solid ' + theme.tableBorder,
                    padding: 8,
                  }}
                >
                  <img
                    src={qrBase64}
                    width={200}
                    height={200}
                    alt="QR Code"
                    style={{ display: 'block' }}
                  />
                </View>
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 11, color: theme.pageTextLight }}>
                    {t('1. Abra o WhatsApp no celular')}
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.pageTextLight }}>
                    {t('2. Vá em ⋮ → Aparelhos conectados')}
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.pageTextLight }}>
                    {t('3. Toque em Conectar aparelho')}
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.pageTextLight }}>
                    {t('4. Aponte a câmera para o QR acima')}
                  </Text>
                </View>
              </View>
            )}

            {status === 'connected' && (
              <View
                style={{
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: theme.tableBackground,
                  border: '1px solid ' + theme.tableBorder,
                  borderRadius: 10,
                  padding: '20px 12px',
                }}
              >
                <Text style={{ fontSize: 28 }}>📱</Text>
                <Text style={{ fontSize: 11, color: theme.pageTextLight }}>
                  {t('Número conectado')}
                </Text>
                <Text style={{ fontWeight: 700, fontSize: 15 }}>
                  {phone ? `+${phone}` : ''}
                </Text>
              </View>
            )}
          </>
        )}

        {status === 'connected' && activeGroup && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: theme.tableBackground,
              border: '1px solid ' + theme.tableBorder,
              borderRadius: 8,
              padding: '10px 12px',
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 11, color: theme.pageTextLight }}>
                {t('Grupo ativo')}
              </Text>
              <Text
                style={{
                  fontWeight: 600,
                  fontSize: 13,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {activeGroup.name}
              </Text>
            </View>
          </View>
        )}

        {status === 'connected' && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ fontSize: 12, color: theme.pageTextLight }}>
              {t('Configuração')}
            </Text>
            <Text
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: configured ? theme.pageTextPositive : theme.warningText,
              }}
            >
              {configured ? t('Completa') : t('Pendente')}
            </Text>
          </View>
        )}

        {status === 'connected' && (
          <Button variant="normal" onPress={logout}>
            {t('Desconectar WhatsApp')}
          </Button>
        )}
      </View>
    </View>
  );
}

type GroupCardProps = {
  status: string;
  groups: WhatsAppGroup[];
  groupId: string | null;
  selectGroup: (groupId: string) => void;
  refreshGroups: () => void;
};

function GroupCard({
  status,
  groups,
  groupId,
  selectGroup,
  refreshGroups,
}: GroupCardProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('');

  if (status !== 'connected') return null;

  const filtered = groups.filter(g =>
    g.name.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <Card
      title={t('Selecionar grupo')}
      right={
        <Button variant="normal" onPress={refreshGroups}>
          {t('Atualizar')}
        </Button>
      }
    >
      {groups.length === 0 ? (
        <Text style={{ color: theme.pageTextLight }}>
          {t('Nenhum grupo encontrado. Crie um grupo no WhatsApp com este número.')}
        </Text>
      ) : (
        <>
          <Input
            placeholder={t('Filtrar grupos...')}
            value={filter}
            onChangeValue={setFilter}
          />
          <View style={{ maxHeight: 340, overflow: 'auto', gap: 2 }}>
            {filtered.map(g => {
              const isActive = g.id === groupId;
              return (
                <View
                  key={g.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 8,
                    // Rows are flex items in a height-capped scroll column;
                    // without this they get squeezed to fit and overlap.
                    flexShrink: 0,
                    backgroundColor: isActive
                      ? theme.tableRowBackgroundHighlight
                      : 'transparent',
                    border: isActive
                      ? '1px solid ' + theme.tableBorderSelected
                      : '1px solid transparent',
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 999,
                      flexShrink: 0,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: theme.tableBackground,
                      border: '1px solid ' + theme.tableBorder,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: 600 }}>
                      {[...g.name][0] ?? '#'}
                    </Text>
                  </View>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontWeight: 500,
                        fontSize: 13,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {g.name}
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.pageTextLight }}>
                      {t('{{count}} participantes', { count: g.members })}
                    </Text>
                  </View>
                  {isActive ? (
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: theme.pageTextPositive,
                        flexShrink: 0,
                      }}
                    >
                      ✓ {t('Ativo')}
                    </Text>
                  ) : (
                    <Button
                      variant="normal"
                      onPress={() => selectGroup(g.id)}
                      style={{ flexShrink: 0 }}
                    >
                      {t('Selecionar')}
                    </Button>
                  )}
                </View>
              );
            })}
          </View>
        </>
      )}
    </Card>
  );
}

type ConfigCardProps = {
  aiProviders: WhatsAppAiProvider[];
  currentProvider: string;
  currentModel: string;
  saveConfig: (config: {
    accountId: string;
    syncId: string;
    budgetPassword?: string;
    actualPassword: string;
    aiProvider: string;
    aiModel?: string;
    aiBaseUrl?: string;
    aiApiKey: string;
  }) => Promise<unknown>;
};

function ConfigCard({
  aiProviders,
  currentProvider,
  currentModel,
  saveConfig,
}: ConfigCardProps) {
  const { t } = useTranslation();
  const { data: accounts } = useAccounts();
  const [cloudFileId] = useMetadataPref('cloudFileId');
  const dispatch = useDispatch();

  const [accountId, setAccountId] = useState('');
  const [syncId, setSyncId] = useState(cloudFileId ?? '');
  const [budgetPassword, setBudgetPassword] = useState('');
  const [actualPassword, setActualPassword] = useState('');
  const [aiProvider, setAiProvider] = useState(currentProvider);
  const [aiModel, setAiModel] = useState(currentModel);
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<
    { ok: true; text: string } | { ok: false; text: string } | null
  >(null);

  const providerSpec = aiProviders.find(p => p.id === aiProvider);
  const isCustomProvider = aiProvider === 'custom';

  function onProviderChange(next: string) {
    setAiProvider(next);
    setAiModel(aiProviders.find(p => p.id === next)?.defaultModel ?? '');
  }

  async function onSave() {
    const missing: string[] = [];
    if (!accountId) missing.push(t('Conta de destino'));
    if (!syncId) missing.push(t('Sync ID do orçamento'));
    if (!actualPassword) missing.push(t('Senha da conta Actual'));
    if (!aiApiKey) missing.push(t('Chave da API'));
    if (isCustomProvider && !aiBaseUrl) missing.push(t('URL base da API'));

    if (missing.length > 0) {
      setResult({
        ok: false,
        text: t('Preencha: {{fields}}', { fields: missing.join(', ') }),
      });
      return;
    }

    setSaving(true);
    setResult(null);
    try {
      const saved = (await saveConfig({
        accountId,
        syncId,
        budgetPassword: budgetPassword || undefined,
        actualPassword,
        aiProvider,
        aiModel: aiModel || undefined,
        aiBaseUrl: aiBaseUrl || undefined,
        aiApiKey,
      })) as {
        aiModel: string;
        accountName: string;
        categoryCount: number;
      };

      setResult({
        ok: true,
        text: t(
          'Validado: IA "{{model}}" respondeu, orçamento aberto com {{count}} categorias, lançando em "{{account}}".',
          {
            model: saved.aiModel,
            count: saved.categoryCount,
            account: saved.accountName,
          },
        ),
      });
    } catch (e) {
      // PostError carries the server's description in `reason`.
      // Fall back to message, description, or generic text.
      let errorText = 'Erro desconhecido ao salvar configuração.';
      if (typeof e === 'object' && e !== null) {
        const err = e as Record<string, unknown>;
        errorText = (err.reason as string) ||
                    (err.message as string) ||
                    (err.description as string) ||
                    errorText;
      } else if (e instanceof Error) {
        errorText = e.message;
      } else if (typeof e === 'string') {
        errorText = e;
      }
      setResult({
        ok: false,
        text: errorText,
      });
    }
    setSaving(false);
  }

  return (
    <Card title={t('Configuração da API')}>
      <Text
        style={{
          color: theme.pageTextLight,
          backgroundColor: theme.tableBackground,
          border: '1px solid ' + theme.tableBorder,
          borderRadius: 8,
          padding: 12,
          fontSize: 12,
        }}
      >
        {t(
          'O grupo pode ser selecionado antes de preencher estas configurações. Elas só são necessárias para o bot criar transações de verdade no seu orçamento.',
        )}
      </Text>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 14,
        }}
      >
        <View style={{ flex: 1, minWidth: 220, gap: 4 }}>
          <Text style={{ fontSize: 12 }}>
            {t('Conta de destino das transações')}
          </Text>
          <Select
            value={accountId}
            onChange={setAccountId}
            options={[
              ['', t('Selecione uma conta')],
              ...((accounts ?? []).map(a => [a.id, a.name]) as [
                string,
                string,
              ][]),
            ]}
          />
          <Button
            variant="bare"
            onPress={() =>
              dispatch(pushModal({ modal: { name: 'add-account', options: {} } }))
            }
            style={{ alignSelf: 'flex-start', fontSize: 11 }}
          >
            {t('+ Criar nova conta')}
          </Button>
          {(accounts ?? []).length === 0 && (
            <Text style={{ fontSize: 10, color: theme.warningText }}>
              {t('Você ainda não tem contas neste orçamento.')}
            </Text>
          )}
        </View>

        <View style={{ flex: 1, minWidth: 220, gap: 4 }}>
          <Text style={{ fontSize: 12 }}>
            {t('Sync ID do orçamento')}
          </Text>
          <Input value={syncId} onChangeValue={setSyncId} />
          <Text style={{ fontSize: 10, color: theme.pageTextLight }}>
            {cloudFileId
              ? t('Preenchido automaticamente com o orçamento aberto')
              : t('Este orçamento ainda não está sincronizado com o servidor')}
          </Text>
        </View>

        <View style={{ flex: 1, minWidth: 220, gap: 4 }}>
          <Text style={{ fontSize: 12 }}>
            {t('Senha de criptografia (opcional)')}
          </Text>
          <Input
            type="password"
            value={budgetPassword}
            onChangeValue={setBudgetPassword}
            placeholder={t('Deixe vazio se não usa criptografia')}
          />
        </View>

        <View style={{ flex: 1, minWidth: 220, gap: 4 }}>
          <Text style={{ fontSize: 12 }}>{t('Senha da conta Actual')}</Text>
          <Input
            type="password"
            value={actualPassword}
            onChangeValue={setActualPassword}
          />
          <Text style={{ fontSize: 10, color: theme.pageTextLight }}>
            {t('Usada pelo bot para acessar e lançar transações')}
          </Text>
        </View>

        <View style={{ flex: 1, minWidth: 220, gap: 4 }}>
          <Text style={{ fontSize: 12 }}>{t('Provedor de IA')}</Text>
          <Select
            value={aiProvider}
            onChange={onProviderChange}
            options={
              aiProviders.map(p => [p.id, p.label]) as [string, string][]
            }
          />
        </View>

        <View style={{ flex: 1, minWidth: 220, gap: 4 }}>
          <Text style={{ fontSize: 12 }}>{t('Modelo')}</Text>
          <Input
            value={aiModel}
            onChangeValue={setAiModel}
            placeholder={providerSpec?.defaultModel || 'gpt-4o-mini'}
          />
          <Text style={{ fontSize: 10, color: theme.pageTextLight }}>
            {t('Deixe como está para usar o modelo padrão do provedor')}
          </Text>
        </View>

        {isCustomProvider && (
          <View style={{ flex: 1, minWidth: 220, gap: 4 }}>
            <Text style={{ fontSize: 12 }}>{t('URL base da API')}</Text>
            <Input
              value={aiBaseUrl}
              onChangeValue={setAiBaseUrl}
              placeholder="https://meu-servidor/v1"
            />
            <Text style={{ fontSize: 10, color: theme.pageTextLight }}>
              {t('Endpoint compatível com OpenAI (/chat/completions)')}
            </Text>
          </View>
        )}

        <View style={{ flex: '1 1 100%', gap: 4 }}>
          <Text style={{ fontSize: 12 }}>
            {t('Chave da API ({{provider}})', {
              provider: providerSpec?.label ?? aiProvider,
            })}
          </Text>
          <Input
            type="password"
            value={aiApiKey}
            onChangeValue={setAiApiKey}
            placeholder={aiProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
          />
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 12,
          paddingTop: 8,
          borderTop: '1px solid ' + theme.tableBorder,
        }}
      >
        {result && (
          <Text
            style={{
              fontSize: 12,
              flex: 1,
              color: result.ok ? theme.pageTextPositive : theme.errorText,
            }}
          >
            {result.ok ? '✓ ' : '✕ '}
            {result.text}
          </Text>
        )}
        <Button
          variant="primary"
          onPress={onSave}
          isDisabled={saving}
        >
          {saving ? t('Validando...') : t('Salvar configuração')}
        </Button>
      </View>
    </Card>
  );
}

export function WhatsAppPage() {
  const { t } = useTranslation();
  const {
    status,
    qrBase64,
    phone,
    groups,
    groupId,
    configured,
    aiProviders,
    aiProvider,
    aiModel,
    isLoading,
    connect,
    saveConfig,
    selectGroup,
    refreshGroups,
    logout,
  } = useWhatsAppStatus();

  return (
    <Page header={t('WhatsApp')}>
      <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
        <ConnectionPanel
          status={status}
          qrBase64={qrBase64}
          phone={phone}
          isLoading={isLoading}
          configured={configured}
          groupId={groupId}
          groups={groups}
          connect={connect}
          logout={logout}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <GroupCard
            status={status}
            groups={groups}
            groupId={groupId}
            selectGroup={selectGroup}
            refreshGroups={refreshGroups}
          />
          <ConfigCard
            aiProviders={aiProviders}
            currentProvider={aiProvider}
            currentModel={aiModel}
            saveConfig={saveConfig}
          />
        </View>
      </View>
    </Page>
  );
}
