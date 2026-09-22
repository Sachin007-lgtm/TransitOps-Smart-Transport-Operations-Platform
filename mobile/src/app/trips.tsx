import { Redirect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DriverNav } from '@/components/driver/DriverNav';
import { useAuth } from '@/contexts/AuthContext';

export default function TripsScreen() {
  const { isRestoring, user } = useAuth();

  if (isRestoring) {
    return null;
  }

  if (!user) {
    return <Redirect href="/" />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>DRIVER OPERATIONS</Text>
        <Text style={styles.title}>Your trips</Text>
        <Text style={styles.subtitle}>Assignments from your dispatcher will appear here.</Text>

        <View style={styles.emptyState}>
          <Text style={styles.emptyMark}>--</Text>
          <Text style={styles.emptyTitle}>No trips yet</Text>
          <Text style={styles.emptyDescription}>
            Once a trip is assigned to you, you will see its route, schedule, and status here.
          </Text>
        </View>
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
  subtitle: {
    color: '#7D7382',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E1E8',
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 42,
    paddingHorizontal: 24,
    paddingVertical: 38,
  },
  emptyMark: {
    color: '#D97D00',
    fontSize: 28,
    fontWeight: '800',
  },
  emptyTitle: {
    color: '#2A2030',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 18,
  },
  emptyDescription: {
    color: '#7D7382',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    textAlign: 'center',
  },
});
