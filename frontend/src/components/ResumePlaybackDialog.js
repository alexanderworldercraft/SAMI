import React from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

const ResumePlaybackDialog = ({
  open,
  onOutsideClick,
  onResume,
  onRestart,
  resumeTimeLabel,
  choicePulse = false,
}) => (
  <Dialog
    open={open}
    onClose={onOutsideClick}
    className="relative z-[120]"
    data-testid="resume-playback-dialog"
  >
    <DialogBackdrop
      transition
      className="fixed inset-0 bg-gray-900/50 backdrop-blur-md transition-opacity data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in"
    />

    <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
      <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        <DialogPanel
          transition
          className="relative transform overflow-hidden rounded-lg bg-blue-200 px-4 pb-4 pt-5 text-left text-blue-950 shadow-xl outline outline-1 -outline-offset-1 outline-white/10 transition-all data-[closed]:translate-y-4 data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in dark:bg-slate-950 dark:text-blue-400 sm:my-8 sm:w-full sm:max-w-lg sm:p-6 data-[closed]:sm:translate-y-0 data-[closed]:sm:scale-95"
        >
          <div className="sm:flex sm:items-start">
            <div className="mx-auto flex size-12 shrink-0 items-center justify-center rounded-full bg-blue-200 dark:bg-blue-950 sm:mx-0 sm:size-10">
              <ExclamationTriangleIcon
                aria-hidden="true"
                className="size-6 text-blue-900 dark:text-blue-400"
              />
            </div>
            <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
              <DialogTitle as="h3" className="text-base font-semibold text-blue-950 dark:text-blue-50">
                Reprendre la lecture ?
              </DialogTitle>
              <div className="mt-2">
                <p className="text-sm text-blue-900 dark:text-blue-300">
                  On a trouvé une progression enregistrée à{" "}
                  <span className="text-red-500">{resumeTimeLabel}</span>. Souhaitez-vous reprendre la vidéo à cet endroit ?
                </p>
              </div>
            </div>
          </div>
          <div className="mt-5 sm:ml-10 sm:mt-4 sm:flex sm:pl-4">
            <button
              type="button"
              onClick={onResume}
              className={`inline-flex w-full justify-center rounded-md bg-blue-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-400 sm:w-auto ${choicePulse ? "animate-pulse ring-2 ring-blue-200" : ""}`}
            >
              Reprendre
            </button>
            <button
              type="button"
              data-autofocus
              onClick={onRestart}
              className={`mt-3 inline-flex w-full justify-center rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-inset ring-white/5 hover:bg-white/20 sm:ml-3 sm:mt-0 sm:w-auto ${choicePulse ? "animate-pulse ring-2 ring-blue-200" : ""}`}
            >
              Repartir du début
            </button>
          </div>
        </DialogPanel>
      </div>
    </div>
  </Dialog>
);

export default ResumePlaybackDialog;
