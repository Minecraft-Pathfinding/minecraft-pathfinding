<!-- Explain how to create a subclass of goals.Goal class -->

<!-- reference typescript code -->
<!-- export abstract class Goal implements AGoal<Move> {
  abstract isEnd (node: Move): boolean
  abstract heuristic (node: Move): number
  async onFinish (node: MovementExecutor): Promise<void> {}
} -->


<h1 align="center">Advanced Usage!</h1>

<h3>Table of Contents</h3>

- [Custom Goals](#custom-goals)
  - [Creating_a_sublcass_of_goals.GoalDynamic](#creating-a-sublcass-of-goals.goal)
  - [Creating_a_sublcass_of_goals.GoalDynamic](#creating-a-sublcass-of-goals.goaldynamic)
- [Movement Customization](#movement-customization)
  - [Custom Movement Producers](#custom-movement-producers)
    - [Creating_a_sublcass_of_move_produders.MoveProducer](#creating-a-sublcass-of-move-producers.moveproducer)
  - [Custom Movement Executors](#custom-movement-executors)
    - [Creating_a_sublcass_of_move_executor.MoveExecutor](#creating-a-sublcass-of-move-executor.moveexecutor)
  - [Custom Movement_Optimizers](#move-optimizer)
    - [Creating_a_sublcass_of_move_optimizer.MoveOptimizer](#creating-a-sublcass-of-move-optimizer.moveoptimizer)



<h2>Goal Creation</h2>

This pathfinder supports any type of goal, provided they extend our base classes `goals.Goal` and `goals.GoalDynamic`. These classes are designed to be extended and provide a simple interface for creating custom goals.

`goals.Goal` is the simpler goal type. It is static, meaning it cannot update itself based on events. 

`goals.GoalDynamic` is the more complex goal type. It is dynamic, meaning it can update itself based on events. Because of this, both `hasChanged` and `isValid` methods, which implement when *the goal has moved* and *whether the goal is still worth moving towards*, respectively, are required to be implemented.

Both of these classes are abstract, meaning you cannot create an instance of them directly. Instead, you must create a subclass of them and implement the required methods.

<h3>Creating a subclass of goals.Goal</h3>

To create a subclass of `goals.Goal`, you need to implement the `isEnd` and `heuristic` methods. You can also override the `onFinish` method to perform any cleanup or additional actions when the goal is finished.


<h4>Example</h4>


```ts

import { Goal, MovementExecutor } from 'mineflayer-pathfinder'

class MyGoal extends Goal {
  isEnd (node: Move): boolean {
    // Return true if the goal is finished
  }

  heuristic (node: Move): number {
    // Return a number representing the cost of the node
  }

  async onFinish (node: MovementExecutor): Promise<void> {
    // Perform any cleanup or additional actions when the goal is finished
  }
}
```


<!-- type EasyKeys = keyof BotEvents | Array<keyof BotEvents>
export abstract class GoalDynamic<
  Change extends EasyKeys = Array<keyof BotEvents>,
  Valid extends EasyKeys = Array<keyof BotEvents>,
  ChKey extends Change extends keyof BotEvents ? [Change] : Change = Change extends keyof BotEvents ? [Change] : Change,
  VlKey extends Valid extends keyof BotEvents ? [Valid] : Valid = Valid extends keyof BotEvents ? [Valid] : Valid
> extends Goal {
  dynamic = true
  neverfinish = false
  abstract readonly eventKeys: Readonly<Change>
  abstract readonly validKeys: Readonly<Valid>
  abstract hasChanged (event: ChKey[number], ...args: Parameters<BotEvents[ChKey[number]]>): boolean
  abstract isValid (event: VlKey[number], ...args: Parameters<BotEvents[VlKey[number]]>): boolean
  abstract update (): void
  cleanup?: () => void // will be assigned later.

  get _eventKeys (): ChKey {
    if (this.eventKeys instanceof Array) return this.eventKeys as ChKey
    return [this.eventKeys] as ChKey
  }

  get _validKeys (): VlKey {
    if (this.validKeys instanceof Array) return this.validKeys as VlKey
    return [this.validKeys] as VlKey
  }
} -->

<h3>Creating a sublcass of goals.GoalDynamic</h3>

To create a subclass of `goals.GoalDynamic`, you need to implement all of the required methods for `goals.Goal` and also implement the `hasChanged`, `isValid`, and `update` methods. You will also have to specify the `eventKeys` and `validKeys` values and match them to your provided generic typing. 


<h4>Example</h4>

```ts

import { GoalDynamic, BotEvents } from 'mineflayer-pathfinder'

class MyGoalDynamic extends GoalDynamic<'physicsTick', 'physicsTick'> {
  readonly eventKeys = 'physicsTick' as const // required for typing
  readonly validKeys = 'physicsTick' as const // required for typing

  isEnd (node: Move): boolean {
    // Return true if the goal is finished
  }

  heuristic (node: Move): number {
    // Return a number representing the cost of the node
  }

  hasChanged (event: 'physicsTick', username: string, message: string): boolean {
    // Return true if the event has changed
  }

  isValid (event: 'physicsTick', username: string, message: string): boolean {
    // Return true if the event is valid
  }

  // will be called whenever hasChanged is true.
  update (): void {
    // Update the goal
  }
}
```

<h1 align="center">Movement Customization</h1>

This pathfiner supports three levels of customization for movement: Movement Producers, Movement Executors, and Movement Optimizers. Each of these classes are designed to be extended and provide a simple interface for creating custom movement logic.

To break down how this works, let's trace the code functionality.

1. We provide a goal to Pathfinder
   - now, pathfinder wants to create a path.
2. Pathfinder takes the current `MovementProviders` loaded in its settings and begins calculating the path based on them.
   - `MovementProviders` are only used at calculation time, not execution time. They are used to determine whether or not movement is possible.
3. The initial path has been calculated!
4. The pathfinder now takes the calculated path and *optimizes* it using `MovementOptimizers`
   - `MovementOptimizers` are used to optimize the path, removing unnecessary nodes and making the path more efficient. This is the step where straight-lining can be introduced, as normal A* does not provide this functionality well. *Note: see [here](#https://www.ijcai.org/Proceedings/09/Papers/303.pdf) for more information on straight-lining.*
5. The path has been optimized!
6. Provide this optimized path to the `goto` function in the pathfinder. 
7. The pathfinder now takes the optimized path and begins executing it using `MovementExecutors`.
   - `MovementExecutors` are used to execute the path, performing any necessary actions to reach the goal. This is where the bot actually moves and interacts with the world.
   - `MovementExecutors` can provide runtime optimizations to the path itself via skipping nodes, but cannot modify the path itself.
8. **The path has been executed!** Or has it?
   - In the event that some factor (such as failure to execute or knocking off course) has caused the bot to go off course, The pathfinder will recalculate the path and repeat steps 4-7.
   - If the bot has gone off course due to an external event (such as a block update), the pathfinder will recalculate the path and repeat steps 4-7.
   - If the bot has reached the goal, the pathfinder will finish and the bot will stop moving.


Providing customization to each step is important for creating a bot that can handle a wide variety of situations. For example, you may want to create a custom `MovementProvider` that can handle a specific type of block, or a custom `MovementExecutor` that can handle a specific type of movement. You may also want to create a custom `MovementOptimizer` that can optimize the path in a specific way.

To add custom movement logic, you need to create a subclass of the appropriate class and implement the required methods. You can then provide an instance of your custom class to the pathfinder when creating a path.

<h3>Inserting custom classes into the pathfinder</h3>

<h4>Movement Providers</h4>

Because Providers cannot do anything on their own, we do not provide a method of adding them to the pathfinder alone. Instead, they are paired with an executor during insertion.

Inserting a Provider **must** be with its static instance. This is so lookups across the pathfinder can be done with the static instance.

The movement Executor can be either its static instance or a new instance of the class. We recommend using its **static instance**.


<h4>Inserting a Custom Movement Executor</h4>

<!-- Function on bot.pathfinder that inserts executors -->
<!-- BuildableMoveProvider is the static instance of MovementProvider -->
<!-- BuildableMoveExecutor is the static instance of MovementExecutor -->
<!-- setExecutor (provider: BuildableMoveProvider, Executor: BuildableMoveExecutor | MovementExecutor): void {
    if (Executor instanceof MovementExecutor) {
      this.movements.set(provider, Executor)
    } else {
      this.movements.set(provider, new Executor(this.bot, this.world, this.defaultMoveSettings))
    }
  } -->


```ts
import { MovementExecutor, MovementProvider, Bot, World, MovementOptions } from 'mineflayer-pathfinder'

class MyProvider extends MovementProvider {
  // ... implementation
}

class MyExecutor extends MovementExecutor {
    // ... implementation
} 

bot.pathfinder.setExecutor(MyProvider, MyExecutor)

// OR:

const executor = new MyExecutor(bot, world, settings)

bot.pathfinder.setExecutor(MyProvider, executor)

```




<h2>Custom Movement Producers</h2>

<!-- The class of Movement, the base class of MovementProducer -->


<!-- export abstract class Movement {
  static readonly cardinalDirs = cardinalVec3s
  static readonly diagonalDirs = diagonalVec3s
  static readonly jumpDirs = jumpVec3s

  public readonly bot: Bot
  public readonly world: World
  public settings: MovementOptions

  protected currentMove!: Move

  /**
   * Current interaction.
   */
  protected _cI?: InteractHandler

  public constructor (bot: Bot, world: World, settings: Partial<MovementOptions> = {}) {
    this.bot = bot
    this.world = world
    this.settings = Object.assign({}, DEFAULT_MOVEMENT_OPTS, settings)
  }

  loadMove (move: Move): void {
    this.currentMove = move
  }

  toBreak (): BreakHandler[] {
    return this.currentMove.toBreak.filter((b) => !b.allowExit)
  }

  toBreakLen (): number {
    return this.currentMove.toBreak.filter((b) => !b.allowExit).length
  }

  toPlace (): PlaceHandler[] {
    return this.currentMove.toPlace.filter((b) => !b.allowExit)
  }

  toPlaceLen (): number {
    return this.currentMove.toPlace.filter((b) => !b.allowExit).length
  }

  getBlock (pos: Vec3Properties, dx: number, dy: number, dz: number): Block | null {
    return this.world.getBlock(new Vec3(pos.x + dx, pos.y + dy, pos.z + dz))
  }

  getBlockInfo (pos: Vec3Properties, dx: number, dy: number, dz: number): BlockInfo {
    const yes = new Vec3(pos.x + dx, pos.y + dy, pos.z + dz)

    // if (move) {
    //   const key = yes.toString();
    //   if (move.interactMap.has(key)) {
    //     const handler = move.interactMap.get(key)!;
    //     return handler.toBlockInfo();
    //   }
    // }

    // console.log('not found', yes)
    return this.world.getBlockInfo(yes)
  }

  /**
   * Returns if a block is safe or not
   * @param pos
   * @returns
   */
  safe (pos: Vec3Properties): number {
    const block = this.world.getBlockInfo(new Vec3(pos.x, pos.y, pos.z))
    return block.physical ? 0 : 100
  }

  /**
   * Takes into account if the block is within a break exclusion area.
   * @param {import('prismarine-block').Block} block
   * @returns
   */
  safeToBreak (block: BlockInfo): boolean {
    if (!this.settings.canDig) {
      return false
    }

    if (this.settings.dontCreateFlow) {
      // false if next to liquid
      if (this.getBlockInfo(block.position, 0, 1, 0).liquid) return false
      if (this.getBlockInfo(block.position, -1, 0, 0).liquid) return false
      if (this.getBlockInfo(block.position, 1, 0, 0).liquid) return false
      if (this.getBlockInfo(block.position, 0, 0, -1).liquid) return false
      if (this.getBlockInfo(block.position, 0, 0, 1).liquid) return false
    }

    if (this.settings.dontMineUnderFallingBlock) {
      // TODO: Determine if there are other blocks holding the entity up
      if (this.getBlockInfo(block.position, 0, 1, 0).canFall) {
        // || (this.getNumEntitiesAt(block.position, 0, 1, 0) > 0)
        return false
      }
    }

    if (BlockInfo.replaceables.has(block.type)) return true
    // console.log('block type:', this.bot.registry.blocks[block.type], block.position, !BlockInfo.blocksCantBreak.has(block.type))
    return !BlockInfo.blocksCantBreak.has(block.type) // && this.exclusionBreak(block) < 100
  }

  /**
   * Takes into account if the block is within the stepExclusionAreas. And returns 100 if a block to be broken is within break exclusion areas.
   * @param {import('prismarine-block').Block} block block
   * @param {[]} toBreak
   * @returns {number}
   */
  safeOrBreak (block: BlockInfo, toBreak: BreakHandler[]): number {
    // cost += this.exclusionStep(block) // Is excluded so can't move or break
    // cost += this.getNumEntitiesAt(block.position, 0, 0, 0) * this.entityCost

    // if (block.breakCost !== undefined) return block.breakCost // cache breaking cost.

    if (block.safe) {
      // if (!block.replaceable) toBreak.push(BreakHandler.fromVec(block.position, "solid"));
      return 0 // TODO: block is a carpet or a climbable (BUG)
    }

    if (block.block === null) return 100 // Don't know its type, but that's only replaceables so just return.

    if (!this.safeToBreak(block)) return 100 // Can't break, so can't move

    const cost = this.breakCost(block)

    // console.log('cost for:', block.position, cost)

    if (cost >= 100) return cost

    // TODO: Calculate cost of breaking block
    // if (block.physical) cost += this.getNumEntitiesAt(block.position, 0, 1, 0) * this.entityCost // Add entity cost if there is an entity above (a breakable block) that will fall
    toBreak.push(BreakHandler.fromVec(block.position, 'solid'))

    return cost
  }

  breakCost (block: BlockInfo): number {
    if (block.block === null) return 100 // Don't know its type, but that's only replaceables so just return.

    // const tool = this.bot.pathfinder.bestHarvestTool(block)

    const digTime = this.bot.pathingUtil.digCost(block.block)
    // const tool = null as any;
    // const enchants = (tool && tool.nbt) ? nbt.simplify(tool.nbt).Enchantments : []
    // const effects = this.bot.entity.effects
    // const digTime = block.block.digTime(tool ? tool.type : null, false, false, false, enchants, effects)
    const laborCost = (1 + 3 * digTime / 1000) * this.settings.digCost
    return laborCost
  }

  safeOrPlace (block: BlockInfo, toPlace: PlaceHandler[], type: InteractType = 'solid'): number {
    if (!this.settings.canPlace) return 100
    if (this.currentMove.remainingBlocks <= 0) return 100

    if (block.block === null) return 100 // Don't know its type, but that's only replaceables so just return.
    if (block.physical) return 0 // block is already physical at location.

    const cost = this.placeCost(block)

    if (cost >= 100) return cost
    toPlace.push(PlaceHandler.fromVec(block.position, type))

    return cost
  }

  /**
   * TODO: calculate more accurate place costs.
   */
  placeCost (block: BlockInfo): number {
    return this.settings.placeCost
  }
} -->

<!-- The MovementProducer class -->
<!-- 
export abstract class MovementProvider extends Movement {
  orgPos!: Vec3
  toClear!: Set<number>

  public constructor (bot: Bot, world: World, settings: Partial<MovementOptions> = {}) {
    super(bot, world, settings)
  }

  abstract movementDirs: Vec3[]

  private boundaries!: [x: number, z: number, y: number]
  private halfway!: [x: number, z: number, y: number]

  /**
   * Simulation-time calculation.
   *
   * Decide whether or not movement is possible.
   * If possible, append to provided storage.
   */
  abstract provideMovements (start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void

  private localData: Array<BlockInfo | null> = []

  loadLocalData (orgPos: Vec3, boundaries: [x: number, z: number, y: number], arr: Array<BlockInfo | null>, clear: Set<number>): void {
    this.orgPos = orgPos
    this.localData = arr
    this.boundaries = boundaries
    this.halfway = [Math.floor(boundaries[0] / 2), Math.floor(boundaries[1] / 2), Math.floor(boundaries[2] / 2)]
    this.toClear = clear
    // console.log(this.halfway)
  }

  getBlockInfo (pos: Vec3Properties, dx: number, dy: number, dz: number): BlockInfo {
    const yes = new Vec3(Math.floor(pos.x) + dx, Math.floor(pos.y) + dy, Math.floor(pos.z) + dz)
    let move: Move | undefined = this.currentMove

    let i = 0
    while (move !== undefined && i++ < 4) { // 5 levels
      // console.log('i', i)
      for (const m of move.toPlace) {
        if (m.x === yes.x && m.y === yes.y && m.z === yes.z) {
          return m.blockInfo
        }
      }

      for (const m of move.toBreak) {
        if (m.x === yes.x && m.y === yes.y && m.z === yes.z) {
          return m.blockInfo
        }
      }

      move = move.parent
    }

    // const wantedDx = pos.x - this.orgPos.x + dx + this.halfway[0]
    const wantedDx = yes.x - this.orgPos.x + this.halfway[0]

    // if (wantedDx < 0 || wantedDx >= this.boundaries[0]) {
    //   return super.getBlockInfo(pos, dx, dy, dz);
    // }

    // const wantedDz = pos.z - this.orgPos.z + dz + this.halfway[1]
    const wantedDz = yes.z - this.orgPos.z + this.halfway[1]

    // if (wantedDz < 0 || wantedDz >= this.boundaries[2]) {
    //   return super.getBlockInfo(pos, dx, dy, dz);
    // }

    // const wantedDy = pos.y - this.orgPos.y + dy + this.halfway[2]
    const wantedDy = yes.y - this.orgPos.y + this.halfway[2]

    // if (wantedDy < 0 || wantedDy >= this.boundaries[2]) {
    //   return super.getBlockInfo(pos, dx, dy, dz);
    // }

    // const packed = (wantedDx << 16) + (wantedDz << 8) + wantedDy

    if (
      wantedDx < 0 ||
      wantedDx >= this.boundaries[0] ||
      wantedDz < 0 ||
      wantedDz >= this.boundaries[1] ||
      wantedDy < 0 ||
      wantedDy >= this.boundaries[2]
    ) {
      // console.log('hey', idx, this.localData[idx])
      return this.world.getBlockInfo(yes)
      // return super.getBlockInfo(pos, dx, dy, dz)
      // console.log('out of bounds', pos, this.orgPos, wantedDx, wantedDy, wantedDz, this.boundaries)
    }

    const idx = wantedDx * this.boundaries[2] * this.boundaries[1] + wantedDz * this.boundaries[2] + wantedDy

    // const data = this.localData[wantedDx][wantedDy][wantedDz];
    const data = this.localData[idx]

    if (data !== null) {
      // this.toClear.add(packed)
      // const target = new Vec3(wantedDx - this.halfway[0], wantedDy - this.halfway[2], wantedDz - this.halfway[1]).plus(this.orgPos)
      // if (!data.block?.position.equals(target) && data.position.x !== 0 && data.block?.position.y !== 0 && data.position.z !== 0) {
      //   console.log(
      //     'crap',
      //     pos,
      //     dx,
      //     dy,
      //     dz,
      //     data.position,
      //     '\n\n',
      //     this.orgPos,
      //     wantedDx,
      //     wantedDy,
      //     wantedDz,
      //     target,
      //     this.halfway,
      //     this.boundaries,

      //     this.localData[idx]
      //   )
      //   throw new Error('dang')
      // }

      return data
    }

    const ret = this.world.getBlockInfo(yes)
    // const ret = super.getBlockInfo(pos, dx, dy, dz)

    this.localData[idx] = ret
    return ret
  }
} -->

<h3>Creating a sublcass of move_produders.MoveProducer</h3>

To create a subclass of `move_produders.MoveProducer`, you need to implement the `provideMovements` method. This method is responsible for deciding whether or not movement is possible and, if possible, appending to the provided storage.

<h4>Example</h4>

```ts

import { MovementProvider, Move, goals } from 'mineflayer-pathfinder'

class MyMoveProducer extends MovementProvider {
  movementDirs = [
    new Vec3(1, 0, 0),
    new Vec3(-1, 0, 0),
    new Vec3(0, 0, 1),
    new Vec3(0, 0, -1)
  ] // often used in provideMovements to provide all directions.

  provideMovements (start: Move, storage: Move[], goal: goals.Goal, closed: Set<string>): void {
    // Decide whether or not movement is possible
    // If possible, append to provided storage
  }
}
```

<h2>Custom Movement Executors</h2>

<!-- The class of Movement, the base class of MovementExecutor, is the same as MovementProducers -->

<!-- The class MovementExecutor -->

<!-- 
interface AbortOpts {
  reason?: ResetError | AbortError
  timeout?: number
}

export interface CompleteOpts {
  ticks?: number
  entry?: boolean
}

export abstract class MovementExecutor extends Movement {
  /**
   * Current move being executed.
   *
   * This move is the same as the thisMove argument provided to functions.
   */
  protected currentMove!: Move

  /**
   * Physics engine, baby.
   */
  protected sim: BaseSimulator

  /**
   * Entity state of bot
   */
  protected simCtx: EPhysicsCtx

  /** */
  protected engine: EntityPhysics

  /**
   * Return the current interaction.
   */
  public get cI (): InteractHandler | undefined {
    // if (this._cI === undefined) return undefined;
    // if (this._cI.allowExit) return undefined;
    return this._cI
  }

  /**
   * Whether or not this movement has been cancelled/aborted.
   */
  public aborted = false

  /**
   * Whether or not this movement is asking for a reset.
   */
  public resetReason?: AbortOpts['reason']

  private task: Task<void, void> = new Task()

  public constructor (bot: Bot, world: World, settings: Partial<MovementOptions> = {}) {
    super(bot, world, settings)
    this.engine = new EntityPhysics(bot.registry)
    this.sim = new BaseSimulator(this.engine)
    this.simCtx = EPhysicsCtx.FROM_BOT(this.engine, bot)
  }

  public reset (): void {
    this.aborted = false
    delete this.resetReason
    this.task.finish()
  }

  /**
   * TODO: Implement.
   */
  public async abort (move: Move = this.currentMove, settings: AbortOpts = {}): Promise<void> {
    if (this.aborted || this.resetReason != null) return

    const resetting = settings.reason

    this.aborted = true

    this.resetReason = resetting

    await this.task.promise

    this.task = new Task()
  }

  private async holdUntilAborted (move: Move, task: Task<void>, timeout = 1000): Promise<void> {
    if (!this.aborted && this.resetReason == null) return

    // console.log('aborting')

    // let start = performance.now()
    for (const breakTarget of move.toBreak) {
      await breakTarget._abort(this.bot)
    }

    // console.log('aborted breaks', performance.now() - start)
    // start = performance.now()

    for (const place of move.toPlace) {
      await place._abort(this.bot)
    }

    // console.log('aborted places', performance.now() - start)
    // start = performance.now()

    // TODO: handle bug (nextMove not included).
    await new Promise<void>((resolve, reject) => {
      const listener = (): void => {
        if (this.safeToCancel(move)) {
          this.bot.off('physicsTick', listener)
          // task.finish()
          resolve()
        }
      }
      this.bot.on('physicsTick', listener)
      setTimeout(() => {
        this.bot.off('physicsTick', listener)
        // task.finish()
        reject(new Error('Movement failed to abort properly.'))
      }, timeout)
    })

    // console.log('aborted all', performance.now() - start)

    if (this.resetReason != null) throw this.resetReason // new ResetError('Movement is resetting.')
    if (this.aborted) throw new AbortError('Movement aborted.')
  }

  public async _performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    await this.holdUntilAborted(thisMove, this.task)
    return await this.performInit(thisMove, currentIndex, path)
  }

  public async _performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number> {
    await this.holdUntilAborted(thisMove, this.task)
    return await this.performPerTick(thisMove, tickCount, currentIndex, path)
  }

  public async _align (thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
    await this.holdUntilAborted(thisMove, this.task)
    return await this.align(thisMove, tickCount, goal)
  }

  /**
   * Runtime calculation.
   *
   * Perform initial setup upon movement start.
   * Can be sync or async.
   */
  abstract performInit (thisMove: Move, currentIndex: number, path: Move[]): void | Promise<void>

  /**
   * Runtime calculation.
   *
   * Perform modifications on bot per-tick.
   * Return whether or not bot has reached the goal.
   *
   */
  abstract performPerTick (
    thisMove: Move,
    tickCount: number,
    currentIndex: number,
    path: Move[]
  ): boolean | number | Promise<boolean | number>

  /**
   * Runtime calculation.
   *
   * Perform modifications on bot BEFORE attempting the move.
   * This can be used to align to the center of blocks, etc.
   * Align IS allowed to throw exceptions, it will revert to recovery.
   */
  align (thisMove: Move, tickCount?: number, goal?: goals.Goal, lookTarget?: Vec3): boolean | Promise<boolean> {
    const target = lookTarget ?? thisMove.entryPos
    if (lookTarget != null) void this.postInitAlignToPath(thisMove, { lookAt: target })
    else void this.postInitAlignToPath(thisMove)

    return this.isInitAligned(thisMove, target)
  }

  /**
   * Runtime calculation.
   *
   * Check whether or not the move is already currently completed. This is checked once, before alignment.
   */
  isAlreadyCompleted (thisMove: Move, tickCount: number, goal: goals.Goal): boolean {
    return this.isComplete(thisMove)
  }

  /**
   * Default implementation of isComplete.
   *
   * Checks whether or not the bot hitting the target block is unavoidable.
   *
   * Does so via velocity direction check (heading towards the block)
   * and bounding box check (touching OR slightly above block).
   */
  protected isComplete (startMove: Move, endMove: Move = startMove, opts: CompleteOpts = {}): boolean {
    // console.log('isComplete:', this.toBreakLen(), this.toPlaceLen())
    if (this.toBreakLen() > 0) return false
    if (this.toPlaceLen() > 0) return false

    if (this.cI !== undefined) {
      if (!this.cI.allowExit) return false
    }

    const ticks = opts.ticks ?? 1

    const target = endMove.exitPos
    const offset = endMove.exitPos.minus(this.bot.entity.position)
    const dir = endMove.exitPos.minus(startMove.entryPos)

    // console.log(offset, dir)
    offset.translate(0, -offset.y, 0) // xz only
    dir.translate(0, -dir.y, 0) // xz only

    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0)
    const xzVelDir = xzVel.normalize()

    const dist = offset.norm()
    const similarDirection = offset.normalize().dot(dir.normalize()) > 0.5

    const ectx = EPhysicsCtx.FROM_BOT(this.bot.physicsUtil.engine, this.bot)
    for (let i = 0; i < ticks; i++) {
      this.bot.physicsUtil.engine.simulate(ectx, this.world)
    }

    const pos = ectx.state.pos.clone()

    this.bot.physicsUtil.engine.simulate(ectx, this.world) // needed for later.

    // console.log(ectx.state.pos, ectx.state.isCollidedHorizontally, ectx.state.isCollidedVertically);

    // const pos = this.bot.entity.position
    const bb0 = AABBUtils.getPlayerAABB({ position: pos, width: 0.599, height: 1.8 })
    // bb0.extend(0, ticks === 0 ? -0.251 : -0.1, 0);
    // bb0.expand(-0.0001, 0, -0.0001);

    let bb1bl
    let bbCheckCond = false
    let weGood = false

    const aboveWater =
      !ectx.state.isInWater &&
      !ectx.state.onGround &&
      this.bot.pathfinder.world.getBlockInfo(this.bot.entity.position.floored().translate(0, -0.6, 0)).liquid
    if (aboveWater) {
      bb1bl = this.bot.pathfinder.world.getBlockInfo(target.floored())
      bbCheckCond = bb1bl.safe
      const bb1s = AABB.fromBlockPos(bb1bl.position)
      weGood = bb1s.collides(bb0) && bbCheckCond // && !(this.bot.entity as any).isCollidedHorizontally;
    } else if (ectx.state.isInWater) {
      bb1bl = this.bot.pathfinder.world.getBlockInfo(target.floored())
      bbCheckCond = bb1bl.liquid
      const bb1s = AABB.fromBlock(bb1bl.position)
      weGood = bb1s.collides(bb0) && bbCheckCond // && !(this.bot.entity as any).isCollidedHorizontally;
      // console.log('water check', bb1bl.block?.type, bb1s, bb0, bbCheckCond)
    } else {
      bb1bl = this.bot.pathfinder.world.getBlockInfo(target.floored().translate(0, -1, 0))
      bbCheckCond = bb1bl.physical
      const bb1s = bb1bl.getBBs()
      weGood = bb1s.some((b) => b.collides(bb0)) && bbCheckCond && pos.y >= bb1bl.height // && !(this.bot.entity as any).isCollidedHorizontally;
      // console.log(
      //   "land check",
      //   endMove.exitPos,
      //   bb1bl.block?.name,
      //   bb1s,
      //   bb0,
      //   bbCheckCond,
      //   bb1s.some((b) => b.collides(bb0))
      // );
    }
    // const bbOff = new Vec3(0, ectx.state.isInWater ? 0 : -1, 0)

    const headingThatWay = xzVelDir.dot(dir.normalize()) > -2

    // console.log(endMove.exitPos.floored().translate(0, -1, 0), bb1physical)
    // startMove.moveType.getBlockInfo(endMove.exitPos.floored(), 0, -1, 0).physical;

    // console.info('bb0', bb0, 'bb1s', bb1s)
    // console.log(weGood, similarDirection, offset.y <= 0, this.bot.entity.position);
    // console.info('end move exit pos', endMove.exitPos.toString())
    if (weGood) {
      // console.log(offset.normalize().dot(dir.normalize()), similarDirection, headingThatWay, ectx.state.isCollidedHorizontally, ectx.state.isCollidedVertically)
      if (similarDirection && headingThatWay) return !ectx.state.isCollidedHorizontally
      else if (dist < 0.2) return true

      // console.log('finished!', this.bot.entity.position, endMove.exitPos, bbsVertTouching, similarDirection, headingThatWay, offset.y)
    }

    // console.log(
    //   "backup",
    //   this.bot.entity.position.xzDistanceTo(endMove.exitPos),
    //   this.bot.entity.position.y,
    //   endMove.exitPos.y,
    //   this.bot.entity.onGround,
    //   this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0).norm()
    // );

    // default implementation of being at the center of the block.
    // Technically, this may be true when the bot overshoots, which is fine.
    return (
      this.bot.entity.position.xzDistanceTo(endMove.exitPos) < 0.2 &&
      this.bot.entity.position.y === endMove.exitPos.y &&
      this.bot.entity.onGround
    )
  }

  public isInitAligned (thisMove: Move, target: Vec3 = thisMove.entryPos): boolean {
    target = thisMove.entryPos
    const off0 = thisMove.exitPos.minus(this.bot.entity.position)
    const off1 = thisMove.exitPos.minus(target)

    if (this.bot.entity.position.y < thisMove.entryPos.y - 1) throw new CancelError('MovementExecutor: bot is too low.')
    // const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0);

    // console.log(off0.dot(off1), off0, off1)

    off0.translate(0, -off0.y, 0)
    off1.translate(0, -off1.y, 0)

    const similarDirection = off0.normalize().dot(off1.normalize()) > 0.95
    // console.log(similarDirection, thisMove.moveType.constructor.name, target, thisMove.entryPos, thisMove.exitPos)
    // if (!similarDirection) {
    const bb0 = AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width: 0.6, height: 1.8 })

    const bb1bl = this.getBlockInfo(target, 0, -1, 0)
    const bb1 = bb1bl.getBBs()
    if (bb1.length === 0) bb1.push(AABB.fromBlock(bb1bl.position))
    const bb1physical = bb1bl.physical || bb1bl.liquid

    const bb2bl = this.getBlockInfo(thisMove.exitPos.floored(), 0, -1, 0)
    const bb2 = bb2bl.getBBs()
    if (bb2.length === 0) bb2.push(AABB.fromBlock(bb2bl.position))
    const bb2physical = bb2bl.physical || bb2bl.liquid

    // console.log(
    //   this.toPlaceLen(),
    //   bb1bl.block?.name,
    //   bb1,
    //   bb2bl.block?.name,
    //   bb2,
    //   'test',
    //   bb0,
    //   bb1.some((b) => b.collides(bb0)),
    //   bb1physical,
    //   bb2.some((b) => b.collides(bb0)),
    //   bb2physical,
    //   bb2bl
    // )
    // console.log(bb0.collides(bb1), bb0, bb1, this.bot.entity.position.distanceTo(thisMove.entryPos))
    if ((bb1.some((b) => b.collides(bb0)) && bb1physical) || (bb2.some((b) => b.collides(bb0)) && bb2physical)) {
      // console.log('yay', similarDirection, this.bot.entity.position.xzDistanceTo(target))
      if (similarDirection) return true
      else {
        if (this.bot.entity.position.xzDistanceTo(target) < 0.2) return true // this.isLookingAtYaw(target);
        if (bb2.some((b) => b.collides(bb0)) && bb2physical) return true
      }
    }

    return false
  }

  /**
   * Lazy code.
   */
  public safeToCancel (startMove: Move, endMove: Move = startMove): boolean {
    return this.bot.entity.onGround || ((this.bot.entity as any).isInWater as boolean)
  }

  /**
   * Provide information about the current move.
   *
   * Return breaks first as they will not interfere with placements,
   * whereas placements will almost always interfere with breaks (LOS failure).
   */
  async interactPossible (ticks = 1): Promise<PlaceHandler | BreakHandler | undefined> {
    for (const breakTarget of this.currentMove.toBreak) {
      if (breakTarget !== this._cI && !breakTarget.done) {
        const res = await breakTarget.performInfo(this.bot, ticks)
        // console.log("break", res, res.raycasts.length > 0);
        if (res.ticks < Infinity) return breakTarget
      }
    }

    for (const place of this.currentMove.toPlace) {
      if (place !== this._cI && !place.done) {
        const res = await place.performInfo(this.bot, ticks)
        // console.log("place", res, res.raycasts.length > 0);
        if (res.ticks < Infinity) return place
      }
    }
  }

  /**
   * Generalized function to perform an interaction.
   */
  async performInteraction (interaction: PlaceHandler | BreakHandler, opts: InteractOpts = {}): Promise<void> {
    this._cI = interaction
    interaction.loadMove(this)
    if (interaction instanceof PlaceHandler) {
      await this.performPlace(interaction, opts)
    } else if (interaction instanceof BreakHandler) {
      await this.performBreak(interaction, opts)
    }
  }

  protected async performPlace (place: PlaceHandler, opts: InteractOpts = {}): Promise<void> {
    const item = place.getItem(this.bot)
    if (item == null) throw new CancelError('MovementExecutor: no item to place')
    await place._perform(this.bot, item, opts)
    this._cI = undefined
  }

  protected async performBreak (breakTarget: BreakHandler, opts: InteractOpts = {}): Promise<void> {
    const block = breakTarget.getBlock(this.bot.pathfinder.world)
    if (block == null) throw new CancelError('MovementExecutor: no block to break')
    const item = breakTarget.getItem(this.bot, block)
    await breakTarget._perform(this.bot, item, opts)
    this._cI = undefined
  }

  /**
   * Utility function to have the bot look in the direction of the target, but only on the xz plane.
   */
  protected async lookAtPathPos (vec3: Vec3, force = this.settings.forceLook): Promise<void> {
    // const dx = vec3.x - this.bot.entity.position.x
    // const dz = vec3.z - this.bot.entity.position.z

    return await this.lookAt(vec3.offset(0, -vec3.y + this.bot.entity.position.y + 1.62, 0), force)
  }

  protected async lookAt (vec3: Vec3, force = this.settings.forceLook): Promise<void> {
    // const dx = vec3.x - this.bot.entity.position.x
    // const dy = vec3.y - this.bot.entity.position.y
    // const dz = vec3.z - this.bot.entity.position.z

    if (this.isLookingAt(vec3, 0.001)) return
    await this.bot.lookAt(vec3, force)

    // console.log("lookAt", this.bot.entity.yaw, Math.atan2(-dx, -dz), Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)));

    // this.bot.entity.yaw = Math.atan2(-dx, -dz)
    // this.bot.entity.pitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)) - Math.PI / 2
  }

  public isLookingAt (vec3: Vec3, limit = 0.01): boolean {
    if (!this.settings.careAboutLookAlignment) return true
    // const dx = this.bot.entity.position.x - vec3.x
    // const dy = this.bot.entity.position.y - vec3.y
    // const dz = this.bot.entity.position.z - vec3.z

    // const pitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)) - Math.PI / 2
    // const yaw = wrapRadians(Math.atan2(-dx, -dz))
    // fuck it, I'm being lazy.

    const bl = this.bot.blockAtCursor(256) as unknown as RayType | null
    // console.log(bl)
    if (bl == null) return false

    const eyePos = this.bot.entity.position.offset(0, 1.62, 0)
    // console.log(bl.intersect, vec3, bl.intersect.minus(eyePos).normalize().dot(vec3.minus(eyePos).normalize()), 1 - limit);

    return bl.intersect.minus(eyePos).normalize().dot(vec3.minus(eyePos).normalize()) > 1 - limit

    // console.log(
    //   limit,
    //   pitch,
    //   yaw,
    //   '|',
    //   this.bot.entity.pitch,
    //   this.bot.entity.yaw,
    //   '|',
    //   Math.abs(pitch - this.bot.entity.pitch),
    //   Math.abs(yaw - this.bot.entity.yaw)
    // )
    // return Math.abs(pitch - this.bot.entity.pitch) < limit && Math.abs(yaw - this.bot.entity.yaw) < limit
  }

  public isLookingAtYaw (vec3: Vec3, limit = 0.01): boolean {
    if (!this.settings.careAboutLookAlignment) return true
    // const dx = this.bot.entity.position.x - vec3.x
    // const dy = this.bot.entity.position.y - vec3.y
    // const dz = this.bot.entity.position.z - vec3.z

    // const pitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)) - Math.PI / 2
    // const yaw = wrapRadians(Math.atan2(-dx, -dz))
    // fuck it, I'm being lazy.

    // const bl = this.bot.blockAtCursor(256) as unknown as RayType | null;
    // if (bl == null) return false;

    // const blPosXZ = bl.position.offset(0, -bl.position, 0)
    // const vec3XZ = vec3.offset(0, -vec3.y, 0)

    const inter = this.bot.util.getViewDir()
    const eyePos = this.bot.entity.position.offset(0, 1.62, 0)
    // const inter = bl.intersect.minus(eyePos);
    // inter.translate(0, -inter.y, 0);

    const pos1 = vec3.minus(eyePos)
    pos1.translate(0, -pos1.y, 0)
    // console.log(blPosXZ, vec3XZ, vec3XZ.minus(eyePos).normalize().dot(blPosXZ.minus(eyePos).normalize()), 1 - limit);

    return inter.normalize().dot(pos1.normalize()) > 1 - limit

    // console.log(
    //   limit,
    //   pitch,
    //   yaw,
    //   '|',
    //   this.bot.entity.pitch,
    //   this.bot.entity.yaw,
    //   '|',
    //   Math.abs(pitch - this.bot.entity.pitch),
    //   Math.abs(yaw - this.bot.entity.yaw)
    // )
    // return Math.abs(pitch - this.bot.entity.pitch) < limit && Math.abs(yaw - this.bot.entity.yaw) < limit
  }

  protected resetState (): EntityState {
    this.simCtx.state.updateFromBot(this.bot)
    return this.simCtx.state
  }

  protected simUntil (...args: Parameters<BaseSimulator['simulateUntil']>): ReturnType<BaseSimulator['simulateUntil']> {
    this.simCtx.state.updateFromBot(this.bot)
    return this.sim.simulateUntil(...args)
  }

  protected simUntilGrounded (controller: Controller, maxTicks = 1000): EntityState {
    this.simCtx.state.updateFromBot(this.bot)
    return this.sim.simulateUntil(
      (state) => state.onGround,
      () => {},
      controller,
      this.simCtx,
      this.world,
      maxTicks
    )
  }

  protected simJump ({ goal, controller }: { goal?: SimulationGoal, controller?: Controller } = {}, maxTicks = 1000): EntityState {
    this.simCtx.state.updateFromBot(this.bot)
    goal = goal ?? ((state) => state.onGround)
    controller =
      controller ??
      ((state) => {
        state.control.set('jump', true)
      })
    return this.sim.simulateUntil(goal, () => {}, controller, this.simCtx, this.world, maxTicks)
  }

  protected async postInitAlignToPath (
    startMove: Move,
    opts?: { handleBack?: boolean, lookAt?: Vec3, lookAtYaw?: Vec3, sprint?: boolean }
  ): Promise<void>
  protected async postInitAlignToPath (
    startMove: Move,
    endMove?: Move,
    opts?: { handleBack?: boolean, lookAt?: Vec3, lookAtYaw?: Vec3, sprint?: boolean }
  ): Promise<void>
  protected async postInitAlignToPath (startMove: Move, endMove?: any, opts?: any): Promise<void> {
    if (endMove === undefined) {
      endMove = startMove
      opts = {}
    } else if (endMove instanceof Move) {
      opts = opts ?? {}
    } else {
      opts = endMove
      endMove = startMove
    }

    // const handleBack = opts.handleBack ?? false
    let target = opts.lookAt ?? opts.lookAtYaw ?? endMove.exitPos

    if (opts.lookAtYaw != null && opts.lookAt == null) {
      target = target.offset(0, -target.y + this.bot.entity.position.y + this.bot.entity.height, 0)
    }
    // const offset = endMove.exitPos.minus(this.bot.entity.position)
    // const dir = endMove.exitPos.minus(startMove.entryPos)
    const sprint = opts.sprint ?? true
    // const similarDirection = offset.normalize().dot(dir.normalize()) > 0.9

    // if (similarDirection) {
    //   this.bot.setControlState('left', false);
    //   this.bot.setControlState('right', false);
    //   if (handleBack) botSmartMovement(this.bot, endMove.exitPos, true);
    //   else this.lookAtPathPos(endMove.exitPos);
    // } else {

    // console.log("target", target, opts)

    if (target !== endMove.exitPos) {
      await this.lookAt(target)
      if (!this.isLookingAt(target, 0.01)) return
    } else {
      await this.lookAtPathPos(target)
      if (!this.isLookingAtYaw(target, 0.01)) {
        // console.log('failed yaw check')
        return
      }
    }

    // this.bot.chat(`/particle flame ${endMove.exitPos.x} ${endMove.exitPos.y} ${endMove.exitPos.z} 0 0.5 0 0 10 force`);
    botStrafeMovement(this.bot, endMove.exitPos)
    botSmartMovement(this.bot, endMove.exitPos, sprint)

    // console.log(this.bot.entity.yaw)
    // console.log(
    //   target,
    //   startMove.entryPos,
    //   endMove.exitPos,
    //   startMove === endMove,
    //   this.bot.entity.position.distanceTo(endMove.exitPos),
    //   '\n | ',
    //   this.bot.getControlState('forward'),
    //   this.bot.getControlState('back'),
    //   ' | ',
    //   this.bot.getControlState('left'),
    //   this.bot.getControlState('right'),
    //   ' | ',
    //   this.bot.getControlState('sprint'),
    //   this.bot.getControlState('jump'),
    //   this.bot.getControlState('sneak')
    // )
    // await task;
    // if (this.bot.entity.position.xzDistanceTo(target) > 0.3)
    // // botSmartMovement(this.bot, endMove.exitPos, true);
    // this.bot.setControlState("forward", true);

    // }

    // if (handleBack) {
    //   botSmartMovement(this.bot, target, true);
    // }

    // console.log(target)

    // this.simCtx.state.updateFromBot(this.bot)
    // const state = this.bot.physicsUtil.engine.simulate(this.simCtx, this.world)
    // const bb0 = AABBUtils.getPlayerAABB({ position: state.pos, width: 0.6, height: 1.8 });

    // if (state.pos.y < startMove.entryPos.y && state.pos.y < endMove.exitPos.y) {
    //   this.bot.setControlState("sprint", false);
    //   this.bot.setControlState("jump", false);
    //   this.bot.setControlState("sneak", true);
    // }
  }
} -->

<h3>Creating a sublcass of move_executors.MoveExecutor</h3>

To create a subclass of `move_executors.MoveExecutor`, you need to implement the `performInit`, `performPerTick`, and `align` methods.

<h4>Example</h4>

```ts
import { Move, goals, MovementExecutor } from 'mineflayer-pathfinder'

class MyMoveExecutor extends MovementExecutor {
  
  async align (thisMove: Move, tickCount?: number, goal?: goals.Goal, lookTarget?: Vec3): Promise<boolean> {
    // Perform modifications on bot BEFORE attempting the move
    // This can be used to align to the center of blocks, etc.
    // Align IS allowed to throw exceptions, it will revert to recovery
  }
  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    // Perform initial setup upon movement start
  }

  async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number> {
    // Perform modifications on bot per-tick
    // Return whether or not bot has reached the goal
  }


}
```
