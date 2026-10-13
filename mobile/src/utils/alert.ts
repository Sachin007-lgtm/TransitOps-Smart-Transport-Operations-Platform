import { Alert as RNAlert, Platform } from 'react-native';

export type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    if (Platform.OS === 'web') {
      const fullMessage = [title, message].filter(Boolean).join('\n\n');
      if (!buttons || buttons.length === 0) {
        if (typeof window !== 'undefined' && window.alert) {
          window.alert(fullMessage);
        }
        return;
      }

      const cancelBtn = buttons.find((b) => b.style === 'cancel');
      const actionBtn = buttons.find((b) => b.style !== 'cancel') || buttons[buttons.length - 1];

      if (cancelBtn && actionBtn && actionBtn !== cancelBtn) {
        const confirmed = typeof window !== 'undefined' && window.confirm ? window.confirm(fullMessage) : true;
        if (confirmed) {
          actionBtn.onPress?.();
        } else {
          cancelBtn.onPress?.();
        }
      } else {
        if (typeof window !== 'undefined' && window.alert) {
          window.alert(fullMessage);
        }
        buttons[0]?.onPress?.();
      }
      return;
    }

    RNAlert.alert(title, message, buttons);
  },
};
