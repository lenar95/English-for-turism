import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.englishfortourism.app',
  appName: 'Английский в поездку',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#F6F4EF',
  },
};

export default config;
