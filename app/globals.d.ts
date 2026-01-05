declare module "*.css";

declare global {
  // eslint-disable-next-line no-var
  var prisma: import("@prisma/client").PrismaClient & {
    config: any;
  };

  namespace JSX {
    interface IntrinsicElements {
      's-app-nav': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      's-link': React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>;
    }
  }
}

export {};
