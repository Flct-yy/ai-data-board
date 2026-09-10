---
alwaysApply: true
scene: git_message
---

# Git commit 提交信息生成规则

1. 语言：中文，精简，不啰嗦，控制在 20 字以内
2. 格式：`类型: 简短描述`
   类型可选：feat / fix / refactor / docs / style / chore
3. 规则
   - feat：新增功能
   - fix：修复bug
   - refactor：重构代码，无功能变化
   - docs：文档/注释修改
   - style：格式、lint、样式调整，逻辑不变
   - chore：脚手架、依赖、配置文件改动
4. 禁止长篇描述，不添加多余解释，只保留核心变更点
5. 多条改动合并提炼一条，不要罗列文件
