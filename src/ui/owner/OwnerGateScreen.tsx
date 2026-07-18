/**
 * ============================================
 * OWNER GATE
 * ============================================
 *
 * The screen between the worker and the owner's money. Rendered by the state
 * machine in front of any gated screen (expenses, sales book, weekly,
 * activity, health report) while the owner lock is on, and directly when the
 * locked Home card is tapped.
 *
 * One question, one input, per the house rule. A wrong PIN just re-asks --
 * see ownerLock.ts for why there is no lockout.
 */

import React, { useState } from 'react';
import { Pressable, SafeAreaView, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { unlockOwner } from '../../core/ownerLock';
import { styles } from '../styles';
import { color } from '../theme';
import { ScreenHeader } from '../components/ScreenHeader';

export interface OwnerGateStrings {
  BACK: string;
  OWNER_ONLY_TITLE: string;
  OWNER_ONLY_HINT: string;
  OWNER_PIN_CURRENT: string;
  OWNER_UNLOCK: string;
  OWNER_WRONG_PIN: string;
}

export function OwnerGateScreen({
  strings,
  onBack,
  onUnlocked,
}: {
  strings: OwnerGateStrings;
  onBack: () => void;
  onUnlocked: () => void;
}) {
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);

  const tryUnlock = () => {
    if (unlockOwner(pin)) {
      onUnlocked();
    } else {
      setWrong(true);
      setPin('');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <ScreenHeader title={strings.OWNER_ONLY_TITLE} leftLabel={strings.BACK} onLeft={onBack} />

      <View style={{ padding: 20, gap: 12 }}>
        <Text style={styles.inputLabel}>{strings.OWNER_ONLY_HINT}</Text>
        <TextInput
          style={styles.priceInput}
          placeholder={strings.OWNER_PIN_CURRENT}
          placeholderTextColor={color.inkMuted}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={4}
          autoFocus
          value={pin}
          accessibilityLabel={strings.OWNER_PIN_CURRENT}
          onChangeText={value => {
            setPin(value.replace(/\D/g, ''));
            setWrong(false);
          }}
          onSubmitEditing={tryUnlock}
        />
        {wrong && (
          <Text style={styles.inputHint} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {strings.OWNER_WRONG_PIN}
          </Text>
        )}
        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            pin.length !== 4 && styles.saveButtonDisabled,
            pressed && pin.length === 4 && { opacity: 0.85 },
          ]}
          disabled={pin.length !== 4}
          accessibilityRole="button"
          accessibilityLabel={strings.OWNER_UNLOCK}
          accessibilityState={{ disabled: pin.length !== 4 }}
          onPress={tryUnlock}
        >
          <Text style={styles.saveButtonText}>{strings.OWNER_UNLOCK}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
