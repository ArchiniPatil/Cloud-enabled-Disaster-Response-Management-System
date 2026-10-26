import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ReactElement,
} from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  RefreshCw,
  X,
} from "lucide-react";

export function AnimatedCount({ value }: { value: number | undefined }) {
  const [shown, setShown] = useState<number | undefined>(value),
    previous = useRef(value);
  useEffect(() => {
    if (
      value == null ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setShown(value);
      previous.current = value;
      return;
    }
    const from = previous.current ?? 0,
      start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 350);
      setShown(Math.round(from + (value - from) * progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    previous.current = value;
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return (
    <strong aria-label={value == null ? "Loading" : String(value)}>
      {shown ?? "—"}
    </strong>
  );
}
export function RetryNotice({
  title,
  message,
  retry,
}: {
  title: string;
  message: string;
  retry: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <div className="notice error inline-error" role="alert" aria-live="polite">
      <AlertCircle size={20} />
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      <button
        ref={button}
        disabled={busy}
        aria-busy={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await retry();
          } finally {
            setBusy(false);
            requestAnimationFrame(() => {
              if (button.current) button.current.focus();
              else document.getElementById("main-content")?.focus();
            });
          }
        }}
      >
        <RefreshCw size={16} className={busy ? "spin" : ""} />
        {busy ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}
export function UpdatedAt({ value }: { value?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span className="updated-at">
      {value
        ? `Updated ${Math.max(0, Math.floor((now - Date.parse(value)) / 1000))}s ago`
        : "Waiting for data"}
    </span>
  );
}
function cellText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(cellText).join(" ");
  if (isValidElement<{ children?: ReactNode; value?: string }>(node))
    return node.props.value ?? cellText(node.props.children);
  return "";
}
/** Reorders only already-rendered rows; no API order, pagination or records change. */
export function PresentationTable({ children }: { children: ReactNode }) {
  const [sort, setSort] = useState<{
    column: number;
    direction: 1 | -1;
  } | null>(null);
  const sections = Children.toArray(children);
  let columns = 1;
  const head = sections.find((n) => isValidElement(n) && n.type === "thead") as
    ReactElement<{ children: ReactNode }> | undefined;
  const row = head && Children.toArray(head.props.children)[0];
  if (isValidElement<{ children: ReactNode }>(row))
    columns = Children.count(row.props.children);
  return (
    <table>
      {sections.map((section) => {
        if (!isValidElement<{ children: ReactNode }>(section)) return section;
        if (section.type === "thead")
          return cloneElement(
            section,
            {},
            Children.map(section.props.children, (row) => {
              if (!isValidElement<{ children: ReactNode }>(row)) return row;
              return cloneElement(
                row,
                {},
                Children.map(row.props.children, (cell, column) => {
                  if (
                    !isValidElement<{
                      children: ReactNode;
                      scope?: string;
                      "aria-sort"?: "ascending" | "descending" | "none";
                    }>(cell)
                  )
                    return cell;
                  const name = cellText(cell.props.children);
                  if (["Action", "Details"].includes(name)) return cell;
                  const active = sort?.column === column;
                  return cloneElement(
                    cell,
                    {
                      scope: "col",
                      "aria-sort": active
                        ? sort.direction === 1
                          ? "ascending"
                          : "descending"
                        : "none",
                    },
                    <button
                      className="table-sort"
                      onClick={() =>
                        setSort({
                          column,
                          direction: active && sort.direction === 1 ? -1 : 1,
                        })
                      }
                      aria-label={`Sort visible rows by ${name}`}
                    >
                      {cell.props.children}
                      {active && sort.direction === -1 ? (
                        <ArrowDown size={14} />
                      ) : (
                        <ArrowUp
                          size={14}
                          className={active ? "" : "sort-idle"}
                        />
                      )}
                    </button>,
                  );
                }),
              );
            }),
          );
        if (section.type === "tbody") {
          let rows = Children.toArray(section.props.children).filter(
            isValidElement,
          ) as ReactElement<{ children: ReactNode }>[];
          if (sort)
            rows = [...rows].sort((a, b) => {
              const cellsA = Children.toArray(a.props.children),
                cellsB = Children.toArray(b.props.children);
              return (
                cellText(cellsA[sort.column]).localeCompare(
                  cellText(cellsB[sort.column]),
                  undefined,
                  { numeric: true, sensitivity: "base" },
                ) * sort.direction
              );
            });
          return cloneElement(
            section,
            {},
            rows.length ? (
              rows
            ) : (
              <tr>
                <td colSpan={columns}>
                  <div className="empty">
                    <CheckCircle2 size={24} />
                    <p>No records to show in this view.</p>
                  </div>
                </td>
              </tr>
            ),
          );
        }
        return section;
      })}
    </table>
  );
}
/** Mirrors only existing success/error notices. It never issues requests. */
export function StatusToasts() {
  const [items, setItems] = useState<
    { id: number; text: string; error: boolean }[]
  >([]);
  useEffect(() => {
    const root = document.getElementById("main-content");
    if (!root) return;
    const seen = new WeakMap<Element, string>();
    let id = 0;
    const observer = new MutationObserver(() => {
      root.querySelectorAll(".notice.success,.notice.error").forEach((node) => {
        const text = node.textContent?.trim();
        if (!text || seen.get(node) === text) return;
        seen.set(node, text);
        const error = node.classList.contains("error");
        setItems((old) =>
          [
            ...old,
            {
              id: ++id,
              text: error
                ? "An action needs attention. Review the inline message."
                : "Action completed. Review the confirmation in the workspace.",
              error,
            },
          ].slice(-3),
        );
      });
    });
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, []);
  return (
    <div className="toast-stack" aria-live="polite" aria-relevant="additions">
      {items.map((item) => (
        <div
          className={`toast ${item.error ? "error" : "success"}`}
          key={item.id}
        >
          {item.error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span>{item.text}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() =>
              setItems((old) => old.filter((n) => n.id !== item.id))
            }
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
