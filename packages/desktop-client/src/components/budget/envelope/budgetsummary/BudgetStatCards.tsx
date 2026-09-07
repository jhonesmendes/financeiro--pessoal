import React from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { useEnvelopeSheetValue } from '#components/budget/envelope/EnvelopeBudgetComponents';
import { FinancialText } from '#components/FinancialText';
import { useFormat } from '#hooks/useFormat';
import { envelopeBudget } from '#spreadsheet/bindings';

import { ToBudget } from './ToBudget';

type BudgetStatCardsProps = {
  month: string;
  prevMonthName: string;
  onBudgetAction: (month: string, action: string, arg?: unknown) => void;
};

function StatCard({
  label,
  sub,
  highlighted,
  children,
}: {
  label?: ReactNode;
  sub?: ReactNode;
  highlighted?: boolean;
  children: ReactNode;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 112,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        gap: 8,
        padding: 16,
        borderRadius: 14,
        border:
          '1px solid ' +
          (highlighted ? theme.tableBorderSelected : theme.cardBorder),
        backgroundColor: highlighted
          ? theme.tableRowBackgroundHighlight
          : theme.cardBackground,
      }}
    >
      {label && (
        <Text
          style={{
            fontSize: 12,
            fontWeight: 600,
            lineHeight: 1.4,
            color: theme.pageTextLight,
          }}
        >
          {label}
        </Text>
      )}
      {children}
      {sub && (
        <Text
          style={{ fontSize: 12, lineHeight: 1.4, color: theme.pageTextLight }}
        >
          {sub}
        </Text>
      )}
    </View>
  );
}

function StatValue({
  color,
  children,
}: {
  color: string;
  children: ReactNode;
}) {
  return (
    <FinancialText
      style={{
        fontSize: 'clamp(20px, 4cqi, 24px)',
        fontWeight: 700,
        letterSpacing: '-0.02em',
        lineHeight: 1.2,
        color,
        overflowWrap: 'anywhere',
      }}
    >
      {children}
    </FinancialText>
  );
}

export function BudgetStatCards({
  month,
  prevMonthName,
  onBudgetAction,
}: BudgetStatCardsProps) {
  const { t } = useTranslation();
  const format = useFormat();

  const totalBudgeted =
    useEnvelopeSheetValue({ name: envelopeBudget.totalBudgeted, value: 0 }) ??
    0;
  const totalSpent =
    useEnvelopeSheetValue({ name: envelopeBudget.totalSpent, value: 0 }) ?? 0;
  const forNextMonth =
    useEnvelopeSheetValue({ name: envelopeBudget.forNextMonth, value: 0 }) ?? 0;

  return (
    <View
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: 12,
        '@container budget-summary (min-width: 280px)': {
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        },
        '@container budget-summary (min-width: 760px)': {
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        },
        '& [data-cellname]': {
          maxWidth: '100%',
          overflowWrap: 'anywhere',
        },
      }}
    >
      <StatCard highlighted sub={t('Recursos disponíveis neste mês')}>
        <ToBudget
          month={month}
          prevMonthName={prevMonthName}
          onBudgetAction={onBudgetAction}
          style={{ alignItems: 'stretch', gap: 4 }}
          amountStyle={{
            fontSize: 'clamp(20px, 4cqi, 24px)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
            textAlign: 'left',
          }}
        />
      </StatCard>

      <StatCard label={t('Orçado')} sub={t('Total alocado em categorias')}>
        <StatValue color={theme.budgetNumberNeutral}>
          {format(Math.abs(totalBudgeted), 'financial')}
        </StatValue>
      </StatCard>

      <StatCard label={t('Gasto')} sub={t('Gasto neste mês')}>
        <StatValue color={theme.budgetNumberNegative}>
          {format(Math.abs(totalSpent), 'financial')}
        </StatValue>
      </StatCard>

      <StatCard label={t('Guardado')} sub={t('Movido para o próximo mês')}>
        <StatValue color={theme.budgetNumberPositive}>
          {format(Math.abs(forNextMonth), 'financial')}
        </StatValue>
      </StatCard>
    </View>
  );
}
