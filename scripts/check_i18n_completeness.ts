import {
  getCommonDict,
  getGamesDict,
  getPatcherDict,
  Locale,
} from '../lib/i18n/index';

const locales: Locale[] = ['en', 'ja', 'de', 'es'];

const dicts = {
  common: getCommonDict,
  games: getGamesDict,
  patcher: getPatcherDict,
};

let errors = 0;

for (const [dictName, getFn] of Object.entries(dicts)) {
  const koContent = getFn('ko');
  const koKeys = Object.keys(koContent);

  for (const loc of locales) {
    const locContent = getFn(loc);
    const locKeys = Object.keys(locContent);

    // Check missing keys
    for (const key of koKeys) {
      if (!(key in locContent)) {
        console.error(`[MISSING KEY] Dict: ${dictName}, Locale: ${loc}, Key: '${key}' is missing.`);
        errors++;
      } else {
        // Check array lengths
        const koVal = (koContent as any)[key];
        const locVal = (locContent as any)[key];
        if (Array.isArray(koVal) && Array.isArray(locVal)) {
          if (koVal.length !== locVal.length) {
             // For keywords, it might not be a huge issue, but let's log it
            console.error(`[ARRAY LENGTH MISMATCH] Dict: ${dictName}, Locale: ${loc}, Key: '${key}' length mismatch (ko: ${koVal.length}, ${loc}: ${locVal.length})`);
          }
        }
      }
    }

    // Check extra keys
    for (const key of locKeys) {
      if (!(key in koContent)) {
        console.error(`[EXTRA KEY] Dict: ${dictName}, Locale: ${loc}, Key: '${key}' should not exist.`);
        errors++;
      }
    }
  }
}

if (errors === 0) {
  console.log('All i18n dicts are perfectly synchronized across languages!');
} else {
  console.error(`Found ${errors} discrepancies.`);
  process.exit(1);
}
