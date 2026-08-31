# Agent Note: 在 Profile 启动前引导 macOS 系统代理

Status: implemented

[English](2026-08-31-macos-system-proxy-bootstrap.md) | 中文

## 问题

macOS 网络设置可以让浏览器和命令行流量经过本地 HTTP 或 HTTPS 代理，但不会把代理变量导出到新启动的 Node 进程。Node 的全局网络客户端本身不会使用这些系统设置，并且只在进程启动时读取 `NODE_USE_ENV_PROXY`。因此，即使相同端点可以通过已启用的 macOS 代理访问，已经登录的 Codex 提供方仍可能让每次请求都以传输错误失败。

## 决策

CLI 只为 Profile 执行引导代理配置，并且在加载任何 Profile 模块之前完成。在 macOS 上，如果 Node 版本支持环境代理和进程替换，启动器会保留显式的 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` 和 `NO_PROXY` 值。没有显式代理时，它读取 `scutil --proxy`，取得已启用的 HTTP、HTTPS 代理 URL 及绕过列表，然后以 `NODE_USE_ENV_PROXY=1` 替换当前进程一次。显式将 `NODE_USE_ENV_PROXY` 设为 `1` 以外的值可选择退出。其他平台、CLI 模式、不支持的 Node 版本、没有系统代理以及代理发现失败的情况都保留继承行为。

## 考虑过的替代方案

要求每位用户导出代理变量的方案被否决，因为 GUI 启动和普通终端会话可能合理地只配置了 macOS 系统代理。为各提供方添加局部代理 agent 的方案被否决，因为问题位于进程网络边界，不应在每个模型适配器中分别重复实现。加载 Profile 后再修改 `process.env` 的方案被否决，因为 Node 会根据启动时的状态建立环境代理行为。

## 后果

受支持的 macOS Profile 可以在应用启动前透明地替换自身一次。显式的操作者配置始终优先，系统代理变更会在 Profile 重启后生效。该引导不增加代理依赖，不在其他平台上执行发现，并且以尽力而为方式处理失败。单元测试覆盖发现、优先级、选择退出、绕过列表传递和无操作路径；从父命令移除全部代理变量后的真实 Codex 冒烟测试验证了重启后的 DSH 进程可以完成模型请求并报告提供方 token 用量。
