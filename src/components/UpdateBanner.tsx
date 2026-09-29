import { useApp } from '../state/AppContext';

/** Новая версия скачана и ждёт. Перезагрузку не делаем сами, чтобы не прервать тренировку. */
export function UpdateBanner() {
  const { updateReady, applyUpdate } = useApp();
  if (!updateReady) return null;
  return (
    <div className="update-banner" role="status">
      <span className="grow">Доступна новая версия приложения.</span>
      <button type="button" className="btn btn--sm" onClick={applyUpdate}>
        Обновить
      </button>
    </div>
  );
}
