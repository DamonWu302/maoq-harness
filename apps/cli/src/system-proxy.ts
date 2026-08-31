/**
 * macOS system-proxy bootstrap for profile processes.
 * @module @deepseek-ai/dsh/system-proxy
 */

import { execFileSync } from 'node:child_process'

/** Inputs replaceable by the deterministic launcher tests. */
export interface SystemProxyEnvironmentOptions {
  /** Platform whose system settings may supply a proxy. */
  platform?: NodeJS.Platform
  /** Environment inherited by the replacement process. */
  environment?: NodeJS.ProcessEnv
  /** Whether this Node release supports `NODE_USE_ENV_PROXY`. */
  supportsEnvProxy?: boolean
  /** Read the macOS `scutil --proxy` output. */
  readSystemProxy?: () => string
  /** Replace the current process with the same CLI and this environment. */
  replaceProcess?: (environment: Record<string, string>) => void
}

/** Read one scalar from `scutil --proxy` output. */
function scalar(output: string, name: string): string | undefined {
  const match = output.match(new RegExp(`^\\s*${name}\\s*:\\s*(.*?)\\s*$`, 'm'))
  return match?.[1]
}

/** Render an enabled macOS HTTP proxy as the URL Node's environment agent accepts. */
function proxyUrl(output: string, prefix: 'HTTP' | 'HTTPS'): string | undefined {
  if (scalar(output, `${prefix}Enable`) !== '1') return undefined
  const host = scalar(output, `${prefix}Proxy`)
  const port = Number(scalar(output, `${prefix}Port`))
  if (host === undefined || host.length === 0 || /[\s/@]/.test(host)) return undefined
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) return undefined
  const address = host.includes(':') ? `[${host}]` : host
  return `http://${address}:${port}`
}

/** Read the bypass list macOS associates with its enabled proxies. */
function noProxy(output: string): string | undefined {
  const body = output.match(/^\s*ExceptionsList\s*:\s*<array>\s*\{([\s\S]*?)^\s*\}/m)?.[1]
  const entries = [...(body ?? '').matchAll(/^\s*\d+\s*:\s*(.*?)\s*$/gm)]
    .map(match => match[1])
    .filter((entry): entry is string => entry !== undefined && entry.length > 0)
  return entries.length === 0 ? undefined : entries.join(',')
}

/** Whether an upper- or lower-case spelling is already explicit. */
function hasEnvironmentName(environment: NodeJS.ProcessEnv, name: string): boolean {
  const target = name.toUpperCase()
  return Object.keys(environment).some(candidate => candidate.toUpperCase() === target)
}

/** Read system proxy settings without making their absence a launch failure. */
function readMacSystemProxy(): string {
  try {
    return execFileSync('/usr/sbin/scutil', ['--proxy'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2_000,
    })
  } catch {
    // Proxy discovery is optional; the inherited environment remains authoritative.
    return ''
  }
}

/** Replace this CLI process so Node constructs its global proxy agent at startup. */
function replaceCurrentProcess(environment: Record<string, string>): void {
  if (process.execve === undefined) throw new Error('dsh: this Node release cannot restart with the macOS system proxy')
  process.execve(
    process.execPath,
    [process.execPath, ...process.execArgv, ...process.argv.slice(1)],
    environment,
  )
  throw new Error('dsh: process.execve returned without replacing the process')
}

/**
 * Make a profile process honour explicit proxy variables or the enabled macOS
 * system HTTP proxies. Existing proxy and no-proxy variables always win. The
 * current process is replaced because Node reads `NODE_USE_ENV_PROXY` only at
 * startup; profiles on other platforms and Node releases without the flag are
 * unchanged.
 * @param options - injectable process and system-settings operations.
 */
export function ensureSystemProxyEnvironment(options: SystemProxyEnvironmentOptions = {}): void {
  const platform = options.platform ?? process.platform
  const environment = options.environment ?? process.env
  const supportsEnvProxy = options.supportsEnvProxy
    ?? (process.allowedNodeEnvironmentFlags.has('--use-env-proxy') && process.execve !== undefined)
  if (platform !== 'darwin' || !supportsEnvProxy) return

  const nodeProxySetting = environment['NODE_USE_ENV_PROXY']
  if (nodeProxySetting !== undefined && nodeProxySetting !== '1') return

  const hasExplicitProxy = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY']
    .some(name => hasEnvironmentName(environment, name))
  if (hasExplicitProxy && nodeProxySetting === '1') return

  const next = Object.fromEntries(
    Object.entries(environment).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
  next['NODE_USE_ENV_PROXY'] = '1'

  if (!hasExplicitProxy) {
    const output = (options.readSystemProxy ?? readMacSystemProxy)()
    const http = proxyUrl(output, 'HTTP')
    const https = proxyUrl(output, 'HTTPS')
    if (http === undefined && https === undefined) return
    if (http !== undefined) next['HTTP_PROXY'] = http
    if (https !== undefined) next['HTTPS_PROXY'] = https
    if (!hasEnvironmentName(environment, 'NO_PROXY')) {
      const bypass = noProxy(output)
      if (bypass !== undefined) next['NO_PROXY'] = bypass
    }
  }

  ;(options.replaceProcess ?? replaceCurrentProcess)(next)
}
