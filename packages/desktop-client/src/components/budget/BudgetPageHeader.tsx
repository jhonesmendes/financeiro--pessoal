// @ts-strict-ignore
import React, { memo } from 'react';
import type { ComponentProps } from 'react';
import { useTranslation, Trans } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { useGlobalPref } from '#hooks/useGlobalPref';

import { MonthPicker } from './MonthPicker';
import { getScrollbarWidth } from './util';

type BudgetPageHeaderProps = {
  startMonth: string;
  onMonthSelect: (month: string) => void;
  numMonths: number;
  monthBounds: ComponentProps<typeof MonthPicker>['monthBounds'];
};

export const BudgetPageHeader = memo<BudgetPageHeaderProps>(
  ({ startMonth, onMonthSelect, numMonths, monthBounds }) => {
    const { t } = useTranslation();
    const [categoryExpandedStatePref] = useGlobalPref('categoryExpandedState');
    const categoryExpandedState = categoryExpandedStatePref ?? 0;
    const offsetMultipleMonths = numMonths === 1 ? 4 : 0;
    const isSingleMonth = numMonths === 1;

    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: theme.tableHeaderBackground,
          borderBottom: '1px solid ' + theme.tableBorder,
          gap: 20,
          padding: '12px 28px',
          flexShrink: 0,
        }}
      >
        <View style={{ flexShrink: 0 }}>
          <Text style={{ fontSize: 15, fontWeight: 600 }}>{<Trans>Budget</Trans>}</Text>
          <Text style={{ fontSize: 12, color: theme.pageTextLight }}>
            {t('Monthly overview')}
          </Text>
        </View>

        <View
          style={{
            marginLeft: isSingleMonth
              ? 'auto'
              : 200 + 100 * categoryExpandedState + 5 - offsetMultipleMonths,
            marginRight: isSingleMonth
              ? 0
              : 5 + getScrollbarWidth() - offsetMultipleMonths,
            width: isSingleMonth ? 'min(620px, 75%)' : undefined,
            minWidth: 0,
          }}
        >
          <View
            style={{
              backgroundColor: theme.tableRowHeaderBackground,
              border: '1px solid ' + theme.tableBorder,
              borderRadius: 12,
              padding: 4,
            }}
          >
            <MonthPicker
              startMonth={startMonth}
              numDisplayed={numMonths}
              monthBounds={monthBounds}
              style={{ paddingTop: 0 }}
              onSelect={month => onMonthSelect(month)}
            />
          </View>
        </View>
      </View>
    );
  },
);

BudgetPageHeader.displayName = 'BudgetPageHeader';
