require('ts-node/register')

const { readdirSync } = require('node:fs')
const { join } = require('node:path')



function loadTests(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      loadTests(fullPath)
      continue
    }

    if (!entry.name.endsWith('.test.ts')) continue
    require(fullPath)
  }
}

loadTests(__dirname)
