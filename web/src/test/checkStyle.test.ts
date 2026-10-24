import { describe, expect, it } from 'vitest';
import { checkDir, checkSource } from '../../scripts/check-style.mjs';

const rules = (file: string, text: string) => checkSource(file, text).map((v) => `${v.rule}:${v.match}`);

describe('check-style: arbitrary values', () => {
  it('catches literal arbitrary values', () => {
    const found = rules('src/x.tsx', `<p className="text-[13px] bg-[#0047AB] rounded-[7px] max-sm:p-[3px] -mt-[2px]" />`);
    expect(found).toEqual([
      'arbitrary-value:text-[13px]',
      'arbitrary-value:bg-[#0047AB]',
      'arbitrary-value:rounded-[7px]',
      'arbitrary-value:max-sm:p-[3px]',
      'arbitrary-value:-mt-[2px]',
      'raw-hex:#0047AB',
    ]);
  });

  it('catches arbitrary variants and properties', () => {
    expect(rules('src/x.tsx', `cx('data-[state=open]:bg-card', '[mask-type:alpha]')`)).toEqual([
      'arbitrary-value:data-[state=open]',
      'arbitrary-value:[mask-type:alpha]',
    ]);
  });

  it('allows CSS variables and the v4 (--var) shorthand', () => {
    expect(rules('src/x.tsx', `<p className="w-[var(--w)] left-(--tip-x) top-[--y]" />`)).toEqual([]);
  });

  it('does not flag ordinary code', () => {
    expect(rules('src/x.ts', `const a = list[i - 1]; const b = obj['key']; type T = { [k: string]: number };`)).toEqual([]);
  });
});

describe('check-style: raw hex', () => {
  it('catches hex colours in components and CSS', () => {
    expect(rules('src/x.tsx', `const c = '#0047AB';`)).toEqual(['raw-hex:#0047AB']);
    expect(rules('src/styles/other.css', `.a { color: #fff; }`)).toEqual(['raw-hex:#fff']);
  });

  it('allows hex inside theme.css only', () => {
    expect(rules('src/styles/theme.css', `:root { --brand: #0047AB; }`)).toEqual([]);
  });

  it('ignores comments, entities and anchors', () => {
    expect(rules('src/x.tsx', `// the old #E5484D red\n/* #fff */ const s = '&#123;'; const h = '#main';`)).toEqual([]);
  });
});

describe('check-style: inline styles', () => {
  it('rejects ordinary inline styles', () => {
    expect(rules('src/x.tsx', `<div style={{ color: 'red' }} />`)).toHaveLength(1);
    expect(rules('src/x.tsx', `<div style={{ '--board-color': c, width: 4 }} />`)).toHaveLength(1);
    expect(rules('src/x.tsx', `<div style={styles} />`)).toHaveLength(1);
    expect(rules('src/x.tsx', `<div style={{ ...rest }} />`)).toHaveLength(1);
  });

  it('allows objects that only set CSS custom properties', () => {
    expect(rules('src/x.tsx', `<div style={{ '--board-color': board.color }} />`)).toEqual([]);
    expect(rules('src/x.tsx', `<div style={{ "--a": f(x, { y: 1 }), '--b': \`\${n}px\` }} />`)).toEqual([]);
    expect(rules('src/x.tsx', `<div style={{ '--x': y } as CSSProperties} />`)).toEqual([]);
  });
});

describe('check-style on the real source tree', () => {
  it('passes (the same gate CI runs)', () => {
    expect(checkDir()).toEqual([]);
  });
});
