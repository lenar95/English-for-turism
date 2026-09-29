import { useState } from 'react';
import { PronunciationCheck } from '../components/PronunciationCheck';
import { TripDetails, TripScenarioPicker } from '../components/TripEditor';
import { scenarios } from '../data';
import { plural } from '../lib/ru';
import { useApp } from '../state/AppContext';

export function OnboardingPage() {
  const { finishOnboarding, speechSupported, updateSettings } = useApp();
  const [step, setStep] = useState(0);
  const steps = 3;

  return (
    // Первое впечатление — яркая «арена», как экраны тренировки; цвет плавно меняется от шага к шагу.
    <div className={`arena arena--onb-${step}`}>
    <div className="page page--bare onboarding">
      <div className="steps" aria-label={`Шаг ${step + 1} из ${steps}`}>
        {Array.from({ length: steps }, (_, i) => (
          <span key={i} className={i === step ? 'active' : ''} />
        ))}
      </div>

      {step === 0 && (
        <div className="stack" style={{ paddingTop: 24 }}>
          <div className="big-emoji onb-plane" aria-hidden>✈️</div>
          <h1>Английский в поездку</h1>
          <p className="muted">Для тех, кто едет за границу и не знает английского. Без грамматики и зубрёжки — только то, что пригодится в поездке.</p>
          <div className="card stack">
            <div className="row"><span style={{ fontSize: 24, width: 32, flex: "none", textAlign: "center" }}>🗺</span><span><b>{scenarios.length} {plural(scenarios.length, 'ситуация', 'ситуации', 'ситуаций')}</b> — от паспортного контроля и такси до аптеки и ресторана</span></div>
            <div className="row"><span style={{ fontSize: 24, width: 32, flex: "none", textAlign: "center" }}>🔊</span><span><b>Живое звучание</b> и подсказка русскими буквами для каждой фразы</span></div>
            <div className="row"><span style={{ fontSize: 24, width: 32, flex: "none", textAlign: "center" }}>🎙</span><span><b>Проверка произношения</b> — говорите в микрофон, приложение покажет, какие слова звучат непонятно</span></div>
            <div className="row"><span style={{ fontSize: 24, width: 32, flex: "none", textAlign: "center" }}>🎯</span><span><b>Шкала готовности</b> — память и произношение по каждой ситуации</span></div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="stack" style={{ paddingTop: 16 }}>
          <h1>Ваша поездка</h1>
          <p className="muted">Отметьте, что вам пригодится. Потом это можно изменить в настройках.</p>
          <div className="card">
            <TripDetails />
          </div>
          <TripScenarioPicker />
        </div>
      )}

      {step === 2 && (
        <div className="stack" style={{ paddingTop: 16 }}>
          <h1>Проверим микрофон</h1>
          {speechSupported ? (
            <>
              <p className="muted">
                Нажмите на микрофон и скажите: <b lang="en">Hello!</b> (Хэлоу!). Браузер или телефон спросит разрешение на
                микрофон — разрешите.
              </p>
              <div className="card">
                <PronunciationCheck targets={['Hello!', 'Hello']} />
              </div>
            </>
          ) : (
            <div className="banner">
              <span aria-hidden>⚠️</span>
              <span>
                Этот браузер не умеет распознавать речь, поэтому произношение проверяться не будет — готовность будет
                считаться только по памяти. Для проверки произношения откройте приложение в Chrome, Edge или Safari или
                установите iOS-приложение.
              </span>
            </div>
          )}
        </div>
      )}

      <div className="sticky-footer stack">
        {step < steps - 1 ? (
          <button type="button" className="btn btn--block" onClick={() => setStep(step + 1)}>
            {step === 0 ? 'Начать' : 'Дальше'}
          </button>
        ) : (
          <>
            <button type="button" className="btn btn--block" onClick={finishOnboarding}>
              Готово, к занятиям!
            </button>
            {speechSupported && (
              <button
                type="button"
                className="btn btn--ghost btn--block"
                onClick={() => {
                  updateSettings({ pronunciation: false });
                  finishOnboarding();
                }}
              >
                Заниматься без микрофона
              </button>
            )}
          </>
        )}
        {step > 0 && (
          <button type="button" className="btn btn--ghost btn--block" onClick={() => setStep(step - 1)}>
            Назад
          </button>
        )}
      </div>
    </div>
    </div>
  );
}
