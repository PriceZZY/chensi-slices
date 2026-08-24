'use client'
import { useEffect, useRef, useState } from 'react'
import { acquireShellInert, releaseShellInert, pushOverlay, popOverlay, isTopOverlay, announceOverlayOpen, OVERLAY_OPEN_EVENT } from './shellInert'

// 文案可配:拷进自己项目时改这里(或接你的 i18n)。原产品里这五个值来自词典。
const LABELS = { close: '关闭', confirmAria: '确认', skipForever: '以后不再提醒（可在设置里改回）', cancel: '取消', confirm: '确定' }

// 应用内确认弹窗(纸墨风格),取代浏览器自带 confirm() —— 那个黑色系统框跟整个 app 的气质完全不搭。
// 用法:await confirmInk('话', { title, confirmText }) → boolean。
// 与 toast 同一套事件模式:confirmInk 只发事件,真正的渲染在 layout 挂载的 <InkConfirmHost />。
// skipKey(可选):弹窗底部多一个「以后不再提醒」勾选;勾选并确认后,同 key 的确认直接按「确定」放行。
// 偏好存 localStorage(设备层交互偏好,不进数据库),设置页可改回。

type Ask = { title?: string; message: string; confirmText: string; skipKey?: string; resolve: (ok: boolean) => void }

const SKIP_PREFIX = 'chensi:skip-confirm:'
export const VISIBILITY_CONFIRM_KEY = 'visibility-change' // 星图三种可见性拖拽(公开/收回/朋友可见)共用一个开关

export function isConfirmSkipped(key: string): boolean {
  try { return globalThis.localStorage?.getItem(SKIP_PREFIX + key) === '1' } catch { return false } // 隐私模式等读不到 → 按「要确认」
}

// 偏好变更通知:设置页开关用 useSyncExternalStore 订阅,单一事实源就是 localStorage(本组件写 → 手动 notify;跨标签页 → storage 事件)
const skipListeners = new Set<() => void>()
export function subscribeConfirmSkip(fn: () => void): () => void {
  skipListeners.add(fn)
  const onStorage = (e: StorageEvent) => { if (e.key === null || e.key.startsWith(SKIP_PREFIX)) fn() } // key=null 是 clear(),也要刷新
  window.addEventListener('storage', onStorage)
  return () => { skipListeners.delete(fn); window.removeEventListener('storage', onStorage) }
}

export function setConfirmSkipped(key: string, skip: boolean): void {
  try {
    if (skip) localStorage.setItem(SKIP_PREFIX + key, '1')
    else localStorage.removeItem(SKIP_PREFIX + key)
  } catch { /* 存不进去就退回每次都问,不炸 */ }
  skipListeners.forEach((f) => f())
}

let hostMounted = false // Host 在 root layout 常驻;此标记只兜「挂载前/极端卸载后」的理论边缘

export function confirmInk(message: string, opts?: { title?: string; confirmText?: string; skipKey?: string }): Promise<boolean> {
  if (opts?.skipKey && isConfirmSkipped(opts.skipKey)) return Promise.resolve(true) // 用户选过「不再提醒」→ 直接放行
  return new Promise((resolve) => {
    if (!hostMounted) {
      // 没人接事件 → Promise 会吊死。按「取消」收场(不做任何破坏性动作),绝不 hang。
      console.warn('[confirmInk] Host 未挂载,按取消处理')
      resolve(false)
      return
    }
    window.dispatchEvent(new CustomEvent<Ask>('app-confirm', {
      detail: { message, title: opts?.title, confirmText: opts?.confirmText ?? '', skipKey: opts?.skipKey, resolve },
    }))
  })
}

export default function InkConfirmHost() {
  const [ask, setAsk] = useState<Ask | null>(null)
  const [skip, setSkipState] = useState(false) // 「以后不再提醒」勾选态,每个新弹窗都从未勾开始
  const skipRef = useRef(false) // settle 从 ref 读(settle 若读 state 会变 reactive,键盘 effect 的旧闭包就关不对了)
  const setSkip = (v: boolean) => { skipRef.current = v; setSkipState(v) }
  const askRef = useRef<Ask | null>(null) // 当前请求的权威引用:settle 一律按对象身份校验,旧闭包关不掉新弹窗
  const okRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const tokenRef = useRef<symbol | null>(null)

  // settle 全走这里:身份不符(旧闭包/重复触发)一律忽略 → Promise 恰好 resolve 一次
  const settle = (which: Ask, ok: boolean) => {
    if (askRef.current !== which) return
    askRef.current = null
    if (ok && which.skipKey && skipRef.current) setConfirmSkipped(which.skipKey, true) // 只有点「确定」才落偏好;取消/Esc 不落
    setAsk(null) // 先关再 resolve:万一 resolve 的同步续体立刻发起新确认,尾部 setAsk 不会把新弹窗盖掉
    which.resolve(ok)
  }

  useEffect(() => {
    const on = (e: Event) => {
      const detail = (e as CustomEvent<Ask>).detail
      // 极端情况:上一个还开着又来一个 → 旧的按取消收场(在事件处理里做,不塞进 state updater)
      const prev = askRef.current
      if (prev) { askRef.current = null; prev.resolve(false) }
      askRef.current = detail
      setSkip(false)
      setAsk(detail)
      announceOverlayOpen('confirm') // 跨 Host 互斥
    }
    const onOther = (e: Event) => {
      if ((e as CustomEvent<{ kind: string }>).detail?.kind === 'confirm') return
      const cur = askRef.current
      if (cur) { askRef.current = null; setAsk(null); cur.resolve(false) }
    }
    hostMounted = true
    window.addEventListener('app-confirm', on)
    window.addEventListener(OVERLAY_OPEN_EVENT, onOther)
    return () => {
      hostMounted = false
      window.removeEventListener('app-confirm', on)
      window.removeEventListener(OVERLAY_OPEN_EVENT, onOther)
      // Host 卸载:当前 Promise 绝不吊死,按取消收场;焦点也还回去
      const cur = askRef.current
      if (cur) { askRef.current = null; cur.resolve(false) }
      // 还焦点要等两个 effect 的 cleanup 都跑完:本 cleanup 先执行,此刻 app-shell 还是 inert,
      // 直接 focus 会失败 → 微任务推迟到 [ask] 的 cleanup(解 inert)之后。
      const el = restoreRef.current
      restoreRef.current = null
      queueMicrotask(() => el?.focus?.())
    }
  }, [])

  // 打开:记住焦点(仅从「无→有」时记,弹窗替换不覆盖)、聚到「确定」、背景 app-shell 置 inert(与 Modal 同款)
  useEffect(() => {
    if (!ask) { restoreRef.current?.focus?.(); restoreRef.current = null; return }
    if (!restoreRef.current) restoreRef.current = document.activeElement as HTMLElement | null
    okRef.current?.focus()
    acquireShellInert() // 引用计数(shellInert):与 Modal 等 Host 叠开叠关都对账
    tokenRef.current = pushOverlay()
    return () => { if (tokenRef.current) { popOverlay(tokenRef.current); tokenRef.current = null }; releaseShellInert() }
  }, [ask])

  useEffect(() => {
    if (!ask) return
    const onKey = (e: KeyboardEvent) => {
      if (tokenRef.current && !isTopOverlay(tokenRef.current)) return // 仲裁:非栈顶不响应
      // Esc = 取消。Enter 不做全局分支:焦点在哪个按钮,原生 Enter 就点哪个(否则焦点在「取消」上按 Enter 会误确认)
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); settle(ask, false) }
      else if (e.key === 'Tab') {
        // 焦点圈定:只在面板内的控件之间跳,含「不再提醒」勾选(遮罩是 tabIndex=-1 的假按钮,绝不能拿到焦点)
        e.preventDefault(); e.stopPropagation()
        const btns = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button, input') ?? [])
        if (!btns.length) return
        const i = btns.indexOf(document.activeElement as HTMLElement)
        btns[(i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length]?.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [ask])

  if (!ask) return null
  return (
    <div data-ink-confirm className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button" aria-label={LABELS.close} tabIndex={-1} onClick={() => settle(ask, false)}
        className="absolute inset-0 cursor-default bg-scrim backdrop-blur-[2px]"
      />
      <div
        ref={panelRef} role="alertdialog" aria-modal="true" aria-label={ask.title ?? LABELS.confirmAria} aria-describedby="ink-confirm-msg"
        className="relative w-full max-w-sm animate-fade-up rounded-2xl border border-ink/10 bg-paper p-6 shadow-lg"
      >
        {ask.title && <h2 className="font-serif text-[17px] text-ink">{ask.title}</h2>}
        <p id="ink-confirm-msg" className={`${ask.title ? 'mt-3' : ''} text-[14px] leading-relaxed text-ink`}>{ask.message}</p>
        {ask.skipKey && (
          <label className="mt-4 flex cursor-pointer select-none items-center gap-2 text-[13px] text-ink-soft transition-colors hover:text-ink">
            <input
              type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)}
              className="h-[15px] w-[15px] accent-cinnabar"
            />
            {LABELS.skipForever}
          </label>
        )}
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button" onClick={() => settle(ask, false)}
            className="inline-flex h-9 items-center justify-center rounded-md px-4 text-sm text-ink-soft transition-colors duration-200 hover:text-ink"
          >{LABELS.cancel}</button>
          <button
            ref={okRef} type="button" onClick={() => settle(ask, true)}
            className="inline-flex h-9 items-center justify-center rounded-md bg-cinnabar px-5 text-sm text-paper transition-all duration-200 active:scale-95"
          >{ask.confirmText || LABELS.confirm}</button>
        </div>
      </div>
    </div>
  )
}
