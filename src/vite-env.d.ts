/// <reference types="vite/client" />

declare module "*?script" {
  const path: string;
  export default path;
}

declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}
