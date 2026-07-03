import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import { HelpProvider } from './shared/help/HelpContext';
import { SettingsProvider } from './shared/SettingsProvider';
import { TimetableProvider } from './TimetableProvider';
import { AppLayout } from './shell/AppLayout';
import { HomePage } from './shell/HomePage';
import { SettingsPage } from './pages/SettingsPage';
import { TOOLS } from './tools/registry';

function App() {
  return (
    // Workspace-level providers sit ABOVE the router so settings, the help
    // system, and the timetable tool's route-persistent state all survive
    // navigation between tools.
    <HelpProvider>
      <SettingsProvider>
        <TimetableProvider>
          <BrowserRouter>
            <Routes>
              {/* The layout is a parent route: its sidebar stays mounted while
                  the routed tool content swaps through <Outlet>. */}
              <Route element={<AppLayout />}>
                <Route index element={<HomePage />} />
                {TOOLS.map((tool) => {
                  const Page = tool.component;
                  return (
                    <Route key={tool.id} path={tool.path} element={<Page />} />
                  );
                })}
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </TimetableProvider>
      </SettingsProvider>
    </HelpProvider>
  );
}

export default App;
