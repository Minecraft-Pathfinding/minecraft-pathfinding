import mineflayer from 'mineflayer'
import { Vec3 } from 'vec3'
import type { Block } from 'prismarine-block'

const bot = mineflayer.createBot({
  host: 'localhost', // change this
  port: 64206,       // change this if needed
  username: 'BreakTestBot'
})


bot.on("login", () => {
    let last = performance.now();
    const lastSeens: Record<string, number> = {}
    const newWrite = (name: string, params: any) => {
        if (name === "flying" || name === "position") return

        const time = performance.now()
        let delta;
        if (!lastSeens[name]) {
            lastSeens[name] = time;
            delta = 0;
        } else {
            delta = time - lastSeens[name];
            lastSeens[name] = time;
        }

        console.log(`(${name}): delta ${delta}`, name, params, bot.entity.yaw, bot.entity.pitch);
        originalWrite(name, params)
        last = performance.now()
    }
    bot._client.write = newWrite
})


let last = performance.now();
const lastSeensExternal: Record<string, number> = {}
bot._client.on('packet', (data, meta, raw) => {

    const name = meta.name;
    if (name.includes('map')) return;
  const time = performance.now()
        let delta;
        if (!lastSeensExternal[name]) {
            lastSeensExternal[name] = time;
            delta = 0;
        } else {
            delta = time - lastSeensExternal[name];
            lastSeensExternal[name] = time;
        }


    // if (meta.name.includes('dig')) {
        console.log(`S2C: (${name}): delta ${delta}`)
    // }
})

// bot.on("entityMoved", (entity: any) => {
//     console.log()
// })

bot.once('spawn', () => {
  console.log('Bot spawned.')
})

const originalWrite = bot._client.write.bind(bot._client)


bot.on('chat', async (username, message) => {
  if (username === bot.username) return

  const parts = message.trim().split(/\s+/)
  if (parts[0] !== '!break') return

  if (parts.length !== 4) {
    bot.chat('Usage: !break <x> <y> <z>')
    return
  }

  const x = Number(parts[1])
  const y = Number(parts[2])
  const z = Number(parts[3])

  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
    bot.chat('Coordinates must be integers.')
    return
  }

  const pos = new Vec3(x, y, z)
  const block: Block | null = bot.blockAt(pos)

  if (block == null) {
    bot.chat(`No block found at ${x} ${y} ${z}.`)
    return
  }

  if (block.name === 'air') {
    bot.chat(`Block at ${x} ${y} ${z} is air.`)
    return
  }

  try {
    console.time('dig')
    console.timeLog('dig', `Attempting to dig ${block.name} at ${block.position}`)

    await bot.dig(block)

    bot.chat(`Broke ${block.name} at ${x} ${y} ${z}.`)
    console.log(`Successfully broke ${block.name} at ${block.position}`)
    console.timeEnd('dig')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    bot.chat(`Failed to break block: ${msg}`)
    console.error('Dig failed:', err)
  }
})

bot.on('error', (err) => {
  console.error('Bot error:', err)
})

bot.on('end', () => {
  console.log('Bot disconnected.')
})