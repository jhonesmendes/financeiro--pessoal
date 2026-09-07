module.exports = {
  input: ['../packages/desktop-client/src/**/*.{js,jsx,ts,tsx}'],
  output: 'frontend-keys/$LOCALE.json',
  locales: ['en'],
  sort: true,
  keySeparator: false,
  namespaceSeparator: false,
  defaultValue: (locale, ns, key, value) => (locale === 'en' ? value || key : ''),
};
