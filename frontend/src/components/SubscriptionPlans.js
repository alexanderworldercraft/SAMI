import React, { useEffect, useState } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import api from "../services/api";

const plans = [
  { id: "FREE", title: "Gratuit", price: "0 €", description: "Accès standard." },
  { id: "MONTHLY", title: "Premium mensuel", price: "10 € / mois", description: "Accès Premium avec renouvellement mensuel." },
  { id: "YEARLY", title: "Premium annuel", price: "100 € / an", description: "Accès Premium pendant un an — 2 mois offerts.", highlight: true },
];
const planName = (id) => plans.find(plan => plan.id === id)?.title || "Premium";
const formatDate = (value) => value ? new Date(value).toLocaleDateString("fr-FR", {
  year: "numeric", month: "long", day: "numeric",
}) : "";

export default function SubscriptionPlans() {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [dialogReady, setDialogReady] = useState(false);
  const [dialogError, setDialogError] = useState("");

  useEffect(() => {
    let mounted = true;
    api.get("/users/premium/subscription")
      .then(response => { if (mounted) setSubscription(response.data); })
      .catch(() => { if (mounted) setError("Impossible de charger votre abonnement. Merci de réessayer."); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const openConfirmation = async (plan) => {
    setSelectedPlan(plan);
    setDialogError("");
    setDialogLoading(true);
    setDialogReady(false);
    try {
      const response = await api.get("/users/premium/subscription");
      setSubscription(response.data);
      setDialogReady(true);
    } catch (_) {
      setDialogError("Impossible de vérifier votre abonnement et les contenus concernés. Réessayez.");
    } finally {
      setDialogLoading(false);
    }
  };

  const confirmPlan = async () => {
    setSaving(true);
    setDialogError("");
    setSuccess("");
    try {
      const response = await api.post("/users/premium/fake-checkout", { plan: selectedPlan });
      setSubscription(previous => ({ ...previous, ...response.data }));
      setSuccess(response.data.message || "Abonnement mis à jour.");
      setSelectedPlan(null);
    } catch (err) {
      setDialogError(err.response?.data?.error || "Impossible de modifier votre abonnement. Réessayez.");
    } finally {
      setSaving(false);
    }
  };

  const premium = Boolean(subscription?.isPremium);
  const currentPlan = subscription?.currentPlan || "FREE";
  const renewalPlan = subscription?.renewalPlan;
  const endDate = formatDate(subscription?.PremiumEndDate);
  const cancelScheduled = premium && !subscription?.autoRenew;
  const switched = premium && renewalPlan && renewalPlan !== currentPlan;
  const apiActive = Boolean(subscription?.apiActive);
  const freeChoice = selectedPlan === "FREE";
  const blocked = loading || saving || !subscription;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Statut de votre abonnement</h2>
        {loading ? <p className="mt-2">Chargement de votre abonnement...</p> : error ? (
          <p role="alert" className="mt-2 text-red-600 dark:text-red-400">{error}</p>
        ) : (
          <div className="mt-2 space-y-2 text-sm text-gray-700 dark:text-gray-200">
            <p>Formule actuelle : <strong>{planName(currentPlan)}</strong>{premium && <> jusqu’au <strong>{endDate}</strong></>}.</p>
            {premium && subscription.autoRenew && !switched && <p>Renouvellement automatique {currentPlan === "YEARLY" ? "annuel" : "mensuel"} le {endDate}.</p>}
            {switched && <p>Passage à la formule <strong>{planName(renewalPlan)}</strong> au renouvellement le {endDate}. Votre période en cours reste inchangée.</p>}
            {cancelScheduled && <p>Renouvellement arrêté. Votre accès Premium reste disponible jusqu’au {endDate}, puis votre compte passera à la formule gratuite.</p>}
            {!premium && subscription?.autoRenew && !apiActive && <p>Renouvellement suspendu tant que l’API des abonnements est désactivée.</p>}
          </div>
        )}
        {success && <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{success}</p>}
      </div>

      {subscription && !apiActive && (
        <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100">
          Les souscriptions, changements de formule payante et renouvellements sont temporairement désactivés. Vos droits acquis sont conservés et vous pouvez toujours arrêter le renouvellement.
        </p>
      )}
      <div>
        <h3 className="mb-3 text-base font-semibold text-gray-900 dark:text-gray-100">Choisissez une formule</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {plans.map(plan => {
            const current = plan.id === currentPlan;
            const scheduled = premium && plan.id === renewalPlan && !current;
            const freeScheduled = plan.id === "FREE" && cancelScheduled;
            const alreadySelected = current && (plan.id === "FREE" || renewalPlan === currentPlan);
            const disabled = blocked || scheduled || freeScheduled || alreadySelected || (plan.id !== "FREE" && !apiActive);
            let label = "Choisir cette formule";
            if (alreadySelected) label = "Formule actuelle";
            else if (scheduled) label = "Prévue au renouvellement";
            else if (freeScheduled) label = "Passage au gratuit programmé";
            else if (current && cancelScheduled) label = "Réactiver le renouvellement";
            else if (current && switched) label = "Conserver cette formule";
            return (
              <div key={plan.id} className={`relative flex flex-col rounded-xl border bg-white p-4 shadow-sm dark:bg-gray-900 ${plan.highlight ? "border-indigo-500" : "border-gray-200 dark:border-gray-700"}`}>
                {plan.highlight && <span className="absolute -top-2 right-3 rounded-full bg-indigo-500 px-2 py-0.5 text-xs font-semibold text-white">Populaire</span>}
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{plan.title}</h4>
                {current && premium && <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">Abonnement actuel</p>}
                <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{plan.price}</p>
                <p className="mt-1 flex-1 text-sm text-gray-500 dark:text-gray-400">{plan.description}</p>
                <button type="button" disabled={disabled} onClick={() => openConfirmation(plan.id)}
                  aria-label={`${label} : ${plan.title}`}
                  className="mt-3 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-default disabled:bg-gray-200 disabled:text-gray-600 dark:disabled:bg-gray-800 dark:disabled:text-gray-300">
                  {label}
                </button>
                {current && premium && (
                  <button type="button" disabled={blocked || cancelScheduled} onClick={() => openConfirmation("FREE")}
                    className="mt-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800">
                    {cancelScheduled ? "Renouvellement arrêté" : "Passer au gratuit à l’échéance"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">Les paiements et renouvellements sont factices. Aucun prélèvement réel n’est effectué.</p>

      <Dialog open={selectedPlan !== null} onClose={() => { if (!saving) setSelectedPlan(null); }} className="relative z-[200]">
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
          <DialogPanel className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-950">
            <DialogTitle className="text-xl font-bold text-gray-900 dark:text-white">
              {freeChoice ? "Confirmer le passage au gratuit" : `Confirmer la formule ${planName(selectedPlan)}`}
            </DialogTitle>
            {dialogLoading ? <p className="mt-4">Vérification de votre abonnement...</p> : (
              <div className="mt-4 space-y-3 text-sm leading-6 text-gray-700 dark:text-gray-200">
                {freeChoice ? <>
                  <p>Le renouvellement automatique sera arrêté. Vous conservez tout votre temps d’abonnement et votre accès Premium jusqu’au <strong>{endDate}</strong>.</p>
                  {subscription?.contentLoss?.adminAccessPreserved ? (
                    <p>Votre grade administrateur conserve l’accès aux contenus Premium après cette date.</p>
                  ) : subscription?.contentLoss && (
                    <p className="rounded-lg bg-amber-500/10 p-3 font-semibold">
                      À la fin du temps restant, {subscription.contentLoss.films} films et les contenus Premium de {subscription.contentLoss.series} séries ne vous seront plus accessibles. Ce décompte correspond au catalogue actuel.
                    </p>
                  )}
                </> : <>
                  <p>Vous choisissez <strong>{planName(selectedPlan)}</strong> à <strong>{plans.find(plan => plan.id === selectedPlan)?.price}</strong>, avec renouvellement automatique.</p>
                  {premium ? <p>Cette formule s’appliquera au renouvellement, le <strong>{endDate}</strong>. Aucun temps ne sera ajouté aujourd’hui ; votre formule et votre date de fin actuelles sont conservées jusque-là.</p>
                    : <p>Votre abonnement commencera dès la confirmation.</p>}
                  <p>Le paiement est simulé : aucun prélèvement réel ne sera effectué.</p>
                  {!apiActive && <p>Les souscriptions sont actuellement désactivées.</p>}
                </>}
              </div>
            )}
            {dialogError && <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">{dialogError}</p>}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" autoFocus disabled={saving} onClick={() => setSelectedPlan(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600 dark:text-gray-100">Annuler</button>
              <button type="button" disabled={saving || dialogLoading || !dialogReady || (!freeChoice && !apiActive)} onClick={confirmPlan}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? "Enregistrement..." : "Confirmer"}
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}
