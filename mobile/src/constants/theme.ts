import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#2A2030',
    background: '#F3F2F5',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#F0E7ED',
    textSecondary: '#7D7382',
    border: '#E5E1E8',
    primary: '#F09A1B',
    primaryPressed: '#D97D00',
    accent: '#F09A1B',
    danger: '#C93737',
    inverseText: '#FFFFFF',
  },
  dark: {
    text: '#FFF8FB',
    background: '#241923',
    backgroundElement: '#362632',
    backgroundSelected: '#4B2D42',
    textSecondary: '#C9B9C5',
    border: '#574452',
    primary: '#F5A62B',
    primaryPressed: '#FFC15A',
    accent: '#F5A62B',
    danger: '#FF9E9A',
    inverseText: '#241923',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
