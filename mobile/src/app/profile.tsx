import { Redirect, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DriverNav } from '@/components/driver/DriverNav';
import { useAuth } from '@/contexts/AuthContext';

export default function ProfileScreen() {
  const { isRestoring, signOut, user } = useAuth();

  if (isRestoring) {
    return null;
  }

  if (!user) {
    return <Redirect href="/" />;
  }

  async function handleSignOut() {
    await signOut();
    router.replace('/');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>ACCOUNT</Text>
        <Text style={styles.title}>Your profile</Text>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.role}>{user.role}</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>EMAIL</Text>
            <Text style={styles.detailValue}>{user.email}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>ACCOUNT ID</Text>
            <Text style={styles.detailValue}>{user.id}</Text>
          </View>
        </View>

        <Pressable onPress={handleSignOut} style={styles.signOutButton}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
      <DriverNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#F3F2F5',
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  eyebrow: {
    color: '#D97D00',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    color: '#2A2030',
    fontSize: 30,
    fontWeight: '800',
    marginTop: 9,
  },
  profileCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E1E8',
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 28,
    padding: 24,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#4B2D42',
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  avatarText: {
    color: '#FFF8FB',
    fontSize: 24,
    fontWeight: '800',
  },
  name: {
    color: '#2A2030',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 14,
  },
  role: {
    color: '#D97D00',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 5,
    textTransform: 'uppercase',
  },
  detailRow: {
    alignSelf: 'stretch',
    borderTopColor: '#E5E1E8',
    borderTopWidth: 1,
    marginTop: 20,
    paddingTop: 14,
  },
  detailLabel: {
    color: '#7D7382',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  detailValue: {
    color: '#2A2030',
    fontSize: 15,
    marginTop: 5,
  },
  signOutButton: {
    alignItems: 'center',
    borderColor: '#C93737',
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 22,
    paddingVertical: 14,
  },
  signOutText: {
    color: '#C93737',
    fontSize: 15,
    fontWeight: '800',
  },
});
