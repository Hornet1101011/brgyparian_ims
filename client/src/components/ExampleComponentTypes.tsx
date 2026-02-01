/**
 * Example Component - Proper Type Usage
 * 
 * This file demonstrates the recommended way to use React types
 * after the TypeScript React type fix.
 */

import React from 'react';

interface ExampleProps {
  title: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

const ExampleComponent: React.FC<ExampleProps> = ({
  title,
  children,
  style,
  onClick,
}) => {
  return (
    <div style={style} onClick={onClick}>
      <h2>{title}</h2>
      {children}
    </div>
  );
};

export default ExampleComponent;

// ===================================================================

// Method 2: Using React namespace (also works after the fix)
/*
import React from 'react';

interface AnotherProps {
  label: string;
  children?: React.ReactNode;
}

const AnotherComponent: React.FC<AnotherProps> = ({ label, children }) => {
  return (
    <div>
      <span>{label}</span>
      {children}
    </div>
  );
};

export default AnotherComponent;
*/

// ===================================================================

// Method 3: Using React.FunctionComponent (full name)
/*
import React from 'react';

const ThirdComponent: React.FunctionComponent = () => {
  return <div>Hello</div>;
};

export default ThirdComponent;
*/

// ===================================================================

// Common React Type Patterns

// Form events
export const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  console.log(e.target.value);
};

// Drag events
export const handleDragStart = (e: DragEvent) => {
  console.log('Drag started');
};

// Keyboard events
export const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') {
    console.log('Enter pressed');
  }
};

// Ref usage
export const ExampleWithRef: React.FC = () => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  
  const handleClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };
  
  return (
    <>
      <input ref={inputRef} />
      <button onClick={handleClick}>Focus Input</button>
    </>
  );
};

// ===================================================================

// Import paths (available after tsconfig path aliases setup)
/*
Examples of new import paths you can use:

import { FC, ReactNode } from 'types';
import MyComponent from 'components/MyComponent';
import { useCustomHook } from 'hooks/useCustomHook';
import { formatDate } from 'utils/dateHelpers';
import { AppContext } from 'contexts/AppContext';

Instead of:

import { FC, ReactNode } from '../../../types/react-compat';
import MyComponent from '../../../components/MyComponent';
import { useCustomHook } from '../../../hooks/useCustomHook';
import { formatDate } from '../../../utils/dateHelpers';
import { AppContext } from '../../../contexts/AppContext';
*/
