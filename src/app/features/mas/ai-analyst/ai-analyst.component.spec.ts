import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';

import { AiAnalystComponent } from './ai-analyst.component';
import { AiAnalystService } from '../../../shared/services/ai-analyst.service';

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

  it('calls aiAnalystService.sendMessage with trimmed input and currentYear', async () => {
    component.userInput = '  ¿cuánto gasté?  ';

    await component.sendMessage();

    expect(aiServiceStub.sendMessage).toHaveBeenCalledOnceWith('¿cuánto gasté?', component.currentYear);
  });
});
