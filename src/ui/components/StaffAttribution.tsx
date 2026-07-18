import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

import { findStaffByPin, loadStaffMembers, type StaffMember } from '../../core/db';
import type { Strings } from '../../i18n';
import { color, radius, space } from '../theme';

export function StaffAttribution({
  db,
  strings,
  onSelected,
  onRequirementChange,
}: {
  db: SQLiteDatabase;
  strings: Strings;
  onSelected: (staffId: number | null) => void;
  onRequirementChange: (required: boolean) => void;
}) {
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [pin, setPin] = useState('');
  const [selected, setSelected] = useState<StaffMember | null>(null);

  useEffect(() => {
    void loadStaffMembers(db).then(active => {
      setMembers(active);
      onRequirementChange(active.length > 0);
    });
  }, [db, onRequirementChange]);

  if (members.length === 0) return null;

  const confirm = async () => {
    const member = await findStaffByPin(db, pin);
    if (!member) {
      Alert.alert(strings.STAFF_WRONG_PIN);
      return;
    }
    setSelected(member);
    setPin('');
    onSelected(member.id);
  };

  return (
    <View style={staffStyles.box}>
      <Text style={staffStyles.title}>{strings.STAFF_WHO}</Text>
      {selected ? (
        <TouchableOpacity onPress={() => { setSelected(null); onSelected(null); }}>
          <Text style={staffStyles.selected}>{strings.STAFF_RECORDED_AS(selected.name)}</Text>
        </TouchableOpacity>
      ) : (
        <View style={staffStyles.row}>
          <TextInput
            style={staffStyles.input}
            placeholder={strings.STAFF_ENTER_PIN}
            placeholderTextColor={color.inkMuted}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            value={pin}
            onChangeText={value => setPin(value.replace(/\D/g, ''))}
          />
          <TouchableOpacity
            style={[staffStyles.button, pin.length !== 4 && staffStyles.disabled]}
            disabled={pin.length !== 4}
            onPress={confirm}
          >
            <Text style={staffStyles.buttonText}>{strings.STAFF_CONFIRM}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const staffStyles = StyleSheet.create({
  box: { margin: space.base, padding: space.md, gap: space.sm, backgroundColor: color.infoSoft, borderColor: color.infoBorder, borderWidth: 1, borderRadius: radius.md },
  title: { color: color.infoInk, fontSize: 17, fontWeight: '800' },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  input: { flex: 1, minHeight: 50, color: color.ink, backgroundColor: color.surface, borderColor: color.borderStrong, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md },
  button: { minHeight: 50, maxWidth: 140, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: color.info },
  disabled: { opacity: 0.5 },
  buttonText: { color: color.onAction, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  selected: { color: color.greenInk, fontSize: 17, fontWeight: '800', paddingVertical: space.sm },
});
