import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'forge-studio',
  component: 'Pane',
  requestId: 'forge-studio',
  props: {
    title: 'Forge Studio',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('an empty studio says so on every surface', async ($, on) => {
  on('command.register', () => ({ value: { command: 'studio' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Nothing rendered yet/ }))?.text).toContain('Nothing rendered yet')
    await ui.unmount()
  }
})

test('/tune refuses an odd argument list without running anything', async ($, on) => {
  on('command.register', () => ({ value: { command: 'tune' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  let ran = 0
  on('process.run', () => {
    ran++
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })

  const odd = await $.command.run({ command: 'tune', args: 'striations' })
  expect(odd.text).toContain('Pairs, please')
  const notANumber = await $.command.run({ command: 'tune', args: 'striations soft' })
  expect(notANumber.text).toContain('is not a number')
  const list = await $.command.run({ command: 'tune', args: 'list' })
  expect(list.text).toContain('striations')
  expect(ran).toBe(0)
})
