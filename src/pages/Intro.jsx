import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Intro.css";

function Intro() {
  const navigate = useNavigate();
  const [fadeOut, setFadeOut] = useState(false);
  const [phase, setPhase] = useState(0);
  // phase 0 = nothing, 1 = line appears, 2 = title appears, 3 = tagline appears

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 200);
    const t2 = setTimeout(() => setPhase(2), 700);
    const t3 = setTimeout(() => setPhase(3), 1400);

    const tFade = setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => navigate("/login"), 900);
    }, 3600);

    return () => [t1, t2, t3, tFade].forEach(clearTimeout);
  }, [navigate]);

  return (
    <div className={`intro-wrapper ${fadeOut ? "fade-out" : ""}`}>
      {/* Ambient orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />

      {/* Grid overlay */}
      <div className="grid-overlay" />

      <div className="intro-content">
        {/* Top accent line */}
        <div className={`accent-line ${phase >= 1 ? "visible" : ""}`} />

        {/* Main title */}
        <h1 className={`intro-title ${phase >= 2 ? "visible" : ""}`}>
          <span className="title-letter">M</span>
          <span className="title-letter">A</span>
          <span className="title-letter">L</span>
          <span className="title-letter">L</span>
          <span className="title-gap" />
          <span className="title-letter">M</span>
          <span className="title-letter">A</span>
          <span className="title-letter">T</span>
          <span className="title-letter">E</span>
        </h1>

        {/* Tagline */}
        <p className={`intro-tagline ${phase >= 3 ? "visible" : ""}`}>
          Your smart mall companion
        </p>

        {/* Bottom accent line */}
        <div className={`accent-line bottom ${phase >= 1 ? "visible" : ""}`} />
      </div>

      {/* Corner marks */}
      <div className="corner corner-tl" />
      <div className="corner corner-tr" />
      <div className="corner corner-bl" />
      <div className="corner corner-br" />
    </div>
  );
}

export default Intro;