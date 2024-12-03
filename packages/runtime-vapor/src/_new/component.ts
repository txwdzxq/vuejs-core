import {
  type AppContext,
  type ComponentInternalOptions,
  type ComponentPropsOptions,
  EffectScope,
  type EmitsOptions,
  type GenericComponentInstance,
  type LifecycleHook,
  type NormalizedPropsOptions,
  type ObjectEmitsOptions,
  nextUid,
} from '@vue/runtime-core'
import type { Block } from '../block'
import type { Data } from '@vue/runtime-shared'
import { pauseTracking, resetTracking } from '@vue/reactivity'
import { EMPTY_OBJ, isFunction } from '@vue/shared'
import {
  type RawProps,
  getDynamicPropsHandlers,
  initStaticProps,
} from './componentProps'
import { setDynamicProp } from '../dom/prop'
import { renderEffect } from './renderEffect'

export type VaporComponent = FunctionalVaporComponent | ObjectVaporComponent

export type VaporSetupFn = (
  props: any,
  ctx: SetupContext,
) => Block | Data | undefined

export type FunctionalVaporComponent = VaporSetupFn &
  Omit<ObjectVaporComponent, 'setup'> & {
    displayName?: string
  } & SharedInternalOptions

export interface ObjectVaporComponent
  extends ComponentInternalOptions,
    SharedInternalOptions {
  setup?: VaporSetupFn
  inheritAttrs?: boolean
  props?: ComponentPropsOptions
  emits?: EmitsOptions
  render?(ctx: any): Block

  name?: string
  vapor?: boolean
}

interface SharedInternalOptions {
  /**
   * Cached normalized props options.
   * In vapor mode there are no mixins so normalized options can be cached
   * directly on the component
   */
  __propsOptions?: NormalizedPropsOptions
  /**
   * Cached normalized props proxy handlers.
   */
  __propsHandlers?: [ProxyHandler<any>, ProxyHandler<any>]
  /**
   * Cached normalized emits options.
   */
  __emitsOptions?: ObjectEmitsOptions
}

export function createComponent(
  component: VaporComponent,
  rawProps?: RawProps,
  isSingleRoot?: boolean,
): VaporComponentInstance {
  // check if we are the single root of the parent
  // if yes, inject parent attrs as dynamic props source
  if (isSingleRoot && currentInstance && currentInstance.hasFallthrough) {
    if (rawProps) {
      ;(rawProps.$ || (rawProps.$ = [])).push(currentInstance.attrs)
    } else {
      rawProps = { $: [currentInstance.attrs] }
    }
  }

  const instance = new VaporComponentInstance(component, rawProps)

  pauseTracking()
  let prevInstance = currentInstance
  currentInstance = instance
  instance.scope.on()

  const setupFn = isFunction(component) ? component : component.setup
  const setupContext = setupFn!.length > 1 ? new SetupContext(instance) : null
  instance.block = setupFn!(
    instance.props,
    // @ts-expect-error
    setupContext,
  ) as Block // TODO handle return object

  // single root, inherit attrs
  if (
    instance.hasFallthrough &&
    component.inheritAttrs !== false &&
    instance.block instanceof Element &&
    Object.keys(instance.attrs).length
  ) {
    renderEffect(() => {
      for (const key in instance.attrs) {
        setDynamicProp(instance.block as Element, key, instance.attrs[key])
      }
    })
  }

  instance.scope.off()
  currentInstance = prevInstance
  resetTracking()
  return instance
}

export let currentInstance: VaporComponentInstance | null = null

export class VaporComponentInstance implements GenericComponentInstance {
  uid: number
  type: VaporComponent
  parent: GenericComponentInstance | null
  appContext: AppContext

  block: Block
  scope: EffectScope
  props: Record<string, any>
  attrs: Record<string, any>
  exposed?: Record<string, any>

  emitted: Record<string, boolean> | null
  propsDefaults: Record<string, any> | null

  // for useTemplateRef()
  refs: Data
  // for provide / inject
  provides: Data

  hasFallthrough: boolean

  // LifecycleHooks.ERROR_CAPTURED
  ec: LifecycleHook

  constructor(comp: VaporComponent, rawProps?: RawProps) {
    this.uid = nextUid()
    this.type = comp
    this.parent = currentInstance
    this.appContext = currentInstance ? currentInstance.appContext : null! // TODO

    this.block = null! // to be set
    this.scope = new EffectScope(true)

    this.provides = this.refs = EMPTY_OBJ
    this.emitted = null
    this.ec = null

    // init props
    this.propsDefaults = null
    this.hasFallthrough = false
    if (comp.props && rawProps && rawProps.$) {
      // has dynamic props, use proxy
      const handlers = getDynamicPropsHandlers(comp, this)
      this.props = new Proxy(rawProps, handlers[0])
      this.attrs = new Proxy(rawProps, handlers[1])
      this.hasFallthrough = true
    } else {
      this.props = {}
      this.attrs = {}
      this.hasFallthrough = initStaticProps(comp, rawProps, this)
    }

    // TODO validate props
    // TODO init slots
  }
}

export function isVaporComponent(
  value: unknown,
): value is VaporComponentInstance {
  return value instanceof VaporComponentInstance
}

export class SetupContext<E = EmitsOptions> {
  attrs: Record<string, any>
  // emit: EmitFn<E>
  // slots: Readonly<StaticSlots>
  expose: (exposed?: Record<string, any>) => void

  constructor(instance: VaporComponentInstance) {
    this.attrs = instance.attrs
    // this.emit = instance.emit as EmitFn<E>
    // this.slots = instance.slots
    this.expose = (exposed = {}) => {
      instance.exposed = exposed
    }
  }
}
