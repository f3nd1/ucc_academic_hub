import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import './App.css';
import { TimetablePage } from './pages/TimetablePage';
import { SettingsPage } from './pages/SettingsPage';

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <header className="app__header">
          <h1>UCC School Timetable Generator</h1>
          <nav className="nav">
            <NavLink to="/" end>
              Timetable
            </NavLink>
            <NavLink to="/settings">Settings</NavLink>
          </nav>
        </header>

        <Routes>
          <Route path="/" element={<TimetablePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
