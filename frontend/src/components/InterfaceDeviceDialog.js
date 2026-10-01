import React, { useState } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { DEVICE_TYPES, INTERFACE_MODES } from "../utils/interfaceDevice";

export const interfaceButtonClass = "rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm font-bold text-slate-900 hover:bg-sky-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50 dark:text-white";
const inputClass = "mt-1 w-full rounded-lg border border-slate-400/40 bg-white p-2 text-slate-900 dark:bg-slate-900 dark:text-white";

export function InterfaceDeviceFields({ value, onChange, prefix = "device" }) {
  const change = (field, next) => onChange({ ...value, [field]: next });
  return <div className="grid gap-3 sm:grid-cols-3">
    <label htmlFor={`${prefix}-name`}>Nom de l'appareil<input id={`${prefix}-name`} className={inputClass} value={value.Nom} maxLength={100} required onChange={(e) => change("Nom", e.target.value)} /></label>
    <label htmlFor={`${prefix}-type`}>Type<select id={`${prefix}-type`} className={inputClass} value={value.Type} onChange={(e) => change("Type", e.target.value)}>{Object.entries(DEVICE_TYPES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    <label htmlFor={`${prefix}-mode`}>Interface<select id={`${prefix}-mode`} className={inputClass} value={value.InterfaceMode} onChange={(e) => change("InterfaceMode", e.target.value)}>{Object.entries(INTERFACE_MODES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
  </div>;
}

export function InterfaceDialog({ title, children, onClose }) {
  return <Dialog open onClose={onClose} className="relative z-[190]">
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm" aria-hidden="true" />
    <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
      <DialogPanel className="my-auto w-full max-w-2xl rounded-2xl border border-sky-400/30 bg-white p-6 text-slate-900 shadow-2xl dark:bg-slate-950 dark:text-white">
        <DialogTitle className="mb-4 text-xl font-black">{title}</DialogTitle>
        {children}
      </DialogPanel>
    </div>
  </Dialog>;
}

export default function InterfaceDeviceDialog({ consent, detected, loading, error, onConsent, onRegister, onDismiss }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(detected);
  const perform = (operation) => operation().catch(() => {});
  const close = () => { if (!loading) onDismiss(); };
  return <InterfaceDialog title={consent ? "Mémoriser l'interface de vos appareils ?" : "Quelle interface pour cet appareil ?"} onClose={close}>
    {consent ? <>
      <p>Autorisez-vous SAMI à enregistrer vos appareils et leur interface sur votre compte ? Ce choix s'applique à tous vos appareils.</p>
      <p className="mt-3">Détection actuelle : {DEVICE_TYPES[detected.Type]} · {INTERFACE_MODES[detected.InterfaceMode]}. Sans réponse ou en cas de refus, seule la détection automatique est utilisée, sans enregistrer l'appareil.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button className={interfaceButtonClass} disabled={loading} onClick={() => perform(() => onConsent(true))}>Oui, j'accepte</button>
        <button className={interfaceButtonClass} disabled={loading} onClick={() => perform(() => onConsent(false))}>Non, je refuse</button>
        <button className={interfaceButtonClass} disabled={loading} onClick={close}>Plus tard</button>
      </div>
    </> : <>
      <p className="mb-4">Détection proposée : {DEVICE_TYPES[detected.Type]} · {INTERFACE_MODES[detected.InterfaceMode]}. Vous pouvez choisir une autre interface, par exemple remote pour un ordinateur branché à une TV.</p>
      <form onSubmit={(e) => { e.preventDefault(); perform(() => onRegister(editing ? draft : detected)); }}>
        {editing && <fieldset disabled={loading}><InterfaceDeviceFields value={draft} onChange={setDraft} /></fieldset>}
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="submit" className={interfaceButtonClass} disabled={loading}>{editing ? "Enregistrer" : "Cela correspond, enregistrer"}</button>
          {!editing && <button type="button" className={interfaceButtonClass} disabled={loading} onClick={() => setEditing(true)}>À modifier</button>}
          <button type="button" className={interfaceButtonClass} disabled={loading} onClick={close}>Ne pas enregistrer</button>
        </div>
      </form>
    </>}
    {error && <p role="alert" className="mt-4 text-red-700 dark:text-red-300">{error}</p>}
    <p className="mt-5 text-sm text-slate-600 dark:text-slate-400">Vous pourrez changer ce choix et gérer vos appareils dans Paramètres. Le mode remote prépare la future interface TV ; sa mise en page actuelle reste identique.</p>
  </InterfaceDialog>;
}
