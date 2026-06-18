import { describe, expect, it } from 'vitest';
import type { Book } from './book.js';
import { validateBookCompleteness } from './validate.js';

describe('book completeness', () => {
  it('rejects unresolved images by default', () => {
    const book: Book = {
      id: 1,
      title: 'Book',
      author: 'Author',
      language: 'zh-CN',
      description: '',
      sourceUrl: 'https://example/book/1',
      catalogueUrl: 'https://example/book/1/index',
      metadata: {},
      assets: [],
      volumes: [
        {
          id: 'v1',
          index: 0,
          title: 'Volume',
          chapters: [
            {
              id: 'c1',
              index: 0,
              title: 'Chapter',
              sourceUrl: 'https://example/c1',
              blocks: [{ type: 'image', sourceUrl: null, alt: '图片' }],
            },
          ],
        },
      ],
    };
    expect(() => validateBookCompleteness(book)).toThrow(/无法定位来源/);
    expect(() => validateBookCompleteness(book, true)).not.toThrow();
  });
});
