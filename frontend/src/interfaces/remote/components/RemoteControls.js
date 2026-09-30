import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { findDirectionalTarget, focusRemoteTarget, getRemoteTargets } from "../spatialNavigation";

export default function RemoteControls() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const scope = () => {
      const surface = document.fullscreenElement || document;
      const panels = Array.from(surface.querySelectorAll('[role="dialog"],[role="menu"]'));
      return panels.reverse().find((panel) => getRemoteTargets(panel).length) || surface;
    };
    let awaitingContent = true;
    let awaitingPlayer = /^\/lecture\//.test(pathname);
    const initialFocus = () => {
      const root = scope();
      const candidates = getRemoteTargets(root);
      const player = candidates.find((item) => item.matches('[data-remote-player]'));
      // La page de lecture charge la vidéo après ses liens et son pied de page.
      // Attendre le lecteur dimensionné au lieu de consommer le focus sur ces liens.
      if (root === document && awaitingPlayer) {
        if (player) {
          awaitingPlayer = false;
          awaitingContent = false;
          focusRemoteTarget(player);
        }
        return;
      }
      const content = player || candidates.find((item) => item.closest('[data-remote-content]'));
      if (root === document && awaitingContent && content) {
        awaitingContent = false;
        focusRemoteTarget(content);
      } else if (!candidates.includes(document.activeElement)) {
        focusRemoteTarget(candidates.find((item) => item.matches('[data-remote-player]'))
          || candidates.find((item) => item.closest('[data-remote-content]')) || candidates[0]);
      }
    };
    let frame = requestAnimationFrame(initialFocus);
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(initialFocus);
    });
    observer.observe(document.body, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ["style", "class", "inert", "aria-hidden"],
    });
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      const editable = event.target?.matches?.('input,textarea,[contenteditable="true"]');
      if (event.target?.matches?.("select")) return;
      const back = event.key === "Escape" || event.key === "BrowserBack" || event.key === "GoBack" || event.keyCode === 461 || event.keyCode === 10009
        || (event.key === "Backspace" && !editable);
      if (back) {
        // Laisser les composants de dialogue recevoir Escape et se fermer.
        if (event.key === "Escape" && !document.fullscreenElement && scope() !== document) return;
        event.preventDefault();
        if (event.repeat) return;
        // Convertir les touches Retour TV en Escape pour les dialogues natifs.
        if (event.key !== "Escape") {
          const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
          event.target.dispatchEvent(escape);
          return;
        }
        if (document.fullscreenElement) {
          document.exitFullscreen?.();
          return;
        }
        if (scope() !== document) return;
        navigate(-1);
        return;
      }
      if (!event.key.startsWith("Arrow")) return;
      if (editable && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        if (event.target.matches('input[type="range"]')) return;
        const { selectionStart, selectionEnd, value } = event.target;
        // La saisie conserve les flèches dans le texte ; à son bord, on sort du champ.
        const atEdge = selectionStart === selectionEnd && (
          (event.key === "ArrowLeft" && selectionStart === 0)
          || (event.key === "ArrowRight" && selectionEnd === value?.length)
        );
        if (!atEdge) return;
      }
      event.preventDefault();
      const candidates = getRemoteTargets(scope());
      const current = document.activeElement;
      if (awaitingPlayer && scope() === document) {
        initialFocus();
        return;
      }
      focusRemoteTarget(candidates.includes(current)
        ? findDirectionalTarget(current, candidates, event.key) : candidates[0]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [pathname, search, navigate]);
  return null;
}
