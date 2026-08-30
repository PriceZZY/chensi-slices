# confirmInk — 纸墨风格的应用内确认弹窗

> **这份切片是用来读的，不是用来跑的。** 两个文件（`confirmInk.tsx` / `shellInert.ts`）是从产品仓
> 原样摘出来的源码，依赖 React 19 与产品的样式 token，单独 `npm install` 跑不起来 —— 放在这里是为了
> 让人看清楚「一个命令式 `await` 弹窗 + 焦点陷阱 + 浮层仲裁」是怎么写的。
> 想直接看效果的，隔壁 [`starmap-physics/`](../starmap-physics) 是个双击就能开的单文件 HTML。

浏览器自带的 `confirm()` 是一个黑色系统框，跟产品气质完全不搭。这是替代品：一个命令式 API 的应用内确认层。

```tsx
const ok = await confirmInk('删掉后这条闪念就彻底没了，不进回收站。', {
  title: '删掉这条闪念？',
  confirmText: '删掉',
  skipKey: 'delete-note', // 可选:「以后不再提醒」
})
if (ok) { /* ... */ }
```

## 设计要点 / Design notes

- **命令式 API × 事件驱动渲染**：`confirmInk()` 只 dispatch 一个 CustomEvent，真正的渲染在 root layout 常驻的 `<InkConfirmHost />`。调用方拿到一个 Promise——`await` 一个弹窗，代码读起来像同步逻辑。
- **绝不吊死**：Host 没挂载/中途卸载/新弹窗顶掉旧弹窗——所有边缘路径都按「取消」收场，Promise 恰好 resolve 一次（`askRef` 按对象身份校验，旧闭包关不掉新弹窗）。
- **焦点纪律**：打开记住来源焦点、初始聚到「确定」、Tab 只在面板内循环（含勾选框）、Esc=取消、**Enter 不做全局分支**——焦点在「取消」上按 Enter 就该是取消。关闭后焦点物归原主，且要等背景解除 inert 之后（微任务推迟）。
- **「不再提醒」协议**：`skipKey` 开启底部勾选；只有点「确定」才落偏好（取消/Esc 不落）；存 localStorage（设备层偏好不进数据库），带跨标签页同步（storage 事件）与设置页可改回的订阅接口（`subscribeConfirmSkip`）。
- **多浮层秩序**：与站内其他浮层共享一个引用计数的 `shellInert`（背景 `inert`）+ 浮层栈（Esc 只关栈顶）+ 跨 Host 互斥广播（两个浮层不共存）。这套秩序在 `shellInert.ts`，43 行。

## 移植说明 / Porting

- 依赖 React 18+；样式类是 Tailwind + 四个主题变量：`--color-paper: #F7F4ED; --color-ink: #262521; --color-ink-soft: #6B6659; --color-cinnabar: #A63A2B;`（`bg-scrim` 是遮罩色：亮色主题下 25% 墨）。没有 Tailwind 的话把 className 换成你自己的。
- 文案在文件头部的 `LABELS` 常量（原产品里接 i18n 词典）。
- 把 `<InkConfirmHost />` 挂在 root layout、**任何会被 `inert` 的容器之外**。

## License

MIT
