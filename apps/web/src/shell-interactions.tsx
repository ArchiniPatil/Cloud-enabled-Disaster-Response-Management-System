import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Bell, Keyboard, X } from "lucide-react";
import { label } from "./api";

export function ShellInteractions({ notifications }: { notifications: any }) {
  const location = useLocation(),
    navigate = useNavigate();
  const shortcuts = useRef<HTMLDialogElement>(null),
    preview = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    let prefixAt = 0;
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.isComposing ||
        target.closest('input, textarea, select, [contenteditable="true"]')
      )
        return;
      if (event.key === "Escape") {
        if (preview.current) preview.current.open = false;
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        shortcuts.current?.showModal();
        return;
      }
      if (shortcuts.current?.open) return;
      if (event.key === "/") {
        const search = document.querySelector<HTMLInputElement>(
          'input[aria-label="Search incident ID or location"]',
        );
        if (search) {
          event.preventDefault();
          search.focus();
        }
        return;
      }
      if (event.key.toLowerCase() === "i" && Date.now() - prefixAt < 1200) {
        event.preventDefault();
        navigate("/reports");
        prefixAt = 0;
      } else prefixAt = event.key.toLowerCase() === "g" ? Date.now() : 0;
    };
    const outside = (event: PointerEvent) => {
      if (preview.current && !preview.current.contains(event.target as Node))
        preview.current.open = false;
    };
    document.addEventListener("keydown", keydown);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("pointerdown", outside);
    };
  }, [navigate]);
  useEffect(() => {
    if (preview.current) preview.current.open = false;
  }, [location.pathname]);
  return (
    <>
      <button
        className="icon-button shortcut-trigger"
        aria-label="Keyboard shortcuts"
        onClick={() => shortcuts.current?.showModal()}
      >
        <Keyboard size={19} />
      </button>
      <details className="notification-preview" ref={preview}>
        <summary className="icon-button" aria-label="Preview notifications">
          <Bell size={20} />
          {!!notifications?.unread && <span className="unread-dot" />}
        </summary>
        <section
          className="notification-popover"
          aria-label="Notification preview"
        >
          <h2>Updates for you</h2>
          <p className="muted">
            {notifications
              ? `${notifications.unread} unread`
              : "Notifications are loading or unavailable."}
          </p>
          {notifications?.items?.slice(0, 3).map((n: any) => (
            <div className="preview-item" key={n.id}>
              <strong>{label(n.type ?? n.channel)}</strong>
              <span className={`badge ${n.status.toLowerCase()}`}>
                {label(n.status)}
              </span>
              <small>{new Date(n.created_at).toLocaleString()}</small>
            </div>
          ))}
          {notifications && !notifications.items?.length && (
            <p>No notifications yet.</p>
          )}
          <Link to="/notifications" className="button">
            Open notification centre
          </Link>
        </section>
      </details>
      <dialog
        className="shortcut-dialog"
        ref={shortcuts}
        aria-labelledby="shortcut-title"
      >
        <div className="section-heading">
          <h2 id="shortcut-title">Keyboard shortcuts</h2>
          <button
            aria-label="Close keyboard shortcuts"
            onClick={() => shortcuts.current?.close()}
          >
            <X size={18} />
          </button>
        </div>
        <dl>
          <div>
            <dt>
              <kbd>g</kbd> then <kbd>i</kbd>
            </dt>
            <dd>Open your incident inbox</dd>
          </div>
          <div>
            <dt>
              <kbd>/</kbd>
            </dt>
            <dd>Focus search on an incident dashboard</dd>
          </div>
          <div>
            <dt>
              <kbd>?</kbd>
            </dt>
            <dd>Open this guide</dd>
          </div>
          <div>
            <dt>
              <kbd>Esc</kbd>
            </dt>
            <dd>Close this guide or notification preview</dd>
          </div>
        </dl>
        <p className="muted">Shortcuts are inactive while typing in a form.</p>
      </dialog>
    </>
  );
}
export function useSidebarPreference() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("response:sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setCollapsed((previous) => {
      const next = !previous;
      try {
        localStorage.setItem("response:sidebar-collapsed", String(next));
      } catch {
        /* Storage is optional. */
      }
      return next;
    });
  return { collapsed, toggle };
}
