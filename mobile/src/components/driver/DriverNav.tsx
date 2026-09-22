import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

const items = [
  { label: 'Home', route: '/dashboard' as const, symbol: 'H' },
  { label: 'Trips', route: '/trips' as const, symbol: 'T' },
  { label: 'Profile', route: '/profile' as const, symbol: 'P' },
];

export function DriverNav() {
  const pathname = usePathname();
  const colors = Colors.light;

  return (
    <View style={[styles.container, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}>
      {items.map((item) => {
        const isActive = pathname === item.route;

        return (
          <Pressable
            accessibilityLabel={`Open ${item.label}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            key={item.route}
            onPress={() => router.replace(item.route)}
            style={styles.item}>
            <Text style={[styles.symbol, { color: isActive ? colors.primaryPressed : colors.textSecondary }]}>
              {item.symbol}
            </Text>
            <Text style={[styles.label, { color: isActive ? colors.primaryPressed : colors.textSecondary }]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingVertical: 8,
  },
  item: {
    alignItems: 'center',
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  symbol: {
    fontSize: 21,
    fontWeight: '700',
  },
});
