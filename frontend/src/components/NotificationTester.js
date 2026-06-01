'use client';

import React, { useState } from 'react';
import Notification from './Notification'; // Assure-toi que le chemin est correct

const NotificationTester = () => {
  const [notification, setNotification] = useState(null);

  const triggerNotification = (type) => {
    let message;
    switch (type) {
      case 'success':
        message = 'Action réussie !';
        break;
      case 'error':
        message = 'Une erreur est survenue.';
        break;
      case 'info':
        message = 'Voici une information importante.';
        break;
      case 'warning':
        message = 'Attention, vérifiez les données.';
        break;
      default:
        message = 'Notification';
    }

    setNotification({ message, type });
  };

  return (
    <div className="flex flex-col items-center gap-4 mt-10">
      <div className="flex gap-2">
        <button
          onClick={() => triggerNotification('success')}
          className="px-4 py-2 bg-green-600 text-white rounded-md shadow hover:bg-green-700"
        >
          Success
        </button>
        <button
          onClick={() => triggerNotification('error')}
          className="px-4 py-2 bg-red-600 text-white rounded-md shadow hover:bg-red-700"
        >
          Error
        </button>
        <button
          onClick={() => triggerNotification('info')}
          className="px-4 py-2 bg-blue-600 text-white rounded-md shadow hover:bg-blue-700"
        >
          Info
        </button>
        <button
          onClick={() => triggerNotification('warning')}
          className="px-4 py-2 bg-yellow-600 text-white rounded-md shadow hover:bg-yellow-700"
        >
          Warning
        </button>
      </div>

      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}
    </div>
  );
};

export default NotificationTester;
