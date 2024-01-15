interface Vec3Properties {
    x: number
    y: number
    z: number
  }
  

type BlockType = ReturnType<typeof import('prismarine-block')>
type Block = InstanceType<BlockType>


type MCData = import('minecraft-data').IndexedData