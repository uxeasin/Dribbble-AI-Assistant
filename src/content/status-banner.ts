// A small, dismissible banner on the Dribbble page so the designer can always
// see what the extension is doing. Rendered in a closed shadow root so it
// cannot affect, or be affected by, Dribbble's styles.

export type BannerTone = 'working' | 'waiting' | 'success' | 'error';

const HOST_ID = 'dribbble-ai-assistant-banner';

const STYLES = `
:host { all: initial; }
.banner {
  position: fixed; right: 20px; bottom: 20px; z-index: 2147483646;
  display: flex; gap: 12px; align-items: flex-start;
  max-width: 360px; padding: 14px 16px; border-radius: 14px;
  background: #0d0c22; color: #f5f5f7;
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
  box-shadow: 0 12px 32px rgba(13, 12, 34, 0.28), 0 2px 6px rgba(13, 12, 34, 0.18);
  animation: in 220ms cubic-bezier(.2,.8,.2,1);
}
@keyframes in { from { opacity: 0; transform: translateY(8px); } }
.dot { flex: none; width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; background: #ea4c89; }
.working .dot { animation: pulse 1s ease-in-out infinite; }
.waiting .dot { background: #f5a524; }
.success .dot { background: #2fbf71; }
.error .dot { background: #ff5a5f; }
@keyframes pulse { 50% { opacity: .35; } }
.title { font-weight: 600; margin: 0 0 2px; }
.body { margin: 0; color: #c9c9d6; }
.note { margin: 6px 0 0; color: #9d9db3; font-size: 12px; }
button {
  flex: none; margin-left: auto; padding: 2px 6px; border: 0; border-radius: 6px;
  background: transparent; color: #9d9db3; font: inherit; font-size: 16px; line-height: 1; cursor: pointer;
}
button:hover, button:focus-visible { color: #fff; background: rgba(255,255,255,.08); outline: none; }
@media (prefers-reduced-motion: reduce) { .banner, .working .dot { animation: none; } }
`;

export interface BannerContent {
  tone: BannerTone;
  title: string;
  body: string;
}

export class StatusBanner {
  private root: ShadowRoot | null = null;
  private host: HTMLElement | null = null;

  constructor(private readonly doc: Document = document) {}

  show({ tone, title, body }: BannerContent): void {
    const root = this.ensure();
    const banner = root.querySelector('.banner')!;
    banner.className = `banner ${tone}`;
    banner.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    root.querySelector('.title')!.textContent = title;
    root.querySelector('.body')!.textContent = body;
  }

  hide(): void {
    this.host?.remove();
    this.host = null;
    this.root = null;
  }

  private ensure(): ShadowRoot {
    if (this.root && this.host?.isConnected) return this.root;
    this.doc.getElementById(HOST_ID)?.remove();
    const host = this.doc.createElement('div');
    host.id = HOST_ID;
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>${STYLES}</style>
      <div class="banner" aria-live="polite">
        <span class="dot" aria-hidden="true"></span>
        <div>
          <p class="title"></p>
          <p class="body"></p>
          <p class="note">Dribbble AI Assistant · Publishing is always manual.</p>
        </div>
        <button type="button" aria-label="Dismiss">×</button>
      </div>`;
    root.querySelector('button')!.addEventListener('click', () => this.hide());
    this.doc.documentElement.append(host);
    this.host = host;
    this.root = root;
    return root;
  }
}
