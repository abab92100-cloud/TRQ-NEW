import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.trg.new',
  appName: 'TRQ-NEW',
  webDir: 'dist',
  backgroundColor: '#0a0e14',
  plugins: {
    // كل طلبات fetch تمر عبر التطبيق الأصلي — تتجاوز قيود CORS في WebView
    CapacitorHttp: { enabled: true },
  },
};

export default config;
