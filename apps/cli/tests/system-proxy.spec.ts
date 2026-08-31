import { describe, expect, it, vi } from 'vitest'
import { ensureSystemProxyEnvironment } from '../src/system-proxy.ts'

const SYSTEM_PROXY = [
  '<dictionary> {',
  '  ExceptionsList : <array> {',
  '    0 : 127.0.0.1',
  '    1 : localhost',
  '    2 : *.local',
  '  }',
  '  HTTPEnable : 1',
  '  HTTPPort : 7897',
  '  HTTPProxy : 127.0.0.1',
  '  HTTPSEnable : 1',
  '  HTTPSPort : 7897',
  '  HTTPSProxy : 127.0.0.1',
  '}',
].join('\n')

describe('ensureSystemProxyEnvironment', () => {
  it('restarts a macOS profile with the enabled system proxies before networking starts', () => {
    const replaceProcess = vi.fn()

    ensureSystemProxyEnvironment({
      platform: 'darwin',
      environment: { PATH: '/bin' },
      supportsEnvProxy: true,
      readSystemProxy: () => SYSTEM_PROXY,
      replaceProcess,
    })

    expect(replaceProcess).toHaveBeenCalledOnce()
    expect(replaceProcess).toHaveBeenCalledWith({
      PATH: '/bin',
      NODE_USE_ENV_PROXY: '1',
      HTTP_PROXY: 'http://127.0.0.1:7897',
      HTTPS_PROXY: 'http://127.0.0.1:7897',
      NO_PROXY: '127.0.0.1,localhost,*.local',
    })
  })

  it('enables Node proxy support without replacing an explicit proxy', () => {
    const replaceProcess = vi.fn()
    const readSystemProxy = vi.fn(() => SYSTEM_PROXY)

    ensureSystemProxyEnvironment({
      platform: 'darwin',
      environment: { HTTPS_PROXY: 'http://explicit.example:8080' },
      supportsEnvProxy: true,
      readSystemProxy,
      replaceProcess,
    })

    expect(readSystemProxy).not.toHaveBeenCalled()
    expect(replaceProcess).toHaveBeenCalledWith({
      HTTPS_PROXY: 'http://explicit.example:8080',
      NODE_USE_ENV_PROXY: '1',
    })
  })

  it('honours an explicit Node proxy opt-out', () => {
    const replaceProcess = vi.fn()

    ensureSystemProxyEnvironment({
      platform: 'darwin',
      environment: {
        NODE_USE_ENV_PROXY: '0',
        HTTPS_PROXY: 'http://explicit.example:8080',
      },
      supportsEnvProxy: true,
      readSystemProxy: () => SYSTEM_PROXY,
      replaceProcess,
    })

    expect(replaceProcess).not.toHaveBeenCalled()
  })

  it('does nothing off macOS, without Node support, or without an enabled HTTP proxy', () => {
    for (const options of [
      { platform: 'linux' as const, supportsEnvProxy: true, output: SYSTEM_PROXY },
      { platform: 'darwin' as const, supportsEnvProxy: false, output: SYSTEM_PROXY },
      { platform: 'darwin' as const, supportsEnvProxy: true, output: '<dictionary> { HTTPEnable : 0 }' },
    ]) {
      const replaceProcess = vi.fn()
      ensureSystemProxyEnvironment({
        platform: options.platform,
        environment: {},
        supportsEnvProxy: options.supportsEnvProxy,
        readSystemProxy: () => options.output,
        replaceProcess,
      })
      expect(replaceProcess).not.toHaveBeenCalled()
    }
  })

  it('keeps an explicit no-proxy list when discovering the system proxy', () => {
    const replaceProcess = vi.fn()

    ensureSystemProxyEnvironment({
      platform: 'darwin',
      environment: { no_proxy: 'localhost,internal.example' },
      supportsEnvProxy: true,
      readSystemProxy: () => SYSTEM_PROXY,
      replaceProcess,
    })

    expect(replaceProcess).toHaveBeenCalledWith(expect.objectContaining({
      no_proxy: 'localhost,internal.example',
    }))
    expect(replaceProcess.mock.calls[0]?.[0]).not.toHaveProperty('NO_PROXY')
  })
})
