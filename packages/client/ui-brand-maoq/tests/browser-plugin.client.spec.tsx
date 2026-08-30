// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { MaoqBrandMark, MaoqBrandName } from '../src/client/Brand.tsx'
import { apply, inject } from '../src/client/index.ts'

afterEach(cleanup)

const HOLES = ['sidebar.brand.mark', 'sidebar.brand.name', 'conversation.hero.brand.mark'] as const

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  const declareHoles = () => slots.register({
    name: 'root',
    children: Object.fromEntries(HOLES.map(name => [name, { kind: 'single', scope: 'root' }])),
  } as never, () => null)
  const disposeHoles = declare ? declareHoles() : undefined
  return { ctx, slots, declareHoles, disposeHoles }
}

describe('MAOQ browser brand', () => {
  it('fills all brand declarations before or after apply and removes them together', async () => {
    expect(inject).toEqual(['slots'])
    const before = await bench()
    const fiber = before.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(1)
    before.disposeHoles?.()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(0)
    before.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(1)
    await fiber.dispose()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(0)

    const after = await bench(false)
    await after.ctx.plugin({ inject: [...inject], apply }).await()
    after.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES) expect(after.slots.entries(hole)).toHaveLength(1)
  })

  it('renders one scalable mark and a fixed geometric wordmark', () => {
    const mark = render(<MaoqBrandMark size={34} className="hero" />)
    const markSvg = mark.container.querySelector('svg')
    expect(markSvg?.getAttribute('width')).toBe('34')
    expect(markSvg?.getAttribute('class')).toBe('hero')
    expect(markSvg?.querySelectorAll('path')).toHaveLength(2)
    mark.unmount()

    const name = render(<MaoqBrandName />)
    expect(name.container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 92 24')
  })
})
