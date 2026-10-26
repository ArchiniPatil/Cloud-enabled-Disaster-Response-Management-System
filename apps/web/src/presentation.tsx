import { useState } from "react";
import {
  Check,
  FileText,
  Handshake,
  Truck,
  MapPin,
  Pause,
  Play,
} from "lucide-react";

/** Illustration only: no real incidents, notifications or dispatch state. */
export function ResponseIllustration() {
  const [paused, setPaused] = useState(false);
  const steps = [
    [FileText, "Reported", "Location & needs recorded"],
    [Handshake, "Accepted", "A team confirms availability"],
    [Truck, "Dispatched", "An authority authorizes response"],
    [MapPin, "Arrived", "The team confirms arrival"],
  ] as const;
  return (
    <figure className={`response-illustration ${paused ? "is-paused" : ""}`}>
      <figcaption>
        <span className="illustration-label">
          Illustrative response sequence
        </span>
        <button
          type="button"
          className="quiet-button"
          aria-label={paused ? "Play illustration" : "Pause illustration"}
          aria-pressed={paused}
          onClick={() => setPaused(!paused)}
        >
          {paused ? <Play size={16} /> : <Pause size={16} />}
        </button>
      </figcaption>
      <div className="illustration-reference">
        <span>EXAMPLE / 0042</span>
        <span>Assistance requested</span>
      </div>
      <ol className="response-sequence">
        {steps.map(([Icon, title, description], index) => (
          <li key={title} style={{ "--step": index } as React.CSSProperties}>
            <span className="sequence-icon">
              <Icon size={20} />
              <Check className="sequence-check" size={14} />
            </span>
            <div>
              <strong>{title}</strong>
              <span>{description}</span>
            </div>
            <span className="sequence-number">0{index + 1}</span>
          </li>
        ))}
      </ol>
      <p>Four separate milestones. No step implies the next.</p>
    </figure>
  );
}
