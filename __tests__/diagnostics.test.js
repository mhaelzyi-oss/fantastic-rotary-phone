import { recordDiagnostic } from '../utils/diagnostics.js';

test('records diagnostics and strips URL details', async () => {
  const state = { diagnostics: [] };
  await recordDiagnostic(state, {
    category: 'download',
    code: 'FAIL',
    title: 'Failed',
    userMessage: 'Retry later',
    technicalDetail: 'fetch https://secret.test/media?auth=token',
  });
  expect(state.diagnostics[0].category).toBe('download');
  expect(state.diagnostics[0].technicalDetail).not.toContain('secret.test');
});
