import { Fragment, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import {
  SvgCheveronLeft,
  SvgCheveronRight,
} from '@actual-app/components/icons/v1';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';

import { useLocale } from '#hooks/useLocale';
import { useResizeObserver } from '#hooks/useResizeObserver';

import type { MonthBounds } from './MonthsContext';

type MonthPickerProps = {
  startMonth: string;
  numDisplayed: number;
  monthBounds: MonthBounds;
  style: CSSProperties;
  onSelect: (month: string) => void;
};

export function MonthPicker({
  startMonth,
  numDisplayed,
  monthBounds,
  style,
  onSelect,
}: MonthPickerProps) {
  const locale = useLocale();
  const { t } = useTranslation();
  const [count, setCount] = useState(11);
  const containerRef = useResizeObserver<HTMLDivElement>(rect => {
    setCount(Math.max(3, Math.min(11, Math.floor((rect.width - 120) / 40))));
  });
  const first = monthUtils.subMonths(
    startMonth,
    Math.floor((count - numDisplayed) / 2),
  );
  const months = monthUtils.rangeInclusive(
    first,
    monthUtils.addMonths(first, count - 1),
  );
  const lastSelected = monthUtils.addMonths(startMonth, numDisplayed - 1);
  return (
    <View
      innerRef={containerRef}
      role="navigation"
      aria-label={t('Budget months')}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        minWidth: 0,
        ...style,
      }}
    >
      <Button
        variant="bare"
        aria-label={t('Previous month')}
        onPress={() => onSelect(monthUtils.prevMonth(startMonth))}
        style={{ padding: 4, flexShrink: 0 }}
      >
        <SvgCheveronLeft width={14} height={14} />
      </Button>
      {months.map((month, index) => {
        const selected = month >= startMonth && month <= lastSelected;
        const year = monthUtils.getYear(month);
        return (
          <Fragment key={month}>
            {(index === 0 ||
              year !== monthUtils.getYear(months[index - 1])) && (
              <Text
                style={{
                  fontSize: 10,
                  color: theme.pageTextLight,
                  padding: '0 4px',
                }}
              >
                {year}
              </Text>
            )}
            <Button
              variant={selected ? 'primary' : 'bare'}
              aria-label={monthUtils.format(month, 'MMMM yyyy', locale)}
              aria-pressed={selected}
              data-testid={selected ? 'selected-budget-month' : undefined}
              data-month={month}
              onPress={() => onSelect(month)}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '5px 4px',
                fontSize: 12,
                fontWeight: selected ? 600 : 400,
                color: selected ? theme.buttonPrimaryText : theme.pageTextLight,
                opacity:
                  month < monthBounds.start || month > monthBounds.end
                    ? 0.6
                    : 1,
              }}
            >
              {monthUtils.format(month, 'MMM', locale)}
            </Button>
          </Fragment>
        );
      })}
      <Button
        variant="bare"
        aria-label={t('Next month')}
        onPress={() => onSelect(monthUtils.nextMonth(startMonth))}
        style={{ padding: 4, flexShrink: 0 }}
      >
        <SvgCheveronRight width={14} height={14} />
      </Button>
    </View>
  );
}
