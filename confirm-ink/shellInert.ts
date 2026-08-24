// app-shell inert 的引用计数:弹窗 Host(confirmInk;closeInk 已退役)各自快照
// hadInert 不可组合——A 先开(置 inert),B 后开(见 hadInert=true 不认领),A 关(摘 inert),
// B 还开着却没锁。计数化:acquire 时 0→1 才真设属性,release 时 1→0 才真摘,叠开叠关都对账。
let count = 0

export function acquireShellInert(): void {
  count += 1
  if (count === 1) document.getElementById('app-shell')?.setAttribute('inert', '')
}

export function releaseShellInert(): void {
  count = Math.max(0, count - 1)
  if (count === 0) document.getElementById('app-shell')?.removeAttribute('inert')
}

// 顶层浮层仲裁栈:confirmInk(历史上还有 closeInk)在 document capture 上监听——
// stopPropagation 挡不住**同一 target**的另一个 listener,叠开时一个 Esc 会连关两层。
// 仲裁:各 Host 打开时 push 一个 token,键盘 handler 先问 isTopOverlay(token),非栈顶不响应。
const overlayStack: symbol[] = []

export function pushOverlay(): symbol {
  const token = Symbol('overlay')
  overlayStack.push(token)
  return token
}

export function popOverlay(token: symbol): void {
  const i = overlayStack.lastIndexOf(token)
  if (i >= 0) overlayStack.splice(i, 1)
}

export function isTopOverlay(token: symbol): boolean {
  return overlayStack.length > 0 && overlayStack[overlayStack.length - 1] === token
}

// 跨 Host 互斥:高低 z 的两个 Host 叠开时视觉顶层≠栈顶层(Tab 进被遮层;实例曾是 confirm×closeInk)。
// 现有流程本就到不了叠开(彼此打开时对方入口被 inert+遮罩封死),这里把「到不了」升级成「机制上不存在」:
// 任一 Host 打开时广播,另一 Host 若还开着立即按取消收场——单一弹窗不变量成立后,z 序天然无错位面。
export const OVERLAY_OPEN_EVENT = 'app-overlay-open'

export function announceOverlayOpen(kind: string): void {
  window.dispatchEvent(new CustomEvent(OVERLAY_OPEN_EVENT, { detail: { kind } }))
}
