/**
 * React Type Compatibility Layer
 * 
 * This file provides type aliases for React types that may not be properly exported
 * depending on the React version and TypeScript configuration.
 * 
 * Import from this file instead of using React.FC, React.ReactNode, etc. directly.
 */

import React from 'react';

// Re-export React namespace with type augmentation
export namespace ReactTypes {
  export type FC<P = {}> = React.FC<P>;
  export type FunctionComponent<P = {}> = React.FunctionComponent<P>;
  export type ComponentType<P = {}> = React.ComponentType<P>;
  export type ComponentProps<T> = T extends React.ComponentType<infer P> ? P : never;
  
  // React type exports
  export type ReactNode = React.ReactNode;
  export type ReactElement<P = any> = React.ReactElement<P>;
  export type CSSProperties = React.CSSProperties;
  export type SVGProps<T = SVGSVGElement> = React.SVGProps<T>;
  
  // Event types
  export type ChangeEvent<T = HTMLElement> = React.ChangeEvent<T>;
  export type DragEvent<T = HTMLElement> = React.DragEvent<T>;
  export type KeyboardEvent<T = HTMLElement> = React.KeyboardEvent<T>;
  export type MouseEvent<T = HTMLElement> = React.MouseEvent<T>;
  
  // Ref types
  export type Ref<T> = React.Ref<T>;
  export type RefObject<T> = React.RefObject<T>;
  export type RefCallback<T> = React.RefCallback<T>;
  export type MutableRefObject<T> = React.MutableRefObject<T>;
  
  // Context
  export type Context<T> = React.Context<T>;
  
  // Other types
  export type Key = React.Key;
  export type PropsWithChildren<P = {}> = React.PropsWithChildren<P>;
  export type Dispatch<A> = React.Dispatch<A>;
  export type SetStateAction<S> = React.SetStateAction<S>;
}

// Direct exports for convenience
export type FC<P = {}> = React.FC<P>;
export type FunctionComponent<P = {}> = React.FunctionComponent<P>;
export type ComponentType<P = {}> = React.ComponentType<P>;
export type ComponentProps<T> = T extends React.ComponentType<infer P> ? P : never;
export type ReactNode = React.ReactNode;
export type ReactElement<P = any> = React.ReactElement<P>;
export type CSSProperties = React.CSSProperties;
export type SVGProps<T = SVGSVGElement> = React.SVGProps<T>;
export type ChangeEvent<T = HTMLElement> = React.ChangeEvent<T>;
export type DragEvent<T = HTMLElement> = React.DragEvent<T>;
export type KeyboardEvent<T = HTMLElement> = React.KeyboardEvent<T>;
export type MouseEvent<T = HTMLElement> = React.MouseEvent<T>;
export type MutableRefObject<T> = React.MutableRefObject<T>;
export type Key = React.Key;
export type Ref<T> = React.Ref<T>;
export type RefObject<T> = React.RefObject<T>;
export type RefCallback<T> = React.RefCallback<T>;
export type Context<T> = React.Context<T>;
export type PropsWithChildren<P = {}> = React.PropsWithChildren<P>;
export type Dispatch<A> = React.Dispatch<A>;
export type SetStateAction<S> = React.SetStateAction<S>;

