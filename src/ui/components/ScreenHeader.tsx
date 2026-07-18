import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { styles } from '../styles';
import { color, radius, space, touch, type } from '../theme';

export function ScreenHeader({
  title,
  leftLabel,
  onLeft,
  rightLabel,
  onRight,
  leftHint,
  rightHint,
}: {
  title: string;
  leftLabel?: string;
  onLeft?: () => void;
  rightLabel?: string;
  onRight?: () => void;
  leftHint?: string;
  rightHint?: string;
}) {
  return (
    <View style={[styles.screenHeader, headerStyles.root]}>
      <View style={[headerStyles.side, headerStyles.left]}>
        {leftLabel && onLeft ? (
          <Pressable
            style={({ pressed }) => [headerStyles.action, pressed && headerStyles.pressed]}
            hitSlop={touch.hitSlop}
            accessibilityRole="button"
            accessibilityLabel={leftLabel}
            accessibilityHint={leftHint}
            onPress={onLeft}
          >
            <Text style={styles.backButton}>{leftLabel}</Text>
          </Pressable>
        ) : null}
      </View>

      <Text accessibilityRole="header" style={[styles.screenTitle, headerStyles.title]}>
        {title}
      </Text>

      <View style={[headerStyles.side, headerStyles.right]}>
        {rightLabel && onRight ? (
          <Pressable
            style={({ pressed }) => [headerStyles.action, pressed && headerStyles.pressed]}
            hitSlop={touch.hitSlop}
            accessibilityRole="button"
            accessibilityLabel={rightLabel}
            accessibilityHint={rightHint}
            onPress={onRight}
          >
            <Text style={styles.addButton}>{rightLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const headerStyles = StyleSheet.create({
  root: {
    justifyContent: 'flex-start',
    gap: space.sm,
  },
  side: {
    flex: 1,
    minWidth: 0,
  },
  left: {
    alignItems: 'flex-start',
  },
  right: {
    alignItems: 'flex-end',
  },
  action: {
    minHeight: touch.minTarget,
    minWidth: touch.minTarget,
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  pressed: {
    backgroundColor: color.greenSoft,
  },
  title: {
    ...type.title,
    flex: 1.4,
    minWidth: 0,
    textAlign: 'center',
  },
});
