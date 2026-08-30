---
description: "用于浏览器侧边栏和会话首屏的独立 MAOQ 品牌占位组件。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-maoq

[English](README.md) | 中文

## 概述

本包用独立的 MAOQ 身份填充浏览器侧边栏标志、名称和会话首屏标志。几何图形让两股相向力量组成 `M`，以中心圆点表示矛盾汇合，并从中延伸出向上的路线。它不使用 DeepSeek 图形、人物肖像、红星或既有政治徽记。本包不会向模型请求贡献任何内容。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在通用侧边栏和会话 Slot 声明之后挂载本插件。三个占位组件以原子方式注册，并在 HMR 时一起撤销。界面标志继承周围文字颜色，独立 favicon 则拥有自己的明暗配色。

<a id="understand-the-implementation"></a>
## 理解实现

[`src/client/Brand.tsx`](src/client/Brand.tsx) 保存代码原生的 SVG 几何图形与字标；[`src/client/index.ts`](src/client/index.ts) 完成感知声明顺序的 Slot 注册。实现不包含位图或复制的上游标志资产。

<a id="model-experience"></a>
## 模型体验

无。本包只负责浏览器展示，不会进入提供者请求。

#### KV Cache 影响

无。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **固定单一身份** — 其他标志或主题应由另一个 Slot 占位包提供。
- **尚未使用设计令牌配色** — 界面标志继承 `currentColor`，favicon 颜色由独立的 Shell 资产定义。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
