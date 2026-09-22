import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/AuthContext';

export default function ChangePasswordScreen() {
  const { isRestoring, user, changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (isRestoring) return null;
  if (!user) return <Redirect href="/" />;

  async function handleSubmit() {
    setError('');
    if (newPassword.length < 8) {
      setError('Your new password must be at least 8 characters.');
      return;
    }

    setIsSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      router.replace('/dashboard');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to change password.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>SECURITY CHECK</Text>
        <Text style={styles.title}>Create your password</Text>
        <Text style={styles.subtitle}>Your temporary password must be replaced before you continue.</Text>
        <Text style={styles.label}>Current password</Text>
        <TextInput
          accessibilityLabel="Current password"
          secureTextEntry
          placeholder="Enter your temporary password"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          style={styles.input}
        />
        <Text style={styles.label}>New password</Text>
        <TextInput
          accessibilityLabel="New password"
          secureTextEntry
          placeholder="Enter a new password"
          value={newPassword}
          onChangeText={setNewPassword}
          style={styles.input}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable disabled={isSaving} onPress={handleSubmit} style={styles.button}>
          <Text style={styles.buttonText}>{isSaving ? 'Saving...' : 'Set password'}</Text>
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
  error: { color: '#C93737', fontSize: 13, marginTop: 14 },
  button: { alignItems: 'center', backgroundColor: '#4B2D42', borderRadius: 8, height: 56, justifyContent: 'center', marginTop: 22 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});