import { useState, useEffect } from 'react';

export function useViewportGate() {
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    const check = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const ratio = width / height;
      
      // Block if width < 1200 OR ratio < 1.4
      const blocked = width < 1200 || ratio < 1.4;
      setIsBlocked(blocked);
    };

    // Initial check
    check();
    
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return isBlocked;
}
