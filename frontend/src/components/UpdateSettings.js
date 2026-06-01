import React, { useState, useEffect } from "react";
import axios from "axios";
import ImagePreview from "./ImagePreview";
import Notification from "./Notification";

const UpdateSettings = () => {
  const [user, setUser] = useState({});
  const [surnom, setSurnom] = useState("");
  const [email, setEmail] = useState("");
  const [image, setImage] = useState(null);
  const [removeImage, setRemoveImage] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // 🔐 Modal de mot de passe
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // ⏳ état d’envoi
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 🔔 Notification globale
  const [notification, setNotification] = useState(null); // { message, type }

  const apiBaseUrl = process.env.REACT_APP_URL_LOCAL;

  const defaultImage = "https://via.placeholder.com/150?text=Default+Profile";

  const submitWithPassword = async () => {
    if (!passwordConfirmation) {
      setPasswordError("Le mot de passe est requis pour appliquer les modifications.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    const formData = new FormData();
    formData.append("surnom", surnom);
    formData.append("email", email);
    formData.append("currentPassword", passwordConfirmation);

    // Si l'utilisateur change son mot de passe
    if (newPassword || confirmPassword) {
      const passwordData = JSON.stringify({
        oldPassword: passwordConfirmation, // le MDP tapé dans le modal
        newPassword,
        confirmPassword,
      });
      formData.append("motDePasse", passwordData);
    }

    // Gérer l'image : suppression ou remplacement
    if (removeImage) {
      formData.append("removeImage", true);
    } else if (image && typeof image !== "string") {
      formData.append("image", image);
    }

    try {
      const response = await axios.put("/api/users/update", formData, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "multipart/form-data",
        },
      });

      setSuccessMessage("Les paramètres ont été mis à jour avec succès.");
      setErrorMessage("");
      setIsPasswordModalOpen(false);

      // 🟢 Notification
      setNotification({
        message: "Paramètres mis à jour avec succès.",
        type: "success",
      });

      if (response.data.user.CheminImage) {
        setImage(`${apiBaseUrl}${response.data.user.CheminImage}`);
        setRemoveImage(false);
      } else {
        setImage(null);
      }
    } catch (error) {
      const status = error.response?.status;
      const data = error.response?.data || {};

      // 🔒 Cas 429 : lock 15min → on déconnecte
      if (status === 429) {
        setNotification({
          message:
            data.error ||
            "Trop de tentatives de vérification du mot de passe. Tu as été déconnecté pour 15 minutes.",
          type: "warning",
        });

        // Déconnexion forcée côté front
        localStorage.removeItem("token");
        setTimeout(() => {
          window.location.href = "/login";
        }, 1500);

        setIsPasswordModalOpen(false);
        setIsSubmitting(false);
        return;
      }

      // ❌ MDP incorrect ou autre erreur
      if (status === 401) {
        const attemptsRemaining = data.attemptsRemaining;
        let msg = data.error || "Mot de passe incorrect.";

        if (typeof attemptsRemaining === "number") {
          msg += ` Il te reste ${attemptsRemaining} tentative(s) avant le blocage.`;
        }

        setPasswordError(msg);
      } else {
        setErrorMessage(data.error || "Une erreur est survenue");
      }

      // 🔴 Notification d'erreur globale
      setNotification({
        message: data.error || "Impossible de mettre à jour les paramètres.",
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await axios.get("/api/users/me", {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        setUser(response.data);
        setSurnom(response.data.Surnom);
        setEmail(response.data.Email);

        // Si l'utilisateur a une image, utiliser son URL, sinon une image par défaut
        setImage(response.data.CheminImage ? `${apiBaseUrl}${response.data.CheminImage}` : null);
      } catch (error) {
        console.error("Failed to fetch user data:", error);
      }
    };

    fetchUser();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();

    // On prépare les données mais on n'envoie pas encore :
    setPasswordError("");
    setPasswordConfirmation("");
    setIsPasswordModalOpen(true);
  };


  const handleImageSelect = (selectedImage) => {
    setImage(selectedImage);
    setRemoveImage(false); // Désactiver la suppression si une nouvelle image est sélectionnée
  };

  const handleRemoveImage = (e) => {
    const isChecked = e.target.checked;
    setRemoveImage(isChecked);
    if (isChecked) {
      setImage(null); // Réinitialise l'image si "Supprimer" est coché
    }
  };

  return (
    <>
        {errorMessage && <p className="text-red-500 mb-4">{errorMessage}</p>}
        {successMessage && <p className="text-green-500 mb-4">{successMessage}</p>}
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 text-black dark:text-gray-200">

          <div>
            <div className="mb-4">
              <label className="block">Surnom</label>
              <input
                type="text"
                className="w-full px-3 py-2 border hover:border-sky-600 border-sky-500 bg-white dark:bg-black rounded"
                value={surnom}
                onChange={(e) => setSurnom(e.target.value)}
              />
            </div>
            <div className="mb-4">
              <label className="block">Email</label>
              <input
                type="email"
                className="w-full px-3 py-2 border hover:border-sky-600 border-sky-500 bg-white dark:bg-black rounded"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="mb-4">
              <label className="block">Nouveau mot de passe</label>
              <input
                type="password"
                className="w-full px-3 py-2 border hover:border-sky-600 border-sky-500 bg-white dark:bg-black rounded"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="mb-4">
              <label className="block">Confirmer le nouveau mot de passe</label>
              <input
                type="password"
                className="w-full px-3 py-2 border hover:border-sky-600 border-sky-500 bg-white dark:bg-black rounded"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="mb-4">
              <label>Photo de profil</label>
              <ImagePreview
                initialImage={image}
                onImageSelect={handleImageSelect}
              />
            </div>
            <div className="flex gap-3 mb-4">
              <div className="flex h-6 shrink-0 items-center">
                <div className="group grid size-4 grid-cols-1">
                  <input id="removeImage" name="removeImage" type="checkbox" className="col-start-1 row-start-1 appearance-none rounded border border-gray-300 bg-white checked:border-sky-600 checked:bg-gradient-to-r from-sky-800 to-sky-700 indeterminate:border-sky-600 indeterminate:bg-gradient-to-r from-sky-800 to-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:border-gray-300 disabled:bg-gray-100 disabled:checked:bg-gray-100 forced-colors:appearance-auto"
                    checked={removeImage}
                    onChange={handleRemoveImage} />
                  <svg className="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white group-has-[:disabled]:stroke-gray-950/25" viewBox="0 0 14 14" fill="none">
                    <path className="opacity-0 group-has-[:checked]:opacity-100" d="M3 8L6 11L11 3.5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    <path className="opacity-0 group-has-[:indeterminate]:opacity-100" d="M3 7H11" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </div>
              </div>
              <div>
                <label for="removeImage">Supprimer l'image de profil</label>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-sky-800 to-sky-700 hover:from-sky-900 hover:to-sky-950 dark:text-white py-2 rounded"
          >
            Sauvegarder
          </button>
        </form>
        
      {/* 🔐 Modal de confirmation par mot de passe */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 bg-black/30 dark:bg-white/10 backdrop-blur-md flex justify-center items-center z-50">
          <div className="p-6 bg-blue-50 dark:bg-slate-950 rounded-xl shadow-lg border border-slate-800 text-black dark:text-white">
            <h3 className="text-xl font-bold mb-4">Confirmer les modifications</h3>
            <p className="text-sm text-gray-800 dark:text-gray-300 mb-4">
              Pour modifier tes paramètres, merci de saisir ton mot de passe actuel.
            </p>

            <input
              type="password"
              className="w-full px-3 py-2 border hover:border-sky-600 border-sky-500 bg-white dark:bg-black rounded mb-2"
              placeholder="Mot de passe actuel"
              value={passwordConfirmation}
              onChange={(e) => setPasswordConfirmation(e.target.value)}
            />

            {passwordError && (
              <p className="text-red-500 text-sm mb-2">{passwordError}</p>
            )}

            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={() => {
                  setIsPasswordModalOpen(false);
                  setPasswordConfirmation("");
                  setPasswordError("");
                }}
                className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-md"
                disabled={isSubmitting}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={submitWithPassword}
                className="bg-sky-700 hover:bg-sky-800 px-4 py-2 rounded-md font-semibold"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Validation..." : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔔 Notification globale */}
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          duration={5000}
          onClose={() => setNotification(null)}
        />
      )}

    </>
  );
};

export default UpdateSettings;