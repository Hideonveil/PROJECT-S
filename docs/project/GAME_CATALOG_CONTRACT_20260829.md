# M2｜统一游戏目录契约

> 日期：2026-08-29（Asia/Shanghai）
>
> 状态：`M2 COMPLETE / PRODUCTION NOT DEPLOYED`

## 一句话

每款游戏只在服务端 `GameDefinition` 登记一次。浏览器页面和容量测试只能读取其安全公开版本，不能再各自抄写
游戏名、段位、位置、配置步骤和人数上限。

## 唯一事实源

```text
Server GameDefinition registry
        │
        ├── 服务端规则 adapter（不公开）
        └── /api/config games（安全 public catalog）
                      │
             ┌────────┼────────┐
             │        │        │
           Home     Profile   Capacity Runner
```

服务端保留匹配规则函数和容量场景等内部实现；`/api/config` 只提供渲染与生成合法输入需要的数据，不公开函数、密钥
或管理员能力。

## Public catalog 内容

- 游戏 ID、名称、开放状态、分类和支持设备；
- 游戏卡、模式卡和段位图资源；
- Ranked / Casual 是否启用、人数硬上限和配置步骤；
- 段位选项与位置选项；
- Room 招募文案。

## 已接入消费者

- Home：游戏、模式、段位、位置和步骤；
- Profile：当前可用游戏及名称；
- Room / Matching / Session Preview：游戏名称；
- Matching directory：只读取目录中当前开放游戏；
- 5-user、stateful、distributed capacity Runner：从 catalog 选择游戏、段位和位置，并只提交场景明确指定的玩家偏好。

Casual 的默认人数、招募模式和人数边界只由服务端 normalization 决定；浏览器和 Runner 不再各自复制一份
业务默认值。

## 防回归规则

1. 新游戏必须新增一个 `GameDefinition` 与独立规则 adapter；
2. 不得在 Home/Profile/Room/Runner 新增游戏名映射表；
3. 浏览器不得获得服务端规则函数；
4. 未开放游戏不能进入匹配目录或容量 workload；
5. 新游戏接入必须通过 fake-game catalog、浏览器消费和 capacity 输入测试。

## 本阶段边界

- Deadlock 用户行为保持不变；
- 未加入三款新游戏的真实规则或素材；
- 未开始 M3 手机外壳；
- 未修改数据库、migration 或 Production。
