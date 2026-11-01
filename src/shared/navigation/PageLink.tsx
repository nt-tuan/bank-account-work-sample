import {
  createContext,
  useContext,
  type ComponentProps,
  type MouseEvent,
  type FocusEvent,
  type TouchEvent,
} from 'react';
import { Link as RouterLink, NavLink as RouterNavLink, useResolvedPath } from 'react-router';

export const PagePrefetchContext = createContext<(href: string) => void>(() => {});

type IntentProps = Pick<
  ComponentProps<typeof RouterLink>,
  | 'to'
  | 'relative'
  | 'onMouseEnter'
  | 'onFocus'
  | 'onTouchStart'
  | 'target'
  | 'download'
  | 'reloadDocument'
>;

function usePrefetchIntent(props: IntentProps) {
  const prefetch = useContext(PagePrefetchContext);
  const path = useResolvedPath(props.to, props.relative ? { relative: props.relative } : {});
  const warm = () => {
    if (typeof props.to === 'string' && /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(props.to)) return;
    if (!props.reloadDocument && !props.download && (!props.target || props.target === '_self')) {
      prefetch(path.pathname + path.search);
    }
  };
  return {
    onMouseEnter: (event: MouseEvent<HTMLAnchorElement>) => {
      props.onMouseEnter?.(event);
      if (!event.defaultPrevented) warm();
    },
    onFocus: (event: FocusEvent<HTMLAnchorElement>) => {
      props.onFocus?.(event);
      if (!event.defaultPrevented) warm();
    },
    onTouchStart: (event: TouchEvent<HTMLAnchorElement>) => {
      props.onTouchStart?.(event);
      if (!event.defaultPrevented) warm();
    },
  };
}

export function PageLink(props: ComponentProps<typeof RouterLink>) {
  const intent = usePrefetchIntent(props);
  return <RouterLink {...props} {...intent} />;
}

export function PageNavLink(props: ComponentProps<typeof RouterNavLink>) {
  const intent = usePrefetchIntent(props);
  return <RouterNavLink {...props} {...intent} />;
}
