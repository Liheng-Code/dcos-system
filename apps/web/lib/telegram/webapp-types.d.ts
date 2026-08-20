// Minimal ambient type declarations for the Telegram Mini App WebApp bridge
// (https://core.telegram.org/bots/webapps#initializing-mini-apps).
//
// Deliberately narrow: only the subset of `window.Telegram.WebApp` used by
// Phase 1 of the e-leave Mini App, plus stubs for MainButton / BackButton /
// showConfirm that Phase 2 and 3 will need. No `@twa-dev/sdk` dependency —
// the raw `telegram-web-app.js` bridge script defines `window.Telegram.WebApp`
// at runtime; this file just describes its shape to TypeScript.

export {};

declare global {
  interface TelegramWebAppMainButton {
    text: string;
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
    setText(text: string): void;
    showProgress(leaveActive?: boolean): void;
    hideProgress(): void;
  }

  interface TelegramWebAppBackButton {
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  }

  interface TelegramWebApp {
    ready(): void;
    expand(): void;
    close(): void;
    initData: string;
    themeParams: Record<string, string>;
    MainButton: TelegramWebAppMainButton;
    BackButton: TelegramWebAppBackButton;
    showConfirm(message: string, cb: (confirmed: boolean) => void): void;
    showPopup(params: object, cb?: (id: string) => void): void;
  }

  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}
