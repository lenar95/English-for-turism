import type { LocalVersion } from '../data';
import { SpeakButtons } from './Speak';

/** Та же фраза на местном языке: текст, произношение и озвучка. */
export function LocalLine({ local }: { local: LocalVersion }) {
  return (
    <div className="local-line">
      <div className="local-line__text">
        <span className="local-line__label">{capitalize(local.name)}</span>
        <span className="local-line__phrase" lang={local.lang.slice(0, 2)}>{local.text}</span>
        <span className="local-line__tr">{local.tr}</span>
      </div>
      <SpeakButtons text={local.text} lang={local.lang} />
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
