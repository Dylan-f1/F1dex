/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Un package-lock.json traîne dans le dossier utilisateur : on fixe la racine du projet.
  turbopack: {
    root: import.meta.dirname,
  },
}

export default nextConfig
