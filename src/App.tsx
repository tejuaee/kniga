import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { GuestOnly, RequireAuth } from './auth';
import { LogProvider } from './log-context';
import { Nav } from './components/Nav';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Verify } from './pages/Verify';
import { Home } from './pages/Home';
import { Diary } from './pages/Diary';
import { BookPage } from './pages/BookPage';

function AppShell() {
  return (
    <RequireAuth>
      <LogProvider>
        <Nav />
        <main className="app-main">
          <Outlet />
        </main>
      </LogProvider>
    </RequireAuth>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/signup" element={<GuestOnly><Signup /></GuestOnly>} />
      <Route path="/verify" element={<Verify />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/diary" element={<Diary />} />
        <Route path="/book/:id" element={<BookPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
