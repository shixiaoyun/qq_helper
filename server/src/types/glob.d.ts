declare module 'glob' {
  function glob(pattern: string, options: any, callback: (err: any, matches: string[]) => void): void;
  function glob(pattern: string, callback: (err: any, matches: string[]) => void): void;
  export { glob };
}
