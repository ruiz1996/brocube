# Neon Breaker

一个零依赖、可扩展的 Canvas 无限生存打方块游戏。挡板每 5 秒自动发射能量球；球掉出底部会被回收，但不会导致失败。随机凸多边形方块会持续生成并缓慢下压，任意方块触碰底部防线即游戏结束。

在线游玩：<https://ruiz1996.github.io/brocube/>

## 运行

Windows 用户直接双击 `启动游戏.cmd`，启动器会在后台运行本地服务并打开浏览器。

也可以在终端中启动：

```powershell
npm run dev
```

浏览器打开 `http://localhost:5173`。

运行核心玩法测试：

```powershell
npm test
```

## 架构

```text
src/
├─ core/                 # 与玩法无关的引擎层
│  ├─ GameEngine.js      # 固定时间步循环、场景、暂停
│  ├─ EventBus.js        # 模块间消息契约
│  ├─ Entity.js          # 实体与 World 容器
│  ├─ InputManager.js    # 键盘/指针统一输入
│  └─ PluginManager.js   # 外部玩法插件与生命周期钩子
├─ game/
│  ├─ BreakoutScene.js   # 本玩法的编排与状态机
│  ├─ BreakoutRenderer.js# 纯渲染
│  ├─ entities/          # 球、挡板、砖块、粒子
│  ├─ systems/           # 移动、自动发球、多边形碰撞、生成、下压与特效
│  └─ plugins/           # 可插拔玩法示例
└─ ui/                   # DOM 界面，不侵入游戏逻辑
```

## 扩展约定

- **新砖块**：扩展 `Brick` 的数据字段或替换 `BrickFieldSystem` 的多边形生成器，由独立系统监听 `brick:hit` 处理。
- **血量曲线**：编辑 `config.js` 中的 `brick.healthFormula`。期望血量由基础值、时间幂函数、分数幂函数相加得到，没有固定上限；`randomSpread` 控制同一时刻方块之间的随机差异。

```text
期望血量 = baseHp
         + timeCoefficient × (存活分钟数 ^ timeExponent)
         + scoreCoefficient × ((分数 / scoreScale) ^ scoreExponent)
最终血量 = round(期望血量 ± randomSpread)，且不低于 minHp
```

调大 `timeCoefficient` / `scoreCoefficient` 会整体加快成长；大于 1 的指数让后期加速，小于 1 则让增长逐渐放缓。调整 `scoreScale` 可以改变分数项开始明显生效的时机。

## 强化系统

每累计 `GAME.upgrade.scoreInterval` 分（默认 2000 分）会冻结战场并弹出一次强化选择。阈值可以连续跨越，多出来的选择会排队，不会丢失。每次从尚未满级的强化池中随机抽取 3 项且不会重复。

- **高速装填**：发射间隔每级乘以 `rapidFireMultiplier`，最低不会小于 `minimumFireInterval`。
- **分裂发射**：每级增加额外生成一颗球的概率；概率按 `1 - (1 - extraBallChancePerLevel) ^ 等级` 叠加。选择一级后，新球改为向上半场随机角度发射。
- **动能超频**：所有现存和未来球的速度每级乘以 `ballSpeedMultiplierPerLevel`。
- **延展力场**：挡板长度每级增加 20%，最多 3 级；满级后退出候选池。
- **底线回响**：球落底时每级增加 20% 向上反弹概率，最多 3 级；满级概率为 60%。

这些参数都集中在 `config.js` 的 `GAME.upgrade`。前三项可无限重复选择，后两项具有三级上限。
- **新道具/敌人**：新增 Entity 和 System，在 `BreakoutScene.systems` 注册；不需要改动引擎循环。
- **新模式**：新增 Scene，实现 `enter / update / render / exit`，交给 `engine.setScene()`。
- **跨玩法模块**：使用插件。插件可实现 `install(context)`、`beforeUpdate(dt)`、`afterUpdate(dt)`、`afterRender(ctx)`、`dispose()`。
- **UI/成就/存档**：订阅事件总线，避免把平台能力写进物理或实体代码。
- **多球**：物理层已经按球集合运行；直接向 `world` 添加新的 `Ball` 即可。

现有事件包括 `game:started`、`game:stats`、`game:lost`、`ball:launched`、`ball:bounce`、`ball:lost`、`brick:hit`、`brick:damaged`、`brick:destroyed`、`brick:breached`、`engine:paused` 和 `engine:resumed`。

开发控制台可通过 `window.breakout.engine` 与 `window.breakout.scene` 检查运行状态或挂载临时实验代码。
