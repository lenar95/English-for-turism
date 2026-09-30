import { useSyncExternalStore } from 'react';
import { useSettings } from '../../state/AppContext';
import { langSupported, subscribeLangSupport } from './langSupport';

/**
 * Можно ли проверять произношение на этом языке: распознавание включено и поддерживается устройством.
 * Для языка, который на устройстве зависает (см. langSupport.ts), возвращает false, и интерфейс
 * переходит на самопроверку.
 */
export function useSpeechFor(lang: string): boolean {
  const { speechOn } = useSettings();
  const supported = useSyncExternalStore(
    subscribeLangSupport,
    () => langSupported(lang),
    () => true,
  );
  return speechOn && supported;
}
