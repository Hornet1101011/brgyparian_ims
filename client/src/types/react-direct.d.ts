/**
 * Direct React Type Declarations
 * These declarations ensure React types are available without depending on @types/react resolution
 */

declare global {
  namespace React {
    // Component types
    type FC<P = {}> = FunctionComponent<P>;
    type FunctionComponent<P = {}> = (props: P & PropsWithChildren<P>) => ReactElement | null;
    type ComponentType<P = {}> = FunctionComponent<P> | ClassComponent<P>;
    
    // Common React types
    type ReactNode = ReactElement | string | number | boolean | null | undefined;
    type ReactElement<P = any> = any;
    type CSSProperties = any;
    type SVGProps<T> = any;
    
    // Event types
    type ChangeEvent<T = HTMLElement> = any;
    type DragEvent<T = HTMLElement> = any;
    type KeyboardEvent<T = HTMLElement> = any;
    type MouseEvent<T = HTMLElement> = any;
    
    // Ref types
    type Ref<T> = RefCallback<T> | RefObject<T> | null;
    type RefObject<T> = { current: T | null };
    type RefCallback<T> = (instance: T | null) => void;
    type MutableRefObject<T> = { current: T };
    
    // Context
    type Context<T> = any;
    
    // Other types
    type Key = string | number;
    type PropsWithChildren<P = {}> = P & { children?: ReactNode };
    type Dispatch<A> = (action: A) => void;
    type SetStateAction<S> = S | ((prevState: S) => S);
    
    // Utility
    type ComponentProps<T extends keyof JSX.IntrinsicElements | ComponentType<any>> = T extends ComponentType<infer P> ? P : T extends keyof JSX.IntrinsicElements ? JSX.IntrinsicElements[T] : {};
    
    interface ClassComponent<P = {}> {
      render(): ReactElement | null;
    }
  }
}

export {};
