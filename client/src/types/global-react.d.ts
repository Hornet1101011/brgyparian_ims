/**
 * Global React types re-export
 * 
 * This allows using React types as namespace exports without issues.
 * Include this in your global types or import the compat module.
 */

declare global {
  namespace React {
    type FC<P = {}> = React.FunctionComponent<P>;
    type ReactNode = any;
    type ReactElement = any;
    type CSSProperties = any;
    type SVGProps<T> = any;
    type ChangeEvent<T> = any;
    type DragEvent<T> = any;
    type KeyboardEvent<T> = any;
    type MutableRefObject<T> = any;
    type Key = any;
    type ReactNode = any;
  }
}

export {};
