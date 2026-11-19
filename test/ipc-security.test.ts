import { describe, expect, it } from 'vitest';
import { guardedHandler, packagedAppUrl, safeExternalUrl, trustedSender } from '../electron/ipc-security';

describe('IPC security', () => {
  const devUrl = 'http://localhost:5173/';
  const makeFrame = (url = devUrl, processId = 4, routingId = 9) => ({
    processId, routingId, url, detached: false, isDestroyed: () => false,
  });
  const frame = makeFrame();
  const wc = { mainFrame: frame, isDestroyed: () => false, getURL: () => devUrl };
  const event = { sender: wc, senderFrame: frame };
  it('allows exact dev and packaged URLs', () => {
    expect(trustedSender(event, wc, wc.getURL())).toBe(true);
    const url = packagedAppUrl('C:\\app\\dist\\index.html');
    const packagedFrame = makeFrame(url);
    const packaged = { ...wc, mainFrame: packagedFrame, getURL: () => url };
    expect(trustedSender({ sender: packaged, senderFrame: packagedFrame }, packaged, url)).toBe(true);
  });
  it('rejects foreign contents, subframes, and wrong URLs', () => {
    expect(trustedSender({ ...event, sender: {} }, wc, wc.getURL())).toBe(false);
    expect(trustedSender({ ...event, senderFrame: makeFrame(devUrl, 4, 10) }, wc, wc.getURL())).toBe(false);
    expect(trustedSender({ ...event, senderFrame: makeFrame('https://attacker.test/', 4, 9) }, wc, wc.getURL())).toBe(false);
    expect(trustedSender(event, wc, 'wrong')).toBe(false);
  });
  it('matches the main frame by stable IDs without relying on undocumented properties', () => {
    const mainFrame = makeFrame();
    const contents = { ...wc, mainFrame };
    const wrapper = makeFrame();
    expect(trustedSender({ sender: contents, senderFrame: wrapper }, contents, wc.getURL())).toBe(true);
    expect(trustedSender({
      sender: contents,
      senderFrame: makeFrame(devUrl, 4, 10),
    }, contents, wc.getURL())).toBe(false);
  });
  it('guards handler boundary before side effects for dev and production URLs', () => {
    let effects = 0;
    const invoke = guardedHandler(() => wc, wc.getURL(), () => ++effects);
    expect(invoke(event)).toBe(1);
    for (const invalid of [
      { ...event, sender: {} },
      { ...event, senderFrame: makeFrame(devUrl, 4, 10) },
      event,
    ]) {
      if (invalid === event) {
        expect(() => guardedHandler(() => wc, 'wrong', () => ++effects)(invalid)).toThrow();
      } else expect(() => invoke(invalid)).toThrow();
    }
    const prodUrl = packagedAppUrl('C:\\app\\dist\\index.html');
    const prodFrame = makeFrame(prodUrl);
    const prodWc = { ...wc, mainFrame: prodFrame, getURL: () => prodUrl };
    expect(guardedHandler(() => prodWc, prodUrl, () => ++effects)({ sender: prodWc, senderFrame: prodFrame })).toBe(2);
    expect(effects).toBe(2);
  });
  it('rejects destroyed main WebContents before handler effects', () => {
    let effects = 0;
    const destroyed = { ...wc, isDestroyed: () => true };
    const invoke = guardedHandler(() => destroyed, wc.getURL(), () => ++effects);
    expect(() => invoke({ sender: destroyed, senderFrame: frame })).toThrow();
    expect(effects).toBe(0);
    expect(trustedSender({
      sender: wc,
      senderFrame: { ...frame, isDestroyed: () => true },
    }, wc, wc.getURL())).toBe(false);
  });
  it('validates external URLs', () => {
    expect(safeExternalUrl('https://huggingface.co/a')).toBe('https://huggingface.co/a');
    for (const url of ['http://x', 'https://u:p@x', 'https://%', null]) expect(safeExternalUrl(url)).toBeNull();
  });
});
