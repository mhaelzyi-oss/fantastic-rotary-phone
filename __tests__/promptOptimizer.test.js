import { lintFilenameTemplate } from '../utils/promptOptimizer.js';

test('warns on unknown variables, unmatched braces, empty templates, and unsafe characters', () => {
  expect(lintFilenameTemplate('{title}_{mystery}.{ext}').warnings).toContain(
    'Unknown variable: {mystery}',
  );
  expect(lintFilenameTemplate('{title').warnings).toContain('Missing or extra brace detected.');
  expect(lintFilenameTemplate('').warnings).toContain('Filename template is empty.');
  expect(lintFilenameTemplate('{title}/x').warnings).toContain(
    'Unsafe filename characters will be replaced.',
  );
});
