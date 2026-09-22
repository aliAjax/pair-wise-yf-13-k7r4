/**
 * 本仓库刻意不新增任何 npm 依赖（含类型包）。
 * 脚手架未包含 @types/react，这里用类型级别的最小声明补齐 JSX 与 React Hook 类型，
 * 仅用于 tsc 编译期检查，不产生任何运行时代码；领域规则（rules/）与状态（state/）仍是完整强类型。
 *
 * 注意：本文件无顶层 import/export，使 declare module 为环境模块声明而非模块增强。
 */
declare namespace JSX {
  interface Element {}
  interface ElementClass {}
  interface ElementAttributesProperty {
    props: any;
  }
  interface ElementChildrenAttribute {
    children: any;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type LibraryManagedAttributes<C, P> = P;
  interface IntrinsicAttributes {
    key?: any;
  }
  interface IntrinsicElements {
    [elem: string]: {
      children?: any;
      className?: string;
      value?: any;
      defaultValue?: any;
      placeholder?: string;
      disabled?: boolean;
      rows?: number;
      inputMode?: string;
      onClick?: (event: any) => void;
      onChange?: (event: any) => void;
      onKeyDown?: (event: any) => void;
      onSubmit?: (event: any) => void;
      [attr: string]: any;
    };
  }
}

declare module "react" {
  type SetStateAction<T> = T | ((prev: T) => T);
  type Dispatch<A> = (value: A) => void;
  type DependencyList = readonly unknown[];

  export function useState<T>(
    initialState: T | (() => T)
  ): [T, Dispatch<SetStateAction<T>>];
  export function useState<T = undefined>(): [T | undefined, Dispatch<SetStateAction<T | undefined>>];
  export function useMemo<T>(factory: () => T, deps: DependencyList | undefined): T;
  export function useEffect(effect: () => void | (() => void), deps?: DependencyList): void;
  export function useCallback<T extends (...args: any[]) => any>(
    callback: T,
    deps: DependencyList
  ): T;
  export function useRef<T>(initialValue: T): { current: T };
  export function useSyncExternalStore<T>(
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => T,
    getServerSnapshot?: () => T
  ): T;

  export const Fragment: any;
  const React: any;
  export default React;
}

declare module "react/jsx-runtime" {
  export const Fragment: any;
  export const jsx: any;
  export const jsxs: any;
}

declare module "react-dom/client" {
  export interface Root {
    render(node: any): void;
    unmount(): void;
  }
  export function createRoot(container: Element | DocumentFragment): Root;
}
