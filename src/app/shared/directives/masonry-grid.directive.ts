import {
  Directive,
  ElementRef,
  NgZone,
  OnDestroy,
  afterNextRender,
  inject
} from '@angular/core';

/**
 * True masonry for a CSS grid container.
 *
 * CSS can't do this on its own: `grid` aligns by rows (a tall card pushes the
 * whole next row down) and multi-column `columns` fills sequentially, so it
 * can't backfill a short column. Both leave dead space.
 *
 * The trick: the grid uses 1px implicit rows with no row gap, and every child
 * is given a `grid-row-end: span <its height + gap>`. Grid auto-placement then
 * drops each card into the first free slot — which is directly under the card
 * above it in that column. Heights are measured, not estimated, so wrapped text
 * and async data are handled.
 *
 * Usage: <section class="my-grid" masonryGrid> with
 *   .my-grid            { display: grid; align-items: start; column-gap: 16px; row-gap: 16px; }
 *   .my-grid.masonry-on { grid-auto-rows: 1px; row-gap: 0; }
 *
 * Until the first measurement lands, the plain grid rules apply, so the layout
 * is never broken — it just isn't packed yet.
 */
@Directive({
  selector: '[masonryGrid]'
})
export class MasonryGridDirective implements OnDestroy {
  /** Vertical space left between two cards stacked in the same column. */
  private static readonly GAP = 16;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);

  private resizeObserver?: ResizeObserver;
  private mutationObserver?: MutationObserver;
  private frame = 0;

  constructor() {
    afterNextRender(() => {
      // Layout work must not trigger change detection on every frame.
      this.zone.runOutsideAngular(() => {
        this.resizeObserver = new ResizeObserver(() => this.schedule());

        // @for adds/removes cards as the month changes — re-observe on mutation.
        this.mutationObserver = new MutationObserver(() => this.observeChildren());
        this.mutationObserver.observe(this.host.nativeElement, { childList: true });

        this.observeChildren();
        this.layout();
      });
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
  }

  private children(): HTMLElement[] {
    return Array.from(this.host.nativeElement.children) as HTMLElement[];
  }

  /**
   * Observe the children only, never the container: setting spans changes the
   * container's height, which would feed straight back into a resize loop.
   * A container width change resizes the children too, so nothing is missed.
   */
  private observeChildren(): void {
    this.resizeObserver?.disconnect();
    for (const child of this.children()) {
      this.resizeObserver?.observe(child);
    }
    this.schedule();
  }

  private schedule(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.layout());
  }

  private layout(): void {
    const children = this.children();
    if (children.length === 0) {
      return;
    }

    // Read every height first, then write every span — batched to avoid
    // forcing a reflow between each measurement.
    const spans = children.map(
      child => Math.ceil(child.getBoundingClientRect().height) + MasonryGridDirective.GAP
    );

    children.forEach((child, i) => {
      child.style.gridRowEnd = `span ${spans[i]}`;
    });

    this.host.nativeElement.classList.add('masonry-on');
  }
}
