import React, { useState, useEffect } from "react";
import ImagePreview from "./ImagePreview";
import api from "../services/api";

const FormNewAdmin = () => {
  const [surnom, setSurnom] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [image, setImage] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false); // Vérifie si l'utilisateur est super admin

  useEffect(() => {
    const checkSuperAdmin = async () => {
      try {
        const response = await api.get("/users/me");
        if (response.data.GradeID === 1) {
          setIsSuperAdmin(true);
        }
      } catch (error) {
        console.error("Failed to verify super admin:", error);
      }
    };

    checkSuperAdmin();
  }, []);

  const validatePassword = (password) => {
    const minLength = 8;
    const maxLength = 20;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    return (
      password.length >= minLength &&
      password.length <= maxLength &&
      hasUpperCase &&
      hasLowerCase &&
      hasNumber &&
      hasSpecialChar
    );
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();

    if (!validatePassword(motDePasse)) {
      setErrorMessage(
        "Le mot de passe doit contenir entre 8 et 20 caractères, inclure une majuscule, une minuscule, un chiffre et un caractère spécial."
      );
      return;
    }

    try {
      const formData = new FormData();
      formData.append("surnom", surnom);
      formData.append("email", email);
      formData.append("motDePasse", motDePasse);
      if (image) formData.append("image", image);

      const response = await api.post("/users/admin/register", formData);
      console.log("Admin created successfully:", response.data);
      setErrorMessage("");
      setSurnom("");
      setEmail("");
      setMotDePasse("");
      setImage(null);
    } catch (error) {
      setErrorMessage(
        error.response?.data?.error || "Une erreur inattendue est survenue."
      );
    }
  };

  if (!isSuperAdmin) {
    return (
      <section className="mx-auto my-8 max-w-2xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
        <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
          <h2 className="text-xl font-black text-slate-950 dark:text-white">Création d'administrateur</h2>
        </div>
        <div className="px-6 py-8 text-center">
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            <span className="font-bold text-sky-600 dark:text-sky-300">Accès interdit :</span><br />
            cette section est réservée au super administrateur.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto my-8 max-w-4xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
      <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
        <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Administration</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Créer un administrateur</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          Ajoute un compte administrateur avec une photo de profil optionnelle.
        </p>
      </div>

      <div className="relative px-6 py-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.10),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />
        <div className="relative">
        {errorMessage && (
          <div className="mb-5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">
            {errorMessage}
          </div>
        )}
        <form onSubmit={handleCreateAdmin} className="grid gap-5 lg:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">Surnom</label>
            <input
              type="text"
              className="w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white"
              value={surnom}
              onChange={(e) => setSurnom(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">Email</label>
            <input
              type="email"
              className="w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">Mot de passe</label>
            <input
              type="password"
              className="w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              required
            />
            <small className="mt-2 block text-xs leading-5 text-slate-500 dark:text-slate-400">
              Le mot de passe doit contenir entre 8 et 20 caractères, inclure une
              majuscule, une minuscule, un chiffre et un caractère spécial.
            </small>
          </div>
          <div className="lg:col-span-2">
            <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">Photo de profil</label>
            <div className="rounded-xl border border-sky-500/10 bg-white/60 p-4 dark:bg-slate-950/40">
              <ImagePreview onImageSelect={setImage} />
            </div>
          </div>
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 dark:text-white lg:col-span-2"
          >
            Créer
          </button>
        </form>
      </div>
      </div>
    </section>
  );
};

export default FormNewAdmin;
