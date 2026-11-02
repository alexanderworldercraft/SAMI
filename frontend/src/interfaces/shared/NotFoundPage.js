import React from "react";
import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <main className="mx-auto grid min-h-screen max-w-2xl content-center gap-5 px-6 py-12 text-slate-900 dark:text-neutral-100">
      <p className="font-semibold text-sky-600 dark:text-sky-300">404</p>
      <h1 className="text-3xl font-bold">Page introuvable</h1>
      <p>Cette page n'existe pas ou n'est plus disponible.</p>
      <Link to="/" className="w-fit rounded-lg bg-sky-600 px-5 py-3 font-semibold text-white hover:bg-sky-500">Retour à l'accueil</Link>
    </main>
  );
}
