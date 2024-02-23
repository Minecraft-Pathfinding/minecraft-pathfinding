<!-- Explain how to create a subclass of goals.Goal class -->

<!-- reference typescript code -->
<!-- export abstract class Goal implements AGoal<Move> {
  abstract isEnd (node: Move): boolean
  abstract heuristic (node: Move): number
  async onFinish (node: MovementExecutor): Promise<void> {}
} -->


<h1 align="center">Advanced Usage!</h1>

<h3>Table of Contents</h3>

- [Goal_Creation](#goal-creation)
  - [Creating_a_sublcass_of_goals.GoalDynamic](#creating-a-sublcass-of-goals.goal)
  - [Creating_a_sublcass_of_goals.GoalDynamic](#creating-a-sublcass-of-goals.goaldynamic)
- [Move_Producers](#move-producers)
  - [Creating_a_sublcass_of_move_produders.MoveProducer](#creating-a-sublcass-of-move-producers.moveproducer)
- [Move_Executors](#move-executors)
  - [Creating_a_sublcass_of_move_executor.MoveExecutor](#creating-a-sublcass-of-move-executor.moveexecutor)
- [Move_Optimizer](#move-optimizer)
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
