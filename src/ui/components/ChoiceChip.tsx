import React from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { border, color, icon as iconSize, radius, space, touch, type } from '../theme';

export function ChoiceChip({
  label,
  icon,
  selected,
  onPress,
  accessibilityHint,
  style,
}: {
  label: string;
  icon?: string;
  selected: boolean;
  onPress: () => void;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        chipStyles.chip,
        selected && chipStyles.selected,
        pressed && chipStyles.pressed,
        style,
      ]}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected }}
      onPress={onPress}
    >
      {icon ? <Text style={chipStyles.icon} importantForAccessibility="no">{icon}</Text> : null}
      <Text style={[chipStyles.label, selected && chipStyles.labelSelected]}>{label}</Text>
      {selected ? <Text style={chipStyles.check} importantForAccessibility="no">✓</Text> : null}
    </Pressable>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    minHeight: touch.minTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: border.hairline,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
  },
  selected: {
    borderWidth: border.selected,
    borderColor: color.green,
    backgroundColor: color.greenSoft,
  },
  pressed: {
    backgroundColor: color.surfaceSunken,
  },
  icon: {
    fontSize: iconSize.sm,
  },
  label: {
    ...type.label,
    flexShrink: 1,
    color: color.inkSecondary,
  },
  labelSelected: {
    color: color.greenInk,
    fontWeight: '700',
  },
  check: {
    ...type.bodyStrong,
    color: color.greenInk,
  },
});
