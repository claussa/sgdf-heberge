import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Chaque fichier d'intégration démarre son conteneur Postgres + `prisma db push` :
    // en parallèle (6 fichiers), les démarrages se marchent dessus (timeouts de beforeAll).
    // Séquentiel = déterministe, en local comme en CI.
    fileParallelism: false,
  },
})
