/**
 * `import.meta.main` existe dans Bun et dans Node ≥ 22 sans flag, mais les
 * types de `@types/node` ne le déclarent pas pour un fichier compilé en ESM
 * par tsc. On le déclare ici, une fois, plutôt que dans chaque script.
 */

interface ImportMeta {
  /** true quand le fichier est exécuté directement, pas importé. */
  main: boolean;
}
