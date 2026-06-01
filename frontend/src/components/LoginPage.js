import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { buildCookieValue, parseCookieValue } from "../utils/cookieValue";

// Nom des cookies utilisés pour la protection brute-force
const LOGIN_ATTEMPTS_COOKIE = 'login_attempts';
const LOGIN_LOCK_UNTIL_COOKIE = 'login_lock_until';

// Paramètres de sécurité
const LOCK_MAX_ATTEMPTS = 3;        // Nombre de tentatives avant blocage
const LOCK_DURATION_MINUTES = 15;   // Durée de blocage en minutes

// Fonction utilitaire pour créer / mettre à jour un cookie
function setCookie(name, value, minutes) {
  // Calcule la date d'expiration du cookie
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
  const expires = expiresAt.toUTCString();

  // Définit le cookie avec une portée sur tout le site
  const payload = buildCookieValue(value, expiresAt.toISOString());
  document.cookie = `${name}=${encodeURIComponent(payload)}; expires=${expires}; path=/`;
}

// Récupère la valeur d'un cookie à partir de son nom
function getCookie(name) {
  // On découpe la chaîne de cookies en éléments individuels
  const value = document.cookie
    .split('; ')
    .find((row) => row.startsWith(name + '='));

  // Si trouvé → on retourne la partie après le "="
  if (!value) return null;
  const rawValue = value.split('=')[1];
  return parseCookieValue(rawValue).value || decodeURIComponent(rawValue);
}

// Supprime un cookie en fixant une date d'expiration passée
function deleteCookie(name) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

// Supprime tous les cookies liés à la sécurité du login
function clearLoginSecurityCookies() {
  deleteCookie(LOGIN_ATTEMPTS_COOKIE);
  deleteCookie(LOGIN_LOCK_UNTIL_COOKIE);
}

const LoginPage = () => {
  const [surnom, setSurnom] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // ⬇️ États pour le reset de mot de passe
  const [showReset, setShowReset] = useState(false);
  const [resetSurnom, setResetSurnom] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [resetTempPassword, setResetTempPassword] = useState('');

  // ⬇️ États pour la protection brute-force
  const [isLocked, setIsLocked] = useState(false);        // formulaire bloqué ou non
  const [lockRemaining, setLockRemaining] = useState(0);  // temps restant en secondes

  // Au montage du composant, on regarde si un lock est déjà en cours via le cookie
  useEffect(() => {
    const lockUntilStr = getCookie(LOGIN_LOCK_UNTIL_COOKIE);

    if (lockUntilStr) {
      const lockUntil = parseInt(lockUntilStr, 10);

      if (!isNaN(lockUntil)) {
        const remainingMs = lockUntil - Date.now();

        if (remainingMs > 0) {
          // Il reste du temps de blocage → on active le lock
          setIsLocked(true);
          setLockRemaining(Math.ceil(remainingMs / 1000));
        } else {
          // Lock expiré → nettoyage
          clearLoginSecurityCookies();
        }
      } else {
        // Valeur pourrie / non exploitable → reset
        clearLoginSecurityCookies();
      }
    }
  }, []);

  // Si le formulaire est verrouillé, on met en place un timer pour le décompte
  useEffect(() => {
    if (!isLocked) return;

    // Timer qui met à jour le temps restant toutes les secondes
    const intervalId = setInterval(() => {
      const lockUntilStr = getCookie(LOGIN_LOCK_UNTIL_COOKIE);

      if (!lockUntilStr) {
        // Le cookie n'existe plus → déblocage
        setIsLocked(false);
        setLockRemaining(0);
        clearInterval(intervalId);
        return;
      }

      const lockUntil = parseInt(lockUntilStr, 10);
      const remainingMs = lockUntil - Date.now();

      if (remainingMs <= 0) {
        // Le temps est écoulé → déblocage complet
        clearLoginSecurityCookies();
        setIsLocked(false);
        setLockRemaining(0);
        clearInterval(intervalId);
      } else {
        // On met à jour le temps restant (en secondes, arrondi à l'entier supérieur)
        setLockRemaining(Math.ceil(remainingMs / 1000));
      }
    }, 1000);

    // Nettoyage du timer si le composant est démonté ou si isLocked passe à false
    return () => clearInterval(intervalId);
  }, [isLocked]);

  // Fonction appelée à chaque tentative de connexion ratée
  const registerFailedAttempt = () => {
    // Si un verrou est déjà en place, on ne fait rien de plus ici
    const existingLock = getCookie(LOGIN_LOCK_UNTIL_COOKIE);
    if (existingLock) return;

    // Récupère le nombre de tentatives déjà enregistrées
    const attemptsStr = getCookie(LOGIN_ATTEMPTS_COOKIE);
    const attempts = attemptsStr ? parseInt(attemptsStr, 10) || 0 : 0;

    const newAttempts = attempts + 1;

    if (newAttempts >= LOCK_MAX_ATTEMPTS) {
      // On a atteint le seuil → mise en place d'un verrou
      const lockUntil = Date.now() + LOCK_DURATION_MINUTES * 60 * 1000;

      // On stocke en cookie le timestamp de fin de lock
      setCookie(
        LOGIN_LOCK_UNTIL_COOKIE,
        String(lockUntil),
        LOCK_DURATION_MINUTES
      );

      // On n'a plus besoin du compteur de tentatives
      deleteCookie(LOGIN_ATTEMPTS_COOKIE);

      // On met à jour l'état local
      setIsLocked(true);
      setLockRemaining(LOCK_DURATION_MINUTES * 60);
    } else {
      // On met juste à jour le nombre de tentatives dans un cookie
      // Durée de vie alignée sur la fenêtre de lock, pour éviter les tentatives étalées dans le temps
      setCookie(
        LOGIN_ATTEMPTS_COOKIE,
        String(newAttempts),
        LOCK_DURATION_MINUTES
      );
    }
  };

  const clearLoginSecurityState = () => {
    clearLoginSecurityCookies();
    setIsLocked(false);
    setLockRemaining(0);
  };

    const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    const apiBaseUrl = process.env.REACT_APP_URL_LOCAL;

    // On garde ton check local sur le cookie de lock pour éviter de spammer le back
    const lockUntilStr = getCookie(LOGIN_LOCK_UNTIL_COOKIE);
    if (lockUntilStr) {
      setIsLocked(true);
      setError("Trop de tentatives de connexion. Patiente avant de réessayer.");
      return;
    }

    try {
      const response = await axios.post(`${apiBaseUrl}/api/users/login`, {
        surnom,
        motDePasse,
      });

      // Succès : on reset tout
      clearLoginSecurityCookies();
      setIsLocked(false);
      setLockRemaining(0);
      setError('');

      const { token } = response.data;
      if (token) {
        localStorage.setItem('token', token);
      }

      navigate('/');
    } catch (err) {
      console.error('Login failed:', err.response?.data || err.message);

      const status = err.response?.status;
      const data = err.response?.data || {};

      // 🔒 Cas 429 : backend a mis le compte/IP en lock
      if (status === 429) {
        const remaining = data.lockRemaining ?? (15 * 60); // fallback 15min

        const lockUntil = Date.now() + remaining * 1000;

        // Cookie pour que le décompte survit au refresh
        setCookie(
          LOGIN_LOCK_UNTIL_COOKIE,
          String(lockUntil),
          remaining / 60 // en minutes
        );

        setIsLocked(true);
        setLockRemaining(remaining);
        setError(
          data.error ||
            "Trop de tentatives de connexion. Réessaie plus tard."
        );
        return;
      }

      // ❌ Cas 401 : identifiants incorrects, tentative restante donnée par le back
      if (status === 401) {
        const attemptsRemaining = data.attemptsRemaining;

        if (typeof attemptsRemaining === 'number') {
          if (attemptsRemaining > 0) {
            setError(
              `Identifiants incorrects. Il te reste ${attemptsRemaining} tentative(s) avant le blocage.`
            );
          } else {
            // Théoriquement, si attemptsRemaining = 0, le prochain essai déclenchera le lock
            setError(
              "Identifiants incorrects. Attention : la prochaine tentative pourrait bloquer temporairement les connexions."
            );
          }
        } else {
          setError(data.error || 'Identifiants invalides.');
        }

        return;
      }

      // Autres cas (403, 500, etc.)
      setError(data.error || 'Une erreur est survenue lors de la connexion.');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetError('');
    setResetSuccess('');
    setResetTempPassword('');

    const apiBaseUrl = process.env.REACT_APP_URL_LOCAL;

    try {
      const response = await axios.post(`${apiBaseUrl}/api/users/reset-password`, {
        surnom: resetSurnom,
        email: resetEmail,
      });

      setResetSuccess(response.data.message || 'Un email de réinitialisation a été envoyé.');

      // 🧪 Mode dev : si l’API renvoie un mot de passe temporaire, on l’affiche
      if (response.data.tempPassword) {
        setResetTempPassword(response.data.tempPassword);
      }
    } catch (err) {
      console.error('Reset password failed:', err.response?.data || err.message);
      setResetError(err.response?.data?.error || 'Une erreur est survenue lors de la réinitialisation.');
      setResetSuccess('');
      setResetTempPassword('');
    }
  };

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-white p-8 w-96">
        <h2 className="text-2xl font-bold mb-6">Connexion</h2>
        {error && <p className="text-red-600 mb-4">{error}</p>}
        <form onSubmit={handleLogin} autoComplete="on">
          <div className="mb-4">
            <label htmlFor="username" className="block text-gray-200">Surnom</label>
            <input
              id="username"
              name="username"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              type="text"
              className="w-full px-3 py-2 border hover:border-sky-700 border-sky-600 bg-black rounded disabled:opacity-50 disabled:cursor-not-allowed"
              value={surnom}
              onChange={(e) => setSurnom(e.target.value)}
              required
              disabled={isLocked}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="password" className="block text-gray-200">Mot de Passe</label>
            <input
              id="password"
              autoComplete="current-password"
              name="password"
              type="password"
              className="w-full px-3 py-2 border hover:border-sky-700 border-sky-600 bg-black rounded disabled:opacity-50 disabled:cursor-not-allowed"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              required
              disabled={isLocked}
            />
          </div>

          {/* Lien pour afficher / masquer le formulaire de récupération */}
          <div className="mb-4 text-right">
            <button
              type="button"
              onClick={() => {
                setShowReset((prev) => !prev);
                setResetError('');
                setResetSuccess('');
              }}
              className="text-xs text-sky-500 hover:text-sky-400 underline"
            >
              Mot de passe oublié ?
            </button>
          </div>

          {/* Message de lock + décompte si nécessaire */}
          {isLocked && (
            <div className="mb-3 text-xs text-amber-300 border border-amber-500/50 rounded p-2 bg-amber-950/30">
              <p className="font-semibold">
                Trop de tentatives de connexion.
              </p>
              {lockRemaining > 0 && (
                <p>
                  Tu pourras réessayer dans{" "}
                  <span className="font-mono">
                    {Math.floor(lockRemaining / 60)
                      .toString()
                      .padStart(2, '0')}
                    :
                    {(lockRemaining % 60).toString().padStart(2, '0')}
                  </span>
                  .
                </p>
              )}
              <p className="mt-1">
                Si tu as oublié ton mot de passe, utilise la fonction de récupération.
              </p>
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-sky-800 to-sky-700 hover:from-sky-900 hover:to-sky-950 text-white py-2 rounded font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLocked}
          >
            Se connecter
          </button>
        </form>


        {/* Bloc de récupération de mot de passe */}
        {showReset && (
          <div className="mt-6 border border-sky-700 rounded p-4 bg-black/40">
            <h3 className="text-lg font-semibold mb-3">Récupération de mot de passe</h3>

            {resetError && (
              <p className="text-sm text-red-500 mb-2">
                {resetError}
              </p>
            )}
            {resetSuccess && (
              <p className="text-sm text-green-500 mb-2">
                {resetSuccess}
              </p>
            )}

            {resetTempPassword && (
              <div className="mb-3 text-xs text-amber-300 border border-amber-500/50 rounded p-2 bg-amber-950/30">
                <p className="font-semibold mb-1">Mode développement :</p>
                <p>Mot de passe temporaire :</p>
                <p className="font-mono break-all text-amber-200">
                  {resetTempPassword}
                </p>
                <p className="mt-1">
                  Utilise-le pour te connecter puis change-le dans les paramètres.
                </p>
              </div>
            )}

            <form onSubmit={handleResetPassword}>
              <div className="mb-3">
                <label className="block text-gray-200 text-sm">Surnom</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border hover:border-sky-700 border-sky-600 bg-black rounded text-sm"
                  value={resetSurnom}
                  onChange={(e) => setResetSurnom(e.target.value)}
                  required
                />
              </div>

              <div className="mb-3">
                <label className="block text-gray-200 text-sm">Email</label>
                <input
                  type="email"
                  className="w-full px-3 py-2 border hover:border-sky-700 border-sky-600 bg-black rounded text-sm"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full bg-sky-700 hover:bg-sky-800 text-white py-2 rounded text-sm font-semibold"
              >
                Demander un mot de passe temporaire
              </button>
            </form>
          </div>
        )}

        <p className="mt-4 text-center">
          Vous n'avez pas de compte ? <a href="/register" className="text-sky-600 hover:text-sky-700">S'inscrire</a>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
