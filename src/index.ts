import {Bot} from 'mineflayer'



declare module 'mineflayer' {
    interface Bot {
        pathfinder: ThePathfinder
    }
}




export class ThePathfinder {

}

export function createLoader(settings: any) {
    return function(bot: Bot) {
        bot.pathfinder = new ThePathfinder();
    }
}