import { shouldTransformModule, transformSource } from "./transform-source.js";
import { MinwindWebpackPlugin } from "./webpack.js";

// Per-module class-context transform (U3) for webpack/rspack. Wire it with
// enforce: 'pre' so it runs before any JSX/TS compiler — the same ordering
// assumption as the Vite plugin's enforce-pre transform hook (KTD1), and
// the plugin's zero-rename tripwire fails the build when it breaks:
//
//   module: {
//     rules: [
//       {
//         test: /\.(?:[cm]?[jt]s|[jt]sx|vue|svelte|astro)$/,
//         enforce: 'pre',
//         use: [MinwindWebpackPlugin.loader],
//       },
//     ],
//   },
//   plugins: [new MinwindWebpackPlugin()]
//
// The loader finds its plugin instance on the compiler, so one shared
// pre-pass registry feeds every module. Types are structural: webpack is
// the host's dependency, not minwind's.

interface LoaderContextLike {
  resourcePath: string;
  _compiler?: { options?: { plugins?: ReadonlyArray<unknown> } };
  async(): (error: Error | null, content?: string, map?: unknown) => void;
  emitWarning(warning: Error): void;
}

export default function minwindLoader(
  this: LoaderContextLike,
  source: string,
): void {
  const callback = this.async();
  const plugins = this._compiler?.options?.plugins ?? [];
  let plugin: MinwindWebpackPlugin | undefined;
  for (const candidate of plugins) {
    if (candidate instanceof MinwindWebpackPlugin) {
      plugin = candidate;
      break;
    }
  }
  const prepass = plugin?.prepass;
  const id = this.resourcePath;
  if (prepass === undefined || plugin === undefined) {
    callback(null, source);
    return;
  }
  if (!shouldTransformModule(id)) {
    callback(null, source);
    return;
  }
  try {
    const result = transformSource({
      code: source,
      id,
      registry: prepass.registry,
      consolidationVerdicts: plugin.consolidate
        ? prepass.consolidationVerdicts
        : undefined,
      quoteOrder: prepass.naming?.order,
    });
    if (result === null) {
      callback(null, source);
      return;
    }
    for (const warning of result.warnings) {
      this.emitWarning(new Error(warning.message));
    }
    plugin.trackModule(result.code !== source, result.warnings);
    if (result.code === source) {
      callback(null, source);
      return;
    }
    callback(null, result.code, JSON.parse(result.map.toString()));
  } catch (cause) {
    callback(cause instanceof Error ? cause : new Error(String(cause)));
  }
}
