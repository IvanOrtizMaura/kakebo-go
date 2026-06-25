import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';

import { AiAnalystComponent } from './ai-analyst.component';
import { AiAnalystService } from '../../../shared/services/ai-analyst.service';
import { safeHtmlAsString } from '../../../testing/safe-html';
import { renderInlineMarkdown } from '../../../shared/utils/markdown';

describe('AiAnalystComponent.sendMessage', () => {
  let component: AiAnalystComponent;
  let aiServiceStub: {
    messages: ReturnType<typeof signal<unknown[]>>;
    isLoading: ReturnType<typeof signal<boolean>>;
    isLoadingContext: ReturnType<typeof signal<boolean>>;
    sendMessage: jasmine.Spy;
    clearConversation: jasmine.Spy;
  };
  let routerStub: jasmine.SpyObj<Router>;

  beforeEach(() => {
    aiServiceStub = {
      messages: signal<unknown[]>([]),
      isLoading: signal(false),
      isLoadingContext: signal(false),
      sendMessage: jasmine.createSpy('sendMessage').and.resolveTo(),
      clearConversation: jasmine.createSpy('clearConversation'),
    };
    routerStub = jasmine.createSpyObj<Router>('Router', ['navigate']);

    TestBed.configureTestingModule({
      imports: [AiAnalystComponent],
      providers: [
        { provide: AiAnalystService, useValue: aiServiceStub },
        { provide: Router, useValue: routerStub },
      ],
    });

    const fixture = TestBed.createComponent(AiAnalystComponent);
    component = fixture.componentInstance;
  });

  it('does nothing when userInput is empty', async () => {
    component.userInput = '';

    await component.sendMessage();

    expect(aiServiceStub.sendMessage).not.toHaveBeenCalled();
  });

  it('does nothing when userInput is whitespace only', async () => {
    component.userInput = '   \t  ';

    await component.sendMessage();

    expect(aiServiceStub.sendMessage).not.toHaveBeenCalled();
  });

  it('does nothing when isLoading() is true', async () => {
    component.userInput = 'hola';
    aiServiceStub.isLoading.set(true);

    await component.sendMessage();

    expect(aiServiceStub.sendMessage).not.toHaveBeenCalled();
  });

  it('does nothing when isLoadingContext() is true', async () => {
    component.userInput = 'hola';
    aiServiceStub.isLoadingContext.set(true);

    await component.sendMessage();

    expect(aiServiceStub.sendMessage).not.toHaveBeenCalled();
  });

  it('clears userInput before awaiting the service call', async () => {
    const captured: string[] = [];
    aiServiceStub.sendMessage.and.callFake(() => {
      captured.push(component.userInput);
      return Promise.resolve();
    });
    component.userInput = 'pregunta';

    await component.sendMessage();

    expect(captured).toEqual(['']);
  });

  it('calls aiAnalystService.sendMessage with trimmed input', async () => {
    component.userInput = '  ¿cuánto gasté?  ';

    await component.sendMessage();

    expect(aiServiceStub.sendMessage).toHaveBeenCalledOnceWith('¿cuánto gasté?');
  });
});

describe('AiAnalystComponent.renderMarkdown', () => {
  let component: AiAnalystComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AiAnalystComponent],
      providers: [
        {
          provide: AiAnalystService,
          useValue: {
            messages: signal<unknown[]>([]),
            isLoading: signal(false),
            isLoadingContext: signal(false),
            sendMessage: jasmine.createSpy('sendMessage').and.resolveTo(),
            clearConversation: jasmine.createSpy('clearConversation'),
          },
        },
        { provide: Router, useValue: jasmine.createSpyObj<Router>('Router', ['navigate']) },
      ],
    });

    component = TestBed.createComponent(AiAnalystComponent).componentInstance;
  });

  it('HTML-escapes <script> in input before applying markdown (no raw <script> in output)', () => {
    const html = safeHtmlAsString(component.renderMarkdown('<script>alert(1)</script>'));

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders **foo** as <strong>foo</strong>', () => {
    const html = safeHtmlAsString(component.renderMarkdown('hola **foo** mundo'));

    expect(html).toContain('<strong>foo</strong>');
  });

  it('renders **foo bar** (with whitespace inside) as <strong>foo bar</strong>', () => {
    const html = safeHtmlAsString(component.renderMarkdown('**foo bar**'));

    expect(html).toContain('<strong>foo bar</strong>');
  });

  it('collapses consecutive "- " lines into a single <ul> with <li> items', () => {
    const html = safeHtmlAsString(component.renderMarkdown('- uno\n- dos\n- tres'));

    expect(html).toContain('<ul>');
    expect(html).toContain('<li>uno</li>');
    expect(html).toContain('<li>dos</li>');
    expect(html).toContain('<li>tres</li>');
    expect(html.match(/<ul>/g)?.length).toBe(1);
  });

  it('collapses consecutive "• " lines into a single <ul> with <li> items', () => {
    const html = safeHtmlAsString(component.renderMarkdown('• uno\n• dos'));

    expect(html).toContain('<ul>');
    expect(html).toContain('<li>uno</li>');
    expect(html).toContain('<li>dos</li>');
  });

  it('does NOT wrap a non-list line in <ul>', () => {
    const html = safeHtmlAsString(component.renderMarkdown('Esto es texto normal.'));

    expect(html).not.toContain('<ul>');
    expect(html).not.toContain('<li>');
  });

  it('converts plain \\n (outside lists) into <br>', () => {
    const html = safeHtmlAsString(component.renderMarkdown('línea 1\nlínea 2'));

    expect(html).toContain('<br>');
    expect(html).toContain('línea 1');
    expect(html).toContain('línea 2');
  });

  it('returns a SafeHtml wrapping an empty string when input is empty (no crash)', () => {
    const result = component.renderMarkdown('');

    expect(result).toBeTruthy();
    expect(safeHtmlAsString(result)).toBe('');
  });
});

describe('renderInlineMarkdown edge cases', () => {
  it('treats "* item" (asterisk bullet) as a list item, not bold', () => {
    const html = renderInlineMarkdown('* item');

    expect(html).toContain('<ul>');
    expect(html).toContain('<li>item</li>');
    expect(html).not.toContain('<strong>');
  });

  it('renders bold inside a list item: "- foo **bar** baz" wraps "bar" in <strong>', () => {
    const html = renderInlineMarkdown('- foo **bar** baz');

    expect(html).toContain('<li>');
    expect(html).toContain('<strong>bar</strong>');
    // The strong tag should sit inside the li
    expect(html).toMatch(/<li>[^<]*<strong>bar<\/strong>[^<]*<\/li>/);
  });

  it('produces two separate <ul> blocks when list items are separated by a blank line', () => {
    const html = renderInlineMarkdown('- uno\n- dos\n\n- tres\n- cuatro');

    const ulMatches = html.match(/<ul>/g);
    expect(ulMatches?.length).toBe(2);
    expect(html).toContain('<li>uno</li>');
    expect(html).toContain('<li>dos</li>');
    expect(html).toContain('<li>tres</li>');
    expect(html).toContain('<li>cuatro</li>');
  });
});
