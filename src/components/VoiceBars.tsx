import { useEffect, useState } from 'react';

/**
 * Волна голоса во время записи. Реагирует на промежуточные результаты
 * распознавания: как только система слышит новые слова, волна «подпрыгивает».
 */
export function VoiceBars({ pulse }: { pulse: string }) {
  const [energy, setEnergy] = useState(0.35);
  // Новые слова — всплеск; производное состояние сбрасываем прямо в рендере.
  const [seen, setSeen] = useState(pulse);
  if (pulse && pulse !== seen) {
    setSeen(pulse);
    setEnergy(1);
  }
  // Всплеск гаснет сам через мгновение.
  useEffect(() => {
    if (energy !== 1) return;
    const t = setTimeout(() => setEnergy(0.55), 350);
    return () => clearTimeout(t);
  }, [energy]);
  return (
    <span className="voice-bars" style={{ ['--energy' as string]: energy }} aria-hidden>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} style={{ animationDelay: `${(i * 97) % 500}ms` }} />
      ))}
    </span>
  );
}
