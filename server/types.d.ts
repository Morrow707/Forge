import type { User as SchemaUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SchemaUser {}
  }
}

export {};
