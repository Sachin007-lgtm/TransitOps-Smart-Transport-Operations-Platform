import { useRef, useState } from 'react';
import { Redirect, router } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';

export default function HomeScreen() {
  const passwordInput = useRef<TextInput>(null);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === 'dark' ? 'dark' : 'light'];
  const styles = createStyles(colors);
  const { isRestoring, isSigningIn, signIn, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  if (isRestoring) {
    return null;
  }

  if (user) {
    return <Redirect href="/dashboard" />;
  }

  async function handleSubmit() {
    const normalizedEmail = email.trim();

    setError('');

    if (!normalizedEmail || !password.trim()) {
      setError('Enter your email and password to continue.');
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setError('Enter a valid work email address.');
      return;
    }

    try {
      await signIn(normalizedEmail, password);
      router.replace('/dashboard');
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Unable to sign in. Check your connection and try again.',
      );
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.formPanel}>
            <View style={styles.headingBlock}>
              <Text style={styles.eyebrow}>DRIVER ACCESS</Text>
              <Text style={styles.title}>Welcome back</Text>
              <Text style={styles.subtitle}>Sign in to keep your fleet moving with confidence.</Text>
            </View>

            <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Work email</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                accessibilityLabel="Work email"
                keyboardType="email-address"
                onChangeText={setEmail}
                onSubmitEditing={() => passwordInput.current?.focus()}
                placeholder="you@company.com"
                placeholderTextColor={colors.textSecondary}
                returnKeyType="next"
                style={styles.input}
                value={email}
              />
            </View>

            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Password</Text>
                <Pressable onPress={() => setShowPassword((visible) => !visible)}>
                  <Text style={styles.actionText}>{showPassword ? 'Hide' : 'Show'}</Text>
                </Pressable>
              </View>
              <TextInput
                autoCapitalize="none"
                autoComplete="password"
                accessibilityLabel="Password"
                onChangeText={setPassword}
                onSubmitEditing={handleSubmit}
                placeholder="Enter your password"
                placeholderTextColor={colors.textSecondary}
                ref={passwordInput}
                returnKeyType="done"
                secureTextEntry={!showPassword}
                style={styles.input}
                value={password}
              />
            </View>

            <Pressable style={styles.forgotButton}>
              <Text style={styles.actionText}>Forgot password?</Text>
            </Pressable>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
              accessibilityState={{ busy: isSigningIn, disabled: isSigningIn }}
              disabled={isSigningIn}
              onPress={handleSubmit}
              style={({ pressed }) => [styles.submitButton, pressed && styles.submitPressed]}>
              <Text style={styles.submitText}>{isSigningIn ? 'Signing in...' : 'Sign in'}</Text>
              {!isSigningIn ? <Text style={styles.submitArrow}>-&gt;</Text> : null}
            </Pressable>
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Need access to your fleet?</Text>
            <Pressable>
              <Text style={styles.actionText}>Contact your administrator</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: (typeof Colors)[keyof typeof Colors]) {
  return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 22,
    justifyContent: 'center',
  },
  formPanel: {
    backgroundColor: colors.backgroundElement,
    borderRadius: 22,
    marginHorizontal: 16,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  headingBlock: {
    marginBottom: 28,
  },
  eyebrow: {
    color: colors.primaryPressed,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
    marginTop: 8,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 9,
    maxWidth: 300,
  },
  form: {
    marginTop: 0,
  },
  fieldGroup: {
    marginBottom: 22,
  },
  labelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 9,
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    height: 56,
    paddingHorizontal: 16,
  },
  actionText: {
    color: colors.primaryPressed,
    fontSize: 14,
    fontWeight: '700',
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 8,
    flexDirection: 'row',
    height: 58,
    justifyContent: 'center',
  },
  submitPressed: {
    backgroundColor: colors.primaryPressed,
  },
  submitText: {
    color: colors.inverseText,
    fontSize: 16,
    fontWeight: '800',
  },
  submitArrow: {
    color: colors.inverseText,
    fontSize: 20,
    marginLeft: 12,
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 22,
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  });
}
