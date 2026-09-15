import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), 'utf8');

test('Gemini API uses a configured server key and structured JSON output', async () => {
  const source = await read('lib/server/translation/gemini.ts');
  assert.match(source, /process\.env\.GEMINI_API_KEY/);
  assert.match(source, /responseMimeType: 'application\/json'/);
  assert.match(source, /encodeURIComponent\(model\)/);
  assert.match(source, /response\.status === 403 \|\| response\.status === 429/);
});

test('Gemini is a supported provider and automated paid providers remain limit-gated', async () => {
  const [types, service, migration] = await Promise.all([
    read('lib/server/translation/types.ts'),
    read('lib/server/translation/service.ts'),
    read('supabase/migrations/202609150001_gemini_translation_provider_and_limits.sql'),
  ]);
  assert.match(types, /'gemini'/);
  assert.match(service, /translateWithGemini/);
  assert.match(migration, /p_provider not in \('azure', 'openai_paid', 'gemini'\)/);
  assert.match(migration, /default_limit := case when p_provider = 'azure' then 2000000 else 0 end/);
  assert.match(migration, /configure_translation_usage_limit/);
});
