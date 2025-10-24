import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
import tr from './locales/tr.json';

type MessageSchema = typeof en;

const i18n = createI18n<[MessageSchema], 'en'>({
  legacy: false, // Use with Vue 3 Composition API
  locale: navigator.language.split('-')[0] || 'en', // Use browser language
  fallbackLocale: 'en', // Default language for unsupported locales
  messages: {
    en,
    tr,
  },
});

export default i18n;
