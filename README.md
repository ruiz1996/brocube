# Neon Breaker

一个零依赖、可扩展的 Canvas 无限生存打方块游戏。游戏采用 600×900 的竖向战场，适配手机竖屏并保留桌面键盘操作。挡板每 5 秒自动发射能量球；球掉出底部会被回收，但不会导致失败。随机凸多边形方块会持续生成并缓慢下压，任意方块触碰底部防线即游戏结束。

每存活 3 分钟会生成一轮 Boss 波次，其中包含 1 个大型高血量 Boss 与 6 个小型护卫方块；范围伤害可以同时处理护卫并削减 Boss。若场上方块被全部清空，系统会立即在顶部补充一整排 9 个方块，保证战斗不会出现空档。

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
│  ├─ balls/             # 球定义、工厂、伤害/碰撞行为与渲染注册表
│  ├─ emitters/          # 发射位置和方向策略（挡板、顶部等）
│  ├─ entities/          # 球、挡板、砖块、粒子
│  ├─ systems/           # 移动、战斗结算、自动发球、生成、下压与特效
│  └─ plugins/           # 可插拔玩法示例
└─ ui/                   # DOM 界面，不侵入游戏逻辑
```

## 扩展约定

### 特殊球框架

球的能力使用组合式定义，不需要为“闪电穿透分裂球”建立多层继承类：

- `BallDefinitionRegistry` 保存伤害、伤害类型、命中特效、方块碰撞策略、速度和外观。
- `BallFactory` 是球的唯一推荐创建入口，区分 `primary` 主球和 `derived` 衍生球。
- `BallEmitterRegistry` 决定发射来源和方向，内置 `paddle` 与 `top`。
- `BallBehaviorRegistry` 管理命中特效、周期能力以及 `bounce`、`pierce`、`split` 等碰撞策略。
- `BallCombatSystem` 是唯一伤害结算入口，统一发出受击、受伤和击杀事件。
- `BallRendererRegistry` 按球定义选择外观绘制器。

衍生球的限制被集中在 `BallFactory.createDerived()`：它必定使用 `basic` 定义、1 点动能伤害、普通反弹、无命中特效，并使用更小的半径。分裂策略也只能通过此入口生成衍生球，因此特殊主球的闪电、穿透或再次分裂不会被继承。

以下是以后接入特殊球的示例；注册完成后不需要修改物理系统：

```js
scene.ballBehaviors.registerDamageEffect('chain-lightning', ({
  scene, combat, ball, brick, effectConfig,
}) => {
  const targets = scene.world.all('brick')
    .filter((candidate) => candidate !== brick)
    .slice(0, effectConfig.jumps);
  for (const target of targets) {
    combat.applyDamage({
      ball,
      brick: target,
      damage: effectConfig.damage,
      damageType: 'electric',
      cause: 'chain-lightning',
    });
  }
});

scene.ballDefinitions.register('storm-piercer', {
  damage: 2,
  damageType: 'electric',
  damageEffects: [{
    id: 'chain-lightning',
    config: { jumps: 3, damage: 1 },
  }],
  collisionPolicy: 'pierce',
  collisionConfig: { remainingPierces: 4 },
  visual: { color: '#a88cff', trailColor: '#7df9ff' },
});

scene.configureAutoFire({
  definitionId: 'storm-piercer',
  emitterId: 'top',
});
```

要创建分裂球，只需把定义的 `collisionPolicy` 改为 `split`，并在 `collisionConfig` 中填写 `splitCount`、`spreadRadians`、`derivedSpeedRatio` 和可选的 `consumeParent`。由此产生的小球仍会被强制转为基础衍生球。

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

第一次累计 `GAME.upgrade.scoreInterval` 分（默认 2000 分）会冻结战场并弹出强化选择，此后每次强化需要的新增分数会随已获得强化次数增长。阈值可以连续跨越，多出来的选择会排队，不会丢失。每次从尚未满级的强化池中随机抽取 3 项且不会重复。

```text
第 n 次强化所需新增分数 = scoreInterval
                        × (1 + scoreGrowthCoefficient × n ^ scoreGrowthExponent)
```

结果会按 `scoreCostRounding` 取整。默认成长系数为 `0.18`、指数为 `1.25`，可以在 `config.js` 中调整；因此强化间隔会持续拉长，不会在高分阶段连续遮挡战场。

- **高速装填**：发射间隔每级乘以 `rapidFireMultiplier`，最低不会小于 `minimumFireInterval`。
- **分裂发射**：每级增加额外生成一颗球的概率；概率按 `1 - (1 - extraBallChancePerLevel) ^ 等级` 叠加。选择一级后，新球改为向上半场随机角度发射。
- **天顶增援**：每次自动发射时有 25% 概率从顶部追加一颗向下飞行的球，其发射速度为基础速度的 200%；顶部球带有金橙色脉冲光环、彗星尾迹和入场火花，最多 1 级。
- **爆裂核心**：每次自动发射时有 25% 概率从挡板追加一颗爆裂球；爆裂球每 1.5 秒对半径 120 内的全部方块造成 1 点伤害，带有紫红旋转核心、爆炸倒计时环、扩张冲击波与双色碎屑，最多 1 级。
- **动能超频**：所有现存和未来球的速度每级乘以 `ballSpeedMultiplierPerLevel`。
- **延展力场**：挡板长度每级增加 20%，最多 3 级；满级后退出候选池。
- **底线回响**：球落底时每级增加 20% 向上反弹概率，最多 3 级；满级概率为 60%。

这些参数都集中在 `config.js` 的 `GAME.upgrade`。高速装填、分裂发射和动能超频可无限重复选择；天顶增援与爆裂核心最多 1 级，延展力场和底线回响最多 3 级。

## 连击计分

击杀方块后会开启 3 秒连击窗口，每次后续击杀都会刷新窗口。第一杀为基础分，第二杀起每次连击增加 0.1 倍得分，默认最高 3 倍。窗口时长、每杀倍率和倍率上限位于 `config.js` 的 `GAME.combo`。
- **新道具/敌人**：新增 Entity 和 System，在 `BreakoutScene.systems` 注册；不需要改动引擎循环。
- **新模式**：新增 Scene，实现 `enter / update / render / exit`，交给 `engine.setScene()`。
- **跨玩法模块**：使用插件。插件可实现 `install(context)`、`beforeUpdate(dt)`、`afterUpdate(dt)`、`afterRender(ctx)`、`dispose()`。
- **UI/成就/存档**：订阅事件总线，避免把平台能力写进物理或实体代码。
- **多球**：物理层已经按球集合运行；主球用 `ballFactory.createPrimary()`，分裂等衍生小球只用 `ballFactory.createDerived()`。

现有事件包括 `game:started`、`game:stats`、`game:lost`、`ball:launched`、`ball:loadout-changed`、`ball:split`、`ball:exploded`、`ball:bounce`、`ball:lost`、`brick:hit`、`brick:damaged`、`brick:destroyed`、`brick:breached`、`brick:wave-refilled`、`boss:wave`、`combo:changed`、`combo:ended`、`engine:paused` 和 `engine:resumed`。

开发控制台可通过 `window.breakout.engine` 与 `window.breakout.scene` 检查运行状态或挂载临时实验代码。
