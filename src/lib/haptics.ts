import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/** Тактильный отклик: в iOS — через Taptic Engine, в браузере — вибрация, где она есть. */
export function hapticSuccess(): void {
  if (Capacitor.isNativePlatform()) void Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
  else navigator.vibrate?.(20);
}

export function hapticError(): void {
  if (Capacitor.isNativePlatform()) void Haptics.notification({ type: NotificationType.Warning }).catch(() => undefined);
  else navigator.vibrate?.([15, 60, 15]);
}

export function hapticTap(): void {
  if (Capacitor.isNativePlatform()) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
}
