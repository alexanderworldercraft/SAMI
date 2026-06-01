import React, { useState } from "react";
import axios from "axios";
import Notification from "./Notification";


const DeleteAccount = () => {
  const [showFirstModal, setShowFirstModal] = useState(false);
  const [showSecondModal, setShowSecondModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // 🔐 Modal MDP
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // 🔔 Notification globale
  const [notification, setNotification] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);


    const handleDelete = async () => {
    console.log("handleDelete called");
    setIsSubmitting(true);
    setPasswordError("");
    setErrorMessage("");

    try {
      const response = await axios.put(
        `${process.env.REACT_APP_URL_LOCAL}/api/users/delete-account`,
        { currentPassword: password }, // 🔐 on envoie le MDP
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );
      console.log("Request sent to backend");

      setNotification({
        message: response.data.message || "Compte supprimé avec succès.",
        type: "success",
      });

      // Déconnexion après suppression
      localStorage.removeItem("token");
      setTimeout(() => {
        window.location.href = "/login";
      }, 1500);
    } catch (error) {
      console.error("Failed to delete account:", error);
      const status = error.response?.status;
      const data = error.response?.data || {};

      if (status === 429) {
        // Lock 15 minutes
        setNotification({
          message:
            data.error ||
            "Trop de tentatives de vérification du mot de passe. Tu as été déconnecté pour 15 minutes.",
          type: "warning",
        });

        localStorage.removeItem("token");
        setTimeout(() => {
          window.location.href = "/login";
        }, 1500);
      } else if (status === 401) {
        let msg = data.error || "Mot de passe incorrect.";
        if (typeof data.attemptsRemaining === "number") {
          msg += ` Il te reste ${data.attemptsRemaining} tentative(s) avant le blocage.`;
        }
        setPasswordError(msg);
      } else {
        setErrorMessage("Une erreur est survenue lors de la suppression du compte.");
        setNotification({
          message: data.error || "Impossible de supprimer le compte.",
          type: "error",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="flex items-center justify-center h-full">
      <div className="dark:text-white p-8 w-96">
        <p className="text-gray-400 mb-4">
          Vous pouvez supprimer votre compte définitivement. Cette action est irréversible.
        </p>
        {errorMessage && <p className="text-red-500">{errorMessage}</p>}
        <button
          onClick={() => setShowFirstModal(true)}
          className="bg-red-600 hover:bg-red-700 dark:text-white px-4 py-2 rounded font-bold"
        >
          Supprimer mon compte
        </button>

        {/* Premier modal */}
        {showFirstModal && (
          <div className="fixed inset-0 bg-black/30 dark:bg-white/10 backdrop-blur-md flex justify-center items-center z-50">
            <div className="p-6 bg-blue-50 dark:bg-slate-950 rounded-xl shadow-lg border border-slate-800 text-black dark:text-white">
              <h3 className="text-xl font-bold mb-4">Confirmer la suppression</h3>
              <p>Êtes-vous sûr de vouloir supprimer votre compte ?</p>
              <div className="flex justify-end gap-4 mt-6">
                <button
                  onClick={() => setShowFirstModal(false)}
                  className="bg-gray-600 hover:bg-gray-700 dark:text-white px-4 py-2 rounded-md"
                >
                  Annuler
                </button>
                <button
                  onClick={() => {
                    setShowFirstModal(false);
                    setShowSecondModal(true);
                  }}
                  className="bg-red-600 hover:bg-red-700 dark:text-white font-bold px-4 py-2 rounded-md"
                >
                  Oui, je veux supprimer mon compte
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Second modal */}
        {showSecondModal && (
          <div className="fixed inset-0 bg-black/30 dark:bg-white/10 backdrop-blur-md flex justify-center items-center z-50">
            <div className="p-6 bg-blue-50 dark:bg-slate-950 rounded-xl shadow-lg border border-slate-800 text-black dark:text-white">
              <h3 className="text-xl font-bold mb-4">Action irréversible</h3>
              <p>
                En confirmant, votre compte et vos données personnelles seront
                définitivement supprimés.
              </p>
              <div className="flex justify-end gap-4 mt-6">
                <button
                  onClick={() => setShowSecondModal(false)}
                  className="bg-gray-600 hover:bg-gray-700 dark:text-white px-4 py-2 rounded"
                >
                  Annuler
                </button>
                <button
                  onClick={() => {
                    setShowSecondModal(false);
                    setPassword("");
                    setPasswordError("");
                    setShowPasswordModal(true);
                  }}
                  className="bg-red-600 hover:bg-red-700 font-bold dark:text-white px-4 py-2 rounded"
                >
                  Oui, j'accepte de perdre mes données
                </button>

              </div>
            </div>
          </div>
        )}
                {/* 🔐 Modal de saisie du mot de passe */}
        {showPasswordModal && (
          <div className="fixed inset-0 bg-black/30 dark:bg-white/10 backdrop-blur-md flex justify-center items-center z-50">
            <div className="p-6 bg-blue-50 dark:bg-slate-950 rounded-xl shadow-lg border border-slate-800 text-black dark:text-white">
              <h3 className="text-xl font-bold mb-4">Confirmer la suppression</h3>
              <p className="text-sm text-gray-300 mb-4">
                Saisis ton mot de passe pour confirmer la suppression définitive de ton compte.
              </p>
              <input
                type="password"
                className="w-full px-3 py-2 border hover:border-sky-600 border-sky-500 bg-black rounded mb-2"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
              />
              {passwordError && (
                <p className="text-red-500 text-sm mb-2">{passwordError}</p>
              )}
              <div className="flex justify-end gap-4 mt-4">
                <button
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPassword("");
                    setPasswordError("");
                  }}
                  className="bg-gray-600 hover:bg-gray-700 dark:text-white px-4 py-2 rounded"
                  disabled={isSubmitting}
                >
                  Annuler
                </button>
                <button
                  onClick={handleDelete}
                  className="bg-red-600 hover:bg-red-700 font-bold dark:text-white px-4 py-2 rounded"
                  disabled={isSubmitting || !password}
                >
                  {isSubmitting ? "Suppression..." : "Confirmer"}
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

      </div>
    </div>
  );
};

export default DeleteAccount;
