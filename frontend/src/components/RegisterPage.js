import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
//import ImagePreview from "./ImagePreview";

const RegisterPage = () => {
  const [surnom, setSurnom] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [image, setImage] = useState(null); // Stocke l'image sélectionnée
  const [errorMessage, setErrorMessage] = useState(""); // Message d'erreur
  const navigate = useNavigate();

  const validatePassword = (password) => {
    const minLength = 8;
    const maxLength = 20;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (
      password.length < minLength ||
      password.length > maxLength ||
      !hasUpperCase ||
      !hasLowerCase ||
      !hasNumber ||
      !hasSpecialChar
    ) {
      return false;
    }
    return true;
  };

  const handleRegister = async (e) => {
    e.preventDefault();

    // Valider le mot de passe
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

      const apiBaseUrl = process.env.REACT_APP_URL_LOCAL;

      const response = await axios.post(
        `${apiBaseUrl}/api/users/register`,
        formData
      );
      console.log("Registration successful!"); //console.log("Registration successful:", response.data);
      navigate("/login");
    } catch (error) {
      if (error.response && error.response.data.error) {
        setErrorMessage(error.response.data.error);
      } else {
        setErrorMessage(
          "Une erreur inattendue est survenue. Veuillez réessayer."
        );
      }
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-white p-8 rounded w-96">
        <h2 className="text-2xl font-bold mb-6">Inscription</h2>
        {errorMessage && (
          <div className="mb-4 p-3 text-red-700 bg-red-100 rounded">
            {errorMessage}
          </div>
        )}
        <form onSubmit={handleRegister}>
          <div className="mb-4">
            <label className="block text-gray-200">Surnom</label>
            <input
              type="text"
              className="w-full px-3 py-2 border hover:border-sky-700 border-sky-600 bg-black rounded"
              value={surnom}
              onChange={(e) => setSurnom(e.target.value)}
              required
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-200">Email</label>
            <input
              type="email"
              className="w-full px-3 py-2 border hover:border-sky-700 border-sky-600 bg-black rounded"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-200">Mot de Passe</label>
            <input
              type="password"
              className="w-full px-3 py-2 border hover:border-sky-700 border-sky-600 bg-black rounded"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              required
            />
            <small className="text-xs text-gray-400">Le mot de passe doit contenir entre 8 et 20 caractères, inclure une majuscule, une minuscule, un chiffre et un caractère spécial.</small>
          </div>
          {/* <div className="mb-4">
            <label className="block text-gray-200">Photo de Profil</label>
            <ImagePreview onImageSelect={setImage} />
          </div> */}
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-sky-800 to-sky-700 hover:from-sky-900 hover:to-sky-950 text-white py-2 rounded font-bold"
          >
            S'inscrire
          </button>
        </form>
        <p className="mt-4 text-center">
          Vous avez déjà un compte ?{" "}
          <a href="/login" className="text-sky-600 hover:text-sky-700">
            Se connecter
          </a>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;