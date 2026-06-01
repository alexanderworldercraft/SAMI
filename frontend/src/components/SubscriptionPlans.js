import React, { useEffect, useState } from "react";
import api from "../services/api";

const plans = [
  {
    id: "FREE",
    title: "Gratuit",
    price: "0 €",
    description: "Accès standard.",
    highlight: false,
  },
  {
    id: "MONTHLY",
    title: "Premium mensuel",
    price: "10 € (fake)",
    description: "Accès premium pendant 1 mois.",
    highlight: false,
  },
  {
    id: "YEARLY",
    title: "Premium annuel",
    price: "100 € (fake)",
    description: "Accès premium pendant 1 an — 2 mois offerts (prix de 10 mois).",
    highlight: true,
  },
];

function formatDate(dateString) {
  if (!dateString) return null;
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const SubscriptionPlans = () => {
  const [user, setUser] = useState(null);          // Infos utilisateur
  const [loading, setLoading] = useState(true);    // Chargement initial
  const [saving, setSaving] = useState(false);     // État de sauvegarde
  const [error, setError] = useState(null);        // Message d'erreur
  const [success, setSuccess] = useState(null);    // Message de succès

  // Chargement des infos utilisateur (dont isPremium et PremiumEndDate)
  useEffect(() => {
    let isMounted = true;

    const fetchUser = async () => {
      try {
        setLoading(true);
        const response = await api.get("/users/me"); // /api/users/me
        if (!isMounted) return;
        setUser(response.data);
        setError(null);
      } catch (err) {
        console.error("Erreur lors du chargement du profil :", err);
        if (!isMounted) return;
        setError("Impossible de charger vos informations. Merci de réessayer.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchUser();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSelectPlan = async (planId) => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      // Appel à l’API pour changer de plan (fake)
      const response = await api.post("/users/premium", { plan: planId });

      // Mise à jour de l'état local user
      const { PremiumEndDate, isPremium } = response.data;

      setUser((prev) =>
        prev
          ? {
              ...prev,
              PremiumEndDate,
              isPremium,
            }
          : prev
      );

      setSuccess(response.data.message || "Abonnement mis à jour.");
    } catch (err) {
      console.error("Erreur lors de la mise à jour de l'abonnement :", err);
      const msg =
        err.response?.data?.error ||
        "Erreur lors de la mise à jour de l'abonnement.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const currentIsPremium = user?.isPremium;
  const premiumEndFormatted = user?.PremiumEndDate
    ? formatDate(user.PremiumEndDate)
    : null;

  return (
    <div className="space-y-6">
      {/* Statut actuel */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Statut de votre abonnement
        </h2>
        {loading ? (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Chargement de vos informations...
          </p>
        ) : error ? (
          <p className="mt-2 text-sm text-red-500">{error}</p>
        ) : currentIsPremium ? (
          <p className="mt-2 text-sm text-green-500">
            Vous êtes actuellement <span className="font-semibold">Premium</span>
            {premiumEndFormatted && (
              <> jusqu&apos;au <span className="font-semibold">{premiumEndFormatted}</span></>
            )}
            .
          </p>
        ) : (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Vous utilisez actuellement la formule <span className="font-semibold">gratuite</span>.
          </p>
        )}

        {success && (
          <p className="mt-2 text-sm text-emerald-500">{success}</p>
        )}
      </div>

      {/* Choix des formules */}
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Choisissez une formule (paiement factice pour tests)
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {plans.map((plan) => {
            // Déterminer si ce plan représente l'état actuel
            const isCurrentPlan =
              (plan.id === "FREE" && !currentIsPremium) ||
              (plan.id !== "FREE" && currentIsPremium);

            return (
              <div
                key={plan.id}
                className={[
                  "relative flex flex-col rounded-xl border p-4 shadow-sm transition",
                  "bg-white dark:bg-gray-900",
                  plan.highlight
                    ? "border-indigo-500 dark:border-indigo-400"
                    : "border-gray-200 dark:border-gray-700",
                  "hover:shadow-md",
                ].join(" ")}
              >
                {plan.highlight && (
                  <span className="absolute -top-2 right-3 rounded-full bg-indigo-500 px-2 py-0.5 text-xs font-semibold text-white">
                    Populaire
                  </span>
                )}

                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {plan.title}
                </h4>
                <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">
                  {plan.price}
                </p>
                <p className="mt-1 flex-1 text-sm text-gray-500 dark:text-gray-400">
                  {plan.description}
                </p>

                <button
                  type="button"
                  disabled={saving || isCurrentPlan}
                  onClick={() => handleSelectPlan(plan.id)}
                  className={[
                    "mt-3 inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition",
                    isCurrentPlan
                      ? "bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-300 cursor-default"
                      : "bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600",
                    saving && !isCurrentPlan ? "opacity-75 cursor-wait" : "",
                  ].join(" ")}
                >
                  {isCurrentPlan
                    ? "Formule actuelle"
                    : saving
                    ? "Mise à jour..."
                    : "Choisir cette formule"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Note explicite sur le fake */}
      <p className="text-xs text-gray-500 dark:text-gray-500">
        Cet écran utilise des paiements factices. Aucun vrai prélèvement n&apos;est effectué.
      </p>
    </div>
  );
};

export default SubscriptionPlans;