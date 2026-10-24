import 'react';

declare module 'react' {
  // Allow CSS custom properties in style objects: the only inline style the
  // style gate permits (e.g. style={{ '--board-color': board.color }}).
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined;
  }
}
