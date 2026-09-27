import { useEffect, useState } from 'react';

/**
 * Волна голоса во время записи. Реагирует на промежуточные результаты
 * распознавания: как только система слышит новые слова, волна «подпрыгивает».
 */
export function VoiceBars({ pulse }: { pulse: string }) {
  const [energy, setEnergy] = useState(0.35);
  useEffect(() => {
    if (!pulse) return;
    setEnergy(1);
    const t = setTimeout(() => setEnergy(0.55), 350);
    return () => clearTimeout(t);
  }, [pulse]);
  return (
    <span className="voice-bars" style={{ ['--energy' as string]: energy }} aria-hidden>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} style={{ animationDelay: `${(i * 97) % 500}ms` }} />
      ))}
    </span>
  );
}
