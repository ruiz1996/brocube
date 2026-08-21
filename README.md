# Neon Breaker

一个零依赖、可扩展的 Canvas 无限生存打方块游戏。游戏采用 600×900 的竖向战场，适配手机竖屏并保留桌面键盘操作。挡板每 3 秒自动发射能量球；球掉出底部会被回收，但不会导致失败。随机凸多边形方块会持续生成并缓慢下压，任意方块触碰底部防线即游戏结束。

每存活 3 分钟会生成一轮 Boss 波次，其中包含 1 个大型高血量 Boss 与 6 个小型护卫方块；范围伤害可以同时处理护卫并削减 Boss。若场上方块被全部清空，系统会立即在顶部补充一整排 9 个方块，保证战斗不会出现空档。

在线游玩：

- 正式版：<https://ruiz1996.github.io/brocube/>
- 内测版：<https://ruiz1996.github.io/brocube/beta/>

## 双版本发布

- `main` 是正式发布分支，内容部署到网站根路由。
- `beta` 是内测分支，内容部署到 `/beta/` 路由。
- 任一分支发生推送时，GitHub Actions 都会读取两个分支并组合为同一个 Pages 部署产物，因此更新内测版不会覆盖正式版。
- 仓库尚未建立 `beta` 分支时，`/beta/` 会暂时回退到正式版，避免首次配置期间出现 404。

推荐先把新玩法提交到 `beta` 并通过内测链接验证；确认稳定后再合并到 `main`，正式路由才会更新。

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

第一次累计 `GAME.upgrade.scoreInterval` 分（默认 2000 分）会触发强化选择，此后每次强化需要的新增分数会随已获得强化次数增长。阈值可以连续跨越，多出来的选择会排队，不会丢失。每次从尚未满级且满足前置条件的强化池中随机抽取 3 项且不会重复。顶部的卡牌图鉴按钮会展示全部卡片、当前等级和前置关系；玩家可以预先勾选自动升级，随机三选一命中勾选项时会直接升级而不暂停，未命中则照常暂停选择。

```text
第 n 次强化所需新增分数 = scoreInterval
                        × (1 + scoreGrowthCoefficient × n ^ scoreGrowthExponent)
```

结果会按 `scoreCostRounding` 取整。默认成长系数为 `0.18`、指数为 `1.25`，可以在 `config.js` 中调整；因此强化间隔会持续拉长，不会在高分阶段连续遮挡战场。

- **发射类**：高速装填最多 5 级；分裂发射最多 10 级，满级后解锁二连发，使每轮两颗球分别从普通球与全部已解锁特殊球中独立抽取；五连速射每级增加 5% 触发率，最多 3 级。
- **挡板与生存类**：双重挡板最多 3 级，副挡板依次获得主挡板 33%、66%、100% 的宽度；生命增幅最多 2 级；延展力场最多 5 级；底线回响最多 3 级。
- **数值类**：动能超频最多 10 级；攻击强化最多 99 级且以低权重进入候选池。
- **天顶增援**：与普通球等概率替代发射；天顶续航提高触底保留率，天顶冲击按其 200% 发射速度逐级转化碰撞伤害，两项均最多 3 级。
- **爆裂核心**：与普通球等概率替代发射；爆裂增压缩短周期爆炸间隔，爆裂触发增加碰撞时额外爆炸概率，两项均最多 3 级。
- **虚空双星**：虚空超旋提高子球公转速度，虚空扩轨扩大子球旋转半径，两项均最多 3 级。
- **微导航**：导航增幅提高持续修正力度；导航回马枪会在撞击反弹后延迟判定并重新冲向原方块，连续成功时概率递减，两项均最多 3 级。
- **链式闪电**：闪电扩链增加弹射目标；雷霆追击使每段闪电链有概率追加带独立视觉效果的落雷，两项均最多 3 级。

所有数值和等级上限都集中在 `config.js` 的 `GAME.upgrade`。

## 连击计分

击杀方块后会开启 3 秒连击窗口，每次后续击杀都会刷新窗口。第一杀为基础分，第二杀起每次连击增加 0.1 倍得分，默认最高 3 倍。窗口时长、每杀倍率和倍率上限位于 `config.js` 的 `GAME.combo`。
- **新道具/敌人**：新增 Entity 和 System，在 `BreakoutScene.systems` 注册；不需要改动引擎循环。
- **新模式**：新增 Scene，实现 `enter / update / render / exit`，交给 `engine.setScene()`。
- **跨玩法模块**：使用插件。插件可实现 `install(context)`、`beforeUpdate(dt)`、`afterUpdate(dt)`、`afterRender(ctx)`、`dispose()`。
- **UI/成就/存档**：订阅事件总线，避免把平台能力写进物理或实体代码。
- **多球**：物理层已经按球集合运行；主球用 `ballFactory.createPrimary()`，分裂等衍生小球只用 `ballFactory.createDerived()`。

现有事件包括 `game:started`、`game:stats`、`game:lost`、`ball:launched`、`ball:loadout-changed`、`ball:split`、`ball:exploded`、`ball:lightning-chain`、`ball:lightning-strike`、`ball:navigation-return`、`ball:bounce`、`ball:lost`、`upgrade:offered`、`upgrade:selected`、`upgrade:auto-changed`、`brick:hit`、`brick:damaged`、`brick:destroyed`、`brick:breached`、`brick:wave-refilled`、`boss:wave`、`combo:changed`、`combo:ended`、`engine:paused` 和 `engine:resumed`。

开发控制台可通过 `window.breakout.engine` 与 `window.breakout.scene` 检查运行状态或挂载临时实验代码。
