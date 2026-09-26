import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { IconBack, IconBook, IconChart, IconGear, IconHome, IconMap } from './Icons';

const TABS = [
  { to: '/', label: 'Главная', icon: IconHome, end: true },
  { to: '/scenarios', label: 'Ситуации', icon: IconMap },
  { to: '/phrasebook', label: 'Разговорник', icon: IconBook },
  { to: '/progress', label: 'Прогресс', icon: IconChart },
  { to: '/settings', label: 'Настройки', icon: IconGear },
];

export function TabBar() {
  return (
    <nav className="tabbar" aria-label="Разделы">
      <div className="tabbar__inner">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function TopBar({ title, back, right }: { title?: string; back?: string | true; right?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <header className="topbar">
      {back ? (
        <button
          type="button"
          className="icon-btn icon-btn--plain"
          onClick={() => (back === true ? navigate(-1) : navigate(back))}
          aria-label="Назад"
        >
          <IconBack />
        </button>
      ) : (
        <span className="topbar__spacer" />
      )}
      <div className="topbar__title">{title}</div>
      {right ?? <span className="topbar__spacer" />}
    </header>
  );
}
