import type { MinwindEngineId } from "../flags.js";

// Shared rename/universe surface. Tailwind implements compile + consolidation
// inputs; CSS Modules implements rename via bundler naming hooks only.

export interface StyleEngine {
  id: MinwindEngineId;
  requiresCssEntry: boolean;
}
