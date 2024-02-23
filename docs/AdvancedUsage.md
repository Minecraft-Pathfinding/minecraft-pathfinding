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
  - [Custom goals.GoalDynamic](#Custom-goal)
  - [Custom goals.GoalDynamic](#Custom-goaldynamic)
- [Movement Customization](#movement-customization)
  - [Custom Movement Providers](#custom-movement-providers)
  - [Custom Movement Executors](#custom-movement-executors)
  - [Custom Movement Optimizers](#custom-movement-optimizers)



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


<h2>FAQ</h2>

<!-- write a clean FAQ format -->
<h5>Q: What is a Movement Provider?</h5>

A: A Movement Provider is a class that is used to determine whether or not movement is possible. It is used to calculate the path based on the current movement logic.

<h5>Q: What is a Movement Executor?</h5>

A: A Movement Executor is a class that is used to execute the path, performing any necessary actions to reach the goal. It is used to move and interact with the world.

<h5>Q: What is a Movement Optimizer?</h5>

A: A Movement Optimizer is a class that is used to optimize the path, removing unnecessary nodes and making the path more efficient. It is used to optimize the path in a specific way.

<h5>Q: Can I customize an already existing Movement Provider by extending it?</h5>

A: Yes, but you must de-register the Provider that was extended and register the new Provider with an Executor.

<h5>Q: Can I customize an already existing Movement Executor by extending it?</h5>

A: Yes, but you must de-register the Executor that was extended and register the new Executor.

<h5>Q: Can I customize an already existing Movement Optimizer by extending it?</h5>

A: Yes, but you must de-register the Optimizer that was extended and register the new Optimizer.

<h5>Q: Can I pair a custom Movement Executor with an already registered Provider?</h5>

A: Yes. it will entirely overwrite the previous executor linked to that producer for all *future* paths generated.

<h5>Q: If I change the link between Producers and Executors, or Producers and Optimizers, will it affect the current path?</h5>

A: No. The path is calculated and optimized based on the current links between Producers and Executors, and Producers and Optimizers. Changing the links will only affect future paths.

<h2>Custom Movement Providers: A Summary</h2>

This pathfinder supports three levels of customization for movement: Movement Providers, Movement Executors, and Movement Optimizers. Each of these classes are designed to be extended and provide a simple interface for creating custom movement logic.

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

<h2>Inserting custom classes into the pathfinder</h2>

<h4>Best Practice</h4>

When developing custom extensions, it is best to include both the `Executor` and `Optimizer` for the `Provider`. It is not necessary, but recommended.


<h3>Movement Providers</h3>

Because Providers cannot do anything on their own, we do not provide a method of adding them to the pathfinder alone. Instead, they are paired with an executor during insertion.

Inserting a Provider **must** be with its static instance. This is so lookups across the pathfinder can be done with the static instance.

The movement Executor can be either its static instance or a new instance of the class. We recommend using its **static instance**.

<h3>Inserting a Custom Movement Executor</h3>

**Important!** Inserting an executor with a provider that has *no* optimizer does *not* break the code. Functionally, the bot will perform the unoptimized path.

The provider list when calculating a path is *not* linked to the provider list that has executors. This means that if you add an executor to a provider that has no optimizer, the produced path will not be optimized.

```ts
import { custom } from 'mineflayer-pathfinder'
const {MovementProvider, MovementExecutor} = custom

class MyProvider extends MovementProvider {
  // ... implementation
}

class MyExecutor extends MovementExecutor {
    // ... implementation
} 

bot.pathfinder.setExecutor(MyProvider, MyExecutor)

// OR:

/* MovementOptions, this is not synced with pathfinder's settings */
const executor = new MyExecutor(bot, world, settings )

bot.pathfinder.setExecutor(MyProvider, executor)
```

<h3>Inserting a Custom Movement Optimizer</h3>

**Important!** Adding an optimizer paired with a provider that has *no* executor does *not* break the code. Functionally, nothing will change.

The provider list when calculating a path is *not* linked to the provider list that has optimizers. This means that if you add an optimizer to a provider that has no executor, the optimizer will not be used. 

This allows providers to be removed from the calculation step without needing to remove the optimizer as well.


```ts
import { custom } from 'mineflayer-pathfinder'
const {MovementProvider, MovementOptimizer} = custom

class MyProvider extends MovementProvider {
  // ... implementation
}

class MyOptimizer extends MovementOptimizer {
    // ... implementation
}

bot.pathfinder.setOptimizer(MyProvider, MyOptimizer)

// OR:

const optimizer = new MyOptimizer(bot, world)

bot.pathfinder.setOptimizer(MyProvider, optimizer)

```




<h2>Custom Movement Providers</h2>

To create a subclass of `MovementProvider`, you need to implement the `provideMovements` method. This method is responsible for deciding whether or not movement is possible and, if possible, appending to the provided storage.

<h4>Example</h4>

```ts

import { Move, goals, custom } from 'mineflayer-pathfinder'
const {MovementProvider} = custom

class MyMovementProvider extends MovementProvider {
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

To create a subclass of `MovementExecutor`, you need to implement the `performInit`, `performPerTick`, and `align` methods.

<h4>Example</h4>

```ts
import { Move, goals, custom } from 'mineflayer-pathfinder'
const {MovementExecutor} = custom;

class MyMovementExecutor extends MovementExecutor {
  
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

<h2>Custom Movement Optimizers</h2>

To create a subclass of `MovementOptimizer`, you need to implement the `identEndOpt` method.

<h4>Example</h4>

```ts
import { Move, goals, custom } from 'mineflayer-pathfinder'
const {MovementOptimizer} = custom;

class MyMovementOptimizer extends MovementOptimizer {
  async identEndOpt (currentIndex: number, path: Move[]): Promise<number> {
    // Return the index of the last move in the path
  }
}
```
