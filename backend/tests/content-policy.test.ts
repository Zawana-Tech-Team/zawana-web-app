import test from 'node:test';
import assert from 'node:assert/strict';
import { contentInput } from '../src/services/contentPolicy.js';

const base = { title: 'First tournament', publishDate: '2026-10-19' };
test('community content stays compatible and achievement drafts can be incomplete', () => {
  const community = contentInput.parse(base);
  assert.equal(community.kind, 'community');
  assert.equal(community.body, '');
  assert.equal(contentInput.parse({ ...base, kind: 'achievement' }).status, 'draft');
});
test('published achievements require both a summary and a full article', () => {
  const published = { ...base, kind: 'achievement', status: 'published' };
  assert.throws(() => contentInput.parse(published));
  assert.throws(() => contentInput.parse({ ...published, description: 'A summary', body: '  ' }));
  assert.equal(contentInput.parse({ ...published, description: 'A summary', body: 'Full article' }).body, 'Full article');
});
test('content rejects invalid publication dates, unsafe links and unknown status values', () => {
  for (const invalid of [
    { publishDate: '2026-02-30' }, { title: '  ' }, { status: 'public' },
    { googleFormLink: 'javascript:alert(1)' }, { image: 'data:text/html,test' }, { image: '//other.test/image.png' }
  ]) assert.throws(() => contentInput.parse({ ...base, ...invalid }));
  for (const image of ['', '/uploads/media/example.webp', '/facilities/court.webp', 'https://example.test/image'])
    assert.equal(contentInput.parse({ ...base, image }).image, image);
  const sanitized = contentInput.parse({ ...base, id: 'not-writable', unexpected: true });
  assert.equal('id' in sanitized, false);
});
