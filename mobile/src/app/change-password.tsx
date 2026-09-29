import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

export default function ChangePasswordScreen() {
  const { isRestoring, user, changePassword } = useAuth();
  const { t } = useLanguage();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (isRestoring) return null;
  if (!user) return <Redirect href="/" />;

  async function handleSubmit() {
    setError('');
    if (newPassword.length < 8) {
      setError(t('passwordMinLength'));
      return;
    }

    setIsSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      router.replace('/dashboard');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('unableChangePassword'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>{t('securityCheck')}</Text>
        <Text style={styles.title}>{t('createPassword')}</Text>
        <Text style={styles.subtitle}>{t('temporaryPasswordNotice')}</Text>
        <Text style={styles.label}>{t('currentPassword')}</Text>
        <View style={styles.passwordInputRow}>
          <TextInput
            accessibilityLabel={t('currentPassword')}
            secureTextEntry={!showCurrentPassword}
            placeholder={t('enterTemporaryPassword')}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            style={[styles.input, styles.passwordInput]}
          />
          <Pressable accessibilityRole="button" onPress={() => setShowCurrentPassword((visible) => !visible)}>
            <Text style={styles.visibilityToggle}>{showCurrentPassword ? t('hide') : t('show')}</Text>
          </Pressable>
        </View>
        <Text style={styles.label}>{t('newPassword')}</Text>
        <View style={styles.passwordInputRow}>
          <TextInput
            accessibilityLabel={t('newPassword')}
            secureTextEntry={!showNewPassword}
            placeholder={t('enterNewPassword')}
            value={newPassword}
            onChangeText={setNewPassword}
            style={[styles.input, styles.passwordInput]}
          />
          <Pressable accessibilityRole="button" onPress={() => setShowNewPassword((visible) => !visible)}>
            <Text style={styles.visibilityToggle}>{showNewPassword ? t('hide') : t('show')}</Text>
          </Pressable>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable disabled={isSaving} onPress={handleSubmit} style={styles.button}>
          <Text style={styles.buttonText}>{isSaving ? t('saving') : t('setPassword')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#F3F2F5', flex: 1 },
  content: { padding: 24 },
  eyebrow: { color: '#D97D00', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: '#2A2030', fontSize: 30, fontWeight: '800', marginTop: 9 },
  subtitle: { color: '#7D7382', fontSize: 15, lineHeight: 22, marginTop: 8 },
  label: { color: '#2A2030', fontSize: 14, fontWeight: '700', marginTop: 18 },
  input: { backgroundColor: '#FFFFFF', borderColor: '#E5E1E8', borderRadius: 8, borderWidth: 1, color: '#2A2030', fontSize: 16, height: 56, marginTop: 8, paddingHorizontal: 16 },
  passwordInputRow: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#E5E1E8', borderRadius: 8, borderWidth: 1, flexDirection: 'row', marginTop: 8, paddingRight: 16 },
  passwordInput: { borderWidth: 0, flex: 1, marginTop: 0 },
  visibilityToggle: { color: '#6D5267', fontSize: 14, fontWeight: '700', paddingLeft: 12 },
  error: { color: '#C93737', fontSize: 13, marginTop: 14 },
  button: { alignItems: 'center', backgroundColor: '#4B2D42', borderRadius: 8, height: 56, justifyContent: 'center', marginTop: 22 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});