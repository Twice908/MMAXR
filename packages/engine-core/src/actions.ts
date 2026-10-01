/** JSON-compatible data accepted by engine actions and stored in engine state. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** A typed, serializable command applied to state through `dispatch`. */
export type EngineAction = Readonly<{
  type: string;
  payload: JsonValue;
}>;

/** Recursively readonly view of JSON state and actions. */
export type DeepReadonly<Value> = Value extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : Value extends object
    ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
    : Value;

/** A deterministic state transition. Reducers must not perform I/O or read ambient time or randomness. */
export type Reducer<State, Action extends EngineAction> = (
  state: DeepReadonly<State>,
  action: Readonly<Action>,
) => State;

/** Supplies an ISO-8601 UTC timestamp from the application. */
export type Clock = () => string;

/** Supplies a UUID from the application. */
export type IdGenerator = () => string;