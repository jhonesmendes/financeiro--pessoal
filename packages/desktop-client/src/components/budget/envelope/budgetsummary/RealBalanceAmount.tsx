import React from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { Block } from '@actual-app/components/block';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { useEnvelopeSheetValue } from '#components/budget/envelope/EnvelopeBudgetComponents';
import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { useFormat } from '#hooks/useFormat';
import { envelopeBudget } from '#spreadsheet/bindings';

// "Real" balance for the month: what actually came in minus what actually
// went out. Unlike the envelope model's "to budget" figure, this ignores
// planned/budgeted amounts entirely, so it can't go negative just because
// more was budgeted than is available - it reflects actual cash flow.
export function useRealBalance() {
  const totalIncome =
    useEnvelopeSheetValue({ name: envelopeBudget.totalIncome, value: 0 }) ?? 0;
  const totalSpent =
    useEnvelopeSheetValue({ name: envelopeBudget.totalSpent, value: 0 }) ?? 0;
  return totalIncome - Math.abs(totalSpent);
}

type RealBalanceAmountProps = {
  style?: CSSProperties;
  amountStyle?: CSSProperties;
};

export function RealBalanceAmount({
  style,
  amountStyle,
}: RealBalanceAmountProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const realBalance = useRealBalance();
  const isNegative = realBalance < 0;

  return (
    <View style={{ alignItems: 'center', ...style }}>
      <Block
        style={{ fontSize: 11, color: theme.pageTextLight, marginBottom: 4 }}
      >
        {t('Saldo real do mês:')}
      </Block>
      <PrivacyFilter style={{ textAlign: 'center' }}>
        <FinancialText
          style={{
            fontWeight: 400,
            color: isNegative
              ? theme.budgetNumberNegative
              : theme.budgetNumberPositive,
            ...amountStyle,
          }}
        >
          {format(realBalance, 'financial-with-sign')}
        </FinancialText>
      </PrivacyFilter>
    </View>
  );
}
