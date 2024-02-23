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


<h2>Goal Creation</h2>

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
