export type Primitive =
  null |
  boolean |
  number |
  Date |
  Buffer |
  string |
  undefined;

export type BytewiseType = Primitive | Array<Primitive>;

export function encode(value: BytewiseType): Buffer;
export function decode<R extends BytewiseType>(value: Buffer): R;
export function compare(a: Buffer, b: Buffer): -1 | 0 | 1;
