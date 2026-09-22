import { Redirect, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/AuthContext';
import { DriverNav } from '@/components/driver/DriverNav';

export default function DashboardScreen() {
  const { isRestoring, user, signOut } = useAuth();

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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>DRIVER DASHBOARD</Text>
            <Text style={styles.title}>Good morning, {user.name.split(' ')[0]}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={handleSignOut} style={styles.signOutButton}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>

        <View style={styles.statusRow}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>You're ready for today's work</Text>
        </View>

        <View style={styles.assignmentCard}>
          <Text style={styles.cardEyebrow}>TODAY'S ASSIGNMENT</Text>
          <Text style={styles.assignmentTitle}>No trip assigned yet</Text>
          <Text style={styles.assignmentDescription}>
            Your dispatcher will add an assignment here when your schedule is ready.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Quick access</Text>
        <View style={styles.quickRow}>
          <View style={styles.quickCard}>
            <Text style={styles.quickValue}>0</Text>
            <Text style={styles.quickLabel}>UPCOMING TRIPS</Text>
          </View>
          <View style={styles.quickCard}>
            <Text style={styles.quickValue}>--</Text>
            <Text style={styles.quickLabel}>CURRENT VEHICLE</Text>
          </View>
        </View>
      </ScrollView>
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
    padding: 24,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: '#D97D00',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    color: '#2A2030',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 9,
  },
  signOutButton: {
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  signOutText: {
    color: '#7D7382',
    fontSize: 13,
    fontWeight: '700',
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 16,
  },
  statusDot: {
    backgroundColor: '#47A66A',
    borderRadius: 4,
    height: 8,
    marginRight: 8,
    width: 8,
  },
  statusText: {
    color: '#7D7382',
    fontSize: 14,
  },
  assignmentCard: {
    backgroundColor: '#4B2D42',
    borderRadius: 20,
    marginTop: 34,
    padding: 22,
  },
  cardEyebrow: {
    color: '#F5A62B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  assignmentTitle: {
    color: '#FFF8FB',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 20,
  },
  assignmentDescription: {
    color: '#D9C8D4',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  sectionTitle: {
    color: '#2A2030',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 30,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  quickCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E1E8',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    padding: 18,
  },
  quickValue: {
    color: '#D97D00',
    fontSize: 24,
    fontWeight: '800',
  },
  quickLabel: {
    color: '#7D7382',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginTop: 8,
  },
});
