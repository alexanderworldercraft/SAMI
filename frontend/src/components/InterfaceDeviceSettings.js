import React, { useState } from "react";
import { useInterfacePreference } from "../context/InterfacePreferenceContext";
import { DEVICE_TYPES, INTERFACE_MODES } from "../utils/interfaceDevice";
import { InterfaceDialog, InterfaceDeviceFields, interfaceButtonClass } from "./InterfaceDeviceDialog";

const formatDate = (date) => date ? new Date(date).toLocaleString("fr-FR") : "—";

export default function InterfaceDeviceSettings() {
  const context = useInterfacePreference();
  const [confirmation, setConfirmation] = useState(null);
  const [editing, setEditing] = useState(null);
  if (!context) return null;
  const { state, currentDevice, detected, mode, loading, error, notice, updateConsent, register, updateDevice, removeDevice, refresh } = context;
  const perform = async (operation) => {
    try { await operation(); setConfirmation(null); setEditing(null); } catch (_) { /* Erreur exposée par le contexte. */ }
  };
  return <section className="mt-6 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-5 text-slate-900 dark:text-white" aria-labelledby="interface-settings-title">
    <h2 id="interface-settings-title" className="text-lg font-black">Interface et appareils</h2>
    <p className="mt-2 text-sm">Interface actuelle : {INTERFACE_MODES[mode]}{currentDevice ? ` · ${currentDevice.Nom}` : " · détection automatique"}. Le mode remote sera utilisé par la future interface TV.</p>
    <p className="mt-2 text-sm">Autorisez l'enregistrement par compte pour retrouver le choix de chaque appareil. La désactivation supprime tous vos appareils enregistrés.</p>
    <button type="button" role="switch" aria-label="Enregistrer mes appareils et leur interface" aria-checked={state?.accepted === true} disabled={loading || !state} className={`${interfaceButtonClass} mt-4`} onClick={() => state.accepted ? setConfirmation({ type: "disable" }) : perform(() => updateConsent(true))}>
      Enregistrement des appareils : {state?.accepted === true ? "activé" : "désactivé"}
    </button>
    {state?.accepted === null && <p className="mt-2 text-sm">Vous n'avez pas encore répondu. Aucun appareil n'est enregistré.</p>}
    {!state && !loading && <button className={`${interfaceButtonClass} ml-3`} onClick={refresh}>Réessayer</button>}
    {state?.accepted === true && <>
      {!currentDevice && <button className={`${interfaceButtonClass} mt-3 sm:ml-3`} disabled={loading} onClick={() => setEditing({ id: null, draft: { ...detected } })}>Enregistrer cet appareil</button>}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="mb-3 text-left font-bold">Vos appareils enregistrés</caption>
          <thead><tr>{["Nom", "Type", "Interface", "Création", "Modification", "Dernière utilisation", "Actions"].map((title) => <th key={title} scope="col" className="whitespace-nowrap p-2">{title}</th>)}</tr></thead>
          <tbody>{state.devices.map((device) => <tr key={device.UserDeviceID} className="border-t border-slate-400/20">
            <td className="p-2">{device.Nom}{device.UserDeviceID === currentDevice?.UserDeviceID && <span className="block text-xs text-sky-700 dark:text-sky-300">Cet appareil</span>}</td>
            <td className="p-2">{DEVICE_TYPES[device.Type]}</td><td className="p-2">{INTERFACE_MODES[device.InterfaceMode]}</td>
            <td className="whitespace-nowrap p-2">{formatDate(device.CreateDate)}</td><td className="whitespace-nowrap p-2">{formatDate(device.UpdateDate)}</td><td className="whitespace-nowrap p-2">{formatDate(device.LastUsedDate)}</td>
            <td className="p-2"><div className="flex gap-2"><button disabled={loading} className={interfaceButtonClass} aria-label={`Modifier ${device.Nom}`} onClick={() => setEditing({ id: device.UserDeviceID, draft: { Nom: device.Nom, Type: device.Type, InterfaceMode: device.InterfaceMode } })}>Modifier</button><button disabled={loading} className={interfaceButtonClass} aria-label={`Supprimer ${device.Nom}`} onClick={() => setConfirmation({ type: "remove", device })}>Supprimer</button></div></td>
          </tr>)}</tbody>
        </table>
        {!state.devices.length && <p className="mt-3 text-sm">Aucun appareil enregistré.</p>}
      </div>
      <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">Un appareil correspond à un navigateur. Les dates sont renseignées automatiquement par SAMI.</p>
    </>}
    {error && <p role="alert" className="mt-3 text-red-700 dark:text-red-300">{error}</p>}
    {notice && <p role="status" className="mt-3">{notice}</p>}
    {confirmation && <InterfaceDialog title={confirmation.type === "disable" ? "Désactiver l'enregistrement ?" : "Supprimer cet appareil ?"} onClose={() => { if (!loading) setConfirmation(null); }}>
      <p>{confirmation.type === "disable" ? "Tous les appareils enregistrés sur votre compte seront supprimés. La détection automatique continuera sans enregistrer d'appareil." : `${confirmation.device.Nom} sera supprimé. Une nouvelle proposition d'enregistrement sera présentée lors de sa prochaine utilisation.`}</p>
      {error && <p role="alert" className="mt-3 text-red-700 dark:text-red-300">{error}</p>}
      <div className="mt-5 flex gap-3"><button className={interfaceButtonClass} disabled={loading} onClick={() => perform(() => confirmation.type === "disable" ? updateConsent(false) : removeDevice(confirmation.device.UserDeviceID))}>Confirmer</button><button className={interfaceButtonClass} disabled={loading} onClick={() => setConfirmation(null)}>Annuler</button></div>
    </InterfaceDialog>}
    {editing && <InterfaceDialog title={editing.id ? "Modifier l'appareil" : "Enregistrer cet appareil"} onClose={() => { if (!loading) setEditing(null); }}>
      <form onSubmit={(event) => { event.preventDefault(); perform(() => editing.id ? updateDevice(editing.id, editing.draft) : register(editing.draft)); }}>
        <fieldset disabled={loading}><InterfaceDeviceFields prefix="settings-device" value={editing.draft} onChange={(draft) => setEditing({ ...editing, draft })} /></fieldset>
        {error && <p role="alert" className="mt-3 text-red-700 dark:text-red-300">{error}</p>}
        <div className="mt-5 flex gap-3"><button type="submit" disabled={loading} className={interfaceButtonClass}>Enregistrer</button><button type="button" disabled={loading} className={interfaceButtonClass} onClick={() => setEditing(null)}>Annuler</button></div>
      </form>
    </InterfaceDialog>}
  </section>;
}
