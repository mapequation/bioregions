type Key = string | number;

export default class MaxMap<K extends Key> extends Map<K, number> {
  #maxKey: K | undefined;
  #maxValue: number = 0;

  constructor(
    maxKey?: K,
    maxValue?: number,
    entries?: readonly (readonly [K, number])[] | null,
  ) {
    super(entries);
    this.#maxKey = maxKey;
    this.#maxValue = maxValue ?? 0;
  }

  get maxKey() {
    return this.#maxKey;
  }

  get maxValue() {
    return this.#maxValue;
  }

  set(key: K, value: number): this {
    super.set(key, value);
    const val = super.get(key)!;
    if (val > this.#maxValue) {
      this.#maxKey = key;
      this.#maxValue = val;
    }
    return this;
  }
}
