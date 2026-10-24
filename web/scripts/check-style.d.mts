export interface StyleViolation {
  file: string;
  line: number;
  rule: 'arbitrary-value' | 'raw-hex' | 'inline-style';
  match: string;
}
export function stripComments(text: string, isCss?: boolean): string;
export function checkSource(file: string, text: string): StyleViolation[];
export function checkDir(dir?: string): StyleViolation[];
