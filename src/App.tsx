import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import { HelpProvider } from './shared/help/HelpContext';
import { SettingsProvider } from './shared/SettingsProvider';
import { ThemeProvider } from './shared/ThemeProvider';
import { SidebarProvider } from './shared/SidebarProvider';
import { TimetableProvider } from './TimetableProvider';
import { AppLayout } from './shell/AppLayout';
import { HomePage } from './shell/HomePage';
import { SettingsPage } from './pages/SettingsPage';
import { SavedItemsPage } from './pages/SavedItemsPage';
import { AiLogPage } from './pages/AiLogPage';
import { TOOLS } from './tools/registry';

function App() {
  return (
    // Workspace-level providers sit ABOVE the router so the skin, settings, the
    // help system, and the timetable tool's route-persistent state all survive
    // navigation between tools.
    <HelpProvider>
      <ThemeProvider>
        <SidebarProvider>
          <SettingsProvider>
            <TimetableProvider>
              {/* basename picks up Vite's --base flag (e.g. a subfolder
                  deployment like /ucc_academic_hub/); defaults to '/' when the
                  app is served from the domain root. */}
              <BrowserRouter basename={import.meta.env.BASE_URL}>
                <Routes>
                  {/* The layout is a parent route: its sidebar stays mounted
                      while the routed tool content swaps through <Outlet>. */}
                  <Route element={<AppLayout />}>
                    <Route index element={<HomePage />} />
                    {TOOLS.map((tool) => {
                      const Page = tool.component;
                      return (
                        <Route
                          key={tool.id}
                          path={tool.path}
                          element={<Page />}
                        />
                      );
                    })}
                    <Route path="/saved" element={<SavedItemsPage />} />
                    <Route path="/ai-log" element={<AiLogPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                  </Route>
                </Routes>
              </BrowserRouter>
            </TimetableProvider>
          </SettingsProvider>
        </SidebarProvider>
      </ThemeProvider>
    </HelpProvider>
  );
}

export default App;
