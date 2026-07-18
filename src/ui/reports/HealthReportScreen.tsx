import React, { useEffect, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, Share, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { SQLiteDatabase } from 'expo-sqlite';

import { calculateBusinessHealthReport, type BusinessHealthReport } from '../../core/healthReport';
import { formatMoney } from '../../core/currency';
import { shopSignature } from '../../core/shopProfile';
import { loadCashUps, loadCreditEntries, loadProducts } from '../../core/db';
import type { Strings } from '../../i18n';
import { color, elevation, radius, space } from '../theme';
import { LoadingState } from '../components/LoadingState';
import { ScreenHeader } from '../components/ScreenHeader';

export function HealthReportScreen({
  db,
  strings,
  onBack,
}: {
  db: SQLiteDatabase;
  strings: Strings;
  onBack: () => void;
}) {
  const [report, setReport] = useState<BusinessHealthReport | null>(null);

  useEffect(() => {
    void Promise.all([
      db.getAllAsync<{ completed_at: number }>(
        'SELECT completed_at FROM count_sessions WHERE completed_at IS NOT NULL'
      ),
      loadProducts(db),
      loadCreditEntries(db),
      loadCashUps(db, 1000),
    ]).then(([countSessions, products, creditEntries, cashUps]) => {
      setReport(calculateBusinessHealthReport({ countSessions, products, creditEntries, cashUps }));
    }).catch(() => Alert.alert(strings.ERROR_TITLE, strings.ERROR_GENERIC));
  }, [db, strings.ERROR_GENERIC, strings.ERROR_TITLE]);

  const lines = report ? [
    strings.HEALTH_PERIOD(report.period_days),
    strings.HEALTH_COUNTS(report.count_sessions, report.unique_count_days),
    report.average_known_margin_pct == null
      ? strings.HEALTH_MARGIN_UNKNOWN
      : strings.HEALTH_MARGIN(report.average_known_margin_pct.toFixed(1), report.priced_products, report.total_products),
    strings.HEALTH_CREDIT(
      formatMoney(report.credit_given),
      formatMoney(report.credit_repaid),
      report.repayment_pct == null ? strings.NOT_AVAILABLE : `${report.repayment_pct.toFixed(0)}%`
    ),
    strings.HEALTH_CASHUPS(
      report.cash_ups,
      report.balanced_cash_ups,
      report.cash_up_discipline_pct == null ? strings.NOT_AVAILABLE : `${report.cash_up_discipline_pct.toFixed(0)}%`
    ),
  ] : [];

  return (
    <SafeAreaView style={reportStyles.container}>
      <StatusBar style="dark" />
      <ScreenHeader title={strings.HEALTH_TITLE} leftLabel={strings.BACK} onLeft={onBack} />
      {!report ? <LoadingState label={strings.HEALTH_TITLE} /> : <ScrollView contentContainerStyle={reportStyles.content}>
        <Text style={reportStyles.intro}>{strings.HEALTH_HINT}</Text>
        {lines.map((line, index) => <Text key={index} style={reportStyles.fact}>{line}</Text>)}
        {report && (
          <TouchableOpacity
            style={reportStyles.share}
            accessibilityRole="button"
            accessibilityLabel={strings.HEALTH_SHARE}
            onPress={() => {
              // A lender-facing report must say whose shop it describes.
              const signature = shopSignature();
              const header = signature
                ? `${strings.HEALTH_SHARE_HEADER}\n${strings.SHARE_SIGNOFF(signature)}`
                : strings.HEALTH_SHARE_HEADER;
              void Share.share({ message: `${header}\n\n${lines.join('\n')}` });
            }}
          >
            <Text style={reportStyles.shareText}>{strings.HEALTH_SHARE}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>}
    </SafeAreaView>
  );
}

const reportStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.canvas },
  header: { minHeight: 64, paddingHorizontal: space.base, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: color.surface },
  back: { color: color.infoInk, fontSize: 17, fontWeight: '700' },
  title: { color: color.ink, fontSize: 21, fontWeight: '800' },
  content: { padding: space.base, gap: space.md },
  intro: { color: color.inkSecondary, fontSize: 16, lineHeight: 23 },
  fact: { color: color.ink, fontSize: 17, lineHeight: 25, padding: space.base, backgroundColor: color.surface, borderRadius: radius.md, ...elevation.card },
  share: { minHeight: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: color.green, borderRadius: radius.md, marginTop: space.md },
  shareText: { color: color.onAction, fontSize: 18, fontWeight: '800' },
});
