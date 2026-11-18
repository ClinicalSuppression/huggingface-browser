declare module 'sql.js' {
  export interface Database {
    run(sql: string, params?: unknown[]): void;
    exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
    export(): Uint8Array;
  }
  export default function initSqlJs(config?: unknown): Promise<{
    Database: new (data?: ArrayLike<number> | Uint8Array | Buffer) => Database;
  }>;
}

declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      src?: string;
      allowpopups?: string | boolean;
      webpreferences?: string;
    };
  }
}
