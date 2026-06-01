'use client';

import React, { useState, useEffect } from 'react';
import { Transition } from '@headlessui/react';
import { CheckCircleIcon, ExclamationCircleIcon, InformationCircleIcon, ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline';

const iconMap = {
  success: <CheckCircleIcon className="size-6 dark:text-green-400 text-green-900" />,
  error: <ExclamationCircleIcon className="size-6 dark:text-red-400 text-red-900" />,
  info: <InformationCircleIcon className="size-6 dark:text-blue-400 text-blue-900" />,
  warning: <ExclamationTriangleIcon className="size-6 dark:text-yellow-400 text-yellow-900" />,
};

const backgroundMap = {
  success: 'dark:bg-green-950 dark:text-green-400 border border-green-400 bg-green-200',
  error: 'dark:bg-red-950 dark:text-red-400 border border-red-400 bg-red-200',
  info: 'dark:bg-blue-950 dark:text-blue-400 border border-blue-400 bg-blue-200',
  warning: 'dark:bg-yellow-950 dark:text-yellow-400 border border-yellow-400 bg-yellow-200',
};

const Notification = ({ message, type = 'info', duration = 10000, onClose }) => {
  const [show, setShow] = useState(true);

  useEffect(() => {
    if (!duration || duration <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      setShow(false);
      if (onClose) onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div
      aria-live="assertive"
      className="pointer-events-none fixed inset-0 flex items-end px-4 py-6 sm:items-start sm:p-6 z-50"
    >
      <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
        <Transition
          show={show}
          enter="transform ease-out duration-300 transition"
          enterFrom="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
          enterTo="translate-y-0 opacity-100 sm:translate-x-0"
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className={`pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg shadow-lg ring-1 ring-black/5 ${backgroundMap[type] || 'bg-gray-800'}`}>
            <div className="p-4 flex items-start">
              <div className="shrink-0">
                {iconMap[type]}
              </div>
              <div className="ml-3 w-0 flex-1">
                <p className="text-sm font-medium">{message}</p>
              </div>
              <div className="ml-4 flex shrink-0">
                <button
                  onClick={() => {
                    setShow(false);
                    if (onClose) onClose();
                  }}
                  className="inline-flex rounded-md text-gray-700 dark:text-gray-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-white"
                >
                  <span className="sr-only">Fermer</span>
                  <XMarkIcon className="size-5" />
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  );
};

export default Notification;
