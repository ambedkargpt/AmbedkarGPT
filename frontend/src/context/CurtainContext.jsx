import { createContext, useContext, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';

const CurtainCtx = createContext(null);

export function CurtainProvider({ children }) {
  const navigate = useNavigate();
  const [active, setActive] = useState(false);
  const timerRef = useRef(null);
  const rafIds   = useRef([]);

  function go(to, opts) {
    // Cancel any in-flight transition
    if (timerRef.current) clearTimeout(timerRef.current);
    rafIds.current.forEach(cancelAnimationFrame);

    // Force React to commit the curtain to the DOM synchronously
    flushSync(() => setActive(true));

    // Wait for two animation frames so the browser has actually painted
    // the curtain before we navigate (prevents destination flash)
    const id1 = requestAnimationFrame(() => {
      const id2 = requestAnimationFrame(() => {
        navigate(to, opts);
        // Long enough for Pravartan to bring the nib out before the
        // curtain lifts; any sooner and the logo is cut off mid-build.
        timerRef.current = setTimeout(() => setActive(false), 2300);
      });
      rafIds.current = [id2];
    });
    rafIds.current = [id1];
  }

  return (
    <CurtainCtx.Provider value={{ active, go }}>
      {children}
    </CurtainCtx.Provider>
  );
}

export const useCurtain = () => useContext(CurtainCtx);
