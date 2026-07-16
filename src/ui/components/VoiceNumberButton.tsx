import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

import { parseSpokenCount } from '../../core/spokenNumber';
import type { Strings } from '../../i18n';
import { color } from '../theme';

export function VoiceNumberButton({
  strings,
  onValue,
}: {
  strings: Strings;
  onValue: (value: number) => void;
}) {
  const [available, setAvailable] = useState(false);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    try {
      setAvailable(
        ExpoSpeechRecognitionModule.isRecognitionAvailable() &&
        ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()
      );
    } catch {
      setAvailable(false);
    }
  }, []);

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('result', event => {
    if (!event.isFinal) return;
    const value = parseSpokenCount(event.results[0]?.transcript ?? '');
    if (value == null) Alert.alert(strings.VOICE_NOT_A_NUMBER);
    else onValue(value);
  });
  useSpeechRecognitionEvent('error', event => {
    setListening(false);
    if (event.error !== 'aborted') Alert.alert(strings.VOICE_UNAVAILABLE_HINT);
  });

  if (!available) return null;

  const start = async () => {
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(strings.VOICE_PERMISSION);
        return;
      }
      ExpoSpeechRecognitionModule.start({
        lang: strings.SPEECH_LOCALE,
        interimResults: false,
        continuous: false,
        maxAlternatives: 1,
        requiresOnDeviceRecognition: true,
        contextualStrings: Array.from({ length: 101 }, (_, value) => String(value)),
        androidIntentOptions: { EXTRA_LANGUAGE_MODEL: 'web_search' },
      });
    } catch {
      Alert.alert(strings.VOICE_UNAVAILABLE_HINT);
    }
  };

  return (
    <TouchableOpacity
      style={[buttonStyles.button, listening && buttonStyles.active]}
      onPress={listening ? () => ExpoSpeechRecognitionModule.stop() : start}
      accessibilityRole="button"
      accessibilityLabel={listening ? strings.VOICE_LISTENING : strings.VOICE_ENTER}
    >
      <Text style={buttonStyles.text}>{listening ? strings.VOICE_LISTENING : strings.VOICE_ENTER}</Text>
    </TouchableOpacity>
  );
}

const buttonStyles = StyleSheet.create({
  button: {
    minHeight: 48,
    minWidth: 92,
    marginLeft: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: color.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: { backgroundColor: color.amber },
  text: { color: color.onAction, fontSize: 16, fontWeight: '700' },
});
