import { Vec3 } from "vec3";
import { BlockInfo } from "./cacheWorld";
import { Block } from "../../types";
import { Bot } from "mineflayer";


export function fasterGetBlock(this: Bot['world'], minY: number, pos: Vec3): Block {
  // if (!pos.floored().equals(pos)) throw new Error("Position must be floored");
  const offY = pos.y - minY;
  const cX = pos.x >> 4;
  const cZ = pos.z >> 4;
  const cY = offY >> 4;

  
  const colKey = `${cX},${cZ}`
  const col = (this.async as any).columns[colKey];

  if (!col) {
    return null as unknown as Block;
  }
  const colPos = {x: pos.x & 0xf, y: pos.y, z: pos.z & 0xf};

  const ret1 = col.getBlock(colPos as any);
  ret1.position = pos;
  return ret1;
  const section = col.sections[cY];



  if (!section) {
    const ret = BlockInfo.PBlock.fromStateId(0, 0);
    ret.position = pos;
    return ret;
  }

  const blIdx = (offY & 0xf << 8) | (pos.z & 0xf << 4) | (pos.x & 0xf);
  
  let stateId = section.data.get(blIdx);  

  if (section.palette != null) {
    stateId = section.palette[stateId]
  }

  const ret = BlockInfo.PBlock.fromStateId(stateId, 0);
  ret1.position = pos;
  return ret1;
}
