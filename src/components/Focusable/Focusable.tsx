import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { spatialNav, SpatialNode } from '../../services/spatialNav/spatialNavEngine';
import { gamepadManager } from '../../services/controller/gamepadManager';
import './Focusable.css';

export interface FocusableProps {
  id: string;
  groupId?: string;
  indexInGroup?: number;
  priority?: number;
  className?: string;
  focusedClassName?: string;
  style?: React.CSSProperties;
  children: React.ReactNode | ((isFocused: boolean) => React.ReactNode);
  onSelect?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onClick?: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  scaleEffect?: boolean;
  as?: React.ElementType;
}

export const Focusable: React.FC<FocusableProps> = ({
  id,
  groupId,
  indexInGroup,
  priority,
  className = '',
  focusedClassName = '',
  style,
  children,
  onSelect,
  onFocus,
  onBlur,
  onClick,
  disabled = false,
  autoFocus = false,
  scaleEffect = true,
  as: Component = 'div',
}) => {
  const elementRef = useRef<HTMLElement>(null);
  const [isFocused, setIsFocused] = useState<boolean>(() => spatialNav.getFocusedId() === id);

  const onSelectRef = useRef(onSelect);
  const onClickRef = useRef(onClick);
  const onFocusRef = useRef(onFocus);
  const onBlurRef = useRef(onBlur);

  useEffect(() => {
    onSelectRef.current = onSelect;
    onClickRef.current = onClick;
    onFocusRef.current = onFocus;
    onBlurRef.current = onBlur;
  });

  useLayoutEffect(() => {
    if (disabled || !elementRef.current) return;

    const node: SpatialNode = {
      id,
      element: elementRef.current,
      groupId,
      indexInGroup,
      priority,
      onSelect: () => {
        if (onSelectRef.current) onSelectRef.current();
        else if (onClickRef.current) onClickRef.current();
      },
      onFocus: () => {
        setIsFocused(true);
        onFocusRef.current?.();
      },
      onBlur: () => {
        setIsFocused(false);
        onBlurRef.current?.();
      },
    };

    const unregister = spatialNav.register(node);

    if (autoFocus && !spatialNav.getFocusedId()) {
      spatialNav.setFocus(id);
    }

    const unsubscribe = spatialNav.subscribe((focusedId) => {
      const active = focusedId === id;
      setIsFocused(active);
    });

    return () => {
      unregister();
      unsubscribe();
    };
  }, [id, groupId, indexInGroup, priority, disabled, autoFocus]);

  const handlePointerEnter = () => {
    if (!disabled && id) {
      if (gamepadManager.isGamepadActive()) return;
      spatialNav.setFocus(id, false);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (disabled) return;
    e.stopPropagation();
    spatialNav.setFocus(id, false);
    if (onSelectRef.current) onSelectRef.current();
    else if (onClickRef.current) onClickRef.current();
  };

  const combinedClassName = [
    'tv-focusable',
    scaleEffect ? 'tv-focus-scale' : '',
    isFocused ? `is-focused ${focusedClassName}` : '',
    disabled ? 'is-disabled' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <Component
      ref={elementRef}
      id={id}
      tabIndex={disabled ? -1 : 0}
      className={combinedClassName}
      style={style}
      onPointerEnter={handlePointerEnter}
      onClick={handleClick}
      aria-disabled={disabled}
    >
      {typeof children === 'function' ? children(isFocused) : children}
    </Component>
  );
};
