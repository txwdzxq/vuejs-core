import { type ShallowRef, readonly, shallowRef } from '@vue/reactivity'
import { type Data, getCurrentInstance } from '../component'
import { warn } from '../warning'
import { EMPTY_OBJ } from '@vue/shared'

export const knownTemplateRefs: WeakSet<ShallowRef> = new WeakSet()

export function useTemplateRef<T = unknown, Keys extends string = string>(
  key: Keys,
): Readonly<ShallowRef<T | null>> {
  const i = getCurrentInstance()
  const r = shallowRef(null)
  if (i) {
    const refs = i.refs === EMPTY_OBJ ? (i.refs = {}) : i.refs
    if (__DEV__ && isUseTemplateRefKey(refs, key)) {
      warn(`useTemplateRef('${key}') already exists.`)
    } else {
      Object.defineProperty(refs, key, {
        enumerable: true,
        get: () => r.value,
        set: val => (r.value = val),
      })
    }
  } else if (__DEV__) {
    warn(
      `useTemplateRef() is called when there is no active component ` +
        `instance to be associated with.`,
    )
  }
  const ret = __DEV__ ? readonly(r) : r
  if (__DEV__) {
    knownTemplateRefs.add(ret)
  }
  return ret
}

export function isUseTemplateRefKey(refs: Data, key: string): boolean {
  let desc: PropertyDescriptor | undefined
  if (
    (desc = Object.getOwnPropertyDescriptor(refs, key)) &&
    !desc.configurable
  ) {
    return true
  }

  return false
}
