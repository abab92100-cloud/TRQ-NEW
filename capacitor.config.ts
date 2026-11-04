import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.trg.new',
  appName: 'KING-trading',
  webDir: 'dist',
  backgroundColor: '#0a0e14',
  plugins: {
    // كل طلبات fetch تمر عبر الطبقة الأصلية — تتجاوز قيود CORS في WebView
    CapacitorHttp: { enabled: true },
  },
};

export default config;
