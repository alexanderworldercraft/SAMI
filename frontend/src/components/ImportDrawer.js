import { useState, useEffect } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { PlusIcon } from '@heroicons/react/20/solid';
import GenreList from './GenreList';
import SeriesAndSeasonSelector from './SeriesAndSeasonSelector';
import Notification from './Notification';
import api from '../services/api';

const apiUrl = process.env.REACT_APP_URL_LOCAL;

export default function ImportDrawer() {
  const [open, setOpen] = useState(false);
  const [Titre, setTitre] = useState('');
  const [Resumer, setResumer] = useState('');
  const [CheminAcces, setCheminAcces] = useState('');
  const [CheminImage, setCheminImage] = useState('');
  const [selectedSeries, setSelectedSeries] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [subtitles, setSubtitles] = useState([{ Label: '', CheminSubtitle: '' }]);
  const [genres, setGenres] = useState([]);
  const [user, setUser] = useState(null);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await api.get('/users/me');
        setUser(response.data);
      } catch (error) {
        console.error("Erreur lors de la récupération de l'utilisateur :", error);
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    fetch(`${apiUrl}/api/genres`)
      .then(res => res.json())
      .then(data => setGenres(data))
      .catch(err => console.error(err));
  }, []);

  const showNotification = (message, type = "success", icon = "✅") => {
    setNotification({ message, type, icon });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!user || !user.UtilisateurID) return alert("Utilisateur non authentifié");

    const payload = {
      Titre,
      Resumer,
      CheminAcces,
      CheminImage,
      SaisonID: selectedSeason || null,
      GenreIDs: selectedGenres,
      Subtitles: subtitles.filter(s => s.Label && s.CheminSubtitle)
    };

    const response = await fetch(`${apiUrl}/api/import/video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log('Réponse :', data);
    if (response.ok) {
      setOpen(false);
      showNotification("Vidéo importée avec succès.", "success", "✅");
    } else {
      showNotification(data.error || "Erreur lors de l'import.", "error", "⚠️");
    }
  };

  const handleSubtitleChange = (index, field, value) => {
    const updated = [...subtitles];
    updated[index][field] = value;
    setSubtitles(updated);
  };

  const addSubtitleField = () => {
    setSubtitles([...subtitles, { Label: '', CheminSubtitle: '' }]);
  };

  return (
    <div>
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          icon={notification.icon}
          duration={4000}
          onClose={() => console.log('Notification fermée')}
        />
      )}
      <div className='mx-auto w-fit'>
        <button
          onClick={() => setOpen(true)}
          className="rounded-full bg-sky-600 p-2 text-white shadow-sm hover:bg-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
        >
          <PlusIcon aria-hidden="true" className="size-5" />
        </button>
      </div>
      <Dialog open={open} onClose={setOpen} className="relative z-50">
        <div className="fixed inset-0" />
        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden bg-black/30 backdrop-blur">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10 sm:pl-16">
              <DialogPanel className="pointer-events-auto w-screen max-w-xl transform transition ease-in-out">
                <form onSubmit={handleSubmit} className="flex h-full flex-col divide-y divide-gray-800 dark:divide-gray-200 bg-white dark:bg-slate-900 shadow-xl text-black dark:dark:text-white">
                  <div className="h-0 flex-1 overflow-y-auto">
                    <div className="bg-sky-700 px-4 py-6 sm:px-6">
                      <div className="flex items-center justify-between">
                        <DialogTitle className="text-base font-semibold text-white">Nouvelle Vidéo (Import)</DialogTitle>
                        <button onClick={() => setOpen(false)} type="button" className="text-sky-200 hover:dark:text-white">
                          <XMarkIcon className="size-6" />
                        </button>
                      </div>
                    </div>
                    <div className="divide-y divide-gray-200 px-4 sm:px-6">
                      <div className="space-y-6 pt-6 pb-5">
                        <div>
                          <div className="flex justify-between">
                            <label className="block text-sm/6 font-medium">
                              Titre de la vidéo
                            </label>
                            <span className="text-sm/6 text-red-500">
                              Obligatoire
                            </span>
                          </div>
                          <input
                            type="text"
                            value={Titre}
                            onChange={e => setTitre(e.target.value)}
                            placeholder='47 ronin'
                            className="block w-full rounded-md border-0 px-3 py-1.5 dark:text-neutral-200 bg-gray-300 dark:bg-neutral-900/50 shadow-sm ring-1 ring-inset ring-neutral-200/50 focus:ring-2 focus:ring-inset focus:ring-sky-600 outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-700 sm:text-sm/6"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm/6 font-medium">Résumé</label>
                          <textarea
                            rows={8}
                            value={Resumer}
                            onChange={e => setResumer(e.target.value)}
                            placeholder='Dans le Japon médiéval, Kai, un paria mi-japonais, mi-anglais, est adopté...'
                            className="block w-full rounded-md border-0 px-3 py-1.5 dark:text-neutral-200 bg-gray-300 dark:bg-neutral-900/50 shadow-sm ring-1 ring-inset ring-neutral-200/50 focus:ring-2 focus:ring-inset focus:ring-sky-600 outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-700 sm:text-sm/6"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between">
                            <label className="block text-sm/6 font-medium">
                              CheminAcces
                            </label>
                            <span className="text-sm/6 text-red-500">
                              Obligatoire
                            </span>
                          </div>
                          <input
                            type="text"
                            value={CheminAcces}
                            onChange={e => setCheminAcces(e.target.value)}
                            placeholder='hls_1718810000'
                            className="block w-full rounded-md border-0 px-3 py-1.5 dark:text-neutral-200 bg-gray-300 dark:bg-neutral-900/50 shadow-sm ring-1 ring-inset ring-neutral-200/50 focus:ring-2 focus:ring-inset focus:ring-sky-600 outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-700 sm:text-sm/6"
                            required
                          />
                        </div>
                        <div>
                          <div className="flex justify-between">
                            <label className="block text-sm/6 font-medium">
                              CheminImage
                            </label>
                            <span className="text-sm/6 text-red-500">
                              Obligatoire
                            </span>
                          </div>
                          <input
                            type="text"
                            value={CheminImage}
                            onChange={e => setCheminImage(e.target.value)}
                            placeholder='1749889037960.webp'
                            className="block w-full rounded-md border-0 px-3 py-1.5 dark:text-neutral-200 bg-gray-300 dark:bg-neutral-900/50 shadow-sm ring-1 ring-inset ring-neutral-200/50 focus:ring-2 focus:ring-inset focus:ring-sky-600 outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-700 sm:text-sm/6"
                            required
                          />
                        </div>

                        <SeriesAndSeasonSelector
                          selectedSeries={selectedSeries}
                          setSelectedSeries={(serie) => {
                            setSelectedSeries(serie);
                            setSelectedSeason(null);
                          }}
                          selectedSeason={selectedSeason}
                          setSelectedSeason={setSelectedSeason}
                        />
                        <GenreList genres={genres} selectedGenres={selectedGenres} setSelectedGenres={setSelectedGenres} />
                        <div>
                          <h3 className="block text-sm font-medium text-gray-900">Sous-titres (optionnels)</h3>
                          {subtitles.map((sub, index) => (
                            <div key={index} className="flex gap-2 mt-2">
                              <input
                                type="text"
                                placeholder="Label"
                                value={sub.Label}
                                onChange={e => handleSubtitleChange(index, 'Label', e.target.value)}
                                className="w-1/3 block rounded-md border-0 px-3 py-1.5 dark:text-neutral-200 bg-gray-300 dark:bg-neutral-900/50 shadow-sm ring-1 ring-inset ring-neutral-200/50 focus:ring-2 focus:ring-inset focus:ring-sky-600 outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-700 sm:text-sm/6"
                              />
                              <input
                                type="text"
                                placeholder="1749460441207/subtitle_1.vtt"
                                value={sub.CheminSubtitle}
                                onChange={e => handleSubtitleChange(index, 'CheminSubtitle', e.target.value)}
                                className="w-2/3 block rounded-md border-0 px-3 py-1.5 dark:text-neutral-200 bg-gray-300 dark:bg-neutral-900/50 shadow-sm ring-1 ring-inset ring-neutral-200/50 focus:ring-2 focus:ring-inset focus:ring-sky-600 outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-700 sm:text-sm/6"
                              />
                            </div>
                          ))}
                          <button type="button" onClick={addSubtitleField} className="mt-2 text-sm text-sky-600 hover:underline flex items-center">
                            <PlusIcon className="size-4 mr-1" /> Ajouter un sous-titre
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end px-4 py-4">
                    <button type="button" onClick={() => setOpen(false)} className="rounded-md bg-gray-300 px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50 hover:-translate-y-1 duration-500">
                      Annuler
                    </button>
                    <button type="submit" className="ml-4 inline-flex justify-center rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 hover:-translate-y-1 duration-500">
                      Importer
                    </button>
                  </div>
                </form>
              </DialogPanel>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
