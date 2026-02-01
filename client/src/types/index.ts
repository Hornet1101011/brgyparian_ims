/**
 * Central export for all type compatibility and custom types
 * 
 * Usage:
 * import { FC, ReactNode, ComponentProps } from 'types';
 * 
 * const MyComponent: FC = () => <div>Hello</div>;
 */

// React compatibility types - primary exports
export {
  FC,
  FunctionComponent,
  ComponentType,
  ComponentProps,
  ReactNode,
  ReactElement,
  CSSProperties,
  SVGProps,
  ChangeEvent,
  DragEvent,
  KeyboardEvent,
  MouseEvent,
  MutableRefObject,
  Key,
  Ref,
  RefObject,
  RefCallback,
  Context,
  PropsWithChildren,
  Dispatch,
  SetStateAction,
} from './react-compat';
