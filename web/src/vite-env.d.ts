/// <reference types="vite/client" />

declare module '*.mjs?url' {
  const source: string;
  export default source;
}
