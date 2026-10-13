import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {markdownHTML,renderMarkdown} from '../public/markdown.mjs';

test('Markdown renders headings, lists, tables and fenced code',()=>{
  const dom=new JSDOM();
  const html=markdownHTML('# Result\n\n- **Done**\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```python\nprint("<hello>")\n```',dom.window);
  const document=new JSDOM(html).window.document;
  assert.equal(document.querySelector('h1').textContent,'Result');
  assert.equal(document.querySelector('li strong').textContent,'Done');
  assert.equal(document.querySelector('td').textContent,'1');
  assert.equal(document.querySelector('pre code').textContent,'print("<hello>")\n');
});
test('Untrusted assistant Markdown cannot execute HTML or load remote images',()=>{
  const html=markdownHTML('<script>alert(1)</script><img src="https://example.com/private" onerror="alert(1)"><svg onload="alert(1)"></svg><a href="javascript:alert(1)">danger</a><iframe src="https://example.com"></iframe><p style="position:fixed" onclick="alert(1)">hello</p>',new JSDOM().window);
  const document=new JSDOM(html).window.document;
  assert.equal(document.querySelector('script,img,svg,iframe'),null);
  assert.equal(document.querySelector('a').getAttribute('href'),null);
  assert.equal(document.querySelector('p').getAttribute('onclick'),null);
  assert.equal(document.querySelector('p').getAttribute('style'),null);
});
test('Code cards preserve literal code, wrap on demand, and links have safe destinations',()=>{
  const dom=new JSDOM('<div id="message"></div>'),previousWindow=globalThis.window,previousDocument=globalThis.document;
  globalThis.window=dom.window;globalThis.document=dom.window.document;
  try{
    const root=document.querySelector('#message');
    renderMarkdown(root,'```python\nprint("<script>")\n```\n\n[web](https://example.com) [file](file:///etc/passwd)');
    assert.equal(root.querySelector('.code-bar span').textContent,'python');
    assert.equal(root.querySelector('pre code').textContent,'print("<script>")\n');
    const wrap=root.querySelector('[aria-label="切换代码换行"]');wrap.click();
    assert.equal(root.querySelector('pre').className,'wrap');assert.equal(wrap.getAttribute('aria-pressed'),'true');
    assert.equal(root.querySelector('a').rel,'noopener noreferrer');
    assert.equal(root.querySelectorAll('a')[1].hasAttribute('href'),false);
  }finally{globalThis.window=previousWindow;globalThis.document=previousDocument}
});
