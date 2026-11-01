import * as Primitive from '@radix-ui/react-select';
import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';
import { ui, twMerge } from './classes.ts';
import { IconCheckCircle, IconChevronDown } from './icons.tsx';
import styles from './select.module.css';

type SelectProps = Omit<
  ComponentPropsWithoutRef<typeof Primitive.Trigger>,
  'value' | 'onChange' | 'children' | 'defaultValue'
> & {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  placeholder?: string;
  name?: string;
  ref?: Ref<HTMLButtonElement>;
};

// Encode every option so empty filter values remain real, selectable items.
const encode = (value: string) => `option:${value}`;

export function Select({
  value,
  onValueChange,
  children,
  placeholder,
  name,
  disabled,
  className,
  ref,
  ...trigger
}: SelectProps) {
  return (
    <Primitive.Root
      value={encode(value)}
      onValueChange={(next) => onValueChange(next.slice('option:'.length))}
      disabled={disabled}
      name={name}
    >
      <Primitive.Trigger
        {...trigger}
        ref={ref}
        disabled={disabled}
        className={twMerge(ui.input, styles.trigger, className)}
      >
        <span className={styles.value}>
          <Primitive.Value placeholder={placeholder} />
        </span>
        <Primitive.Icon className={styles.icon}>
          <IconChevronDown size={18} />
        </Primitive.Icon>
      </Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          className={styles.content}
          position="popper"
          sideOffset={4}
          collisionPadding={12}
        >
          <Primitive.Viewport className={styles.viewport}>{children}</Primitive.Viewport>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}

export function SelectOption({
  value,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof Primitive.Item>) {
  return (
    <Primitive.Item {...props} value={encode(value)} className={styles.option}>
      <Primitive.ItemText>{children}</Primitive.ItemText>
      <Primitive.ItemIndicator className={styles.indicator}>
        <IconCheckCircle size={16} />
      </Primitive.ItemIndicator>
    </Primitive.Item>
  );
}
