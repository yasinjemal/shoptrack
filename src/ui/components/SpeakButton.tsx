import React, { useState } from 'react';
import { TouchableOpacity, Text } from 'react-native';
import * as Speech from 'expo-speech';
import { styles } from '../styles';

export function SpeakButton({
  text,
  strings,
}: {
  text: string;
  strings: { READ_ALOUD: string; STOP_READING: string; SPEECH_LOCALE: string };
}) {
  const [speaking, setSpeaking] = useState(false);

  const toggle = async () => {
    if (speaking || await Speech.isSpeakingAsync()) {
      await Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    Speech.speak(text, {
      language: strings.SPEECH_LOCALE,
      rate: 0.9,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  return (
    <TouchableOpacity style={styles.insightButton} onPress={toggle} accessibilityRole="button">
      <Text style={styles.insightButtonIcon}>🔊</Text>
      <Text style={styles.insightButtonText}>
        {speaking ? strings.STOP_READING : strings.READ_ALOUD}
      </Text>
    </TouchableOpacity>
  );
}

