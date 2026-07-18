import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { SQLiteDatabase } from 'expo-sqlite';

import { COUNTRY_PACKS, COUNTRY_PACK_CODES, type CountryPackCode } from '../../core/countryPacks';
import { CURRENCIES, CURRENCY_CODES, type CurrencyCode } from '../../core/currency';
import {
  addStaffMember,
  deactivateStaffMember,
  getSetting,
  loadStaffMembers,
  setSetting,
  type StaffMember,
} from '../../core/db';
import { buildRemoteShopSnapshot, type RemoteShopSnapshot } from '../../core/remoteViewer';
import { buildBackupPreview } from '../../core/backupPreview';
import {
  SHOP_NAME_SETTING_KEY,
  SHOP_PHONE_SETTING_KEY,
  SHOP_TEXT_MAX_LENGTH,
  type ShopProfile,
} from '../../core/shopProfile';
import { isOwnerLockEnabled, isValidOwnerPin, verifyOwnerPin } from '../../core/ownerLock';
import { LANGUAGE_OPTIONS, type Language, type Strings } from '../../i18n';
import {
  createConfiguredCloudBackupStore,
  downloadEncryptedBackup,
  generateRecoveryPhrase,
  isValidRecoveryPhrase,
  loadRememberedRecoveryPhrase,
  rememberRecoveryPhrase,
  uploadEncryptedBackup,
} from '../../net/cloudBackup';
import { photoBackupMediaAdapter } from '../../media/photoBackupAdapter';
import {
  isAutomaticCloudBackupOptedIn,
  restoreBackupWithSafetySnapshot,
  scheduleAutomaticCloudBackup,
  setAutomaticCloudBackupOptIn,
  undoRestoreFromSafetySnapshot,
} from '../../app/dataSafety';
import { border, color, control, elevation, radius, space, state, type } from '../theme';
import { refreshActivationMetric } from '../../app/activation';
import { ScreenHeader } from '../components/ScreenHeader';
import {
  buildPartnerActivationExport,
  normaliseReferralCode,
  PARTNER_REFERRAL_SETTING,
} from '../../core/partner';
import { CloudBackupViewerScreen } from '../cloud/CloudBackupViewerScreen';
import { renderBackupPreviewMessage } from '../backupPreviewMessage';

export function SettingsScreen({
  db,
  strings,
  language,
  currency,
  countryPack,
  onBack,
  onLanguageChange,
  onCurrencyChange,
  onCountryPackChange,
  onShopProfileChange,
  onOwnerPinChange,
  onDataRestored,
  remoteViewerEntitled = false,
  automaticCloudBackupEntitled = false,
}: {
  db: SQLiteDatabase;
  strings: Strings;
  language: Language;
  currency: CurrencyCode;
  countryPack: CountryPackCode;
  onBack: () => void;
  onLanguageChange: (language: Language) => Promise<void>;
  onCurrencyChange: (currency: CurrencyCode) => Promise<void>;
  onCountryPackChange: (country: CountryPackCode) => Promise<void>;
  onShopProfileChange: (profile: ShopProfile) => Promise<void>;
  onOwnerPinChange: (pin: string | null) => Promise<void>;
  onDataRestored: () => Promise<void>;
  /** Plus capability, supplied by app-level entitlement state. Fails closed. */
  remoteViewerEntitled?: boolean;
  /** Separate Plus gate so viewer access cannot imply background uploads. */
  automaticCloudBackupEntitled?: boolean;
}) {
  const [phrase, setPhrase] = useState('');
  const [restorePhrase, setRestorePhrase] = useState('');
  const [remembered, setRemembered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffName, setStaffName] = useState('');
  const [staffPin, setStaffPin] = useState('');
  const [partnerCode, setPartnerCode] = useState('');
  const [shopName, setShopName] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [ownerPinNew, setOwnerPinNew] = useState('');
  const [ownerPinCurrent, setOwnerPinCurrent] = useState('');
  const [cloudViewer, setCloudViewer] = useState<RemoteShopSnapshot | null>(null);
  const [automaticBackupOptedIn, setAutomaticBackupOptedIn] = useState(false);
  // Read once per render; onOwnerPinChange triggers a parent re-render.
  const lockEnabled = isOwnerLockEnabled();
  const store = useMemo(() => createConfiguredCloudBackupStore(), []);

  useEffect(() => {
    void loadRememberedRecoveryPhrase().then(value => {
      if (value) {
        setPhrase(value);
        setRemembered(true);
      }
    });
  }, []);

  useEffect(() => {
    void isAutomaticCloudBackupOptedIn().then(setAutomaticBackupOptedIn);
  }, []);

  const refreshStaff = React.useCallback(async () => {
    setStaff(await loadStaffMembers(db));
  }, [db]);

  useEffect(() => { void refreshStaff(); }, [refreshStaff]);

  useEffect(() => {
    void getSetting(db, PARTNER_REFERRAL_SETTING).then(value => setPartnerCode(value ?? ''));
  }, [db]);

  useEffect(() => {
    void getSetting(db, SHOP_NAME_SETTING_KEY).then(value => setShopName(value ?? ''));
    void getSetting(db, SHOP_PHONE_SETTING_KEY).then(value => setShopPhone(value ?? ''));
  }, [db]);

  const addStaff = async () => {
    try {
      await addStaffMember(db, staffName, staffPin);
      setStaffName('');
      setStaffPin('');
      await refreshStaff();
    } catch {
      Alert.alert(strings.ERROR_TITLE, strings.ERROR_GENERIC);
    }
  };

  const createPhrase = async () => {
    setPhrase(await generateRecoveryPhrase());
    setRemembered(false);
  };

  const confirmPhrase = async () => {
    await rememberRecoveryPhrase(phrase);
    setRemembered(true);
  };

  const upload = async () => {
    if (!store || !remembered) return;
    setBusy(true);
    try {
      await uploadEncryptedBackup(db, store, phrase, photoBackupMediaAdapter);
      Alert.alert(strings.CLOUD_UPLOAD_DONE);
    } catch {
      Alert.alert(strings.ERROR_TITLE, strings.CLOUD_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const toggleAutomaticBackup = async () => {
    const next = !automaticBackupOptedIn;
    try {
      await setAutomaticCloudBackupOptIn(next);
      setAutomaticBackupOptedIn(next);
      if (next && store) {
        // Enabling is an explicit request for the current state, independent
        // of whether today's local snapshot was already created at startup.
        scheduleAutomaticCloudBackup(db, {
          optedIn: true,
          entitled: automaticCloudBackupEntitled,
          store,
          newSnapshot: true,
        });
      }
    } catch {
      Alert.alert(strings.ERROR_TITLE, strings.CLOUD_ERROR);
    }
  };

  const download = async () => {
    if (!store) return;
    if (!isValidRecoveryPhrase(restorePhrase)) {
      Alert.alert(strings.CLOUD_BAD_PHRASE);
      return;
    }
    setBusy(true);
    try {
      const backup = await downloadEncryptedBackup(store, restorePhrase);
      const previewMessage = renderBackupPreviewMessage(buildBackupPreview(backup), strings);
      // The Plus viewer is projected only when entitled. Manual recovery stays
      // available to every shop, preserving the permanently-free restore path.
      const viewer = remoteViewerEntitled ? buildRemoteShopSnapshot(backup) : null;
      const actions = [
        { text: strings.CANCEL, style: 'cancel' },
        ...(viewer
          ? [{ text: strings.CLOUD_VIEW_ACTION, onPress: () => setCloudViewer(viewer) }]
          : []),
        {
          text: strings.RESTORE_ACTION,
          style: 'destructive',
          onPress: async () => {
            try {
              const snapshotUri = await restoreBackupWithSafetySnapshot(db, backup);
              await onDataRestored();
              Alert.alert(strings.CLOUD_RESTORE_DONE, undefined, [
                {
                  text: strings.RESTORE_UNDO_ACTION,
                  onPress: async () => {
                    try {
                      await undoRestoreFromSafetySnapshot(db, snapshotUri);
                      await onDataRestored();
                      Alert.alert(strings.RESTORE_UNDO_DONE);
                    } catch {
                      Alert.alert(strings.ERROR_TITLE, strings.CLOUD_ERROR);
                    }
                  },
                },
                { text: strings.DONE },
              ]);
            } catch {
              Alert.alert(strings.ERROR_TITLE, strings.CLOUD_ERROR);
            }
          },
        },
      ] as Parameters<typeof Alert.alert>[2];
      Alert.alert(
        strings.CLOUD_RESTORE_READY,
        `${strings.CLOUD_RESTORE_READY_HINT}\n\n${previewMessage}`,
        actions
      );
    } catch {
      Alert.alert(strings.ERROR_TITLE, strings.CLOUD_ERROR);
    } finally {
      setBusy(false);
    }
  };

  if (cloudViewer) {
    return (
      <CloudBackupViewerScreen
        snapshot={cloudViewer}
        strings={strings}
        onBack={() => setCloudViewer(null)}
      />
    );
  }

  return (
    <SafeAreaView style={settingsStyles.container}>
      <StatusBar style="dark" />
      <ScreenHeader title={strings.SETTINGS} leftLabel={strings.BACK} onLeft={onBack} />
      <ScrollView contentContainerStyle={settingsStyles.content}>
        <Section title={strings.SHOP_PROFILE} hint={strings.SHOP_PROFILE_HINT}>
          <TextInput
            style={settingsStyles.inputSmall}
            placeholder={strings.SHOP_NAME_PLACEHOLDER}
            placeholderTextColor={color.inkMuted}
            maxLength={SHOP_TEXT_MAX_LENGTH}
            value={shopName}
            onChangeText={setShopName}
          />
          <TextInput
            style={settingsStyles.inputSmall}
            placeholder={strings.SHOP_PHONE_PLACEHOLDER}
            placeholderTextColor={color.inkMuted}
            keyboardType="phone-pad"
            maxLength={SHOP_TEXT_MAX_LENGTH}
            value={shopPhone}
            onChangeText={setShopPhone}
          />
          <Choice label={strings.SHOP_PROFILE_SAVE} onPress={async () => {
            await onShopProfileChange({ shop_name: shopName, shop_phone: shopPhone });
            Alert.alert(strings.SHOP_PROFILE_SAVED);
          }} />
        </Section>

        <Section title={strings.COUNTRY_PACK} hint={strings.COUNTRY_PACK_HINT}>
          {COUNTRY_PACK_CODES.map(code => (
            <Choice
              key={code}
              label={`${COUNTRY_PACKS[code].name} · ${COUNTRY_PACKS[code].currency}`}
              selected={countryPack === code}
              onPress={() => onCountryPackChange(code)}
            />
          ))}
        </Section>

        <Section title={strings.CURRENCY_LABEL}>
          <View style={settingsStyles.wrap}>
            {CURRENCY_CODES.map(code => (
              <Choice
                compact
                key={code}
                label={`${code} ${CURRENCIES[code].symbol}`}
                selected={currency === code}
                onPress={() => onCurrencyChange(code)}
              />
            ))}
          </View>
        </Section>

        <Section title={strings.LANGUAGE_LABEL}>
          {LANGUAGE_OPTIONS.map(option => (
            <Choice
              key={option.code}
              label={option.label}
              detail={option.reviewed ? undefined : strings.LANGUAGE_REVIEW_PENDING}
              selected={language === option.code}
              onPress={() => onLanguageChange(option.code)}
            />
          ))}
        </Section>

        <Section title={strings.OWNER_LOCK} hint={strings.OWNER_LOCK_HINT}>
          {lockEnabled && <Text style={settingsStyles.success}>{strings.OWNER_LOCK_ON}</Text>}
          {/* Changing or removing the PIN requires the current one -- the
              phone lives in the worker's hands, and a lock a worker can
              quietly remove is not a lock. */}
          {lockEnabled && (
            <TextInput
              style={settingsStyles.inputSmall}
              placeholder={strings.OWNER_PIN_CURRENT}
              placeholderTextColor={color.inkMuted}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              value={ownerPinCurrent}
              onChangeText={value => setOwnerPinCurrent(value.replace(/\D/g, ''))}
            />
          )}
          <TextInput
            style={settingsStyles.inputSmall}
            placeholder={strings.OWNER_PIN_PLACEHOLDER}
            placeholderTextColor={color.inkMuted}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            value={ownerPinNew}
            onChangeText={value => setOwnerPinNew(value.replace(/\D/g, ''))}
          />
          <Choice
            label={lockEnabled ? strings.OWNER_LOCK_CHANGE : strings.OWNER_LOCK_ENABLE}
            disabled={!isValidOwnerPin(ownerPinNew) || (lockEnabled && ownerPinCurrent.length !== 4)}
            onPress={async () => {
              if (lockEnabled && !verifyOwnerPin(ownerPinCurrent)) {
                Alert.alert(strings.OWNER_WRONG_PIN);
                return;
              }
              await onOwnerPinChange(ownerPinNew);
              setOwnerPinNew('');
              setOwnerPinCurrent('');
              Alert.alert(strings.OWNER_LOCK_CHANGED);
            }}
          />
          {lockEnabled && (
            <Choice
              label={strings.OWNER_LOCK_DISABLE}
              disabled={ownerPinCurrent.length !== 4}
              onPress={async () => {
                if (!verifyOwnerPin(ownerPinCurrent)) {
                  Alert.alert(strings.OWNER_WRONG_PIN);
                  return;
                }
                await onOwnerPinChange(null);
                setOwnerPinNew('');
                setOwnerPinCurrent('');
                Alert.alert(strings.OWNER_LOCK_CHANGED);
              }}
            />
          )}
        </Section>

        <Section title={strings.STAFF_MODE} hint={strings.STAFF_MODE_HINT}>
          {staff.map(member => (
            <View key={member.id} style={settingsStyles.staffRow}>
              <Text style={settingsStyles.choiceText}>{member.name}</Text>
              <TouchableOpacity onPress={async () => {
                await deactivateStaffMember(db, member.id);
                await refreshStaff();
              }}>
                <Text style={settingsStyles.remove}>{strings.STAFF_REMOVE}</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TextInput
            style={settingsStyles.inputSmall}
            placeholder={strings.STAFF_NAME}
            placeholderTextColor={color.inkMuted}
            value={staffName}
            onChangeText={setStaffName}
          />
          <TextInput
            style={settingsStyles.inputSmall}
            placeholder={strings.STAFF_PIN}
            placeholderTextColor={color.inkMuted}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            value={staffPin}
            onChangeText={value => setStaffPin(value.replace(/\D/g, ''))}
          />
          <Choice
            label={strings.STAFF_ADD}
            disabled={!staffName.trim() || staffPin.length !== 4}
            onPress={addStaff}
          />
        </Section>

        <Section title={strings.PARTNER_TITLE} hint={strings.PARTNER_HINT}>
          <TextInput
            style={settingsStyles.inputSmall}
            placeholder={strings.PARTNER_CODE}
            placeholderTextColor={color.inkMuted}
            autoCapitalize="characters"
            value={partnerCode}
            onChangeText={setPartnerCode}
          />
          <Choice label={strings.PARTNER_SAVE} onPress={async () => {
            const clean = normaliseReferralCode(partnerCode);
            if (!clean) {
              Alert.alert(strings.PARTNER_BAD_CODE);
              return;
            }
            await setSetting(db, PARTNER_REFERRAL_SETTING, clean);
            setPartnerCode(clean);
          }} />
          <Text style={settingsStyles.hint}>{strings.PARTNER_EXPORT_HINT}</Text>
          <Choice label={strings.PARTNER_EXPORT} onPress={async () => {
            const metric = await refreshActivationMetric(db);
            const referral = await getSetting(db, PARTNER_REFERRAL_SETTING);
            const payload = buildPartnerActivationExport(metric, referral);
            await Share.share({ message: JSON.stringify(payload, null, 2) });
          }} />
        </Section>

        <Section title={strings.CLOUD_BACKUP_TITLE} hint={strings.CLOUD_BACKUP_HINT}>
          {!store ? (
            <Text style={settingsStyles.warning}>{strings.CLOUD_BACKEND_MISSING}</Text>
          ) : (
            <>
              {!phrase && <Choice label={strings.CLOUD_CREATE_PHRASE} onPress={createPhrase} />}
              {!!phrase && (
                <>
                  <Text style={settingsStyles.warning}>{strings.CLOUD_PHRASE_WARNING}</Text>
                  <Text selectable style={settingsStyles.phrase}>{phrase}</Text>
                  {!remembered ? (
                    <Choice label={strings.CLOUD_WROTE_PHRASE} onPress={confirmPhrase} />
                  ) : (
                    <Text style={settingsStyles.success}>{strings.CLOUD_PHRASE_SAVED}</Text>
                  )}
                  <Choice
                    label={strings.CLOUD_UPLOAD}
                    disabled={!remembered || busy}
                    onPress={upload}
                  />
                  <Text style={settingsStyles.hint}>{strings.CLOUD_AUTO_BACKUP_HINT}</Text>
                  {!automaticCloudBackupEntitled ? (
                    <>
                      <Text style={settingsStyles.warning}>{strings.CLOUD_PLUS_REQUIRED}</Text>
                      {automaticBackupOptedIn && (
                        <Choice
                          label={strings.CLOUD_AUTO_BACKUP_DISABLE}
                          selected
                          onPress={toggleAutomaticBackup}
                        />
                      )}
                    </>
                  ) : (
                    <Choice
                      label={automaticBackupOptedIn
                        ? strings.CLOUD_AUTO_BACKUP_DISABLE
                        : strings.CLOUD_AUTO_BACKUP_ENABLE}
                      selected={automaticBackupOptedIn}
                      disabled={busy || (!automaticBackupOptedIn && !remembered)}
                      onPress={toggleAutomaticBackup}
                    />
                  )}
                </>
              )}
              <TextInput
                style={settingsStyles.input}
                multiline
                placeholder={strings.CLOUD_RESTORE_PHRASE}
                placeholderTextColor={color.inkMuted}
                value={restorePhrase}
                onChangeText={setRestorePhrase}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Choice label={strings.CLOUD_DOWNLOAD} disabled={busy} onPress={download} />
            </>
          )}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={settingsStyles.section}>
      <Text style={settingsStyles.sectionTitle}>{title}</Text>
      {hint && <Text style={settingsStyles.hint}>{hint}</Text>}
      {children}
    </View>
  );
}

function Choice({
  label,
  detail,
  selected = false,
  disabled = false,
  compact = false,
  onPress,
}: {
  label: string;
  detail?: string;
  selected?: boolean;
  disabled?: boolean;
  compact?: boolean;
  onPress: () => void | Promise<void>;
}) {
  return (
    <TouchableOpacity
      style={[
        settingsStyles.choice,
        compact && settingsStyles.compact,
        selected && settingsStyles.selected,
        disabled && settingsStyles.disabled,
      ]}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={detail}
      accessibilityState={{ selected, disabled }}
      onPress={() => void onPress()}
    >
      <Text style={[settingsStyles.choiceText, selected && settingsStyles.selectedText]}>
        {selected ? `✓ ${label}` : label}
      </Text>
      {detail && <Text style={settingsStyles.detail}>{detail}</Text>}
    </TouchableOpacity>
  );
}

const settingsStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.canvas },
  header: {
    minHeight: 64, paddingHorizontal: space.base, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between', backgroundColor: color.surface,
  },
  back: { color: color.infoInk, fontSize: 17, fontWeight: '700' },
  title: { color: color.ink, fontSize: 22, fontWeight: '800' },
  content: { padding: space.base, gap: space.base, paddingBottom: space['3xl'] },
  section: {
    padding: space.base, gap: space.sm, borderRadius: radius.lg,
    backgroundColor: color.surface, ...elevation.card,
  },
  sectionTitle: { color: color.ink, fontSize: 20, fontWeight: '800' },
  hint: { color: color.inkSecondary, fontSize: 15, lineHeight: 21, marginBottom: space.xs },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  choice: {
    minHeight: control.button, borderWidth: border.hairline, borderColor: color.borderStrong,
    borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm,
    justifyContent: 'center', backgroundColor: color.surface,
  },
  compact: { minWidth: '46%', flexGrow: 1 },
  selected: { borderColor: color.green, backgroundColor: color.greenSoft, borderWidth: border.selected },
  disabled: { opacity: state.disabledOpacity, backgroundColor: color.surfaceSunken },
  choiceText: { ...type.title, color: color.ink, fontWeight: '700' },
  selectedText: { color: color.greenInk },
  detail: { color: color.inkMuted, fontSize: 13, marginTop: 2 },
  warning: { color: color.amberInk, backgroundColor: color.amberSoft, padding: space.md, borderRadius: radius.md, lineHeight: 21 },
  success: { color: color.greenInk, backgroundColor: color.greenSoft, padding: space.md, borderRadius: radius.md },
  phrase: { color: color.ink, fontSize: 19, lineHeight: 30, fontWeight: '700', padding: space.md, borderWidth: 1, borderColor: color.borderStrong, borderRadius: radius.md },
  input: { minHeight: 90, color: color.ink, fontSize: 16, textAlignVertical: 'top', borderWidth: 1, borderColor: color.borderStrong, borderRadius: radius.md, padding: space.md },
  inputSmall: { minHeight: 52, color: color.ink, fontSize: 16, borderWidth: 1, borderColor: color.borderStrong, borderRadius: radius.md, padding: space.md },
  staffRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: color.border },
  remove: { color: color.redInk, fontSize: 16, fontWeight: '700', padding: space.sm },
});
