import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppLanguage, useLanguage } from '@/contexts/LanguageContext';

export function LanguageToggle() {
  const { language, setLanguage, t } = useLanguage();
  const options: { value: AppLanguage; label: string }[] = [
    { value: 'en', label: 'EN' },
    { value: 'hi', label: 'हि' },
  ];

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{t('language')}</Text>
      <View style={styles.segment}>
        {options.map(option => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: language === option.value }}
            accessibilityLabel={option.value === 'en' ? t('english') : t('hindi')}
            onPress={() => setLanguage(option.value)}
            style={[styles.option, language === option.value && styles.optionActive]}
          >
            <Text style={[styles.optionText, language === option.value && styles.optionTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 14 },
  label: { color: '#7D7382', fontSize: 12, fontWeight: '700' },
  segment: { backgroundColor: '#F3F2F5', borderColor: '#E5E1E8', borderRadius: 8, borderWidth: 1, flexDirection: 'row', padding: 3 },
  option: { alignItems: 'center', borderRadius: 5, minWidth: 38, paddingHorizontal: 8, paddingVertical: 5 },
  optionActive: { backgroundColor: '#FFFFFF' },
  optionText: { color: '#7D7382', fontSize: 12, fontWeight: '700' },
  optionTextActive: { color: '#4B2D42' },
});
