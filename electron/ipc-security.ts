import { pathToFileURL } from 'url';

export function trustedSender(event: any, contents: any, allowedUrl: string): boolean {
  const reject = (reason: string) => {
    if (process.env.SMOKE_TEST === '1') console.error(`[IPC_GUARD] ${reason}`);
    return false;
  };
  try {
    if (!event || !contents || contents.isDestroyed() || event.sender !== contents) {
      return reject('missing/destroyed contents or sender mismatch');
    }
    const senderFrame = event.senderFrame;
    const mainFrame = contents.mainFrame;
    if (!senderFrame || !mainFrame || senderFrame.isDestroyed() || mainFrame.isDestroyed() ||
        senderFrame.detached || mainFrame.detached) return reject('missing or detached frame');
    // WebFrameMain has no isMainFrame property. The top frame is identified by
    // matching the documented process/routing IDs to WebContents.mainFrame.
    if (!Number.isInteger(senderFrame.processId) || !Number.isInteger(senderFrame.routingId) ||
        !Number.isInteger(mainFrame.processId) || !Number.isInteger(mainFrame.routingId) ||
        senderFrame.processId !== mainFrame.processId ||
        senderFrame.routingId !== mainFrame.routingId) {
      return reject('sender frame does not match WebContents.mainFrame');
    }
    const currentUrl = contents.getURL();
    return senderFrame.url === allowedUrl && currentUrl === allowedUrl ||
      reject(`URL mismatch frame=${senderFrame.url} contents=${currentUrl} expected=${allowedUrl}`);
  } catch { return reject('failed to inspect sender frame'); }
}

export function guardedHandler<TEvent, TArgs extends unknown[], TResult>(
  contents: () => any,
  allowedUrl: string,
  handler: (event: TEvent, ...args: TArgs) => TResult,
): (event: TEvent, ...args: TArgs) => TResult {
  return (event, ...args) => {
    if (!trustedSender(event, contents(), allowedUrl)) throw new Error('Untrusted IPC sender');
    return handler(event, ...args);
  };
}

export function isAllowedHubUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'huggingface.co';
  } catch { return false; }
}

export function packagedAppUrl(indexHtmlPath: string): string {
  return pathToFileURL(indexHtmlPath).href;
}

export function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
