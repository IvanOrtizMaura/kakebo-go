import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ivanortizmaura.kakebogo',
  appName: 'Kakebo Go',
  webDir: 'dist/kakebo-go/browser',
  server: {
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
