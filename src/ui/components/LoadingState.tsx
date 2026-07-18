import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { color, space, type } from '../theme';

export function LoadingState({ label }: { label: string }) {
  return (
    <View
      style={loadingStyles.root}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
    >
      <ActivityIndicator color={color.green} size="large" />
      <Text style={loadingStyles.label}>{label}</Text>
    </View>
  );
}

const loadingStyles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
  },
  label: {
    ...type.body,
    color: color.inkSecondary,
    textAlign: 'center',
  },
});
