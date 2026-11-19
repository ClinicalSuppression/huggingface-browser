import { describe, expect, it } from 'vitest';
import path from 'path';
import { validateInstallPath } from './install-path';

describe('validateInstallPath', () => {
  it('accepts and canonicalizes an absolute custom path', () => {
    expect(validateInstallPath(path.join(path.parse(process.cwd()).root, 'models', '.')))
      .toBe(path.resolve(path.join(path.parse(process.cwd()).root, 'models')));
  });

  it('expands USERPROFILE paths', () => {
    expect(validateInstallPath('%USERPROFILE%\\models', 'C:\\Users\\tester'))
      .toBe(path.resolve('C:\\Users\\tester\\models'));
  });

  it.each(['', '  ', 'models', '../models', '/models/../secret'])('rejects invalid path %s', value => {
    expect(() => validateInstallPath(value)).toThrow();
  });
});
