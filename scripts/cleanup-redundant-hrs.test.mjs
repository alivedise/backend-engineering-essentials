import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanRedundantHrs } from './cleanup-redundant-hrs.mjs';

test('strips body HR but preserves frontmatter delimiters', () => {
  const input = `---
title: Foo
id: 1
---

# Heading

Some text.

---

## Section

More text.
`;
  const expected = `---
title: Foo
id: 1
---

# Heading

Some text.


## Section

More text.
`;
  assert.equal(cleanRedundantHrs(input), expected);
});

test('preserves HR-like lines inside backtick code fence', () => {
  const input = `---
title: Foo
---

Body.

\`\`\`yaml
key: value
---
other: value
\`\`\`

After fence.
`;
  const result = cleanRedundantHrs(input);
  assert.match(result, /---\nother: value/);
});

test('preserves HR-like lines inside tilde code fence', () => {
  const input = `---
title: Foo
---

~~~markdown
Section A
---
Section B
~~~
`;
  const result = cleanRedundantHrs(input);
  assert.match(result, /Section A\n---\nSection B/);
});

test('strips HR with trailing whitespace', () => {
  const input = '---\ntitle: Foo\n---\n\nBody.\n\n---   \n\n## Heading\n';
  const result = cleanRedundantHrs(input);
  assert.ok(!result.includes('---   '), 'trailing-whitespace HR should be stripped');
  // After stripping, exactly two `---` lines should remain (the frontmatter
  // delimiters). Count standalone `---*` lines in the result.
  const hrCount = result.split('\n').filter(l => l.trim() === '---').length;
  assert.equal(hrCount, 2, 'only frontmatter delimiters should survive');
});

test('handles document with no HRs (identity)', () => {
  const input = `---
title: Foo
---

# Heading

Body without separators.
`;
  assert.equal(cleanRedundantHrs(input), input);
});
