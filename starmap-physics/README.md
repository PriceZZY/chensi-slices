# 星图物理 / Starmap Physics

双击 `demo.html` 就能玩。零依赖，一个文件。
Double-click `demo.html`. Zero dependencies, one file.

## 手感是怎么合成的 / How the feel is composed

沉思的星图上，每个想法是一颗星。「漂」的手感 = 三条规则叠加：

1. **漂浮 Drift** — 每颗星带独立相位与频率的 sin 摆动。关键在**不同步**：同步的摆动像屏保，异步的摆动像水面浮物。这条的设计要求只有一句：「一定要慢」。
2. **微引力 Anchor gravity** — 每颗星向自己的锚点极弱回归（系数 0.012）。漂得开，但不散场。
3. **互斥 Soft repulsion** — 近距离软推开。星和星不重叠，群体自然铺开，不需要任何布局算法。

再加两笔：

- **入场 Entrance** — 交错延迟 + cubic ease-out 缩放浮现，像墨滴一颗颗落进水。已入场的星记录在案，刷新数据不重播（产品里靠一个 `seenRef`）。
- **阻尼 Damping** — 速度每帧 ×0.86。这是水，不是太空。

## 产品里的完整版还有什么 / What the full version adds

本切片是骨架。产品里的星图（约 1400 行）在此之上还有：拖拽归类（拖进「公开广场/只给自己/朋友」墨池真实改库）、连线成树与层级折叠、滚轮缩放 + 名字渐显（Obsidian 式）、中央「里世界」归档之门、确定性布局种子（每次进来你的星星还在原地）、`prefers-reduced-motion` 全局尊重（本 demo 也做了）。

真实效果在 [chensi.app](https://chensi.app) 注册即见。

## License

MIT
