import * as fs from 'fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { availableServices, typesafeConfig } from '../../config/services';
import { clearProviderKey, getProviderKeyInfos, setProviderKey } from '../admin-store';
import { getTypeSafeStatus, TypeSafeEvaluationProvider } from '../typesafe';
import { questions, state, upstreamResponse } from './evaluation-fixtures';

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

describe('TypeSafe admin keys', () => {
  const originalKey = typesafeConfig.apiKey;

  afterEach(() => {
    clearProviderKey('typesafe');
    vi.restoreAllMocks();
  });

  it('lists TypeSafe as a managed evaluation key only', () => {
    expect(getProviderKeyInfos()).toContainEqual(expect.objectContaining({ provider: 'typesafe' }));
    expect(availableServices).not.toContain(typesafeConfig);
  });

  it('persists and applies key updates to an already constructed provider', async () => {
    const provider = new TypeSafeEvaluationProvider();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json(upstreamResponse));
    const info = setProviderKey('typesafe', 'first-test-key');
    expect(info).toEqual({ provider: 'typesafe', configured: true, source: 'dashboard', maskedKey: '••••-key' });
    expect(fs.writeFileSync).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('"typesafe": "first-test-key"'), 'utf-8');
    expect(getTypeSafeStatus()).toMatchObject({ enabled: true, available: true, config: { hasApiKey: true } });
    await provider.evaluate(state, questions);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer first-test-key' });
    setProviderKey('typesafe', 'second-test-key');
    await provider.evaluate(state, questions);
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ Authorization: 'Bearer second-test-key' });
    expect(JSON.stringify(getProviderKeyInfos())).not.toContain('second-test-key');
  });

  it('falls back to the startup environment key when the override is removed', () => {
    setProviderKey('typesafe', 'test-dashboard-key');
    expect(clearProviderKey('typesafe')).toMatchObject({
      provider: 'typesafe', configured: !!originalKey, source: originalKey ? 'env' : 'none',
    });
    expect(typesafeConfig.apiKey).toBe(originalKey);
    expect(typesafeConfig.enabled).toBe(!!originalKey);
  });
});
