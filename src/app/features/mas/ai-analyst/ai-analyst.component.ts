import { Component, inject, effect, viewChild, ElementRef, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AiAnalystService } from '../../../shared/services/ai-analyst.service';
import { renderInlineMarkdown } from '../../../shared/utils/markdown';

@Component({
  selector: 'app-ai-analyst',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './ai-analyst.component.html',
  styleUrl: './ai-analyst.component.scss',
})
export class AiAnalystComponent {
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly aiAnalystService = inject(AiAnalystService);

  readonly messages = this.aiAnalystService.messages;
  readonly isLoading = this.aiAnalystService.isLoading;
  readonly isLoadingContext = this.aiAnalystService.isLoadingContext;

  userInput = '';

  private readonly messagesContainer = viewChild<ElementRef<HTMLElement>>('messagesContainer');

  constructor() {
    effect(() => {
      this.messages();
      this.isLoading();
      setTimeout(() => {
        const scrollEl = this.messagesContainer()?.nativeElement;
        if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
      }, 50);
    });
  }

  goBack(): void {
    this.router.navigate(['/mas']);
  }

  clearChat(): void {
    this.aiAnalystService.clearConversation();
  }

  async sendMessage(): Promise<void> {
    const message = this.userInput.trim();
    if (!message || this.isLoading() || this.isLoadingContext()) return;
    this.userInput = '';
    await this.aiAnalystService.sendMessage(message);
  }

  renderMarkdown(text: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(renderInlineMarkdown(text));
  }

  onEnterPressed(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey) return;
    event.preventDefault();
    this.sendMessage();
  }
}
