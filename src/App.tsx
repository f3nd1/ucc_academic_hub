import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import './App.css';
import { TimetablePage } from './pages/TimetablePage';
import { SettingsPage } from './pages/SettingsPage';
import { HelpProvider } from './shared/help/HelpContext';
import { useHelp } from './shared/help/helpStore';
import { Tour } from './shared/help/Tour';
import { SettingsProvider } from './shared/SettingsProvider';
import { TimetableProvider } from './TimetableProvider';

/** Nav help controls: master toggle + restart tour. */
function HelpControls() {
  const { helpEnabled, setHelpEnabled, startTour } = useHelp();
  return (
    <div className="nav__help">
      <button
        type="button"
        className="nav__helpbtn"
        aria-pressed={helpEnabled}
        onClick={() => setHelpEnabled(!helpEnabled)}
      >
        Help: {helpEnabled ? 'On' : 'Off'}
      </button>
      {helpEnabled && (
        <button type="button" className="linkbtn" onClick={startTour}>
          Restart tour
        </button>
      )}
    </div>
  );
}

function Shell() {
  return (
    <div className="app">
      <header className="app__header">
        <h1>UCC School Timetable Generator</h1>
        <div className="app__bar">
          <nav className="nav">
            <NavLink to="/" end>
              Timetable
            </NavLink>
            <NavLink to="/settings" data-tour="settings-link">
              Settings
            </NavLink>
          </nav>
          <HelpControls />
        </div>
      </header>

      <Routes>
        <Route path="/" element={<TimetablePage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>

      <Tour />
    </div>
  );
}

function App() {
  return (
    <HelpProvider>
      {/* Settings + timetable state live ABOVE the routes so navigating to
          /settings and back preserves the generated timetable and wizard
          progress (the page component itself unmounts on route change). */}
      <SettingsProvider>
        <TimetableProvider>
          <BrowserRouter>
            <Shell />
          </BrowserRouter>
        </TimetableProvider>
      </SettingsProvider>
    </HelpProvider>
  );
}

export default App;
